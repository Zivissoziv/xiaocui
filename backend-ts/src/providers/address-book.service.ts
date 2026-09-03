import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { AddressBookEntry, HttpError, ImportResult, MatchedContact } from '../common/types';
import { DatabaseProvider } from '../database/database.provider';
import * as schema from '../database/schema';
import { RepositoryService } from '../database/repository.service';
import { nowStr } from '../common/util';
import * as XLSX from 'xlsx';

interface ParsedRow {
  name: string;
  email: string;
  department: string;
  phone: string;
  error: string | null;
}

@Injectable()
export class AddressBookService {
  private readonly db: DatabaseProvider['db'];

  constructor(dbProvider: DatabaseProvider, private readonly repository: RepositoryService) {
    this.db = dbProvider.db;
  }

  private nextId(): number {
    return this.repository.nextId();
  }

  /**
   * 通讯录：维护人员姓名与邮箱，支持 Excel 模板导入（追加/覆盖）、导出与手动增删改。
   * 与 Java 版 AddressBookService 行为一致。
   */
  private readonly EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private readonly HEADERS = ['姓名', '邮箱', '部门', '手机'];

  list(): AddressBookEntry[] {
    return this.db
      .select()
      .from(schema.addressBookContacts)
      .orderBy(desc(schema.addressBookContacts.updatedAt), desc(schema.addressBookContacts.id))
      .all();
  }

  create(request: { name?: string | null; email?: string | null; department?: string | null; phone?: string | null }): AddressBookEntry {
    const name = this.requireName(request.name ?? null);
    const email = this.requireEmail(request.email ?? null);
    const now = nowStr();
    const id = this.nextId();
    this.db
      .insert(schema.addressBookContacts)
      .values({
        id,
        name,
        email,
        department: this.blank(request.department ?? null),
        phone: this.blank(request.phone ?? null),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return this.find(id);
  }

  update(id: number, request: { name?: string | null; email?: string | null; department?: string | null; phone?: string | null }): AddressBookEntry {
    const current = this.find(id);
    const name =
      request.name === null || request.name === undefined || request.name.trim().length === 0
        ? current.name
        : this.requireName(request.name);
    const email =
      request.email === null || request.email === undefined || request.email.trim().length === 0
        ? current.email
        : this.requireEmail(request.email);
    const department = request.department === null || request.department === undefined ? current.department : this.blank(request.department);
    const phone = request.phone === null || request.phone === undefined ? current.phone : this.blank(request.phone);
    const now = nowStr();
    this.db
      .update(schema.addressBookContacts)
      .set({ email, department, phone, updatedAt: now })
      .where(eq(schema.addressBookContacts.id, id))
      .run();
    if (name !== current.name) {
      this.db
        .update(schema.addressBookContacts)
        .set({ name, updatedAt: now })
        .where(eq(schema.addressBookContacts.id, id))
        .run();
    }
    return this.find(id);
  }

  remove(id: number): void {
    this.find(id);
    this.db.delete(schema.addressBookContacts).where(eq(schema.addressBookContacts.id, id)).run();
  }

  find(id: number): AddressBookEntry {
    const row = this.db.select().from(schema.addressBookContacts).where(eq(schema.addressBookContacts.id, id)).get();
    if (!row) throw new HttpError('通讯录条目不存在');
    return row;
  }

  /** 按姓名查通讯录，供催办任务生成时自动补全邮箱。同名取更新时间最新的一条。 */
  findByName(name: string): AddressBookEntry | null {
    if (this.isBlank(name)) return null;
    return (
      this.db
        .select()
        .from(schema.addressBookContacts)
        .where(eq(schema.addressBookContacts.name, this.normalize(name)))
        .orderBy(desc(schema.addressBookContacts.updatedAt), desc(schema.addressBookContacts.id))
        .get() ?? null
    );
  }

  /** 批量匹配：返回每个姓名对应的通讯录邮箱，未命中的也返回（matched=false），便于前端提示。 */
  matchNames(names: string[] | null | undefined): MatchedContact[] {
    const result: MatchedContact[] = [];
    if (!names) return result;
    for (const name of names) {
      if (this.isBlank(name)) continue;
      const key = this.normalize(name);
      if (result.some((item) => item.name === key)) continue;
      const hit = this.findByName(key);
      result.push(
        hit
          ? { name: key, email: hit.email, department: hit.department || '', phone: hit.phone || '', matched: true }
          : { name: key, email: '', department: '', phone: '', matched: false }
      );
    }
    return result;
  }

  /**
   * 导入 Excel。mode=append：只新增通讯录里没有的姓名，已存在的跳过；
   * mode=overwrite：文件中出现的姓名覆盖已有记录，不在此文件中的记录保留。
   */
  importFile(buffer: Buffer, mode: string): ImportResult {
    const overwrite = mode.toLowerCase() === 'overwrite';
    const rows = this.parse(buffer);
    const errors: string[] = [];
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      if (row.error !== null) {
        errors.push(row.error);
        continue;
      }
      const existing = this.findByName(row.name);
      if (!existing) {
        const now = nowStr();
        this.db
          .insert(schema.addressBookContacts)
          .values({
            id: this.nextId(),
            name: row.name,
            email: row.email,
            department: row.department,
            phone: row.phone,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        added++;
      } else if (overwrite) {
        this.db
          .update(schema.addressBookContacts)
          .set({ email: row.email, department: row.department, phone: row.phone, updatedAt: nowStr() })
          .where(eq(schema.addressBookContacts.id, existing.id))
          .run();
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
  exportWorkbook(): Buffer {
    const aoa: (string | null)[][] = [this.HEADERS];
    for (const entry of this.list()) {
      aoa.push([entry.name, entry.email, entry.department ?? '', entry.phone ?? '']);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '通讯录');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  /** 导入模板：表头 + 两行示例。 */
  templateWorkbook(): Buffer {
    const samples = [
      ['张三', 'zhangsan@example.com', '市场部', '13800000001'],
      ['李四', 'lisi@example.com', '采购部', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet([this.HEADERS, ...samples]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '通讯录');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  exportFileName(): string {
    return `通讯录-${nowStr().slice(0, 10).replace(/-/g, '')}.xlsx`;
  }

  templateFileName(): string {
    return '通讯录导入模板.xlsx';
  }

  private parse(buffer: Buffer): ParsedRow[] {
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
    const columnMap = this.readHeader(ws, range);

    const rows: ParsedRow[] = [];
    const start = columnMap.size === 0 ? 0 : 1;
    for (let r = start; r <= range.e.r; r++) {
      const name = this.cell(ws, r, columnMap.get(0) ?? 0);
      const email = this.cell(ws, r, columnMap.get(1) ?? 1);
      const department = this.cell(ws, r, columnMap.get(2) ?? 2);
      const phone = this.cell(ws, r, columnMap.get(3) ?? 3);
      if (this.isBlank(name) && this.isBlank(email)) continue;

      const rowNo = r + 1;
      if (this.isBlank(name)) {
        rows.push({ name: '', email: '', department: '', phone: '', error: `第 ${rowNo} 行：姓名为空` });
        continue;
      }
      if (this.isBlank(email)) {
        rows.push({ name: '', email: '', department: '', phone: '', error: `第 ${rowNo} 行（${name}）：邮箱为空` });
        continue;
      }
      if (!this.EMAIL.test(email)) {
        rows.push({ name: '', email: '', department: '', phone: '', error: `第 ${rowNo} 行（${name}）：邮箱格式不正确` });
        continue;
      }
      rows.push({ name: this.normalize(name), email: email.trim(), department: this.blank(department), phone: this.blank(phone), error: null });
    }
    if (rows.length === 0) throw new HttpError('没有解析到任何数据行，请检查文件内容');
    return rows;
  }

  /** 识别表头所在列；识别不出（没有「姓名」「邮箱」表头）时按 A/B/C/D 列顺序读取。 */
  private readHeader(ws: XLSX.WorkSheet, range: XLSX.Range): Map<number, number> {
    const map = new Map<number, number>();
    const aliases: Record<string, number> = {
      姓名: 0, 名字: 0, 负责人: 0, 人员: 0,
      邮箱: 1, 邮件: 1, 电子邮件: 1, email: 1, 'e-mail': 1,
      部门: 2,
      手机: 3, 手机号: 3, 电话: 3, 联系电话: 3,
    };
    for (let c = range.s.c; c <= range.e.c; c++) {
      const text = this.cell(ws, range.s.r, c).toLowerCase();
      const target = aliases[text];
      if (target !== undefined && !map.has(target)) map.set(target, c);
    }
    // 至少要认出姓名和邮箱两列，否则退回按列顺序读取
    return map.has(0) && map.has(1) ? map : new Map();
  }

  private cell(ws: XLSX.WorkSheet, row: number, col: number): string {
    const cellObj = ws[XLSX.utils.encode_cell({ r: row, c: col })] as XLSX.CellObject | undefined;
    if (!cellObj) return '';
    const text = cellObj.w !== undefined ? cellObj.w : cellObj.v !== undefined ? String(cellObj.v) : '';
    return text.trim();
  }

  private requireName(name: string | null): string {
    if (this.isBlank(name)) throw new HttpError('姓名不能为空');
    return this.normalize(name as string);
  }

  private requireEmail(email: string | null): string {
    if (this.isBlank(email)) throw new HttpError('邮箱不能为空');
    const trimmed = (email as string).trim();
    if (!this.EMAIL.test(trimmed)) throw new HttpError(`邮箱格式不正确：${trimmed}`);
    return trimmed;
  }

  /** 姓名归一化：去首尾与内部空白，便于「张 三」与「张三」互相匹配。 */
  private normalize(name: string): string {
    return name === null || name === undefined ? '' : name.replace(/\s+/g, '').trim();
  }

  private blank(value: string | null | undefined): string {
    return value === null || value === undefined ? '' : value.trim();
  }

  private isBlank(value: string | null | undefined): boolean {
    return value === null || value === undefined || value.trim().length === 0;
  }
}
