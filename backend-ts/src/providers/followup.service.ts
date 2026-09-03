import { Injectable } from '@nestjs/common';
import {
  AiAnalysisResult,
  ContactMatch,
  FollowupDraft,
  FollowupItem,
  FollowupTask,
  ProgressSummary,
  ReconcilePreview,
  RowDiff,
  SendRequest,
  SessionDetail,
  UpdateFollowupItemRequest,
} from '../common/types';
import * as sender from '../lib/messaging/sender';
import * as draftBuilder from '../lib/messaging/draftBuilder';
import { firstNonBlank, isBlank, nowStr } from '../common/util';
import { RepositoryService } from '../database/repository.service';
import { ContactService } from './contact.service';
import { AiRoutingService } from './ai-routing.service';

@Injectable()
export class FollowupService {
  constructor(
    private readonly repository: RepositoryService,
    private readonly contactService: ContactService,
    private readonly aiRouting: AiRoutingService
  ) {}

  /** 首次生成：按分析结果建待补充事项与催办任务。 */
  generate(sessionId: number, analysis: AiAnalysisResult, dueAt: string | null): void {
    const items: FollowupItem[] = [];
    const tasks: FollowupTask[] = [];
    for (const draft of analysis.followupItems) {
      const match = this.contactService.match(draft);
      const item = this.buildItem(sessionId, draft, match, dueAt);
      items.push(item);
      tasks.push(this.buildTask(sessionId, item, match, draft));
    }
    this.repository.saveItems(sessionId, items, tasks);
  }

  /**
   * 重新上传表格后的增量对账。
   * 已补充完整的关闭任务，仍缺失的刷新缺项摘要，新出现的补建任务，绝不覆盖已有的发送留痕。
   */
  reconcile(sessionId: number, analysis: AiAnalysisResult, dueAt: string | null): void {
    const existingByOwner = new Map<string, FollowupItem>();
    for (const item of this.repository.getItems(sessionId)) {
      if (!existingByOwner.has(item.displayName)) existingByOwner.set(item.displayName, item);
    }

    const stillMissing = new Set<string>();
    for (const draft of analysis.followupItems) {
      stillMissing.add(draft.ownerRaw);
      const current = existingByOwner.get(draft.ownerRaw);

      // 根据最新联系方式重新判定待办状态：避免编辑邮箱清空后状态长期停留在 ready_to_send。
      // 走 ContactService 而非直接看 draft，这样表格里没写邮箱、但通讯录里有的人也能被补全。
      const latest = this.contactService.match(draft);
      const latestStatus = latest.matchStatus === 'needs_confirmation' ? 'needs_manual_review' : 'ready_to_send';

      if (!current) {
        const match = this.contactService.match(draft);
        const created = this.buildItem(sessionId, draft, match, dueAt);
        this.repository.insertItem(created);
        this.repository.insertTask(this.buildTask(sessionId, created, match, draft));
        continue;
      }

      if (current.status === 'resolved') {
        // 已解决的人在新表里又出现缺项：重新激活（按最新联系方式判定状态），并把已关闭的催办任务恢复为草稿。
        this.repository.updateItemRow(
          this.withReconcile(current, draft.sourceRows, draft.missingFields, draft.filledFields, draft.businessSummary, draft.issueSummary),
          latestStatus
        );
        const task = this.repository.findTaskByItem(sessionId, current.id);
        if (task && task.status !== 'draft' && task.status !== 'sent') {
          this.repository.updateTaskRow(this.withTaskStatus(task, 'draft'));
        }
        continue;
      }

      this.repository.updateItemRow(
        this.withReconcile(current, draft.sourceRows, draft.missingFields, draft.filledFields, draft.businessSummary, draft.issueSummary),
        latestStatus
      );

      const task = this.repository.findTaskByItem(sessionId, current.id);
      if (task) {
        const settled = task.status === 'sent' || task.status === 'closed' || task.status === 'blocked';
        if (!settled) {
          this.repository.updateTaskRow(this.withMessages(task, draft.messageDraft, draft.messageDraft));
        }
      }
    }

    for (const item of existingByOwner.values()) {
      if (stillMissing.has(item.displayName)) continue;
      if (item.status === 'resolved') continue;
      this.repository.updateItemRow(
        this.withReconcile(item, item.sourceRows, [], item.filledFieldsSnapshot, item.businessSummary, '已补充完整'),
        'resolved'
      );
      const task = this.repository.findTaskByItem(sessionId, item.id);
      if (task && task.status !== 'closed') {
        this.repository.updateTaskRow(this.closeNow(task));
      }
    }
  }

  /**
   * 对账预览：与 reconcile 使用相同的比对规则，但只读不写库，
   * 返回新增/补齐/变化/无变化四类差异，供前端展示后由用户决定是否执行更新。
   */
  previewReconcile(sessionId: number, analysis: AiAnalysisResult): ReconcilePreview {
    const existingByOwner = new Map<string, FollowupItem>();
    for (const item of this.repository.getItems(sessionId)) {
      if (!existingByOwner.has(item.displayName)) existingByOwner.set(item.displayName, item);
    }

    const added: RowDiff[] = [];
    const updated: RowDiff[] = [];
    const stillMissing = new Set<string>();
    let unchanged = 0;

    for (const draft of analysis.followupItems) {
      stillMissing.add(draft.ownerRaw);
      const current = existingByOwner.get(draft.ownerRaw);
      if (!current) {
        added.push({ owner: draft.ownerRaw, missing: draft.missingFields, previousMissing: [], note: '新出现的待补充对象' });
        continue;
      }
      if (current.status === 'resolved') continue;
      if (JSON.stringify(current.missingFields) === JSON.stringify(draft.missingFields)) {
        unchanged++;
      } else {
        updated.push({
          owner: draft.ownerRaw,
          missing: draft.missingFields,
          previousMissing: current.missingFields,
          note: '缺项内容有变化',
        });
      }
    }

    const resolved: RowDiff[] = [];
    for (const item of existingByOwner.values()) {
      if (stillMissing.has(item.displayName)) continue;
      if (item.status === 'resolved') continue;
      resolved.push({
        owner: item.displayName,
        missing: [],
        previousMissing: item.missingFields,
        note: '已补充完整，将标记完成',
      });
    }
    return { added, resolved, updated, unchanged };
  }

  private buildItem(sessionId: number, draft: FollowupDraft, match: ContactMatch, dueAt: string | null): FollowupItem {
    const itemStatus = match.matchStatus === 'needs_confirmation' ? 'needs_manual_review' : 'ready_to_send';
    const now = nowStr();
    return {
      id: this.repository.nextId(),
      sessionId,
      contactMatchId: this.repository.nextId(),
      employeeId: match.employeeId,
      displayName: match.displayName,
      departmentId: match.departmentId,
      email: match.email,
      phone: match.phone,
      sourceRows: draft.sourceRows,
      missingFields: draft.missingFields,
      filledFieldsSnapshot: draft.filledFields,
      businessSummary: draft.businessSummary,
      issueSummary: draft.issueSummary,
      status: itemStatus,
      dueAt,
      createdAt: now,
      updatedAt: now,
    };
  }

  private buildTask(sessionId: number, item: FollowupItem, match: ContactMatch, draft: FollowupDraft): FollowupTask {
    let recipient: string | null = match.employeeId;
    if (isBlank(recipient) || recipient === '待确认') {
      recipient = firstNonBlank(match.email, match.phone);
    }
    return {
      id: this.repository.nextId(),
      sessionId,
      followupItemId: item.id,
      recipientId: recipient,
      channel: 'manual',
      messageDraft: draft.messageDraft,
      messageFinal: draft.messageDraft,
      status: item.status === 'ready_to_send' ? 'draft' : 'blocked',
      scheduledAt: null,
      sentAt: null,
      closedAt: null,
    };
  }

  detail(sessionId: number): SessionDetail {
    const session = this.repository.requireSession(sessionId);
    const items = this.repository.getItems(sessionId);
    const tasks = this.repository.getTasks(sessionId);
    return {
      session,
      workbookProfile: this.repository.getProfile(sessionId),
      analysis: this.repository.getAnalysis(sessionId),
      items,
      tasks,
      reminderEvents: this.repository.getEvents(sessionId),
      progress: this.summarize(items),
    };
  }

  updateItem(itemId: number, request: UpdateFollowupItemRequest): SessionDetail {
    const item = this.repository.requireItem(itemId);
    const task = this.repository.requireTaskByItem(item.sessionId, itemId);
    let status = item.status;
    if (request.status !== null && request.status !== undefined && request.status.trim().length > 0) status = request.status;
    if (status === 'needs_manual_review' && this.hasContact(request)) status = 'ready_to_send';
    const nextItem: FollowupItem = {
      id: item.id,
      sessionId: item.sessionId,
      contactMatchId: item.contactMatchId,
      employeeId: firstNonBlank(request.employeeId ?? null, item.employeeId),
      displayName: firstNonBlank(request.displayName ?? null, item.displayName) ?? item.displayName,
      departmentId: firstNonBlank(request.departmentId ?? null, item.departmentId),
      email: firstNonBlank(request.email ?? null, item.email),
      phone: firstNonBlank(request.phone ?? null, item.phone),
      sourceRows: item.sourceRows,
      missingFields: item.missingFields,
      filledFieldsSnapshot: item.filledFieldsSnapshot,
      businessSummary: item.businessSummary,
      issueSummary: item.issueSummary,
      status,
      dueAt: item.dueAt,
      createdAt: item.createdAt,
      updatedAt: nowStr(),
    };
    this.repository.updateItemRow(nextItem, nextItem.status);
    const message = firstNonBlank(request.messageFinal ?? null, task.messageFinal);
    this.repository.updateTaskRow(this.withMessage(task, message));
    return this.detail(item.sessionId);
  }

  /**
   * 按当前模板（或模型）重生成催办文案，用于模板改版后刷新历史任务、或手工改乱了想重来。
   * 已补充完整（resolved）的人跳过——没有缺项可催，重写出来的文案也是空的。
   * 其余状态一律重写：发送留痕存的是当时的快照，改文案不会篡改已经发出去的内容。
   */
  async regenerateMessages(sessionId: number): Promise<SessionDetail> {
    const session = this.repository.requireSession(sessionId);
    const pending = this.repository.getItems(sessionId).filter((item) => item.status !== 'resolved');

    const generated = new Map<string, string>();
    if (pending.length > 0) {
      const drafts = pending.map(this.toDraft);
      const risks: string[] = [];
      await this.aiRouting.regenerateMessages(drafts, session.userInstruction, session.dueAt, risks);
      for (const draft of drafts) {
        if (!isBlank(draft.messageDraft)) generated.set(draft.ownerRaw, draft.messageDraft);
      }
    }

    for (const item of pending) {
      const fromAi = generated.get(item.displayName);
      const message = isBlank(fromAi)
        ? draftBuilder.buildMessage(
            item.displayName,
            item.missingFields,
            item.businessSummary || '',
            firstNonBlank(item.dueAt, session.dueAt)
          )
        : (fromAi as string);
      const task = this.repository.findTaskByItem(sessionId, item.id);
      if (task) {
        this.repository.updateTaskRow(this.withMessages(task, message, message));
      }
    }
    return this.detail(sessionId);
  }

  private toDraft(item: FollowupItem): FollowupDraft {
    return {
      ownerRaw: item.displayName,
      employeeHint: item.employeeId || '',
      departmentHint: item.departmentId || '',
      emailHint: item.email || '',
      phoneHint: item.phone || '',
      sourceRows: item.sourceRows,
      missingFields: item.missingFields,
      filledFields: item.filledFieldsSnapshot,
      businessSummary: item.businessSummary || '',
      issueSummary: item.issueSummary || '',
      messageDraft: '',
    };
  }

  sendAll(sessionId: number, request: SendRequest | null): SessionDetail {
    const selected = new Set<number>(request?.itemIds ?? []);
    for (const task of this.repository.getTasks(sessionId)) {
      if (selected.size > 0 && !selected.has(task.followupItemId)) continue;
      const item = this.repository.requireItem(task.followupItemId);
      // 只允许有联系方式的待发送/已发送对象；异常（无联系方式）和已补充完整的不再发送。
      // 已发送过的允许再次催办，每次都会新增一条留痕。
      if (item.status !== 'ready_to_send' && item.status !== 'sent') continue;
      const sent = this.sentNow(task);
      this.repository.updateTaskRow(sent);
      this.repository.updateItemRow(this.withStatus(item, 'sent'), 'sent');
      const event = sender.send(sessionId, sent);
      this.repository.addEvent({ ...event, id: this.repository.nextId() });
    }
    return this.detail(sessionId);
  }

  private summarize(items: FollowupItem[]): ProgressSummary {
    const total = items.length;
    const countBy = (status: string) => items.filter((item) => item.status === status).length;
    const ready = countBy('ready_to_send');
    const manual = countBy('needs_manual_review');
    const resolved = countBy('resolved');
    // sent 按事项统计，与明细口径一致（task 状态可能因对账滞后于 item）
    const sent = countBy('sent');
    // 完成度只算真正补充完整的（resolved）；已发送但仍缺项的不算完成
    const completion = total === 0 ? 100 : Math.round((resolved * 100) / total);
    return { total, readyToSend: ready, sent, resolved, needsManualReview: manual, completion };
  }

  /** 删除单个待补充事项（连同其催办任务、发送留痕、联系匹配记录），返回更新后的会话详情。 */
  deleteItem(itemId: number): SessionDetail {
    const item = this.repository.requireItem(itemId);
    this.repository.deleteItem(item.sessionId, itemId);
    return this.detail(item.sessionId);
  }

  // ---------- 不可变更新辅助（对应 Java record 的 withXxx 方法） ----------

  private withReconcile(
    item: FollowupItem,
    sourceRows: number[],
    missingFields: string[],
    filledFieldsSnapshot: Record<string, string>,
    businessSummary: string | null,
    issueSummary: string | null
  ): FollowupItem {
    return {
      ...item,
      sourceRows,
      missingFields,
      filledFieldsSnapshot,
      businessSummary,
      issueSummary,
      updatedAt: nowStr(),
    };
  }

  private withStatus(item: FollowupItem, nextStatus: string): FollowupItem {
    return { ...item, status: nextStatus, updatedAt: nowStr() };
  }

  private withTaskStatus(task: FollowupTask, nextStatus: string): FollowupTask {
    return { ...task, status: nextStatus };
  }

  private withMessage(task: FollowupTask, message: string | null): FollowupTask {
    return { ...task, messageFinal: message };
  }

  private withMessages(task: FollowupTask, draft: string | null, final: string | null): FollowupTask {
    return { ...task, messageDraft: draft, messageFinal: final };
  }

  private sentNow(task: FollowupTask): FollowupTask {
    return { ...task, status: 'sent', sentAt: nowStr() };
  }

  private closeNow(task: FollowupTask): FollowupTask {
    return { ...task, status: 'closed', closedAt: nowStr() };
  }

  private hasContact(request: UpdateFollowupItemRequest): boolean {
    // 与 ContactService 的判断保持一致：邮箱或手机号即可，工号不算联系方式。
    return !isBlank(request.email ?? null) || !isBlank(request.phone ?? null);
  }
}
