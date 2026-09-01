import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';
import { SheetData, RowData, WorkbookSnapshot, HttpError } from './types';
import { config } from './config';
import { sha256, nowStr } from './util';

/** 快照 id：与 Java 版一样从 1000 起，仅用于 snapshot 记录，与业务 id 无关。 */
let snapshotIds = 1000;

/**
 * Excel 解析。行为对齐 Java 版 WorkbookParser：
 * 1. 上传文件先落盘（时间戳前缀防重名），路径写入快照；
 * 2. 逐 Sheet 读取，最多取前 8 个非空 Sheet；
 * 3. 按关键词评分探测表头行（前 8 行内）；
 * 4. 数据区的合并单元格把左上角的值下推到整个区域；
 * 5. 最多读取 5000 行数据。
 */
export function parse(buffer: Buffer, originalFilename: string | undefined): WorkbookSnapshot {
  try {
    const uploadDir = path.resolve(config.uploadDir);
    fs.mkdirSync(uploadDir, { recursive: true });
    const safeName = originalFilename ? path.basename(originalFilename) : 'uploaded.xlsx';
    const hash = sha256(buffer);
    const target = path.join(uploadDir, `${Date.now()}-${safeName}`);
    fs.writeFileSync(target, buffer);

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheets: SheetData[] = [];
    const maxSheets = Math.min(workbook.SheetNames.length, Math.max(1, config.maxVisibleSheets));
    for (let i = 0; i < maxSheets; i++) {
      const sheetName = workbook.SheetNames[i];
      const ws = workbook.Sheets[sheetName];
      if (!ws || !ws['!ref']) continue;
      const range = XLSX.utils.decode_range(ws['!ref']);
      // 等价于 POI 的 getPhysicalNumberOfRows() == 0：整个 Sheet 没有任何内容
      if (range.e.r < range.s.r || range.e.c < range.s.c) continue;
      sheets.push(readSheet(sheetName, ws, range));
    }

    const now = nowStr();
    return {
      id: ++snapshotIds,
      fileName: safeName,
      localFilePath: target,
      fileHash: hash,
      downloadedAt: now,
      parsedAt: now,
      sheets,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new HttpError(`Excel 解析失败：${message}`);
  }
}

/** 取单元格的展示文本（等价 POI DataFormatter.formatCellValue），并 trim。 */
function cellText(ws: XLSX.WorkSheet, row: number, col: number): string {
  const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })] as XLSX.CellObject | undefined;
  if (!cell) return '';
  const text = cell.w !== undefined ? cell.w : cell.v !== undefined ? String(cell.v) : '';
  return text.trim();
}

function readSheet(sheetName: string, ws: XLSX.WorkSheet, range: XLSX.Range): SheetData {
  const headerRow0 = detectHeaderRow(ws, range);
  const headers = readHeaders(ws, range, headerRow0);
  const mergedValues = buildMergedValues(ws, headerRow0);

  const rows: RowData[] = [];
  const lastRow = Math.min(range.e.r, headerRow0 + Math.max(1, config.maxRows));
  for (let r = headerRow0 + 1; r <= lastRow; r++) {
    const values: Record<string, string> = {};
    let hasValue = false;
    for (let c = 0; c < headers.length; c++) {
      let value = cellText(ws, r, c);
      if (value.length === 0) value = mergedValues.get(`${r}:${c}`) || '';
      if (value.length > 0) hasValue = true;
      values[headers[c]] = value;
    }
    if (hasValue) rows.push({ rowNumber: r + 1, values });
  }

  return { sheetName, headerRowIndex: headerRow0 + 1, headers, rows };
}

/** 收集数据区所有合并区域，把左上角单元格的值映射到区域内每个坐标。表头区域的合并不下推。 */
function buildMergedValues(ws: XLSX.WorkSheet, headerRow0: number): Map<string, string> {
  const merged = new Map<string, string>();
  const merges = (ws['!merges'] as XLSX.Range[] | undefined) || [];
  for (const region of merges) {
    if (region.s.r <= headerRow0) continue;
    const value = cellText(ws, region.s.r, region.s.c);
    if (value.length === 0) continue;
    for (let r = region.s.r; r <= region.e.r; r++) {
      for (let c = region.s.c; c <= region.e.c; c++) {
        const key = `${r}:${c}`;
        if (!merged.has(key)) merged.set(key, value);
      }
    }
  }
  return merged;
}

function detectHeaderRow(ws: XLSX.WorkSheet, range: XLSX.Range): number {
  const max = Math.min(range.e.r, 7);
  let bestRow = 0;
  let bestScore = -1;
  for (let r = 0; r <= max; r++) {
    let nonEmpty = 0;
    let keywordHits = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const value = cellText(ws, r, c);
      if (value.length === 0) continue;
      nonEmpty++;
      if (
        value.includes('负责人') || value.includes('部门') || value.includes('时间') ||
        value.includes('金额') || value.includes('状态')
      ) {
        keywordHits += 2;
      }
    }
    const score = nonEmpty + keywordHits;
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }
  return bestRow;
}

function readHeaders(ws: XLSX.WorkSheet, range: XLSX.Range, headerRow0: number): string[] {
  // 等价 POI headerRow.getLastCellNum()：表头行内最后一个有内容（或存在过）的单元格之后
  let lastCell = 0;
  for (let c = range.e.c; c >= range.s.c; c--) {
    if (ws[XLSX.utils.encode_cell({ r: headerRow0, c })]) {
      lastCell = c + 1;
      break;
    }
  }
  const headers: string[] = [];
  for (let c = 0; c < Math.max(0, lastCell); c++) {
    const value = cellText(ws, headerRow0, c);
    headers.push(value.length === 0 ? `未命名列${c + 1}` : value);
  }
  return headers;
}
