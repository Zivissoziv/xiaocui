import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../common/config';
import * as schema from './schema';

/**
 * SQLite 数据库连接（better-sqlite3 + Drizzle ORM）。
 * 表结构与 Java 版 schema.sql 一致（类型换成 SQLite 等价类型），Drizzle 映射见 schema.ts。
 * 复杂结构（画像 / 分析结果 / 缺项集合）同样以 JSON 字符串存放。
 * 建表 DDL 保留 IF NOT EXISTS 幂等初始化：已有 data/ 直接沿用，无需 drizzle-kit 迁移。
 * 由 Nest 生命周期管理：应用启动时建表，关闭时 checkpoint + close。
 */
@Injectable()
export class DatabaseProvider implements OnModuleDestroy {
  readonly sqlite: Database.Database;
  readonly db: BetterSQLite3Database<typeof schema>;

  constructor() {
    fs.mkdirSync(config.dataDir, { recursive: true });
    this.sqlite = new Database(path.join(config.dataDir, 'ai_followup.db'));
    this.sqlite.pragma('journal_mode = WAL');
    this.db = drizzle(this.sqlite, { schema });
    this.sqlite.exec(`
CREATE TABLE IF NOT EXISTS id_counter (
  name TEXT PRIMARY KEY,
  next_val INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_sessions (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  owner_id TEXT,
  source_type TEXT NOT NULL,
  source_ref TEXT,
  user_instruction TEXT,
  due_at TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sheet_snapshots (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  source_type TEXT NOT NULL,
  source_version TEXT,
  file_name TEXT NOT NULL,
  local_file_path TEXT,
  file_hash TEXT,
  downloaded_at TEXT NOT NULL,
  parsed_at TEXT,
  row_count INTEGER NOT NULL,
  parse_status TEXT NOT NULL,
  parse_error TEXT,
  profile_json TEXT
);

CREATE TABLE IF NOT EXISTS ai_table_analyses (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  sheet_snapshot_id INTEGER NOT NULL,
  model_name TEXT,
  prompt_version TEXT,
  table_summary TEXT,
  worksheet_name TEXT,
  header_row_index INTEGER,
  inferred_columns_json TEXT,
  risks_json TEXT,
  raw_output_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_matches (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  source_row_no INTEGER,
  raw_contact_text TEXT,
  employee_id TEXT,
  display_name TEXT,
  department_id TEXT,
  match_status TEXT NOT NULL,
  candidates_json TEXT,
  confirmed_by TEXT,
  confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS followup_items (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  contact_match_id INTEGER,
  employee_id TEXT,
  display_name TEXT,
  department_id TEXT,
  email TEXT,
  phone TEXT,
  source_rows_json TEXT,
  missing_fields_json TEXT,
  filled_fields_snapshot_json TEXT,
  business_summary TEXT,
  issue_summary TEXT,
  status TEXT NOT NULL,
  due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS followup_tasks (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  followup_item_id INTEGER NOT NULL,
  recipient_id TEXT,
  channel TEXT NOT NULL,
  message_draft TEXT,
  message_final TEXT,
  status TEXT NOT NULL,
  scheduled_at TEXT,
  sent_at TEXT,
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS reminder_events (
  id INTEGER PRIMARY KEY,
  session_id INTEGER NOT NULL,
  followup_task_id INTEGER NOT NULL,
  channel TEXT NOT NULL,
  recipient_id TEXT,
  message_snapshot TEXT,
  status TEXT NOT NULL,
  sent_at TEXT,
  failed_reason TEXT
);

CREATE TABLE IF NOT EXISTS address_book_contacts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  department TEXT,
  phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated ON analysis_sessions (updated_at);
CREATE INDEX IF NOT EXISTS idx_items_session ON followup_items (session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_session ON followup_tasks (session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_item ON followup_tasks (followup_item_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON reminder_events (session_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_session ON sheet_snapshots (session_id);
CREATE INDEX IF NOT EXISTS idx_analyses_session ON ai_table_analyses (session_id);
CREATE INDEX IF NOT EXISTS idx_address_book_name ON address_book_contacts (name);
`);
  }

  onModuleDestroy(): void {
    try {
      this.sqlite.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // 关闭时尽力 checkpoint，失败不阻断关闭流程
    }
    this.sqlite.close();
  }
}

/** JSON 列的安全解析，解析失败或空值时返回 fallback。 */
export function readJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw === null || raw === undefined || raw.trim().length === 0) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}
