import {
  AiAnalysisResult,
  ColumnPlan,
  FollowupDraft,
  HttpError,
  SheetData,
  SheetProfile,
  WorkbookProfile,
  WorkbookSnapshot,
} from './types';
import * as draftBuilder from './draftBuilder';

/**
 * 关键词规则实现（等价 Java 版 RuleBasedAiAnalysisService）。
 * 作为没有配置大模型时的兜底，也供 AI 版在列识别失败时回退。
 */
export function analyze(
  snapshot: WorkbookSnapshot,
  profile: WorkbookProfile,
  userInstruction: string | null,
  dueAt: string | null
): AiAnalysisResult {
  const sheet = pickSheet(snapshot);
  const sheetProfile = profile.sheets.find((item) => item.sheetName === sheet.sheetName);
  if (!sheetProfile) throw new Error('没有可分析的 Sheet');
  const plan = inferColumnPlan(sheet, sheetProfile, userInstruction);
  const risks: string[] = [];
  const drafts = draftBuilder.build(sheet, plan, dueAt, risks);
  const summary =
    `${snapshot.fileName} / ${sheet.sheetName} 共读取 ${sheet.rows.length} 行，` +
    `识别 ${blankToPending(plan.ownerColumn)} 为负责人列，` +
    `${plan.requiredColumns.length === 0 ? '待确认字段' : plan.requiredColumns.join('、')} 为待补充字段。（关键词规则识别）`;
  return { tableSummary: summary, columnPlan: plan, followupItems: drafts, risks };
}

function pickSheet(snapshot: WorkbookSnapshot): SheetData {
  let best: SheetData | null = null;
  for (const item of snapshot.sheets) {
    if (!best || item.rows.length > best.rows.length) best = item;
  }
  if (!best) throw new HttpError('没有可分析的 Sheet');
  return best;
}

export function inferColumnPlan(sheet: SheetData, profile: SheetProfile, instruction: string | null): ColumnPlan {
  const headers = sheet.headers;
  const owner = findHeader(headers, '负责人', '责任人', '填报人', '联系人', '姓名', '经办人');
  const department = findHeader(headers, '部门', '单位', '组织', '区域', '中心');
  const employee = findHeader(headers, '工号', '员工号', '员工编号', '账号');
  const email = findHeader(headers, '邮箱', 'email', 'mail');
  const phone = findHeader(headers, '手机', '电话', '联系方式', 'phone');
  const used = new Set<string>();
  addIfPresent(used, owner, department, employee, email, phone);

  const required = new Set<string>();
  for (const header of headers) {
    if (!used.has(header) && instruction && compact(instruction).includes(compact(header))) {
      required.add(header);
    }
  }
  for (const item of required) used.add(item);

  // 注意：这里的"合同"等关键词会误伤"合同金额"这类采集列，
  // 因此必须先让 required 占位再挑 businessKeys。
  const businessKeys = headers
    .filter((header) => !used.has(header))
    .filter((header) => containsAny(header, '项目', '事项', '合同', '客户', '供应商', '名称', '编号', '主题'))
    .filter((header) => !looksLikeCollectedField(header))
    .slice(0, 3);
  for (const item of businessKeys) used.add(item);

  if (required.size === 0) {
    for (const column of profile.columnProfiles) {
      if (required.size >= 6) break;
      if (used.has(column.column)) continue;
      if (containsAny(column.column, '序号', '编号', '工号', '姓名', '负责人', '部门', '邮箱', '手机')) continue;
      if (
        column.nonEmptyRate < 0.96 ||
        containsAny(column.column, '金额', '时间', '日期', '进度', '说明', '备注', '附件', '反馈', '结果')
      ) {
        required.add(column.column);
      }
    }
  }
  if (required.size === 0) {
    const tail = headers.filter((header) => !used.has(header));
    for (const header of tail.slice(Math.max(0, tail.length - 3))) required.add(header);
  }

  return {
    sheetName: sheet.sheetName,
    ownerColumn: owner,
    departmentColumn: department,
    employeeColumn: employee,
    emailColumn: email,
    phoneColumn: phone,
    businessKeyColumns: businessKeys,
    requiredColumns: Array.from(required),
  };
}

/** 形如"合同金额""预计完成时间"的列是采集项，不应被当成业务标识列。 */
function looksLikeCollectedField(header: string): boolean {
  return containsAny(header, '金额', '时间', '日期', '进度', '说明', '备注', '附件', '反馈', '结果', '状态');
}

function findHeader(headers: string[], ...keywords: string[]): string {
  return headers.find((header) => containsAny(header, ...keywords)) || '';
}

function containsAny(value: string, ...keywords: string[]): boolean {
  const lower = (value || '').toLowerCase();
  return keywords.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function addIfPresent(values: Set<string>, ...candidates: (string | null)[]): void {
  for (const candidate of candidates) {
    if (candidate !== null && candidate !== undefined && candidate.trim().length > 0) values.add(candidate);
  }
}

function blankToPending(value: string | null): string {
  return value === null || value === undefined || value.trim().length === 0 ? '待确认' : value;
}

function compact(value: string): string {
  return value.split(' ').join('');
}
