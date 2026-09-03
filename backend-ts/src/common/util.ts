import * as crypto from 'crypto';

/** 本地时间戳，格式与 Java LocalDateTime 的 JSON 序列化保持一致（ISO 无时区）。 */
export function nowStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}` +
    `.${String(d.getMilliseconds()).padStart(3, '0')}`
  );
}

export function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim().length === 0;
}

/** Java String.isBlank 等价判断（不含 trim 语义差异，空白串即为 blank）。 */
export function isJavaBlank(value: string): boolean {
  return value.length === 0 || /^\s*$/.test(value);
}

export function firstNonBlank(next: string | null | undefined, current: string | null | undefined): string | null {
  return isBlank(next ?? null) ? (current ?? null) : (next as string);
}

export function sha256(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/** Java String.split(trim 过滤空串) 常用组合。 */
export function splitAndTrim(raw: string, separator: RegExp): string[] {
  if (isJavaBlank(raw)) return [];
  return raw
    .split(separator)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function joinWith(values: string[], separator: string): string {
  return values.join(separator);
}

/**
 * 修复 multer/busboy 的文件名乱码：multipart 的 filename 按 latin1 解码，
 * 浏览器实际发送 UTF-8，中文文件名会变成「æµ‹è¯•.xlsx」这类乱码。
 * 转回 UTF-8；纯 ASCII 名称转码前后一致，不受影响。
 */
export function fixFileName(name: string | undefined): string | undefined {
  if (!name) return name;
  try {
    return Buffer.from(name, 'latin1').toString('utf8');
  } catch {
    return name;
  }
}
