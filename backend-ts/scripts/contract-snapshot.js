#!/usr/bin/env node
/**
 * 接口契约快照：遍历后端全部路由，把状态码、响应头、响应体落盘。
 *
 * 用途：重构（如 Express → NestJS）前后各跑一次，逐条比对，
 * 确认行为完全一致。前端一行都不会改，所以任何差异都是回归。
 *
 * 用法：
 *   node scripts/contract-snapshot.js <label> [baseUrl]
 *   node scripts/contract-snapshot.js before http://127.0.0.1:8090
 *
 * 注意：脚本会执行写操作（新建/修改/删除会话与通讯录），
 * 必须配合独立的 DATA_DIR / UPLOAD_DIR 沙箱数据库使用，不要对着开发库跑。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const label = process.argv[2] || 'snapshot';
const baseUrl = (process.argv[3] || 'http://127.0.0.1:8090').replace(/\/$/, '');
const OUT_DIR = path.join(__dirname, '..', '.contract');
const XLSX = path.join(__dirname, '..', '..', '测试数据-项目信息收集-已补充.xlsx');

/**
 * 归一化易变内容，保证两次运行可比：
 * - ISO 时间戳（createdAt/updatedAt/sentAt…）
 * - 13 位毫秒时间戳（上传文件的 `Date.now()-xxx.xlsx` 前缀）
 * - AI 连通性测试的网络错误文案
 */
function normalize(text) {
  return text
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?/g, '<TS>')
    .replace(/\b\d{13}\b/g, '<MS>')
    .replace(/连接失败：[^"]*/g, '连接失败：<NETWORK>')
    // 导出文件名带当天日期（通讯录-20260901.xlsx），跨天比对会误报
    .replace(/-20\d{6}(?=\.)/g, '-<DATE>');
}

const probes = [
  // ---------- 先关闭 AI ----------
  // 开着大模型时，列识别结果（columnPlan）与催办文案措辞每次都不同，
  // 快照无法复现。关掉后全部走规则版降级路径，结果确定可比。
  // 注：save() 在 apiKey 留空时会保留原值，不会把密钥清掉。
  {
    name: 'disable-ai-for-determinism',
    method: 'PUT',
    path: '/api/settings/ai',
    json: { enabled: false },
  },

  // ---------- 只读：会话 ----------
  { name: 'list-sessions', method: 'GET', path: '/api/analysis-sessions' },
  { name: 'list-session-details', method: 'GET', path: '/api/analysis-sessions/details' },
  { name: 'get-session', method: 'GET', path: '/api/analysis-sessions/1000' },
  { name: 'get-analysis', method: 'GET', path: '/api/analysis-sessions/1000/analysis' },
  { name: 'get-followup-items', method: 'GET', path: '/api/analysis-sessions/1000/followup-items' },
  { name: 'get-reminder-events', method: 'GET', path: '/api/analysis-sessions/1000/reminder-events' },

  // ---------- 只读：设置与通讯录 ----------
  { name: 'get-ai-settings', method: 'GET', path: '/api/settings/ai' },
  { name: 'address-book-list-empty', method: 'GET', path: '/api/address-book' },
  {
    name: 'address-book-match-missing',
    method: 'POST',
    path: '/api/address-book/match',
    json: { names: ['不存在的人甲', '不存在的人乙'] },
  },
  { name: 'address-book-template', method: 'GET', path: '/api/address-book/template', binary: true },
  { name: 'address-book-export', method: 'GET', path: '/api/address-book/export', binary: true },

  // ---------- 错误路径（不产生副作用）----------
  { name: 'create-session-without-file', method: 'POST', path: '/api/analysis-sessions', json: { instruction: 'x' } },
  { name: 'refresh-without-file', method: 'POST', path: '/api/analysis-sessions/1000/refresh', json: {} },
  { name: 'refresh-preview-without-file', method: 'POST', path: '/api/analysis-sessions/1000/refresh-preview', json: {} },
  { name: 'address-book-import-without-file', method: 'POST', path: '/api/address-book/import', json: { mode: 'append' } },
  {
    name: 'address-book-import-bad-mode',
    method: 'POST',
    path: '/api/address-book/import',
    file: '测试数据-项目信息收集-已补充.xlsx',
    fields: { mode: 'bogus' },
  },
  { name: 'session-not-found', method: 'GET', path: '/api/analysis-sessions/999999' },
  { name: 'item-not-found', method: 'PATCH', path: '/api/followup-items/999999', json: { messageFinal: 'x' } },
  { name: 'unmatched-api-route', method: 'GET', path: '/api/definitely-not-exist' },
  { name: 'unmatched-root-route', method: 'GET', path: '/definitely-not-exist' },

  // ---------- 写操作：通讯录 ----------
  {
    name: 'address-book-create',
    method: 'POST',
    path: '/api/address-book',
    json: { name: '契约测试甲', email: 'jia@example.com', department: '研发部', phone: '13800000001' },
    capture: { field: 'id', as: 'addrId' },
  },
  {
    name: 'address-book-create-2',
    method: 'POST',
    path: '/api/address-book',
    json: { name: '契约测试乙', email: 'yi@example.com' },
    capture: { field: 'id', as: 'addrId2' },
  },
  { name: 'address-book-list-after-create', method: 'GET', path: '/api/address-book' },
  {
    name: 'address-book-match-hit',
    method: 'POST',
    path: '/api/address-book/match',
    json: { names: ['契约测试甲', '不存在的人乙'] },
  },
  {
    name: 'address-book-update',
    method: 'PUT',
    path: '/api/address-book/{addrId}',
    json: { name: '契约测试甲已改名', email: 'jia2@example.com', department: '产品部', phone: '13800000002' },
  },
  { name: 'address-book-delete', method: 'DELETE', path: '/api/address-book/{addrId2}' },
  { name: 'address-book-list-after-delete', method: 'GET', path: '/api/address-book' },
  {
    name: 'address-book-import-append',
    method: 'POST',
    path: '/api/address-book/import',
    file: '测试数据-项目信息收集-已补充.xlsx',
    fields: { mode: 'append' },
  },

  // ---------- 写操作：会话与事项 ----------
  { name: 'patch-session-meta', method: 'PATCH', path: '/api/analysis-sessions/1000', json: { title: '契约快照标题' } },
  { name: 'get-session-after-patch', method: 'GET', path: '/api/analysis-sessions/1000' },
  { name: 'patch-followup-item', method: 'PATCH', path: '/api/followup-items/1003', json: { messageFinal: '契约快照文案' } },
  { name: 'get-followup-items-after-patch', method: 'GET', path: '/api/analysis-sessions/1000/followup-items' },
  { name: 'send-all', method: 'POST', path: '/api/analysis-sessions/1000/followup-tasks/send', json: {} },
  { name: 'get-reminder-events-after-send', method: 'GET', path: '/api/analysis-sessions/1000/reminder-events' },

  // ---------- 上传与增量对账 ----------
  {
    name: 'create-session',
    method: 'POST',
    path: '/api/analysis-sessions',
    file: '测试数据-项目信息收集-已补充.xlsx',
    fields: { title: '契约快照新建会话', instruction: '请补充项目负责人和预计上线时间', dueAt: '2026-09-30T18:00' },
    capture: { field: 'session.id', as: 'newSessionId' },
  },
  {
    name: 'refresh-preview',
    method: 'POST',
    path: '/api/analysis-sessions/1000/refresh-preview',
    file: '测试数据-项目信息收集-已补充.xlsx',
  },
  {
    name: 'refresh',
    method: 'POST',
    path: '/api/analysis-sessions/1000/refresh',
    file: '测试数据-项目信息收集-已补充.xlsx',
  },
  { name: 'refresh-confirm', method: 'POST', path: '/api/analysis-sessions/1000/refresh/confirm', json: {} },
  { name: 'regenerate-messages', method: 'POST', path: '/api/analysis-sessions/1120/messages/regenerate', json: {} },

  // ---------- 收尾 ----------
  { name: 'delete-created-session', method: 'DELETE', path: '/api/analysis-sessions/{newSessionId}' },
  { name: 'delete-followup-item', method: 'DELETE', path: '/api/followup-items/1015' },
  { name: 'get-followup-items-final', method: 'GET', path: '/api/analysis-sessions/1000/followup-items' },
  { name: 'list-sessions-final', method: 'GET', path: '/api/analysis-sessions' },

  // ---------- 设置写操作（放最后，避免影响前面的探针）----------
  {
    name: 'put-ai-settings',
    method: 'PUT',
    path: '/api/settings/ai',
    json: { enabled: true, baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  },
  { name: 'get-ai-settings-after-put', method: 'GET', path: '/api/settings/ai' },
  {
    name: 'test-ai-connection',
    method: 'POST',
    path: '/api/settings/ai/test',
    json: {},
    keysOnly: true,
  },
];

async function runProbe(probe, vars) {
  const url = baseUrl + probe.path.replace(/\{(\w+)\}/g, (_, key) => vars[key]);
  const init = { method: probe.method, headers: {}, signal: AbortSignal.timeout(120000) };

  if (probe.file) {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(XLSX)]), probe.file);
    for (const [key, value] of Object.entries(probe.fields || {})) form.append(key, value);
    init.body = form;
  } else if (probe.json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(probe.json);
  }

  const response = await fetch(url, init);

  if (probe.binary) {
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      name: probe.name,
      request: `${probe.method} ${url.replace(baseUrl, '')}`,
      status: response.status,
      contentType: response.headers.get('content-type'),
      contentDisposition: response.headers.get('content-disposition'),
      bytes: buffer.length,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    };
  }

  const raw = await response.text();
  const text = normalize(raw);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  const result = {
    name: probe.name,
    request: `${probe.method} ${url.replace(baseUrl, '')}`,
    status: response.status,
    body,
  };

  // 结果不可预测的探针（如会调用外部大模型的连通性测试）只记录顶层键名，
  // 比对时只验证结构而不验证具体内容。
  if (probe.keysOnly && body && typeof body === 'object' && !Array.isArray(body)) {
    result.body = { __keys: Object.keys(body).sort() };
  }

  // 支持点号路径，例如从 { session: { id } } 中取 session.id
  if (probe.capture && body && typeof body === 'object') {
    vars[probe.capture.as] = probe.capture.field
      .split('.')
      .reduce((acc, key) => (acc === null || acc === undefined ? acc : acc[key]), body);
  }
  return result;
}

(async () => {
  if (!fs.existsSync(XLSX)) {
    console.error(`找不到测试用 Excel：${XLSX}`);
    process.exit(1);
  }

  const vars = {};
  const results = [];
  const failures = [];

  for (const probe of probes) {
    try {
      results.push(await runProbe(probe, vars));
    } catch (error) {
      failures.push({ name: probe.name, error: String(error) });
      results.push({ name: probe.name, request: `${probe.method} ${probe.path}`, status: 0, body: `PROBE ERROR: ${String(error)}` });
    }
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${label}.json`);
  fs.writeFileSync(file, JSON.stringify({ label, baseUrl, capturedAt: new Date().toISOString(), vars, results }, null, 2), 'utf8');

  console.log(`快照已写入 ${file}`);
  console.log(`探针 ${results.length} 个，失败 ${failures.length} 个`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${f.name}: ${f.error}`);
    process.exit(1);
  }
})();
