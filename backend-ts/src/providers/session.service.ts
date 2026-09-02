import { Injectable } from '@nestjs/common';
import {
  AiAnalysisResult,
  AnalysisSession,
  HttpError,
  ReconcilePreview,
  SessionDetail,
  UpdateSessionMetaRequest,
} from '../types';
import * as workbookParser from '../workbook';
import * as tableProfiler from '../tableProfile';
import { nowStr } from '../util';
import { RepositoryService } from './repository.service';
import { FollowupService } from './followup.service';
import { AiRoutingService } from './ai-routing.service';

/** 预览阶段分析结果缓存：确认更新时直接复用，避免重复调用模型。 */
interface CachedAnalysis {
  snapshot: ReturnType<typeof workbookParser.parse>;
  profile: ReturnType<typeof tableProfiler.profile>;
  analysis: AiAnalysisResult;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly repository: RepositoryService,
    private readonly followupService: FollowupService,
    private readonly aiAnalysis: AiRoutingService
  ) {}

  private readonly pendingRefreshes = new Map<number, CachedAnalysis>();

  async createAndAnalyze(
    file: { buffer: Buffer; originalname?: string },
    title: string | null,
    instruction: string,
    dueAt: string | null
  ): Promise<SessionDetail> {
    const id = this.repository.nextId();
    const now = nowStr();
    const session: AnalysisSession = {
      id,
      title: this.isBlank(title) ? this.stripExtension(file.originalname ?? null) : (title as string),
      ownerId: 'current-user',
      sourceType: 'excel_upload',
      sourceRef: '',
      userInstruction: instruction,
      dueAt,
      status: 'analyzing',
      createdAt: now,
      updatedAt: now,
    };
    this.repository.saveSession(session);

    const snapshot = workbookParser.parse(file.buffer, file.originalname);
    const profile = tableProfiler.profile(snapshot);
    const analysis = await this.aiAnalysis.analyze(snapshot, profile, instruction, dueAt);
    this.repository.saveAnalysis(id, snapshot, profile, analysis);
    this.followupService.generate(id, analysis, dueAt);
    this.repository.saveSession(this.withSourceRef(this.withStatus(session, 'pending_confirmation'), snapshot.localFilePath));
    return this.followupService.detail(id);
  }

  async refresh(sessionId: number, file: { buffer: Buffer; originalname?: string }): Promise<SessionDetail> {
    const session = this.repository.requireSession(sessionId);
    this.repository.saveSession(this.withStatus(session, 'refreshing'));
    const snapshot = workbookParser.parse(file.buffer, file.originalname);
    const profile = tableProfiler.profile(snapshot);
    const analysis = await this.aiAnalysis.analyze(snapshot, profile, session.userInstruction, session.dueAt);
    this.repository.saveAnalysis(sessionId, snapshot, profile, analysis);
    this.followupService.reconcile(sessionId, analysis, session.dueAt);
    this.repository.saveSession(this.withSourceRef(this.withStatus(session, 'pending_confirmation'), snapshot.localFilePath));
    return this.followupService.detail(sessionId);
  }

  /** 刷新前的差异预览：解析并分析新文件，但与当前数据只做比对，不落库。分析结果缓存，供确认时复用。 */
  async previewRefresh(sessionId: number, file: { buffer: Buffer; originalname?: string }): Promise<ReconcilePreview> {
    const session = this.repository.requireSession(sessionId);
    const snapshot = workbookParser.parse(file.buffer, file.originalname);
    const profile = tableProfiler.profile(snapshot);
    const analysis = await this.aiAnalysis.analyze(snapshot, profile, session.userInstruction, session.dueAt);
    this.pendingRefreshes.set(sessionId, { snapshot, profile, analysis });
    return this.followupService.previewReconcile(sessionId, analysis);
  }

  /**
   * 确认应用预览：直接复用预览阶段已分析好的结果执行对账，不再重新解析和调用模型。
   * 预览缓存不存在时（重启/超时/未预览）抛错，提示用户重新上传。
   */
  async confirmRefresh(sessionId: number): Promise<SessionDetail> {
    const session = this.repository.requireSession(sessionId);
    const cached = this.pendingRefreshes.get(sessionId);
    if (!cached) {
      throw new HttpError('预览已失效，请重新上传最新版文件');
    }
    this.pendingRefreshes.delete(sessionId);
    this.repository.saveSession(this.withStatus(session, 'refreshing'));
    this.repository.saveAnalysis(sessionId, cached.snapshot, cached.profile, cached.analysis);
    this.followupService.reconcile(sessionId, cached.analysis, session.dueAt);
    this.repository.saveSession(this.withSourceRef(this.withStatus(session, 'pending_confirmation'), cached.snapshot.localFilePath));
    return this.followupService.detail(sessionId);
  }

  list(): AnalysisSession[] {
    return this.repository.findSessions();
  }

  /**
   * 修改任务元信息（任务名称 / 截止时间）。
   * title 为空保持原值；dueAt 为 null 保持原值，空字符串表示清空截止时间。
   */
  updateMeta(sessionId: number, request: UpdateSessionMetaRequest): SessionDetail {
    const session = this.repository.requireSession(sessionId);
    const nextTitle = this.isBlank(request.title ?? null) ? session.title : (request.title as string).trim();
    const nextDueAt =
      request.dueAt === null || request.dueAt === undefined
        ? session.dueAt
        : request.dueAt.trim().length === 0
          ? null
          : request.dueAt.trim();
    if (nextTitle === session.title && nextDueAt === session.dueAt) {
      return this.followupService.detail(sessionId);
    }
    this.repository.saveSession(this.withTitleAndDueAt(session, nextTitle, nextDueAt));
    return this.followupService.detail(sessionId);
  }

  detail(sessionId: number): SessionDetail {
    return this.followupService.detail(sessionId);
  }

  private stripExtension(fileName: string | null): string {
    if (fileName === null || fileName.trim().length === 0) return '新的催办任务';
    return fileName.replace(/\.(xlsx|xls)$/, '');
  }

  private withStatus(session: AnalysisSession, nextStatus: string): AnalysisSession {
    return { ...session, status: nextStatus, updatedAt: nowStr() };
  }

  private withSourceRef(session: AnalysisSession, nextSourceRef: string): AnalysisSession {
    return { ...session, sourceRef: nextSourceRef, updatedAt: nowStr() };
  }

  private withTitleAndDueAt(session: AnalysisSession, nextTitle: string, nextDueAt: string | null): AnalysisSession {
    return { ...session, title: nextTitle, dueAt: nextDueAt, updatedAt: nowStr() };
  }

  private isBlank(value: string | null | undefined): boolean {
    return value === null || value === undefined || value.trim().length === 0;
  }
}
