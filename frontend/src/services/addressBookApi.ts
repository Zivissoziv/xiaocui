import { request } from "./followupApi";

export interface AddressBookContact {
  id: number;
  name: string;
  email: string;
  department: string;
  phone: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactPayload {
  name: string;
  email: string;
  department?: string;
  phone?: string;
}

export interface ContactImportResult {
  total: number;
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface MatchedContact {
  name: string;
  email: string;
  department: string;
  phone: string;
  matched: boolean;
}

/** 导入模式：append 只新增通讯录里没有的姓名；overwrite 覆盖同名记录的邮箱等信息。 */
export type ImportMode = "append" | "overwrite";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export function listContacts() {
  return request<AddressBookContact[]>("/api/address-book");
}

export function createContact(payload: ContactPayload) {
  return request<AddressBookContact>("/api/address-book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateContact(id: number, payload: ContactPayload) {
  return request<AddressBookContact>(`/api/address-book/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteContact(id: number) {
  await request<null>(`/api/address-book/${id}`, { method: "DELETE" }).catch((error) => {
    // 删除成功时后端返回 204 空响应体，request 解析 JSON 会失败，这里视为成功
    if (!(error instanceof SyntaxError)) throw error;
  });
}

/** 按姓名批量回查通讯录，未命中的也返回（matched=false），便于前端统计未匹配人数。 */
export function matchContacts(names: string[]) {
  return request<MatchedContact[]>("/api/address-book/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  });
}

export function importContacts(file: File, mode: ImportMode) {
  const form = new FormData();
  form.append("file", file);
  form.append("mode", mode);
  return request<ContactImportResult>("/api/address-book/import", {
    method: "POST",
    body: form,
  });
}

/** 下载二进制文件（模板 / 导出）。后端返回 xlsx，因此不能用通用 request（会按 JSON 解析）。 */
export async function downloadFromApi(path: string, fileName: string) {
  const response = await fetch(`${apiBase}${path}`);
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(`[${response.status}] ${body.message || body.error || "下载失败"}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadContactTemplate() {
  return downloadFromApi("/api/address-book/template", "通讯录导入模板.xlsx");
}

export function exportContacts() {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return downloadFromApi("/api/address-book/export", `通讯录-${stamp}.xlsx`);
}
