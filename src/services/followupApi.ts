export interface BackendSessionDetail {
  session: {
    id: number;
    title: string;
    ownerId: string;
    sourceType: string;
    sourceRef: string;
    userInstruction: string;
    dueAt: string;
    status: string;
    createdAt: string;
    updatedAt: string;
  };
  workbookProfile: {
    fileName: string;
    sheets: Array<{
      sheetName: string;
      rowCount: number;
      headerRowIndex: number;
      columnProfiles: Array<{
        column: string;
        typeGuess: string;
        nonEmptyRate: number;
        uniqueCount: number;
        sampleValues: string[];
      }>;
    }>;
  };
  analysis: {
    tableSummary: string;
    columnPlan: {
      sheetName: string;
      ownerColumn: string;
      departmentColumn: string;
      employeeColumn: string;
      emailColumn: string;
      phoneColumn: string;
      businessKeyColumns: string[];
      requiredColumns: string[];
    };
    followupItems: unknown[];
    risks: string[];
  };
  items: Array<{
    id: number;
    sessionId: number;
    employeeId: string;
    displayName: string;
    departmentId: string;
    email: string;
    phone: string;
    sourceRows: number[];
    missingFields: string[];
    businessSummary: string;
    issueSummary: string;
    status: string;
    dueAt: string;
  }>;
  tasks: Array<{
    id: number;
    sessionId: number;
    followupItemId: number;
    recipientId: string;
    channel: string;
    messageDraft: string;
    messageFinal: string;
    status: string;
    sentAt: string | null;
  }>;
  reminderEvents: Array<{
    id: number;
    sessionId: number;
    followupTaskId: number;
    channel: string;
    recipientId: string;
    messageSnapshot: string;
    status: string;
    sentAt: string;
  }>;
  progress: {
    total: number;
    readyToSend: number;
    sent: number;
    resolved: number;
    needsManualReview: number;
    completion: number;
  };
}

// 默认留空走同源 /api，由 vite 代理转发到后端，浏览器不会触发跨域拦截。
// 需要直连后端时再设置 VITE_API_BASE_URL，例如 http://127.0.0.1:8080。
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export async function createAnalysisSession(input: {
  file: File;
  title: string;
  instruction: string;
  dueAt: string;
}) {
  const form = new FormData();
  form.append("file", input.file);
  form.append("title", input.title);
  form.append("instruction", input.instruction);
  form.append("dueAt", input.dueAt);
  return request<BackendSessionDetail>("/api/analysis-sessions", {
    method: "POST",
    body: form,
  });
}

export async function sendFollowups(sessionId: number, itemIds: number[] = []) {
  return request<BackendSessionDetail>(`/api/analysis-sessions/${sessionId}/followup-tasks/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemIds }),
  });
}

export async function updateFollowupItem(itemId: number, payload: {
  displayName?: string;
  employeeId?: string;
  departmentId?: string;
  email?: string;
  phone?: string;
  status?: string;
  messageFinal?: string;
}) {
  return request<BackendSessionDetail>(`/api/followup-items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** 删除单个待补充人员（连同其催办任务与发送留痕），返回更新后的会话详情。 */
export async function deleteFollowupItem(itemId: number) {
  return request<BackendSessionDetail>(`/api/followup-items/${itemId}`, {
    method: "DELETE",
  });
}

export async function fetchSessionDetails() {
  return request<BackendSessionDetail[]>("/api/analysis-sessions/details");
}

export async function fetchSessionDetail(sessionId: number) {
  return request<BackendSessionDetail>(`/api/analysis-sessions/${sessionId}`);
}

/** 修改任务名称 / 截止时间。title/dueAt 只传要改的字段；dueAt 传空字符串表示清空截止时间。 */
export async function updateSessionMeta(sessionId: number, payload: { title?: string; dueAt?: string }) {
  return request<BackendSessionDetail>(`/api/analysis-sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function refreshSession(sessionId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<BackendSessionDetail>(`/api/analysis-sessions/${sessionId}/refresh`, {
    method: "POST",
    body: form,
  });
}

export interface ReconcilePreviewRow {
  owner: string;
  missing: string[];
  previousMissing: string[];
  note: string;
}

export interface ReconcilePreview {
  added: ReconcilePreviewRow[];
  resolved: ReconcilePreviewRow[];
  updated: ReconcilePreviewRow[];
  unchanged: number;
}

/** 上传最新版前先预览差异，只读不落库，由用户确认后再调用 refreshSession 应用。 */
export async function previewRefreshSession(sessionId: number, file: File) {
  const form = new FormData();
  form.append("file", file);
  return request<ReconcilePreview>(`/api/analysis-sessions/${sessionId}/refresh-preview`, {
    method: "POST",
    body: form,
  });
}

/** 确认应用预览：复用预览阶段的分析结果执行对账，不再重复调用模型，速度远快于 refreshSession。 */
export async function confirmRefreshSession(sessionId: number) {
  return request<BackendSessionDetail>(`/api/analysis-sessions/${sessionId}/refresh/confirm`, {
    method: "POST",
  });
}

export interface AiSettingsView {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  configured: boolean;
}

export interface AiSettingsPayload {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export async function getAiSettings() {
  return request<AiSettingsView>("/api/settings/ai");
}

export async function saveAiSettings(payload: AiSettingsPayload) {
  return request<AiSettingsView>("/api/settings/ai", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function testAiSettings(payload: AiSettingsPayload) {
  return request<{ ok: boolean; reply: string }>("/api/settings/ai/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** 删除催办任务。后端返回 204，没有响应体，因此不走通用 request。 */
export async function deleteSession(sessionId: number) {
  const response = await fetch(`${apiBase}/api/analysis-sessions/${sessionId}`, { method: "DELETE" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message || "删除失败");
  }
}

async function request<T>(path: string, init?: RequestInit, timeoutMs = 90_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBase}${path}`, { ...init, signal: controller.signal });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ message: response.statusText }));
      throw new Error(body.message || "接口请求失败");
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("请求超时，请稍后重试");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
