import { AnalysisSession, HttpError, ReconcilePreview, SessionDetail, UpdateSessionMetaRequest } from './types';
import * as workbookParser from './workbook';
import * as tableProfiler from './tableProfile';
import * as aiAnalysis from './aiRouting';
import * as followupService from './followupService';
import * as repository from './repository';
import { nowStr } from './util';

/** 预览阶段分析结果缓存：确认更新时直接复用，避免重复调用模型。 */
interface CachedAnalysis {
  snapshot: ReturnType<typeof workbookParser.parse>;
  profile: ReturnType<typeof tableProfiler.profile>;
  analysis: Awaited<ReturnType<typeof aiAnalysis.analyze>>;
}

const pendingRefreshes = new Map<number, CachedAnalysis>();

export async function createAndAnalyze(
  file: { buffer: Buffer; originalname?: string },
  title: string | null,
  instruction: string,
  dueAt: string | null
): Promise<SessionDetail> {
  const id = repository.nextId();
  const now = nowStr();
  const session: AnalysisSession = {
    id,
    title: isBlank(title) ? stripExtension(file.originalname ?? null) : (title as string),
    ownerId: 'current-user',
    sourceType: 'excel_upload',
    sourceRef: '',
    userInstruction: instruction,
    dueAt,
    status: 'analyzing',
    createdAt: now,
    updatedAt: now,
  };
  repository.saveSession(session);

  const snapshot = workbookParser.parse(file.buffer, file.originalname);
  const profile = tableProfiler.profile(snapshot);
  const analysis = await aiAnalysis.analyze(snapshot, profile, instruction, dueAt);
  repository.saveAnalysis(id, snapshot, profile, analysis);
  followupService.generate(id, analysis, dueAt);
  repository.saveSession(withSourceRef(withStatus(session, 'pending_confirmation'), snapshot.localFilePath));
  return followupService.detail(id);
}

export async function refresh(sessionId: number, file: { buffer: Buffer; originalname?: string }): Promise<SessionDetail> {
  const session = repository.requireSession(sessionId);
  repository.saveSession(withStatus(session, 'refreshing'));
  const snapshot = workbookParser.parse(file.buffer, file.originalname);
  const profile = tableProfiler.profile(snapshot);
  const analysis = await aiAnalysis.analyze(snapshot, profile, session.userInstruction, session.dueAt);
  repository.saveAnalysis(sessionId, snapshot, profile, analysis);
  followupService.reconcile(sessionId, analysis, session.dueAt);
  repository.saveSession(withSourceRef(withStatus(session, 'pending_confirmation'), snapshot.localFilePath));
  return followupService.detail(sessionId);
}

/** 刷新前的差异预览：解析并分析新文件，但与当前数据只做比对，不落库。分析结果缓存，供确认时复用。 */
export async function previewRefresh(sessionId: number, file: { buffer: Buffer; originalname?: string }): Promise<ReconcilePreview> {
  const session = repository.requireSession(sessionId);
  const snapshot = workbookParser.parse(file.buffer, file.originalname);
  const profile = tableProfiler.profile(snapshot);
  const analysis = await aiAnalysis.analyze(snapshot, profile, session.userInstruction, session.dueAt);
  pendingRefreshes.set(sessionId, { snapshot, profile, analysis });
  return followupService.previewReconcile(sessionId, analysis);
}

/**
 * 确认应用预览：直接复用预览阶段已分析好的结果执行对账，不再重新解析和调用模型。
 * 预览缓存不存在时（重启/超时/未预览）抛错，提示用户重新上传。
 */
export async function confirmRefresh(sessionId: number): Promise<SessionDetail> {
  const session = repository.requireSession(sessionId);
  const cached = pendingRefreshes.get(sessionId);
  if (!cached) {
    throw new HttpError('预览已失效，请重新上传最新版文件');
  }
  pendingRefreshes.delete(sessionId);
  repository.saveSession(withStatus(session, 'refreshing'));
  repository.saveAnalysis(sessionId, cached.snapshot, cached.profile, cached.analysis);
  followupService.reconcile(sessionId, cached.analysis, session.dueAt);
  repository.saveSession(withSourceRef(withStatus(session, 'pending_confirmation'), cached.snapshot.localFilePath));
  return followupService.detail(sessionId);
}

export function list(): AnalysisSession[] {
  return repository.findSessions();
}

/**
 * 修改任务元信息（任务名称 / 截止时间）。
 * title 为空保持原值；dueAt 为 null 保持原值，空字符串表示清空截止时间。
 */
export function updateMeta(sessionId: number, request: UpdateSessionMetaRequest): SessionDetail {
  const session = repository.requireSession(sessionId);
  const nextTitle = isBlank(request.title ?? null) ? session.title : (request.title as string).trim();
  const nextDueAt =
    request.dueAt === null || request.dueAt === undefined
      ? session.dueAt
      : request.dueAt.trim().length === 0
        ? null
        : request.dueAt.trim();
  if (nextTitle === session.title && nextDueAt === session.dueAt) {
    return followupService.detail(sessionId);
  }
  repository.saveSession(withTitleAndDueAt(session, nextTitle, nextDueAt));
  return followupService.detail(sessionId);
}

export function detail(sessionId: number): SessionDetail {
  return followupService.detail(sessionId);
}

function stripExtension(fileName: string | null): string {
  if (fileName === null || fileName.trim().length === 0) return '新的催办任务';
  return fileName.replace(/\.(xlsx|xls)$/, '');
}

function withStatus(session: AnalysisSession, nextStatus: string): AnalysisSession {
  return { ...session, status: nextStatus, updatedAt: nowStr() };
}

function withSourceRef(session: AnalysisSession, nextSourceRef: string): AnalysisSession {
  return { ...session, sourceRef: nextSourceRef, updatedAt: nowStr() };
}

function withTitleAndDueAt(session: AnalysisSession, nextTitle: string, nextDueAt: string | null): AnalysisSession {
  return { ...session, title: nextTitle, dueAt: nextDueAt, updatedAt: nowStr() };
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}
