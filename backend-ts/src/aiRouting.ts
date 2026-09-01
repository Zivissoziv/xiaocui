import {
  AiAnalysisResult,
  FollowupDraft,
  WorkbookProfile,
  WorkbookSnapshot,
} from './types';
import { loadSettings, isUsable } from './settings';
import * as openAiAnalysis from './openAiAnalysis';
import * as ruleBased from './ruleBased';

/**
 * 按设置决定走大模型还是关键词规则（等价 Java 版 RoutingAiAnalysisService）。
 * 模型不可用、报错、返回异常结构时自动降级，保证没配 Key 或 Key 失效时功能照常。
 */
export async function analyze(
  snapshot: WorkbookSnapshot,
  profile: WorkbookProfile,
  instruction: string | null,
  dueAt: string | null
): Promise<AiAnalysisResult> {
  if (!isUsable(loadSettings())) {
    return ruleBased.analyze(snapshot, profile, instruction, dueAt);
  }
  try {
    const result = await openAiAnalysis.analyze(loadSettings(), snapshot, profile, instruction, dueAt);
    if (result && result.columnPlan !== null) {
      return result;
    }
    console.warn('AI 分析结果为空，回退到规则实现');
  } catch (error) {
    // 异常信息里可能带密钥片段，只记类型和简短消息
    console.warn('AI 分析失败，回退到规则实现：', error instanceof Error ? error.name : typeof error);
  }

  const fallback = ruleBased.analyze(snapshot, profile, instruction, dueAt);
  const risks = ['本次未使用大模型，结果来自关键词规则。请在「设置」中检查 API Key 与网络。', ...fallback.risks];
  return { tableSummary: fallback.tableSummary, columnPlan: fallback.columnPlan, followupItems: fallback.followupItems, risks };
}

/** 重生成文案：模型不可用时直接返回 false，让调用方用模板文案，不把异常抛给用户。 */
export async function regenerateMessages(
  drafts: FollowupDraft[],
  userInstruction: string | null,
  dueAt: string | null,
  risks: string[]
): Promise<boolean> {
  if (!isUsable(loadSettings())) return false;
  try {
    return await openAiAnalysis.regenerateMessages(loadSettings(), drafts, userInstruction, dueAt, risks);
  } catch (error) {
    console.warn('AI 重生成文案失败，回退到模板文案：', error instanceof Error ? error.name : typeof error);
    return false;
  }
}
