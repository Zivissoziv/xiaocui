import {
  AiAnalysisResult,
  AiSettings,
  ColumnPlan,
  FollowupDraft,
  HttpError,
  SheetData,
  SheetProfile,
  WorkbookProfile,
  WorkbookSnapshot,
} from './types';
import { callModel } from './openai';
import * as draftBuilder from './draftBuilder';
import * as ruleBased from './ruleBased';

/**
 * 真实大模型实现（等价 Java 版 SpringAiAnalysisService）。
 * 遵守设计文档的分层：程序读表 -> 模型只看结构摘要判列 -> 程序判定缺项 -> 模型生成文案。
 * 任何一步失败都返回部分结果或抛错，由 routing 决定降级，不把异常抛给用户。
 */
export async function analyze(
  settings: AiSettings,
  snapshot: WorkbookSnapshot,
  profile: WorkbookProfile,
  instruction: string | null,
  dueAt: string | null
): Promise<AiAnalysisResult> {
  const sheet = pickSheet(snapshot);
  const sheetProfile = profile.sheets.find((item) => item.sheetName === sheet.sheetName);
  if (!sheetProfile) throw new HttpError('没有可分析的 Sheet');

  const risks: string[] = [];
  let plan = await inferColumns(settings, sheet, sheetProfile, instruction, risks);
  if (plan === null) {
    plan = ruleBased.inferColumnPlan(sheet, sheetProfile, instruction);
    risks.push('模型未能识别列结构，已回退到关键词规则。');
  }

  const drafts = draftBuilder.build(sheet, plan, dueAt, risks);
  if (drafts.length > 0) {
    await generateMessages(settings, drafts, instruction, dueAt, risks);
  }

  const tableSummary =
    `${sheet.sheetName} 共读取 ${sheetProfile.rowCount} 行，` +
    `识别 ${plan.ownerColumn.length === 0 ? '待确认' : plan.ownerColumn} 为负责人列，` +
    `${plan.requiredColumns.length === 0 ? '待确认字段' : plan.requiredColumns.join('、')} 为待补充字段。` +
    `（${settings.model} 识别）`;
  return { tableSummary, columnPlan: plan, followupItems: drafts, risks };
}

function pickSheet(snapshot: WorkbookSnapshot): SheetData {
  let best: SheetData | null = null;
  for (const item of snapshot.sheets) {
    if (!best || item.rows.length > best.rows.length) best = item;
  }
  if (!best) throw new HttpError('没有可分析的 Sheet');
  return best;
}

/** 第一步：只把结构摘要给模型，让它判断哪一列是负责人、哪些列是要催的字段。 */
async function inferColumns(
  settings: AiSettings,
  sheet: SheetData,
  profile: SheetProfile,
  instruction: string | null,
  risks: string[]
): Promise<ColumnPlan | null> {
  let columns = '';
  for (const column of profile.columnProfiles) {
    columns +=
      `- ${column.column} | 类型 ${column.typeGuess} | 非空率 ${column.nonEmptyRate}` +
      ` | 样例 ${column.sampleValues.join('、')}\n`;
  }
  const prompt = `你是表格结构分析助手。下面是一个工作表的结构摘要，请判断各列用途。

用户的催办要求：${instruction ?? ''}

工作表名：${sheet.sheetName}，共 ${sheet.rows.length} 行数据。
列信息（列名 | 类型 | 非空率 | 样例）：
${columns}
请只输出一个 JSON 对象，不要任何解释文字、不要代码块标记，格式如下：
{
  "tableSummary": "一句话说明这张表在收集什么",
  "ownerColumn": "负责人列的列名，没有就空字符串",
  "emailColumn": "邮箱列列名，没有就空字符串",
  "phoneColumn": "手机或电话列列名，没有就空字符串",
  "businessKeyColumns": ["用于定位业务对象的列，例如项目名称、合同编号，最多 3 个"],
  "requiredColumns": ["用户这次要求必须填写、但目前存在空值的列"]
}
严格要求：只能使用上面真实出现过的列名，禁止编造；requiredColumns 要贴合用户的催办要求。`;

  try {
    const reply = JSON.parse(extractJson(await callModel(settings, prompt))) as Partial<ColumnPlanReply>;
    if (!reply) return null;
    const headers = new Set(sheet.headers);
    return {
      sheetName: sheet.sheetName,
      ownerColumn: pick(reply.ownerColumn, headers),
      departmentColumn: pick(reply.departmentColumn, headers),
      employeeColumn: pick(reply.employeeColumn, headers),
      emailColumn: pick(reply.emailColumn, headers),
      phoneColumn: pick(reply.phoneColumn, headers),
      businessKeyColumns: pickAll(reply.businessKeyColumns, headers, 3),
      requiredColumns: pickAll(reply.requiredColumns, headers, 8),
    };
  } catch (error) {
    risks.push(`模型列识别异常：${shorten(error instanceof Error ? error.message : String(error))}`);
    return null;
  }
}

/**
 * 对外：只重生成催办文案（不动列识别与缺项判定）。
 * 返回是否至少生成了一条文案；false 表示应由调用方回退到模板文案。
 */
export async function regenerateMessages(
  settings: AiSettings,
  drafts: FollowupDraft[],
  instruction: string | null,
  dueAt: string | null,
  risks: string[]
): Promise<boolean> {
  if (!drafts || drafts.length === 0) return false;
  try {
    await generateMessages(settings, drafts, instruction, dueAt, risks);
  } catch (error) {
    risks.push(`模型不可用，已使用模板文案：${shorten(error instanceof Error ? error.message : String(error))}`);
    return false;
  }
  return drafts.some((draft) => draft.messageDraft !== null && draft.messageDraft.trim().length > 0);
}

/** 第二步：把程序判定出的缺项交给模型，生成更自然的催办文案。 */
async function generateMessages(
  settings: AiSettings,
  drafts: FollowupDraft[],
  instruction: string | null,
  dueAt: string | null,
  risks: string[]
): Promise<void> {
  let items = '';
  for (let index = 0; index < drafts.length; index++) {
    const draft = drafts[index];
    items += `${index + 1}. 负责人：${draft.ownerRaw} | 业务：${draft.businessSummary} | 缺失：${draft.missingFields.join('、')} | 来源行：${draft.sourceRows.join(',')}\n`;
  }
  const prompt = `你是企业内部的催办助手。请为下面每位负责人写一条催办消息。

催办要求：${instruction ?? ''}
截止日期：${dueAt === null || dueAt.trim().length === 0 ? '未指定，写“尽快”' : dueAt}

待催办对象：
${items}
请只输出一个 JSON 对象，不要解释文字、不要代码块标记，格式如下：
{"messages":[{"owner":"负责人姓名","message":"催办消息正文"}]}
要求：每条正文不超过 80 字；写清楚缺哪几个字段和截止时间；语气礼貌但明确；
不要加入你推测出来但实际没有的信息；负责人姓名必须与输入完全一致；
不要把「催办要求」原文搬进正文（例如不要出现“本次要求：……”这类字样），
它只是给你判断范围的背景，收件人只需要知道自己缺什么、什么时候前补。`;

  try {
    const reply = JSON.parse(extractJson(await callModel(settings, prompt))) as MessageReply | null;
    if (!reply || !reply.messages || reply.messages.length === 0) {
      risks.push('模型未返回催办文案，已使用模板文案。');
      return;
    }
    const byOwner = new Map<string, string>();
    for (const entry of reply.messages) {
      if (entry && entry.owner && entry.message && entry.message.trim().length > 0) {
        if (!byOwner.has(entry.owner.trim())) byOwner.set(entry.owner.trim(), entry.message.trim());
      }
    }
    if (byOwner.size === 0) {
      risks.push('模型返回的催办文案无法匹配，已使用模板文案。');
      return;
    }
    for (let index = 0; index < drafts.length; index++) {
      const draft = drafts[index];
      const message = byOwner.get(draft.ownerRaw);
      if (!message || message.trim().length === 0) continue;
      drafts[index] = { ...draft, messageDraft: message };
    }
  } catch (error) {
    risks.push(`模型文案生成异常，已使用模板文案：${shorten(error instanceof Error ? error.message : String(error))}`);
  }
}

interface ColumnPlanReply {
  tableSummary?: string;
  ownerColumn?: string;
  departmentColumn?: string;
  employeeColumn?: string;
  emailColumn?: string;
  phoneColumn?: string;
  businessKeyColumns?: string[];
  requiredColumns?: string[];
}

interface MessageReply {
  messages?: Array<{ owner?: string; message?: string }>;
}

/** 模型经常用 ```json 包裹输出，这里把真正的 JSON 抠出来。 */
function extractJson(raw: string): string {
  if (!raw || raw.trim().length === 0) return '';
  const text = raw.trim();
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.substring(firstBrace, lastBrace + 1);
  }
  return text;
}

function pick(value: string | undefined, headers: Set<string>): string {
  if (value === null || value === undefined || value.trim().length === 0) return '';
  const trimmed = value.trim();
  return headers.has(trimmed) ? trimmed : '';
}

function pickAll(values: string[] | undefined, headers: Set<string>, limit: number): string[] {
  const result: string[] = [];
  if (!values) return result;
  for (const value of values) {
    const matched = pick(value, headers);
    if (matched.length > 0 && !result.includes(matched)) result.push(matched);
    if (result.length >= limit) break;
  }
  return result;
}

function shorten(message: string | null | undefined): string {
  if (!message) return '';
  return message.length > 120 ? message.substring(0, 120) + '…' : message;
}
