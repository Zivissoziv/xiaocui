import { AddressBookEntry, HttpError, ImportResult, MatchedContact } from './types';
import { db } from './db';
import { nextId } from './repository';
import { nowStr } from './util';
import * as XLSX from 'xlsx';

/**
 * 通讯录：维护人员姓名与邮箱，支持 Excel 模板导入（追加/覆盖）、导出与手动增删改。
 * 与 Java 版 AddressBookService 行为一致。
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEADERS = ['姓名', '邮箱', '部门', '手机'];

function rowToEntry(row: any): AddressBookEntry {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department,
    phone: row.phone,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function list(): AddressBookEntry[] {
  const rows = db
    .prepare(
      `SELECT id, name, email, department, phone, created_at, updated_at
       FROM address_book_contacts ORDER BY updated_at DESC, id DESC`
    )
    .all() as any[];
  return rows.map(rowToEntry);
}

export function create(request: { name?: string | null; email?: string | null; department?: string | null; phone?: string | null }): AddressBookEntry {
  const name = requireName(request.name ?? null);
  const email = requireEmail(request.email ?? null);
  const now = nowStr();
  const id = nextId();
  db.prepare(
    `INSERT INTO address_book_contacts(id, name, email, department, phone, created_at, updated_at)
     VALUES(?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, email, blank(request.department ?? null), blank(request.phone ?? null), now, now);
  return find(id);
}

export function update(id: number, request: { name?: string | null; email?: string | null; department?: string | null; phone?: string | null }): AddressBookEntry {
  const current = find(id);
  const name =
    request.name === null || request.name === undefined || request.name.trim().length === 0
      ? current.name
      : requireName(request.name);
  const email =
    request.email === null || request.email === undefined || request.email.trim().length === 0
      ? current.email
      : requireEmail(request.email);
  const department = request.department === null || request.department === undefined ? current.department : blank(request.department);
  const phone = request.phone === null || request.phone === undefined ? current.phone : blank(request.phone);
  const now = nowStr();
  db.prepare(
    'UPDATE address_book_contacts SET email = ?, department = ?, phone = ?, updated_at = ? WHERE id = ?'
  ).run(email, department, phone, now, id);
  if (name !== current.name) {
    db.prepare('UPDATE address_book_contacts SET name = ?, updated_at = ? WHERE id = ?').run(name, now, id);
  }
  return find(id);
}

export function remove(id: number): void {
  find(id);
  db.prepare('DELETE FROM address_book_contacts WHERE id = ?').run(id);
}

export function find(id: number): AddressBookEntry {
  const row = db
    .prepare(
      `SELECT id, name, email, department, phone, created_at, updated_at
       FROM address_book_contacts WHERE id = ?`
    )
    .get(id) as any;
  if (!row) throw new HttpError('通讯录条目不存在');
  return rowToEntry(row);
}

/** 按姓名查通讯录，供催办任务生成时自动补全邮箱。同名取更新时间最新的一条。 */
export function findByName(name: string): AddressBookEntry | null {
  if (isBlank(name)) return null;
  const row = db
    .prepare(
      `SELECT id, name, email, department, phone, created_at, updated_at
       FROM address_book_contacts WHERE name = ? ORDER BY updated_at DESC, id DESC LIMIT 1`
    )
    .get(normalize(name)) as any;
  return row ? rowToEntry(row) : null;
}

/** 批量匹配：返回每个姓名对应的通讯录邮箱，未命中的也返回（matched=false），便于前端提示。 */
export function matchNames(names: string[] | null | undefined): MatchedContact[] {
  const result: MatchedContact[] = [];
  if (!names) return result;
  for (const name of names) {
    if (isBlank(name)) continue;
    const key = normalize(name);
    if (result.some((item) => item.name === key)) continue;
    const hit = findByName(key);
    result.push(
      hit
        ? { name: key, email: hit.email, department: hit.department || '', phone: hit.phone || '', matched: true }
        : { name: key, email: '', department: '', phone: '', matched: false }
    );
  }
  return result;
}

interface ParsedRow {
  name: string;
  email: string;
  department: string;
  phone: string;
  error: string | null;
}

/**
 * 导入 Excel。mode=append：只新增通讯录里没有的姓名，已存在的跳过；
 * mode=overwrite：文件中出现的姓名覆盖已有记录，不在此文件中的记录保留。
 */
export function importFile(buffer: Buffer, mode: string): ImportResult {
  const overwrite = mode.toLowerCase() === 'overwrite';
  const rows = parse(buffer);
  const errors: string[] = [];
  let added = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (row.error !== null) {
      errors.push(row.error);
      continue;
    }
    const existing = findByName(row.name);
    if (!existing) {
      const now = nowStr();
      db.prepare(
        `INSERT INTO address_book_contacts(id, name, email, department, phone, created_at, updated_at)
         VALUES(?, ?, ?, ?, ?, ?, ?)`
      ).run(nextId(), row.name, row.email, row.department, row.phone, now, now);
      added++;
    } else if (overwrite) {
      db.prepare(
        'UPDATE address_book_contacts SET email = ?, department = ?, phone = ?, updated_at = ? WHERE id = ?'
      ).run(row.email, row.department, row.phone, nowStr(), existing.id);
      updated++;
    } else {
      skipped++;
    }
  }
  if (added === 0 && updated === 0 && errors.length === 0) {
    throw new HttpError('没有导入任何数据：通讯录中已存在这些姓名（可改用「覆盖更新」模式）');
  }
  return { total: rows.length, added, updated, skipped, errors };
}

/** 导出为可再次导入的 Excel（只包含姓名/邮箱/部门/手机四列）。 */
export function exportWorkbook(): Buffer {
  const aoa: (string | null)[][] = [HEADERS];
  for (const entry of list()) {
    aoa.push([entry.name, entry.email, entry.department ?? '', entry.phone ?? '']);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '通讯录');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** 导入模板：表头 + 两行示例。 */
export function templateWorkbook(): Buffer {
  const samples = [
    ['张三', 'zhangsan@example.com', '市场部', '13800000001'],
    ['李四', 'lisi@example.com', '采购部', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...samples]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '通讯录');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function exportFileName(): string {
  return `通讯录-${nowStr().slice(0, 10).replace(/-/g, '')}.xlsx`;
}

export function templateFileName(): string {
  return '通讯录导入模板.xlsx';
}

function parse(buffer: Buffer): ParsedRow[] {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch {
    throw new HttpError('无法解析该文件，请确认是 .xlsx / .xls 格式的通讯录表');
  }
  if (workbook.SheetNames.length === 0) throw new HttpError('文件里没有工作表');
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  if (!ws || !ws['!ref']) throw new HttpError('没有解析到任何数据行，请检查文件内容');
  const range = XLSX.utils.decode_range(ws['!ref']);
  const columnMap = readHeader(ws, range);

  const rows: ParsedRow[] = [];
  const start = columnMap.size === 0 ? 0 : 1;
  for (let r = start; r <= range.e.r; r++) {
    const name = cell(ws, r, columnMap.get(0) ?? 0);
    const email = cell(ws, r, columnMap.get(1) ?? 1);
    const department = cell(ws, r, columnMap.get(2) ?? 2);
    const phone = cell(ws, r, columnMap.get(3) ?? 3);
    if (isBlank(name) && isBlank(email)) continue;

    const rowNo = r + 1;
    if (isBlank(name)) {
      rows.push({ name: '', email: '', department: '', phone: '', error: `第 ${rowNo} 行：姓名为空` });
      continue;
    }
    if (isBlank(email)) {
      rows.push({ name: '', email: '', department: '', phone: '', error: `第 ${rowNo} 行（${name}）：邮箱为空` });
      continue;
    }
    if (!EMAIL.test(email)) {
      rows.push({ name: '', email: '', department: '', phone: '', error: `第 ${rowNo} 行（${name}）：邮箱格式不正确` });
      continue;
    }
    rows.push({ name: normalize(name), email: email.trim(), department: blank(department), phone: blank(phone), error: null });
  }
  if (rows.length === 0) throw new HttpError('没有解析到任何数据行，请检查文件内容');
  return rows;
}

/** 识别表头所在列；识别不出（没有「姓名」「邮箱」表头）时按 A/B/C/D 列顺序读取。 */
function readHeader(ws: XLSX.WorkSheet, range: XLSX.Range): Map<number, number> {
  const map = new Map<number, number>();
  const aliases: Record<string, number> = {
    姓名: 0, 名字: 0, 负责人: 0, 人员: 0,
    邮箱: 1, 邮件: 1, 电子邮件: 1, email: 1, 'e-mail': 1,
    部门: 2,
    手机: 3, 手机号: 3, 电话: 3, 联系电话: 3,
  };
  for (let c = range.s.c; c <= range.e.c; c++) {
    const text = cell(ws, range.s.r, c).toLowerCase();
    const target = aliases[text];
    if (target !== undefined && !map.has(target)) map.set(target, c);
  }
  // 至少要认出姓名和邮箱两列，否则退回按列顺序读取
  return map.has(0) && map.has(1) ? map : new Map();
}

function cell(ws: XLSX.WorkSheet, row: number, col: number): string {
  const cellObj = ws[XLSX.utils.encode_cell({ r: row, c: col })] as XLSX.CellObject | undefined;
  if (!cellObj) return '';
  const text = cellObj.w !== undefined ? cellObj.w : cellObj.v !== undefined ? String(cellObj.v) : '';
  return text.trim();
}

function requireName(name: string | null): string {
  if (isBlank(name)) throw new HttpError('姓名不能为空');
  return normalize(name as string);
}

function requireEmail(email: string | null): string {
  if (isBlank(email)) throw new HttpError('邮箱不能为空');
  const trimmed = (email as string).trim();
  if (!EMAIL.test(trimmed)) throw new HttpError(`邮箱格式不正确：${trimmed}`);
  return trimmed;
}

/** 姓名归一化：去首尾与内部空白，便于「张 三」与「张三」互相匹配。 */
function normalize(name: string): string {
  return name === null || name === undefined ? '' : name.replace(/\s+/g, '').trim();
}

function blank(value: string | null | undefined): string {
  return value === null || value === undefined ? '' : value.trim();
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}
