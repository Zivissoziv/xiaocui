import { ColumnProfile, SheetData, WorkbookProfile, WorkbookSnapshot } from './types';

/** 列画像：统计每列的非空率、唯一值与样例，供规则识列与 AI 提示词使用。 */
export function profile(snapshot: WorkbookSnapshot): WorkbookProfile {
  return { fileName: snapshot.fileName, sheets: snapshot.sheets.map(profileSheet) };
}

function profileSheet(sheet: SheetData): import('./types').SheetProfile {
  const columns: ColumnProfile[] = [];
  for (const header of sheet.headers) {
    const values = sheet.rows
      .map((row) => row.values[header] || '')
      .filter((value) => value.trim().length > 0);
    const unique = new Set(values);
    columns.push({
      column: header,
      typeGuess: guessType(header, values),
      nonEmptyRate:
        sheet.rows.length === 0
          ? 0
          : Math.round((values.length * 100.0) / sheet.rows.length) / 100.0,
      uniqueCount: unique.size,
      sampleValues: Array.from(unique).slice(0, 3),
    });
  }
  return {
    sheetName: sheet.sheetName,
    rowCount: sheet.rows.length,
    headerRowIndex: sheet.headerRowIndex,
    columnProfiles: columns,
  };
}

function guessType(header: string, values: string[]): string {
  const lower = header.toLowerCase();
  if (containsAny(lower, '负责人', '责任人', '姓名', '联系人', '经办人')) return 'person_name';
  if (containsAny(lower, '部门', '单位', '组织', '区域')) return 'department';
  if (containsAny(lower, '邮箱', 'email', 'mail') || values.some((v) => /^\S+@\S+\.\S+$/.test(v))) return 'email';
  if (containsAny(lower, '手机', '电话', 'phone') || values.some((v) => /^1\d{10}$/.test(v))) return 'phone';
  if (containsAny(lower, '时间', '日期') || values.some((v) => /\d{4}[-/年]\d{1,2}/.test(v))) return 'date';
  if (containsAny(lower, '金额', '收入', '成本') || values.some((v) => /^-?\d+(\.\d+)?$/.test(v))) return 'number';
  return 'text';
}

function containsAny(value: string, ...keywords: string[]): boolean {
  return keywords.some((keyword) => value.includes(keyword.toLowerCase()));
}
