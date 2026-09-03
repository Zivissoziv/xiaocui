import { Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import {
  AiAnalysisResult,
  AnalysisSession,
  FollowupItem,
  FollowupTask,
  HttpError,
  ReminderEvent,
  WorkbookProfile,
} from '../common/types';
import { DatabaseProvider, readJson, writeJson } from './database.provider';
import * as schema from './schema';
import { nowStr } from '../common/util';

type FollowupItemRow = typeof schema.followupItems.$inferSelect;
type FollowupTaskRow = typeof schema.followupTasks.$inferSelect;
type ReminderEventRow = typeof schema.reminderEvents.$inferSelect;

@Injectable()
export class RepositoryService {
  private readonly db: DatabaseProvider['db'];

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
    const row = this.db
      .select({ nextVal: schema.idCounter.nextVal })
      .from(schema.idCounter)
      .where(eq(schema.idCounter.name, this.COUNTER))
      .get();
    if (!row) {
      this.db.insert(schema.idCounter).values({ name: this.COUNTER, nextVal: this.COUNTER_START }).run();
      return this.COUNTER_START;
    }
    this.db
      .update(schema.idCounter)
      .set({ nextVal: row.nextVal + 1 })
      .where(eq(schema.idCounter.name, this.COUNTER))
      .run();
    return row.nextVal + 1;
  }

  saveSession(session: AnalysisSession): void {
    const values = {
      id: session.id,
      title: session.title,
      ownerId: session.ownerId,
      sourceType: session.sourceType,
      sourceRef: session.sourceRef,
      userInstruction: session.userInstruction,
      dueAt: session.dueAt,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
    const existing = this.db
      .select({ id: schema.analysisSessions.id })
      .from(schema.analysisSessions)
      .where(eq(schema.analysisSessions.id, session.id))
      .get();
    if (!existing) {
      this.db.insert(schema.analysisSessions).values(values).run();
    } else {
      const { id: _id, ...updates } = values;
      this.db.update(schema.analysisSessions).set(updates).where(eq(schema.analysisSessions.id, session.id)).run();
    }
  }

  /** 会话列（owner_id 等业务上必有值，类型继承 Java 版非空约定），显式收窄。 */
  private toSession(row: typeof schema.analysisSessions.$inferSelect): AnalysisSession {
    return {
      id: row.id,
      title: row.title,
      ownerId: row.ownerId as string,
      sourceType: row.sourceType,
      sourceRef: row.sourceRef as string,
      userInstruction: row.userInstruction as string,
      dueAt: row.dueAt,
      status: row.status,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  findSessions(): AnalysisSession[] {
    return this.db
      .select()
      .from(schema.analysisSessions)
      .orderBy(desc(schema.analysisSessions.updatedAt), desc(schema.analysisSessions.id))
      .all()
      .map((row) => this.toSession(row));
  }

  findSession(id: number): AnalysisSession | null {
    const row = this.db.select().from(schema.analysisSessions).where(eq(schema.analysisSessions.id, id)).get();
    return row ? this.toSession(row) : null;
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
    this.db
      .insert(schema.sheetSnapshots)
      .values({
        id: snapshotId,
        sessionId,
        sourceType: 'excel_upload',
        sourceVersion: snapshot.fileName,
        fileName: snapshot.fileName,
        localFilePath: snapshot.localFilePath,
        fileHash: snapshot.fileHash,
        downloadedAt: snapshot.downloadedAt,
        parsedAt: snapshot.parsedAt,
        rowCount,
        parseStatus: 'parsed',
        parseError: '',
        profileJson: writeJson(profile),
      })
      .run();

    this.db
      .insert(schema.aiTableAnalyses)
      .values({
        id: this.nextId(),
        sessionId,
        sheetSnapshotId: snapshotId,
        modelName: 'rule-based-v1',
        promptVersion: 'v1',
        tableSummary: analysis.tableSummary,
        worksheetName: analysis.columnPlan === null ? '' : analysis.columnPlan.sheetName || '',
        headerRowIndex: profile.sheets.length === 0 ? 1 : profile.sheets[0].headerRowIndex,
        inferredColumnsJson: writeJson(analysis.columnPlan),
        risksJson: writeJson(analysis.risks),
        rawOutputJson: writeJson(analysis),
        createdAt: nowStr(),
      })
      .run();
  }

  getProfile(sessionId: number): WorkbookProfile {
    const row = this.db
      .select({ fileName: schema.sheetSnapshots.fileName, profileJson: schema.sheetSnapshots.profileJson })
      .from(schema.sheetSnapshots)
      .where(eq(schema.sheetSnapshots.sessionId, sessionId))
      .orderBy(desc(schema.sheetSnapshots.id))
      .get();
    if (!row) return { fileName: '', sheets: [] };
    const fallback: WorkbookProfile = { fileName: row.fileName, sheets: [] };
    return readJson<WorkbookProfile>(row.profileJson, fallback);
  }

  getAnalysis(sessionId: number): AiAnalysisResult | null {
    const row = this.db
      .select({ rawOutputJson: schema.aiTableAnalyses.rawOutputJson })
      .from(schema.aiTableAnalyses)
      .where(eq(schema.aiTableAnalyses.sessionId, sessionId))
      .orderBy(desc(schema.aiTableAnalyses.id))
      .get();
    if (!row) return null;
    return readJson<AiAnalysisResult | null>(row.rawOutputJson, null);
  }

  private rowToItem(row: FollowupItemRow): FollowupItem {
    return {
      id: row.id,
      sessionId: row.sessionId,
      contactMatchId: row.contactMatchId as number,
      employeeId: row.employeeId,
      displayName: row.displayName as string,
      departmentId: row.departmentId,
      email: row.email,
      phone: row.phone,
      sourceRows: readJson<number[]>(row.sourceRowsJson, []),
      missingFields: readJson<string[]>(row.missingFieldsJson, []),
      filledFieldsSnapshot: readJson<Record<string, string>>(row.filledFieldsSnapshotJson, {}),
      businessSummary: row.businessSummary,
      issueSummary: row.issueSummary,
      status: row.status,
      dueAt: row.dueAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private itemToValues(item: FollowupItem) {
    return {
      id: item.id,
      sessionId: item.sessionId,
      contactMatchId: item.contactMatchId,
      employeeId: item.employeeId,
      displayName: item.displayName,
      departmentId: item.departmentId,
      email: item.email,
      phone: item.phone,
      sourceRowsJson: writeJson(item.sourceRows),
      missingFieldsJson: writeJson(item.missingFields),
      filledFieldsSnapshotJson: writeJson(item.filledFieldsSnapshot),
      businessSummary: item.businessSummary,
      issueSummary: item.issueSummary,
      status: item.status,
      dueAt: item.dueAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  insertItem(item: FollowupItem): void {
    this.db.insert(schema.followupItems).values(this.itemToValues(item)).run();
  }

  updateItemRow(item: FollowupItem, statusOverride?: string): void {
    const status = statusOverride ?? item.status;
    this.db
      .update(schema.followupItems)
      .set({
        employeeId: item.employeeId,
        displayName: item.displayName,
        departmentId: item.departmentId,
        email: item.email,
        phone: item.phone,
        sourceRowsJson: writeJson(item.sourceRows),
        missingFieldsJson: writeJson(item.missingFields),
        filledFieldsSnapshotJson: writeJson(item.filledFieldsSnapshot),
        businessSummary: item.businessSummary,
        issueSummary: item.issueSummary,
        status,
        dueAt: item.dueAt,
        updatedAt: item.updatedAt,
      })
      .where(eq(schema.followupItems.id, item.id))
      .run();
  }

  getItems(sessionId: number): FollowupItem[] {
    return this.db
      .select()
      .from(schema.followupItems)
      .where(eq(schema.followupItems.sessionId, sessionId))
      .orderBy(schema.followupItems.id)
      .all()
      .map((row) => this.rowToItem(row));
  }

  findItem(itemId: number): FollowupItem | null {
    const row = this.db.select().from(schema.followupItems).where(eq(schema.followupItems.id, itemId)).get();
    return row ? this.rowToItem(row) : null;
  }

  requireItem(itemId: number): FollowupItem {
    const item = this.findItem(itemId);
    if (!item) throw new HttpError('待补充事项不存在');
    return item;
  }

  private rowToTask(row: FollowupTaskRow): FollowupTask {
    return {
      id: row.id,
      sessionId: row.sessionId,
      followupItemId: row.followupItemId,
      recipientId: row.recipientId,
      channel: row.channel,
      messageDraft: row.messageDraft,
      messageFinal: row.messageFinal,
      status: row.status,
      scheduledAt: row.scheduledAt,
      sentAt: row.sentAt,
      closedAt: row.closedAt,
    };
  }

  insertTask(task: FollowupTask): void {
    this.db
      .insert(schema.followupTasks)
      .values({
        id: task.id,
        sessionId: task.sessionId,
        followupItemId: task.followupItemId,
        recipientId: task.recipientId,
        channel: task.channel,
        messageDraft: task.messageDraft,
        messageFinal: task.messageFinal,
        status: task.status,
        scheduledAt: task.scheduledAt,
        sentAt: task.sentAt,
        closedAt: task.closedAt,
      })
      .run();
  }

  updateTaskRow(task: FollowupTask): void {
    this.db
      .update(schema.followupTasks)
      .set({
        recipientId: task.recipientId,
        channel: task.channel,
        messageDraft: task.messageDraft,
        messageFinal: task.messageFinal,
        status: task.status,
        scheduledAt: task.scheduledAt,
        sentAt: task.sentAt,
        closedAt: task.closedAt,
      })
      .where(eq(schema.followupTasks.id, task.id))
      .run();
  }

  getTasks(sessionId: number): FollowupTask[] {
    return this.db
      .select()
      .from(schema.followupTasks)
      .where(eq(schema.followupTasks.sessionId, sessionId))
      .orderBy(schema.followupTasks.id)
      .all()
      .map((row) => this.rowToTask(row));
  }

  findTaskByItem(sessionId: number, itemId: number): FollowupTask | null {
    const row = this.db
      .select()
      .from(schema.followupTasks)
      .where(and(eq(schema.followupTasks.sessionId, sessionId), eq(schema.followupTasks.followupItemId, itemId)))
      .orderBy(desc(schema.followupTasks.id))
      .get();
    return row ? this.rowToTask(row) : null;
  }

  requireTaskByItem(sessionId: number, itemId: number): FollowupTask {
    const task = this.findTaskByItem(sessionId, itemId);
    if (!task) throw new HttpError('催办任务不存在');
    return task;
  }

  private rowToEvent(row: ReminderEventRow): ReminderEvent {
    return {
      id: row.id,
      sessionId: row.sessionId,
      followupTaskId: row.followupTaskId,
      channel: row.channel,
      recipientId: row.recipientId,
      messageSnapshot: row.messageSnapshot,
      status: row.status,
      sentAt: row.sentAt,
      failedReason: row.failedReason,
    };
  }

  addEvent(event: ReminderEvent): void {
    this.db
      .insert(schema.reminderEvents)
      .values({
        id: event.id,
        sessionId: event.sessionId,
        followupTaskId: event.followupTaskId,
        channel: event.channel,
        recipientId: event.recipientId,
        messageSnapshot: event.messageSnapshot,
        status: event.status,
        sentAt: event.sentAt,
        failedReason: event.failedReason,
      })
      .run();
  }

  getEvents(sessionId: number): ReminderEvent[] {
    return this.db
      .select()
      .from(schema.reminderEvents)
      .where(eq(schema.reminderEvents.sessionId, sessionId))
      .orderBy(desc(schema.reminderEvents.id))
      .all()
      .map((row) => this.rowToEvent(row));
  }

  /** 全量替换某个会话下的待补充事项与催办任务。仅用于首次生成。 */
  saveItems(sessionId: number, items: FollowupItem[], tasks: FollowupTask[]): void {
    this.db.transaction((tx) => {
      tx.delete(schema.followupTasks).where(eq(schema.followupTasks.sessionId, sessionId)).run();
      tx.delete(schema.followupItems).where(eq(schema.followupItems.sessionId, sessionId)).run();
      for (const item of items) tx.insert(schema.followupItems).values(this.itemToValues(item)).run();
      for (const task of tasks) tx.insert(schema.followupTasks).values(this.taskToValues(task)).run();
    });
  }

  /** 删除整个催办会话及其全部关联数据。 */
  deleteSession(sessionId: number): void {
    this.db.transaction((tx) => {
      tx.delete(schema.reminderEvents).where(eq(schema.reminderEvents.sessionId, sessionId)).run();
      tx.delete(schema.followupTasks).where(eq(schema.followupTasks.sessionId, sessionId)).run();
      tx.delete(schema.followupItems).where(eq(schema.followupItems.sessionId, sessionId)).run();
      tx.delete(schema.contactMatches).where(eq(schema.contactMatches.sessionId, sessionId)).run();
      tx.delete(schema.aiTableAnalyses).where(eq(schema.aiTableAnalyses.sessionId, sessionId)).run();
      tx.delete(schema.sheetSnapshots).where(eq(schema.sheetSnapshots.sessionId, sessionId)).run();
      tx.delete(schema.analysisSessions).where(eq(schema.analysisSessions.id, sessionId)).run();
    });
  }

  /** 删除单个待补充事项及其催办任务、发送留痕、联系匹配记录。 */
  deleteItem(sessionId: number, itemId: number): void {
    this.db.transaction((tx) => {
      const task = tx
        .select({ id: schema.followupTasks.id })
        .from(schema.followupTasks)
        .where(and(eq(schema.followupTasks.sessionId, sessionId), eq(schema.followupTasks.followupItemId, itemId)))
        .orderBy(desc(schema.followupTasks.id))
        .get();
      if (task) tx.delete(schema.reminderEvents).where(eq(schema.reminderEvents.followupTaskId, task.id)).run();
      tx.delete(schema.followupTasks).where(eq(schema.followupTasks.followupItemId, itemId)).run();
      const item = tx
        .select({ contactMatchId: schema.followupItems.contactMatchId })
        .from(schema.followupItems)
        .where(eq(schema.followupItems.id, itemId))
        .get();
      if (item && item.contactMatchId !== null && item.contactMatchId > 0) {
        tx.delete(schema.contactMatches).where(eq(schema.contactMatches.id, item.contactMatchId)).run();
      }
      tx.delete(schema.followupItems).where(eq(schema.followupItems.id, itemId)).run();
    });
  }

  private taskToValues(task: FollowupTask) {
    return {
      id: task.id,
      sessionId: task.sessionId,
      followupItemId: task.followupItemId,
      recipientId: task.recipientId,
      channel: task.channel,
      messageDraft: task.messageDraft,
      messageFinal: task.messageFinal,
      status: task.status,
      scheduledAt: task.scheduledAt,
      sentAt: task.sentAt,
      closedAt: task.closedAt,
    };
  }
}
