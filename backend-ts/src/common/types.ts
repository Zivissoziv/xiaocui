/**
 * 领域模型类型定义，与 Java 版 record 一一对应，字段名保持 camelCase，
 * 保证前端无需任何改动。
 */

export interface AnalysisSession {
  id: number;
  title: string;
  ownerId: string;
  sourceType: string;
  sourceRef: string;
  userInstruction: string;
  dueAt: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface RowData {
  /** Excel 中的 1 基行号 */
  rowNumber: number;
  values: Record<string, string>;
}

export interface SheetData {
  sheetName: string;
  /** 1 基表头行号 */
  headerRowIndex: number;
  headers: string[];
  rows: RowData[];
}

export interface WorkbookSnapshot {
  id: number;
  fileName: string;
  localFilePath: string;
  fileHash: string;
  downloadedAt: string;
  parsedAt: string;
  sheets: SheetData[];
}

export interface ColumnProfile {
  column: string;
  typeGuess: string;
  nonEmptyRate: number;
  uniqueCount: number;
  sampleValues: string[];
}

export interface SheetProfile {
  sheetName: string;
  rowCount: number;
  headerRowIndex: number;
  columnProfiles: ColumnProfile[];
}

export interface WorkbookProfile {
  fileName: string;
  sheets: SheetProfile[];
}

export interface ColumnPlan {
  sheetName: string;
  ownerColumn: string;
  departmentColumn: string;
  employeeColumn: string;
  emailColumn: string;
  phoneColumn: string;
  businessKeyColumns: string[];
  requiredColumns: string[];
}

export interface FollowupDraft {
  ownerRaw: string;
  employeeHint: string;
  departmentHint: string;
  emailHint: string;
  phoneHint: string;
  sourceRows: number[];
  missingFields: string[];
  filledFields: Record<string, string>;
  businessSummary: string;
  issueSummary: string;
  messageDraft: string;
}

export interface AiAnalysisResult {
  tableSummary: string;
  columnPlan: ColumnPlan | null;
  followupItems: FollowupDraft[];
  risks: string[];
}

export interface FollowupItem {
  id: number;
  sessionId: number;
  contactMatchId: number;
  employeeId: string | null;
  displayName: string;
  departmentId: string | null;
  email: string | null;
  phone: string | null;
  sourceRows: number[];
  missingFields: string[];
  filledFieldsSnapshot: Record<string, string>;
  businessSummary: string | null;
  issueSummary: string | null;
  status: string;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FollowupTask {
  id: number;
  sessionId: number;
  followupItemId: number;
  recipientId: string | null;
  channel: string;
  messageDraft: string | null;
  messageFinal: string | null;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  closedAt: string | null;
}

export interface ReminderEvent {
  id: number;
  sessionId: number;
  followupTaskId: number;
  channel: string;
  recipientId: string | null;
  messageSnapshot: string | null;
  status: string;
  sentAt: string | null;
  failedReason: string | null;
}

export interface ProgressSummary {
  total: number;
  readyToSend: number;
  sent: number;
  resolved: number;
  needsManualReview: number;
  completion: number;
}

export interface SessionDetail {
  session: AnalysisSession;
  workbookProfile: WorkbookProfile;
  analysis: AiAnalysisResult | null;
  items: FollowupItem[];
  tasks: FollowupTask[];
  reminderEvents: ReminderEvent[];
  progress: ProgressSummary;
}

export interface ContactMatch {
  rawContactText: string;
  employeeId: string;
  displayName: string;
  departmentId: string;
  email: string;
  phone: string;
  matchStatus: string;
}

export interface RowDiff {
  owner: string;
  missing: string[];
  previousMissing: string[];
  note: string;
}

export interface ReconcilePreview {
  added: RowDiff[];
  resolved: RowDiff[];
  updated: RowDiff[];
  unchanged: number;
}

export interface AddressBookEntry {
  id: number;
  name: string;
  email: string;
  department: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MatchedContact {
  name: string;
  email: string;
  department: string;
  phone: string;
  matched: boolean;
}

export interface ImportResult {
  total: number;
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface AiSettings {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface AiSettingsView {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKeyMasked: string;
  configured: boolean;
}

export interface UpdateFollowupItemRequest {
  displayName?: string | null;
  employeeId?: string | null;
  departmentId?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  messageFinal?: string | null;
}

export interface UpdateSessionMetaRequest {
  title?: string | null;
  dueAt?: string | null;
}

export interface SendRequest {
  itemIds?: number[] | null;
}

/** 业务异常：统一映射为 HTTP 400 + { message }，与 Java 版 ApiExceptionHandler 一致。 */
export class HttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HttpError';
  }
}
