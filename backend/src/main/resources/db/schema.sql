-- 一期表结构。
-- 字段类型统一使用 TEXT / DATETIME，MySQL 8 与 H2 2.x 均可直接执行，避免维护两份脚本。
-- JSON 内容统一以字符串形式存放，由应用层 JsonCodec 负责序列化与反序列化。

CREATE TABLE IF NOT EXISTS id_counter (
  name VARCHAR(64) PRIMARY KEY,
  next_val BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS analysis_sessions (
  id BIGINT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  owner_id VARCHAR(128),
  source_type VARCHAR(64) NOT NULL,
  source_ref VARCHAR(512),
  user_instruction TEXT,
  due_at VARCHAR(64),
  status VARCHAR(64) NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS sheet_snapshots (
  id BIGINT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  source_type VARCHAR(64) NOT NULL,
  source_version VARCHAR(128),
  file_name VARCHAR(255) NOT NULL,
  local_file_path VARCHAR(512),
  file_hash VARCHAR(128),
  downloaded_at DATETIME NOT NULL,
  parsed_at DATETIME,
  row_count INT NOT NULL,
  parse_status VARCHAR(64) NOT NULL,
  parse_error TEXT,
  profile_json TEXT
);

CREATE TABLE IF NOT EXISTS ai_table_analyses (
  id BIGINT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  sheet_snapshot_id BIGINT NOT NULL,
  model_name VARCHAR(128),
  prompt_version VARCHAR(64),
  table_summary TEXT,
  worksheet_name VARCHAR(255),
  header_row_index INT,
  inferred_columns_json TEXT,
  risks_json TEXT,
  raw_output_json TEXT,
  created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS contact_matches (
  id BIGINT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  source_row_no INT,
  raw_contact_text VARCHAR(255),
  employee_id VARCHAR(128),
  display_name VARCHAR(128),
  department_id VARCHAR(128),
  match_status VARCHAR(64) NOT NULL,
  candidates_json TEXT,
  confirmed_by VARCHAR(128),
  confirmed_at DATETIME
);

CREATE TABLE IF NOT EXISTS followup_items (
  id BIGINT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  contact_match_id BIGINT,
  employee_id VARCHAR(128),
  display_name VARCHAR(128),
  department_id VARCHAR(128),
  email VARCHAR(255),
  phone VARCHAR(128),
  source_rows_json TEXT,
  missing_fields_json TEXT,
  filled_fields_snapshot_json TEXT,
  business_summary TEXT,
  issue_summary TEXT,
  status VARCHAR(64) NOT NULL,
  due_at VARCHAR(64),
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS followup_tasks (
  id BIGINT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  followup_item_id BIGINT NOT NULL,
  recipient_id VARCHAR(128),
  channel VARCHAR(64) NOT NULL,
  message_draft TEXT,
  message_final TEXT,
  status VARCHAR(64) NOT NULL,
  scheduled_at DATETIME,
  sent_at DATETIME,
  closed_at DATETIME
);

CREATE TABLE IF NOT EXISTS reminder_events (
  id BIGINT PRIMARY KEY,
  session_id BIGINT NOT NULL,
  followup_task_id BIGINT NOT NULL,
  channel VARCHAR(64) NOT NULL,
  recipient_id VARCHAR(128),
  message_snapshot TEXT,
  status VARCHAR(64) NOT NULL,
  sent_at DATETIME,
  failed_reason TEXT
);

-- 系统级配置，一期用于存放 AI 连接参数（baseUrl / model / apiKey / enabled）。
-- apiKey 明文入库，但对外接口只返回掩码，且不写日志。
CREATE TABLE IF NOT EXISTS app_settings (
  setting_key VARCHAR(64) PRIMARY KEY,
  setting_value TEXT,
  updated_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated ON analysis_sessions (updated_at);
CREATE INDEX IF NOT EXISTS idx_items_session ON followup_items (session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_session ON followup_tasks (session_id);
CREATE INDEX IF NOT EXISTS idx_tasks_item ON followup_tasks (followup_item_id);
CREATE INDEX IF NOT EXISTS idx_events_session ON reminder_events (session_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_session ON sheet_snapshots (session_id);
CREATE INDEX IF NOT EXISTS idx_analyses_session ON ai_table_analyses (session_id);
