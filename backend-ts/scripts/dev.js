/**
 * 开发模式启动器：一个命令同时跑「TS 增量编译」和「带热重启的服务」。
 *
 *   npm run dev
 *
 * 之所以不用 `tsc --watch & node ... &`：
 *   - Windows 的 cmd 里 `&` 是「顺序执行」，tsc --watch 不退出，node 永远起不来；
 *   - 引入 concurrently / nodemon 又得多装依赖。
 * 这里用 Node 自己拉两个子进程，跨平台且零新增依赖。
 *
 * 热重启用 Node 内置的 `--watch-path`（Node 18.11+）。注意必须传绝对路径：
 * Git Bash 会把 `--watch-path=./dist` 这类参数按 POSIX 路径改写，导致 ENOENT。
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const npmCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const children = [];
let shuttingDown = false;

function run(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: root,
    shell: process.platform === 'win32',
    env: process.env,
    ...options,
  });
  children.push(child);

  const prefix = `[${label}] `;
  const pipe = (stream, out) => {
    stream.setEncoding('utf8');
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    // 任一子进程挂掉，整体退出，避免留下孤儿进程占着端口
    process.stderr.write(`${prefix}进程退出（code=${code} signal=${signal}），正在关闭...\n`);
    shutdown(code === 0 ? 1 : code || 1);
  });

  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(code), 200);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// 1) TS 增量编译
run('tsc', npmCmd, ['tsc', '--watch', '--preserveWatchOutput']);

// 2) 等服务进程：dist 一变就自动重启
function startServer() {
  return run(
    'server',
    process.execPath,
    [
      `--watch-path=${distDir}`,
      path.join(distDir, 'main.js'),
    ]
  );
}

// 首次编译可能还没产出 dist，等它出现再启动，避免 ENOENT
if (fs.existsSync(path.join(distDir, 'main.js'))) {
  startServer();
} else {
  process.stdout.write('[dev] 等待首次编译产出 dist/main.js ...\n');
  const timer = setInterval(() => {
    if (fs.existsSync(path.join(distDir, 'main.js'))) {
      clearInterval(timer);
      startServer();
    }
  }, 300);
}
