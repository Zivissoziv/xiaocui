/**
 * 一次性迁移脚本：把 Java 版 H2 导出的 CSV 数据搬进 TS 版 SQLite。
 * 用法：backend 停止后，node migrate-h2-to-sqlite.js
 * 规则：
 *  - 列名以 CSV 表头为准，按名插入，不依赖建表顺序；
 *  - 时间戳 "YYYY-MM-DD HH:MM:SS[.fff...]" 统一改为 'T' 分隔（与 TS 版 nowStr 一致）；
 *  - 先清空目标表再写入，全量替换（当前 SQLite 里只有重建的演示会话，无真实数据）。
 */
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const csvDir = path.resolve('C:/Users/Ziv/Desktop/plan/backend/h2_csv');
const dbPath = path.resolve('C:/Users/Ziv/Desktop/plan/backend-ts/data/ai_followup.db');

/** 极简 RFC4180 CSV 解析（H2 CSVWRITE：双引号转义，逗号分隔，\n 换行，NULL 输出为空） */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const fixTs = (v) =>
  v === null ? null : (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v) ? v.replace(' ', 'T') : v);

const TABLES = [
  'id_counter', 'analysis_sessions', 'sheet_snapshots', 'ai_table_analyses',
  'contact_matches', 'followup_items', 'followup_tasks', 'reminder_events',
  'app_settings', 'address_book_contacts',
];

const db = new DatabaseSync(dbPath);
db.exec('BEGIN');
try {
  // 1) 清空目标表（保留表结构；先子表后父表无所谓，这里没有外键约束）
  for (const t of TABLES) db.prepare(`DELETE FROM ${t}`).run();

  // 2) 逐表迁移
  for (const t of TABLES) {
    const file = path.join(csvDir, `${t}.csv`);
    const parsed = parseCsv(fs.readFileSync(file, 'utf8'));
    const header = parsed[0];
    const dataRows = parsed.slice(1);
    const placeholders = header.map(() => '?').join(', ');
    const cols = header.map((c) => `"${c}"`).join(', ');
    const stmt = db.prepare(`INSERT INTO ${t} (${cols}) VALUES (${placeholders})`);
    for (const r of dataRows) {
      if (r.length !== header.length) throw new Error(`${t} 行列数不匹配: ${r.length} vs ${header.length}`);
      stmt.run(...r.map(fixTs));
    }
    console.log(`${t}: ${dataRows.length} 行`);
  }

  // 3) 校验 id 计数器
  const counter = db.prepare("SELECT next_val FROM id_counter WHERE name = 'global'").get();
  const maxSession = db.prepare('SELECT MAX(id) AS m FROM analysis_sessions').get();
  console.log(`id_counter=${counter ? counter.next_val : '(无)'}, max session id=${maxSession.m}`);
  if (counter && counter.next_val <= maxSession.m) {
    db.prepare('UPDATE id_counter SET next_val = ? WHERE name = ?').run(maxSession.m + 1, 'global');
    console.log(`id_counter 已上调至 ${maxSession.m + 1}`);
  }
  db.exec('COMMIT');
  console.log('迁移完成');
} catch (e) {
  db.exec('ROLLBACK');
  console.error('迁移失败，已回滚:', e.message);
  process.exit(1);
} finally {
  db.close();
}
