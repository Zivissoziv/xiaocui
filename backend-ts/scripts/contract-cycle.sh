#!/usr/bin/env bash
# 契约快照完整周期：重置沙箱数据库 → 启动服务 → 录制快照 → 停止服务。
#
# 用法：
#   bash scripts/contract-cycle.sh <label> <启动命令...>
#
# 示例：
#   bash scripts/contract-cycle.sh before node dist/index.js
#   bash scripts/contract-cycle.sh after  node dist/main.js
#
# 全过程只碰 .contract/work 下的沙箱副本，不影响开发用的 data/ 与 uploads/。
set -u
export MSYS2_ARG_CONV_EXCL="*"

LABEL="$1"
shift

cd "$(dirname "$0")/.." || exit 1
NODE_BIN="C:/Users/Ziv/.workbuddy/binaries/node/versions/22.22.2-2/node.exe"

# 按端口杀进程。$! 在 Git Bash 里拿到的 PID 未必是 Windows 真实 PID，
# 用 taskkill 会静默失败，导致下一轮 EADDRINUSE。
kill_port() {
  local pid
  pid=$(netstat -ano | grep ":8090" | grep LISTENING | awk '{print $5}' | head -1)
  if [ -n "$pid" ]; then
    taskkill /F /T /PID "$pid" >/dev/null 2>&1
    sleep 1
  fi
}

kill_port

# 启动前端口必须为空，否则后续探针会打到残留的旧服务上，
# 拿到的快照是被污染的，比对结果毫无意义。
if netstat -ano | grep ":8090" | grep -q LISTENING; then
  echo "✗ 端口 8090 仍被占用，请手动清理后重试"
  exit 1
fi

echo "==> 重置沙箱数据库"
rm -rf .contract/work
cp -r .contract/fixture .contract/work
mkdir -p .contract/work/uploads

echo "==> 启动服务：$*"
PORT=8090 \
DATA_DIR=".contract/work/data" \
UPLOAD_DIR=".contract/work/uploads" \
"$@" >.contract/server.log 2>&1 &

trap kill_port EXIT

# 注意：本沙箱里 curl 稳定返回退出码 23（CURLE_WRITE_ERROR），
# 不能用它的退出码判断就绪，改用 Node 的 fetch 探测。
echo "==> 等待服务就绪"
READY=0
for _ in $(seq 1 60); do
  if "$NODE_BIN" -e "fetch('http://127.0.0.1:8090/api/analysis-sessions').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 0.5
done

if [ "$READY" -ne 1 ]; then
  echo "✗ 服务未能在 30 秒内就绪，日志如下："
  cat .contract/server.log
  exit 1
fi

echo "==> 录制快照：$LABEL"
"$NODE_BIN" scripts/contract-snapshot.js "$LABEL" http://127.0.0.1:8090
STATUS=$?

if [ -f .contract/server.log ] && grep -qi "error\|未处理异常" .contract/server.log; then
  echo "==> 服务端日志中的异常："
  grep -i "error\|未处理异常" .contract/server.log | head -20
fi

exit $STATUS
