import { Injectable } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import {
  AiAnalysisResult,
  AnalysisSession,
  FollowupItem,
  FollowupTask,
  HttpError,
  ReminderEvent,
  WorkbookProfile,
} from '../types';
import { DatabaseProvider, readJson, writeJson } from './database.provider';
import { nowStr } from '../util';

@Injectable()
export class RepositoryService {
  private readonly db: DatabaseSync;

  constructor(dbProvider: DatabaseProvider) {
    this.db = dbProvider.db;
  }

  /**
   * 会话相关的全部读写，等价于 Java 版 MyBatisSessionRepository。
   * 上层 SessionService / FollowupService 只依赖这里，不感知 SQL 细节。
   */
  private readonly COUNTER = 'global';
  private readonly COUNTER_START = 1000;

  nextId(): number {
    const row = this.db.prepare('SELECT next_val FROM id_counter WHERE name = ?').get(this.COUNTER) as
      | { next_val: number }
      | undefined;
    if (!row) {
      this.db.prepare('INSERT INTO id_counter(name, next_val) VALUES(?, ?)').run(this.COUNTER, this.COUNTER_START);
      return this.COUNTER_START;
    }
    this.db.prepare('UPDATE id_counter SET next_val = next_val + 1 WHERE name = ?').run(this.COUNTER);
    return Number(row.next_val) + 1;
  }

  private rowToSession(row: any): AnalysisSession {
    return {
      id: row.id,
      title: row.title,
      ownerId: row.owner_id,
      sourceType: row.source_type,
      sourceRef: row.source_ref,
      userInstruction: row.user_instruction,
      dueAt: row.due_at,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  saveSession(session: AnalysisSession): void {
    const existing = this.db.prepare('SELECT id FROM analysis_sessions WHERE id = ?').get(session.id);
    if (!existing) {
      this.db.prepare(
        `INSERT INTO analysis_sessions
          (id, title, owner_id, source_type, source_ref, user_instruction, due_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        session.id, session.title, session.ownerId, session.sourceType, session.sourceRef,
        session.userInstruction, session.dueAt, session.status, session.createdAt, session.updatedAt
      );
    } else {
      this.db.prepare(
        `UPDATE analysis_sessions SET
          title = ?, owner_id = ?, source_type = ?, source_ref = ?, user_instruction = ?,
          due_at = ?, status = ?, created_at = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        session.title, session.ownerId, session.sourceType, session.sourceRef,
        session.userInstruction, session.dueAt, session.status, session.createdAt, session.updatedAt,
        session.id
      );
    }
  }

  findSessions(): AnalysisSession[] {
    const rows = this.db
      .prepare(
        `SELECT id, title, owner_id, source_type, source_ref, user_instruction, due_at, status, created_at, updated_at
         FROM analysis_sessions ORDER BY updated_at DESC, id DESC`
      )
      .all() as any[];
    return rows.map(this.rowToSession);
  }

  findSession(id: number): AnalysisSession | null {
    const row = this.db
      .prepare(
        `SELECT id, title, owner_id, source_type, source_ref, user_instruction, due_at, status, created_at, updated_at
         FROM analysis_sessions WHERE id = ?`
      )
      .get(id) as any;
    return row ? this.rowToSession(row) : null;
  }

  requireSession(id: number): AnalysisSession {
    const session = this.findSession(id);
    if (!session) throw new HttpError('会话不存在');
    return session;
  }

  saveAnalysis(
    sessionId: number,
    snapshot: { id: number; fileName: string; localFilePath: string; fileHash: string; downloadedAt: string; parsedAt: string; sheets: { rows: unknown[] }[] },
    profile: WorkbookProfile,
    analysis: AiAnalysisResult
  ): void {
    const snapshotId = this.nextId();
    const rowCount = snapshot.sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
    this.db.prepare(
      `INSERT INTO sheet_snapshots
        (id, session_id, source_type, source_version, file_name, local_file_path, file_hash,
         downloaded_at, parsed_at, row_count, parse_status, parse_error, profile_json)
       VALUES (?, ?, 'excel_upload', ?, ?, ?, ?, ?, ?, ?, 'parsed', '', ?)`
    ).run(
      snapshotId, sessionId, snapshot.fileName, snapshot.fileName, snapshot.localFilePath,
      snapshot.fileHash, snapshot.downloadedAt, snapshot.parsedAt, rowCount, writeJson(profile)
    );

    this.db.prepare(
      `INSERT INTO ai_table_analyses
        (id, session_id, sheet_snapshot_id, model_name, prompt_version, table_summary, worksheet_name,
         header_row_index, inferred_columns_json, risks_json, raw_output_json, created_at)
       VALUES (?, ?, ?, 'rule-based-v1', 'v1', ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      this.nextId(), sessionId, snapshotId,
      analysis.tableSummary,
      analysis.columnPlan === null ? '' : analysis.columnPlan.sheetName || '',
      profile.sheets.length === 0 ? 1 : profile.sheets[0].headerRowIndex,
      writeJson(analysis.columnPlan),
      writeJson(analysis.risks),
      writeJson(analysis),
      nowStr()
    );
  }

  getProfile(sessionId: number): WorkbookProfile {
    const row = this.db
      .prepare(
        `SELECT id, session_id, file_name, local_file_path, file_hash, downloaded_at, parsed_at, row_count, profile_json
         FROM sheet_snapshots WHERE session_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(sessionId) as any;
    if (!row) return { fileName: '', sheets: [] };
    const fallback: WorkbookProfile = { fileName: row.file_name, sheets: [] };
    return readJson<WorkbookProfile>(row.profile_json, fallback);
  }

  getAnalysis(sessionId: number): AiAnalysisResult | null {
    const row = this.db
      .prepare(
        `SELECT id, session_id, sheet_snapshot_id, table_summary, worksheet_name, header_row_index,
                inferred_columns_json, risks_json, raw_output_json, created_at
         FROM ai_table_analyses WHERE session_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(sessionId) as any;
    if (!row) return null;
    return readJson<AiAnalysisResult | null>(row.raw_output_json, null);
  }

  private rowToItem(row: any): FollowupItem {
    return {
      id: row.id,
      sessionId: row.session_id,
      contactMatchId: row.contact_match_id,
      employeeId: row.employee_id,
      displayName: row.display_name,
      departmentId: row.department_id,
      email: row.email,
      phone: row.phone,
      sourceRows: readJson<number[]>(row.source_rows_json, []),
      missingFields: readJson<string[]>(row.missing_fields_json, []),
      filledFieldsSnapshot: readJson<Record<string, string>>(row.filled_fields_snapshot_json, {}),
      businessSummary: row.business_summary,
      issueSummary: row.issue_summary,
      status: row.status,
      dueAt: row.due_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private itemToParams(item: FollowupItem): (string | number | null)[] {
    return [
      item.id, item.sessionId, item.contactMatchId, item.employeeId, item.displayName,
      item.departmentId, item.email, item.phone,
      writeJson(item.sourceRows), writeJson(item.missingFields), writeJson(item.filledFieldsSnapshot),
      item.businessSummary, item.issueSummary, item.status, item.dueAt, item.createdAt, item.updatedAt,
    ];
  }

  insertItem(item: FollowupItem): void {
    this.db.prepare(
      `INSERT INTO followup_items
        (id, session_id, contact_match_id, employee_id, display_name, department_id, email, phone,
         source_rows_json, missing_fields_json, filled_fields_snapshot_json, business_summary,
         issue_summary, status, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(...this.itemToParams(item));
  }

  updateItemRow(item: FollowupItem, statusOverride?: string): void {
    const status = statusOverride ?? item.status;
    const params = this.itemToParams(item);
    this.db.prepare(
      `UPDATE followup_items SET
        employee_id = ?, display_name = ?, department_id = ?, email = ?, phone = ?,
        source_rows_json = ?, missing_fields_json = ?, filled_fields_snapshot_json = ?,
        business_summary = ?, issue_summary = ?, status = ?, due_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      params[3], params[4], params[5], params[6], params[7],
      params[8], params[9], params[10],
      params[11], params[12], status, params[14], item.updatedAt, item.id
    );
  }

  getItems(sessionId: number): FollowupItem[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, contact_match_id, employee_id, display_name, department_id, email, phone,
                source_rows_json, missing_fields_json, filled_fields_snapshot_json, business_summary,
                issue_summary, status, due_at, created_at, updated_at
         FROM followup_items WHERE session_id = ? ORDER BY id`
      )
      .all(sessionId) as any[];
    return rows.map(this.rowToItem);
  }

  findItem(itemId: number): FollowupItem | null {
    const row = this.db
      .prepare(
        `SELECT id, session_id, contact_match_id, employee_id, display_name, department_id, email, phone,
                source_rows_json, missing_fields_json, filled_fields_snapshot_json, business_summary,
                issue_summary, status, due_at, created_at, updated_at
         FROM followup_items WHERE id = ?`
      )
      .get(itemId) as any;
    return row ? this.rowToItem(row) : null;
  }

  requireItem(itemId: number): FollowupItem {
    const item = this.findItem(itemId);
    if (!item) throw new HttpError('待补充事项不存在');
    return item;
  }

  private rowToTask(row: any): FollowupTask {
    return {
      id: row.id,
      sessionId: row.session_id,
      followupItemId: row.followup_item_id,
      recipientId: row.recipient_id,
      channel: row.channel,
      messageDraft: row.message_draft,
      messageFinal: row.message_final,
      status: row.status,
      scheduledAt: row.scheduled_at,
      sentAt: row.sent_at,
      closedAt: row.closed_at,
    };
  }

  insertTask(task: FollowupTask): void {
    this.db.prepare(
      `INSERT INTO followup_tasks
        (id, session_id, followup_item_id, recipient_id, channel, message_draft, message_final,
         status, scheduled_at, sent_at, closed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      task.id, task.sessionId, task.followupItemId, task.recipientId, task.channel,
      task.messageDraft, task.messageFinal, task.status, task.scheduledAt, task.sentAt, task.closedAt
    );
  }

  updateTaskRow(task: FollowupTask): void {
    this.db.prepare(
      `UPDATE followup_tasks SET
        recipient_id = ?, channel = ?, message_draft = ?, message_final = ?, status = ?,
        scheduled_at = ?, sent_at = ?, closed_at = ?
       WHERE id = ?`
    ).run(
      task.recipientId, task.channel, task.messageDraft, task.messageFinal, task.status,
      task.scheduledAt, task.sentAt, task.closedAt, task.id
    );
  }

  getTasks(sessionId: number): FollowupTask[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, followup_item_id, recipient_id, channel, message_draft, message_final,
                status, scheduled_at, sent_at, closed_at
         FROM followup_tasks WHERE session_id = ? ORDER BY id`
      )
      .all(sessionId) as any[];
    return rows.map(this.rowToTask);
  }

  findTaskByItem(sessionId: number, itemId: number): FollowupTask | null {
    const row = this.db
      .prepare(
        `SELECT id, session_id, followup_item_id, recipient_id, channel, message_draft, message_final,
                status, scheduled_at, sent_at, closed_at
         FROM followup_tasks WHERE session_id = ? AND followup_item_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(sessionId, itemId) as any;
    return row ? this.rowToTask(row) : null;
  }

  requireTaskByItem(sessionId: number, itemId: number): FollowupTask {
    const task = this.findTaskByItem(sessionId, itemId);
    if (!task) throw new HttpError('催办任务不存在');
    return task;
  }

  private rowToEvent(row: any): ReminderEvent {
    return {
      id: row.id,
      sessionId: row.session_id,
      followupTaskId: row.followup_task_id,
      channel: row.channel,
      recipientId: row.recipient_id,
      messageSnapshot: row.message_snapshot,
      status: row.status,
      sentAt: row.sent_at,
      failedReason: row.failed_reason,
    };
  }

  addEvent(event: ReminderEvent): void {
    this.db.prepare(
      `INSERT INTO reminder_events
        (id, session_id, followup_task_id, channel, recipient_id, message_snapshot, status, sent_at, failed_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      event.id, event.sessionId, event.followupTaskId, event.channel, event.recipientId,
      event.messageSnapshot, event.status, event.sentAt, event.failedReason
    );
  }

  getEvents(sessionId: number): ReminderEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, session_id, followup_task_id, channel, recipient_id, message_snapshot, status, sent_at, failed_reason
         FROM reminder_events WHERE session_id = ? ORDER BY id DESC`
      )
      .all(sessionId) as any[];
    return rows.map(this.rowToEvent);
  }

  /** 全量替换某个会话下的待补充事项与催办任务。仅用于首次生成。 */
  saveItems(sessionId: number, items: FollowupItem[], tasks: FollowupTask[]): void {
    this.db.prepare('BEGIN').run();
    try {
      this.db.prepare('DELETE FROM followup_tasks WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM followup_items WHERE session_id = ?').run(sessionId);
      for (const item of items) this.insertItem(item);
      for (const task of tasks) this.insertTask(task);
      this.db.prepare('COMMIT').run();
    } catch (error) {
      this.db.prepare('ROLLBACK').run();
      throw error;
    }
  }

  /** 删除整个催办会话及其全部关联数据。 */
  deleteSession(sessionId: number): void {
    this.db.prepare('BEGIN').run();
    try {
      this.db.prepare('DELETE FROM reminder_events WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM followup_tasks WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM followup_items WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM contact_matches WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM ai_table_analyses WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM sheet_snapshots WHERE session_id = ?').run(sessionId);
      this.db.prepare('DELETE FROM analysis_sessions WHERE id = ?').run(sessionId);
      this.db.prepare('COMMIT').run();
    } catch (error) {
      this.db.prepare('ROLLBACK').run();
      throw error;
    }
  }

  /** 删除单个待补充事项及其催办任务、发送留痕、联系匹配记录。 */
  deleteItem(sessionId: number, itemId: number): void {
    this.db.prepare('BEGIN').run();
    try {
      const task = this.db
        .prepare(
          `SELECT id FROM followup_tasks WHERE session_id = ? AND followup_item_id = ? ORDER BY id DESC LIMIT 1`
        )
        .get(sessionId, itemId) as { id: number } | undefined;
      if (task) this.db.prepare('DELETE FROM reminder_events WHERE followup_task_id = ?').run(task.id);
      this.db.prepare('DELETE FROM followup_tasks WHERE followup_item_id = ?').run(itemId);
      const item = this.db.prepare('SELECT contact_match_id FROM followup_items WHERE id = ?').get(itemId) as
        | { contact_match_id: number }
        | undefined;
      if (item && item.contact_match_id > 0) {
        this.db.prepare('DELETE FROM contact_matches WHERE id = ?').run(item.contact_match_id);
      }
      this.db.prepare('DELETE FROM followup_items WHERE id = ?').run(itemId);
      this.db.prepare('COMMIT').run();
    } catch (error) {
      this.db.prepare('ROLLBACK').run();
      throw error;
    }
  }
}
