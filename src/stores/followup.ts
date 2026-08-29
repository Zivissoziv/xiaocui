import { defineStore } from "pinia";

export type TaskStatus = "进行中" | "有异常" | "已完成";
export type PersonStatus = "待处理" | "异常" | "已完成";

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
  lastRefresh: string;
}

export interface FollowupPerson {
  id: number;
  taskId: number;
  name: string;
  employee: string;
  department: string;
  missing: string[];
  sourceRows: string;
  status: PersonStatus;
  project: string;
}

export interface AppSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  channel: "wecom" | "dingtalk" | "feishu" | "email" | "manual";
}

export interface CreateTaskInput {
  title: string;
  file: string;
  owner: string;
  due: string;
  instruction: string;
}

const tasks: FollowupTask[] = [
  {
    id: 1,
    title: "项目合同信息收集催办",
    file: "项目合同信息收集.xlsx",
    owner: "经营管理部",
    due: "明天 18:00",
    instruction: "催还没补合同金额和预计完成时间的人",
    fields: ["合同金额", "预计完成时间"],
    status: "进行中",
    completion: 73,
    pending: 18,
    done: 21,
    manual: 5,
    rows: 42,
    lastRefresh: "今天 15:42",
  },
  {
    id: 2,
    title: "审计材料缺项催办",
    file: "审计材料清单.xlsx",
    owner: "审计部",
    due: "周五 17:00",
    instruction: "催缺少附件和负责人确认的人",
    fields: ["附件链接", "确认状态"],
    status: "有异常",
    completion: 46,
    pending: 27,
    done: 19,
    manual: 12,
    rows: 63,
    lastRefresh: "今天 14:10",
  },
  {
    id: 3,
    title: "月度经营数据催办",
    file: "月度经营数据.xlsx",
    owner: "战略运营部",
    due: "今天 18:00",
    instruction: "催未填收入和成本的人",
    fields: ["收入", "成本"],
    status: "进行中",
    completion: 82,
    pending: 11,
    done: 52,
    manual: 3,
    rows: 24,
    lastRefresh: "今天 13:56",
  },
  {
    id: 4,
    title: "制度确认回收",
    file: "制度确认名单.xlsx",
    owner: "人力资源部",
    due: "9 月 2 日 12:00",
    instruction: "催未确认制度阅读的人",
    fields: ["确认状态"],
    status: "已完成",
    completion: 100,
    pending: 0,
    done: 86,
    manual: 0,
    rows: 0,
    lastRefresh: "昨天 18:20",
  },
  {
    id: 5,
    title: "活动报名信息补全",
    file: "活动报名汇总.xlsx",
    owner: "品牌部",
    due: "9 月 1 日 18:00",
    instruction: "催缺手机号和到场时间的人",
    fields: ["手机号", "到场时间"],
    status: "进行中",
    completion: 64,
    pending: 15,
    done: 28,
    manual: 4,
    rows: 31,
    lastRefresh: "今天 11:08",
  },
];

const people: FollowupPerson[] = [
  {
    id: 1,
    taskId: 1,
    name: "张三",
    employee: "A1024",
    department: "华东销售部",
    missing: ["合同金额", "预计完成时间"],
    sourceRows: "12, 18",
    status: "待处理",
    project: "续约项目 A，新增项目 B",
  },
  {
    id: 2,
    taskId: 1,
    name: "李明",
    employee: "待确认",
    department: "产品一部",
    missing: ["合同金额"],
    sourceRows: "22",
    status: "异常",
    project: "集成项目 C",
  },
  {
    id: 3,
    taskId: 1,
    name: "赵敏",
    employee: "A1187",
    department: "华北运营部",
    missing: ["预计完成时间"],
    sourceRows: "31, 33",
    status: "待处理",
    project: "巡检项目 E，巡检项目 F",
  },
  {
    id: 4,
    taskId: 1,
    name: "王五",
    employee: "A0931",
    department: "华南交付部",
    missing: [],
    sourceRows: "35",
    status: "已完成",
    project: "存量项目 D",
  },
  {
    id: 5,
    taskId: 1,
    name: "陈晨",
    employee: "A2260",
    department: "财务共享中心",
    missing: ["合同金额"],
    sourceRows: "41",
    status: "待处理",
    project: "结算项目 G",
  },
  {
    id: 6,
    taskId: 1,
    name: "刘洋",
    employee: "A1872",
    department: "华东销售部",
    missing: ["预计完成时间"],
    sourceRows: "48",
    status: "待处理",
    project: "拓展项目 H",
  },
  {
    id: 7,
    taskId: 1,
    name: "周倩",
    employee: "待确认",
    department: "供应链管理部",
    missing: ["合同金额"],
    sourceRows: "57",
    status: "异常",
    project: "采购项目 I",
  },
];

export const useFollowupStore = defineStore("followup", {
  state: () => ({
    tasks,
    people,
    settings: {
      apiKey: "",
      baseUrl: "https://llm.internal.example.com/v1",
      model: "internal-chat-model",
      channel: "wecom",
    } as AppSettings,
  }),
  getters: {
    taskById: (state) => (id: number) => state.tasks.find((task) => task.id === id),
    peopleByTask: (state) => (taskId: number) => state.people.filter((person) => person.taskId === taskId),
    totalPending: (state) => state.tasks.reduce((sum, task) => sum + task.pending, 0),
    totalManual: (state) => state.tasks.reduce((sum, task) => sum + task.manual, 0),
    averageCompletion: (state) => Math.round(state.tasks.reduce((sum, task) => sum + task.completion, 0) / state.tasks.length),
  },
  actions: {
    createTask(input?: CreateTaskInput) {
      this.tasks.unshift({
        id: Date.now(),
        title: input?.title || "新的催办任务",
        file: input?.file || "待导入 Excel",
        owner: input?.owner || "当前用户",
        due: input?.due || "未设置",
        instruction: input?.instruction || "导入表格后由小崔识别",
        fields: [],
        status: "进行中",
        completion: 0,
        pending: 0,
        done: 0,
        manual: 0,
        rows: 0,
        lastRefresh: "刚刚",
      });
    },
    refreshTask(taskId: number) {
      const task = this.tasks.find((item) => item.id === taskId);
      if (task) task.lastRefresh = "刚刚";
    },
    handlePerson(personId: number) {
      const person = this.people.find((item) => item.id === personId);
      if (!person || person.status === "已完成") return;

      if (person.status === "异常") {
        person.status = "待处理";
        if (person.employee === "待确认") person.employee = "已确认";
        return;
      }

      person.status = "已完成";
      person.missing = [];
    },
    saveSettings(settings: AppSettings) {
      this.settings = { ...settings };
    },
  },
});
