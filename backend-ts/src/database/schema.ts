import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Drizzle schema：与 database.provider.ts 中的 DDL（即原 Java 版 schema.sql 的 SQLite 等价）逐列一致。
 * 约定：
 *  - 所有 id 由 id_counter 手工分配（非自增），插入时显式传入；
 *  - 时间戳一律存 TEXT（'YYYY-MM-DD HH:MM:SS'，见 common/util.ts 的 nowStr）；
 *  - 复杂结构（画像 / 分析结果 / 缺项集合）以 JSON 字符串存 TEXT 列，列名带 _json 后缀。
 */

export const idCounter = sqliteTable('id_counter', {
  name: text('name').primaryKey(),
  nextVal: integer('next_val').notNull(),
});

export const analysisSessions = sqliteTable(
  'analysis_sessions',
  {
    id: integer('id').primaryKey(),
    title: text('title').notNull(),
    ownerId: text('owner_id'),
    sourceType: text('source_type').notNull(),
    sourceRef: text('source_ref'),
    userInstruction: text('user_instruction'),
    dueAt: text('due_at'),
    status: text('status').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_sessions_updated').on(t.updatedAt)],
);

export const sheetSnapshots = sqliteTable(
  'sheet_snapshots',
  {
    id: integer('id').primaryKey(),
    sessionId: integer('session_id').notNull(),
    sourceType: text('source_type').notNull(),
    sourceVersion: text('source_version'),
    fileName: text('file_name').notNull(),
    localFilePath: text('local_file_path'),
    fileHash: text('file_hash'),
    downloadedAt: text('downloaded_at').notNull(),
    parsedAt: text('parsed_at'),
    rowCount: integer('row_count').notNull(),
    parseStatus: text('parse_status').notNull(),
    parseError: text('parse_error'),
    profileJson: text('profile_json'),
  },
  (t) => [index('idx_snapshots_session').on(t.sessionId)],
);

export const aiTableAnalyses = sqliteTable(
  'ai_table_analyses',
  {
    id: integer('id').primaryKey(),
    sessionId: integer('session_id').notNull(),
    sheetSnapshotId: integer('sheet_snapshot_id').notNull(),
    modelName: text('model_name'),
    promptVersion: text('prompt_version'),
    tableSummary: text('table_summary'),
    worksheetName: text('worksheet_name'),
    headerRowIndex: integer('header_row_index'),
    inferredColumnsJson: text('inferred_columns_json'),
    risksJson: text('risks_json'),
    rawOutputJson: text('raw_output_json'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_analyses_session').on(t.sessionId)],
);

export const contactMatches = sqliteTable('contact_matches', {
  id: integer('id').primaryKey(),
  sessionId: integer('session_id').notNull(),
  sourceRowNo: integer('source_row_no'),
  rawContactText: text('raw_contact_text'),
  employeeId: text('employee_id'),
  displayName: text('display_name'),
  departmentId: text('department_id'),
  matchStatus: text('match_status').notNull(),
  candidatesJson: text('candidates_json'),
  confirmedBy: text('confirmed_by'),
  confirmedAt: text('confirmed_at'),
});

export const followupItems = sqliteTable(
  'followup_items',
  {
    id: integer('id').primaryKey(),
    sessionId: integer('session_id').notNull(),
    contactMatchId: integer('contact_match_id'),
    employeeId: text('employee_id'),
    displayName: text('display_name'),
    departmentId: text('department_id'),
    email: text('email'),
    phone: text('phone'),
    sourceRowsJson: text('source_rows_json'),
    missingFieldsJson: text('missing_fields_json'),
    filledFieldsSnapshotJson: text('filled_fields_snapshot_json'),
    businessSummary: text('business_summary'),
    issueSummary: text('issue_summary'),
    status: text('status').notNull(),
    dueAt: text('due_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_items_session').on(t.sessionId)],
);

export const followupTasks = sqliteTable(
  'followup_tasks',
  {
    id: integer('id').primaryKey(),
    sessionId: integer('session_id').notNull(),
    followupItemId: integer('followup_item_id').notNull(),
    recipientId: text('recipient_id'),
    channel: text('channel').notNull(),
    messageDraft: text('message_draft'),
    messageFinal: text('message_final'),
    status: text('status').notNull(),
    scheduledAt: text('scheduled_at'),
    sentAt: text('sent_at'),
    closedAt: text('closed_at'),
  },
  (t) => [
    index('idx_tasks_session').on(t.sessionId),
    index('idx_tasks_item').on(t.followupItemId),
  ],
);

export const reminderEvents = sqliteTable(
  'reminder_events',
  {
    id: integer('id').primaryKey(),
    sessionId: integer('session_id').notNull(),
    followupTaskId: integer('followup_task_id').notNull(),
    channel: text('channel').notNull(),
    recipientId: text('recipient_id'),
    messageSnapshot: text('message_snapshot'),
    status: text('status').notNull(),
    sentAt: text('sent_at'),
    failedReason: text('failed_reason'),
  },
  (t) => [index('idx_events_session').on(t.sessionId)],
);

export const addressBookContacts = sqliteTable(
  'address_book_contacts',
  {
    id: integer('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    department: text('department'),
    phone: text('phone'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('idx_address_book_name').on(t.name)],
);

export const appSettings = sqliteTable('app_settings', {
  settingKey: text('setting_key').primaryKey(),
  settingValue: text('setting_value'),
  updatedAt: text('updated_at').notNull(),
});
