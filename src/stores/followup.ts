import { defineStore } from "pinia";
import {
  fetchSessionDetail,
  fetchSessionDetails,
  refreshSession,
  type BackendSessionDetail,
} from "../services/followupApi";

export type TaskStatus = "进行中" | "有异常" | "已完成";
export type PersonStatus = "待处理" | "异常" | "已完成";
export type SendStatus = "待发送" | "已发送" | "已关闭";

export interface FollowupTask {
  id: number;
  title: string;
  file: string;
  owner: string;
  due: string;
  instruction: string;
  fields: string[];
  status: TaskStatus;
  completion: number;
  pending: number;
  done: number;
  manual: number;
  rows: number;
  sent: number;
  lastRefresh: string;
  createdAt: string;
  sheetName: string;
  tableSummary: string;
  risks: string[];
}

export interface FollowupPerson {
  id: number;
  taskId: number;
  backendTaskId?: number;
  name: string;
  employee: string;
  department: string;
  email: string;
  phone: string;
  missing: string[];
  sourceRows: string;
  status: PersonStatus;
  project: string;
  matchStatus: "matched" | "needs_confirmation";
  messageDraft: string;
  messageFinal: string;
  sendStatus: SendStatus;
  sentAt: string;
}

export interface ReminderEvent {
  id: number;
  taskId: number;
  personId: number;
  recipient: string;
  channel: string;
  messageSnapshot: string;
  status: "sent" | "failed";
  sentAt: string;
}

export const useFollowupStore = defineStore("followup", {
  state: () => ({
    tasks: [] as FollowupTask[],
    people: [] as FollowupPerson[],
    reminderEvents: [] as ReminderEvent[],
    loading: false,
    loaded: false,
    error: "",
  }),
  getters: {
    taskById: (state) => (id: number) => state.tasks.find((task) => task.id === id),
    peopleByTask: (state) => (taskId: number) => state.people.filter((person) => person.taskId === taskId),
    totalPending: (state) => state.tasks.reduce((sum, task) => sum + task.pending, 0),
    totalManual: (state) => state.tasks.reduce((sum, task) => sum + task.manual, 0),
    totalSent: (state) => state.tasks.reduce((sum, task) => sum + task.sent, 0),
    activeCount: (state) => state.tasks.filter((task) => task.status !== "已完成").length,
    completedCount: (state) => state.tasks.filter((task) => task.status === "已完成").length,
  },
  actions: {
    /** 首屏加载全部会话。后端返回的每条都是完整的 SessionDetail。 */
    async loadSessions(force = false) {
      if (this.loading) return;
      if (this.loaded && !force) return;
      this.loading = true;
      this.error = "";
      try {
        const details = await fetchSessionDetails();
        this.applyDetails(details);
        this.loaded = true;
      } catch (error) {
        this.error = error instanceof Error ? error.message : "任务列表加载失败";
      } finally {
        this.loading = false;
      }
    },

    /** 详情页直接按 id 拉取，支持刷新页面后直接进入。 */
    async loadSession(id: number) {
      this.loading = true;
      this.error = "";
      try {
        const detail = await fetchSessionDetail(id);
        this.upsertSessionDetail(detail);
      } catch (error) {
        this.error = error instanceof Error ? error.message : "任务加载失败";
      } finally {
        this.loading = false;
      }
    },

    /** 重新上传最新版 Excel，后端做增量对账。 */
    async refreshTask(id: number, file: File) {
      this.loading = true;
      this.error = "";
      try {
        const detail = await refreshSession(id, file);
        this.upsertSessionDetail(detail);
      } catch (error) {
        this.error = error instanceof Error ? error.message : "刷新失败";
        throw error;
      } finally {
        this.loading = false;
      }
    },

    applyDetails(details: BackendSessionDetail[]) {
      for (const detail of details) {
        this.upsertSessionDetail(detail);
      }
    },

    upsertSessionDetail(detail: BackendSessionDetail) {
      const task = convertTask(detail);
      const index = this.tasks.findIndex((item) => item.id === task.id);
      if (index >= 0) this.tasks[index] = task;
      else this.tasks.unshift(task);

      this.people = this.people.filter((person) => person.taskId !== task.id);
      this.people.push(...convertPeople(detail));
      this.reminderEvents = [
        ...this.reminderEvents.filter((event) => event.taskId !== task.id),
        ...detail.reminderEvents.map((event) => ({
          id: event.id,
          taskId: event.sessionId,
          personId: event.followupTaskId,
          recipient: event.recipientId,
          channel: event.channel,
          messageSnapshot: event.messageSnapshot,
          status: event.status === "sent" ? ("sent" as const) : ("failed" as const),
          sentAt: formatDateTime(event.sentAt),
        })),
      ];
      return task.id;
    },
  },
});

function convertTask(detail: BackendSessionDetail): FollowupTask {
  const manual = detail.progress.needsManualReview;
  const pending = detail.progress.readyToSend;
  const sent = detail.progress.sent;
  const done = detail.progress.resolved + sent;
  return {
    id: detail.session.id,
    title: detail.session.title,
    file: detail.workbookProfile.fileName,
    owner: detail.session.ownerId,
    due: detail.session.dueAt || "未设置",
    instruction: detail.session.userInstruction,
    fields: detail.analysis.columnPlan.requiredColumns,
    status: manual > 0 ? "有异常" : pending > 0 ? "进行中" : "已完成",
    completion: detail.progress.completion,
    pending,
    done,
    manual,
    rows: detail.workbookProfile.sheets[0]?.rowCount ?? detail.progress.total,
    sent,
    lastRefresh: formatDateTime(detail.session.updatedAt),
    createdAt: formatDateTime(detail.session.createdAt),
    sheetName: detail.analysis.columnPlan.sheetName,
    tableSummary: detail.analysis.tableSummary,
    risks: detail.analysis.risks,
  };
}

function convertPeople(detail: BackendSessionDetail): FollowupPerson[] {
  return detail.items.map((item) => {
    const task = detail.tasks.find((candidate) => candidate.followupItemId === item.id);
    const sent = task?.status === "sent";
    const closed = task?.status === "closed";
    return {
      id: item.id,
      taskId: item.sessionId,
      backendTaskId: task?.id,
      name: item.displayName,
      employee: item.employeeId || "待确认",
      department: item.departmentId || "待确认",
      email: item.email,
      phone: item.phone,
      missing: item.missingFields,
      sourceRows: item.sourceRows.join(", "),
      status:
        item.status === "needs_manual_review"
          ? "异常"
          : item.status === "resolved"
            ? "已完成"
            : "待处理",
      project: item.businessSummary,
      matchStatus: item.status === "needs_manual_review" ? "needs_confirmation" : "matched",
      messageDraft: task?.messageDraft ?? "",
      messageFinal: task?.messageFinal ?? "",
      sendStatus: closed ? "已关闭" : sent ? "已发送" : "待发送",
      sentAt: task?.sentAt ? formatDateTime(task.sentAt) : "--",
    };
  });
}

function formatDateTime(value: string | null) {
  if (!value) return "--";
  return value.replace("T", " ").slice(5, 16);
}
