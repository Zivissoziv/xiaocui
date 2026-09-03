import { ColumnPlan, FollowupDraft, SheetData } from '../../common/types';

/**
 * 确定性的缺项判定与聚合（等价 Java 版 DraftBuilder）。
 * 不管列是谁（规则还是模型）识别出来的，缺哪些项都交给程序按空值判断，不丢给模型瞎猜。
 */

interface OwnerRow {
  row: SheetData['rows'][number];
  index: number;
  emails: string[];
  phones: string[];
  employees: string[];
  departments: string[];
}

export function build(sheet: SheetData, plan: ColumnPlan, dueAt: string | null, risks: string[]): FollowupDraft[] {
  const grouped = new Map<string, OwnerRow[]>();
  for (const row of sheet.rows) {
    let owners = splitValues(get(row, plan.ownerColumn));
    const emails = splitValues(get(row, plan.emailColumn));
    const phones = splitValues(get(row, plan.phoneColumn));
    const employees = splitValues(get(row, plan.employeeColumn));
    const departments = splitValues(get(row, plan.departmentColumn));
    if (owners.length === 0) owners = [`未识别负责人-${row.rowNumber}`];
    for (let index = 0; index < owners.length; index++) {
      const owner = owners[index];
      if (!grouped.has(owner)) grouped.set(owner, []);
      grouped.get(owner)!.push({ row, index, emails, phones, employees, departments });
    }
  }

  const drafts: FollowupDraft[] = [];
  for (const [owner, ownerRows] of grouped) {
    const missing = new Set<string>();
    const filled = new Map<string, string>();
    const sourceRows: number[] = [];
    const businessValues = new Set<string>();

    for (const entry of ownerRows) {
      const row = entry.row;
      sourceRows.push(row.rowNumber);
      for (const required of plan.requiredColumns) {
        const value = get(row, required);
        if (isJavaBlank(value)) missing.add(required);
        else filled.set(required, value);
      }
      for (const businessKey of plan.businessKeyColumns) {
        const value = get(row, businessKey);
        if (!isJavaBlank(value)) businessValues.add(value);
      }
    }
    if (missing.size === 0) continue;

    const sample = ownerRows[0];
    const displayName = owner.startsWith('未识别负责人-') ? '未识别负责人' : owner;
    const email = pickAt(sample.emails, sample.index);
    const phone = pickAt(sample.phones, sample.index);
    const employee = pickAt(sample.employees, sample.index);
    const department = pickAt(sample.departments, sample.index);
    const businessSummary =
      businessValues.size === 0 ? `来源行 ${joinNumbers(sourceRows)}` : Array.from(businessValues).join('，');
    const issueSummary = `第 ${joinNumbers(sourceRows)} 行缺少 ${Array.from(missing).join('、')}`;

    if (displayName === '未识别负责人' || allBlank(email, phone)) {
      risks.push(`第 ${joinNumbers(sourceRows)} 行负责人或邮箱需要人工确认。`);
    }

    drafts.push({
      ownerRaw: displayName,
      employeeHint: employee,
      departmentHint: department,
      emailHint: email,
      phoneHint: phone,
      sourceRows,
      missingFields: Array.from(missing),
      filledFields: Object.fromEntries(filled),
      businessSummary,
      issueSummary,
      messageDraft: buildMessage(displayName, Array.from(missing), businessSummary, dueAt),
    });
  }
  return drafts;
}

/**
 * 模板文案只讲「谁、缺什么、什么时候前」，不照抄用户的催办要求原文：
 * 那段要求是用来判定催谁的，收件人看到反而莫名其妙。
 */
export function buildMessage(owner: string, missing: string[], businessSummary: string, dueAt: string | null): string {
  const due = dueAt === null || dueAt === undefined || /^\s*$/.test(dueAt) ? '截止时间前' : dueAt;
  return `${owner}你好，你负责的 ${businessSummary} 还有 ${missing.join('、')} 待补充，请在 ${due} 前更新表格，谢谢。`;
}

function get(row: SheetData['rows'][number], column: string | null | undefined): string {
  if (!column || isJavaBlank(column)) return '';
  return row.values[column] || '';
}

/** 按逗号/顿号/分号/斜杠/空白拆分一个单元格里的多个值（如多个负责人、多个邮箱）。 */
function splitValues(raw: string): string[] {
  if (raw === null || raw === undefined || /^\s*$/.test(raw)) return [];
  return raw
    .split(/[、，,;；/\s]+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

/** 取拆分后第 index 个值，越界返回空串（如一行只有一个邮箱但有两个负责人）。 */
function pickAt(values: string[], index: number): string {
  return values && index < values.length ? values[index] : '';
}

function joinNumbers(values: number[]): string {
  return values.map(String).join('、');
}

function allBlank(...values: string[]): boolean {
  return values.every((value) => value === null || value === undefined || /^\s*$/.test(value));
}

function isJavaBlank(value: string): boolean {
  return value.length === 0 || /^\s*$/.test(value);
}
