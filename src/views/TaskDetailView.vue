<template>
  <div class="detail-page">
    <header class="detail-top">
      <button class="back-button" aria-label="返回" @click="router.push({ name: 'console' })">
        <el-icon><Back /></el-icon>
      </button>
      <h1>任务进度详情</h1>
      <div class="detail-actions">
        <input ref="refreshInput" class="hidden-input" type="file" accept=".xlsx,.xls" @change="handleRefreshFile">
        <el-button v-if="task" :icon="EditPen" plain class="edit-meta-btn" @click="openEditMeta">修改</el-button>
        <el-button :icon="Refresh" plain :loading="previewBusy" @click="refreshInput?.click()">上传最新版</el-button>
        <el-button :icon="Download" plain @click="exportProgress">导出进度</el-button>
      </div>
    </header>

    <main v-if="task" class="detail-workspace">
      <div class="detail-hero-row">
        <section class="progress-hero panel">
          <div class="hero-title">
            <img class="bot-image bot-hero" src="/assets/xiaocui-slices/to-do.png" alt="小崔">
            <div>
              <h2 class="hero-task-title">{{ task.title }}</h2>
              <dl>
                <div><dt>截止时间：</dt><dd>{{ task.due }}</dd></div>
                <div><dt>创建时间：</dt><dd>{{ task.createdAt }}</dd></div>
                <div><dt>来源数据：</dt><dd>{{ task.rows }} 行</dd></div>
              </dl>
            </div>
          </div>
          <div class="ring-wrap">
            <el-progress type="dashboard" :percentage="completion" :width="92" :stroke-width="9" :color="progressColor" />
            <ul class="ring-legend compact">
              <li><i class="green"></i>已完成 <strong>{{ task.done }}</strong></li>
              <li><i class="orange"></i>未完成 <strong>{{ task.pending }}</strong></li>
              <li><i class="red"></i>异常 <strong>{{ task.manual }}</strong></li>
            </ul>
          </div>
        </section>

        <section class="panel analysis-summary">
          <h3>AI 分析结果</h3>
          <p>{{ task.tableSummary }}</p>
          <div class="field-tags">
            <el-tag v-for="field in task.fields" :key="field" type="success" effect="light" round>
              {{ field }}
            </el-tag>
          </div>
          <el-alert v-if="task.risks.length" type="warning" :closable="false" class="risk-alert">
            <template #title>风险提示</template>
            <p v-for="risk in task.risks" :key="risk" class="risk-line">{{ risk }}</p>
          </el-alert>
        </section>
      </div>

      <el-tabs v-model="activeTab" class="detail-tabs">
        <el-tab-pane label="整体进度" name="progress">
          <section class="panel">
            <div class="panel-head person-head">
              <h3>人员进度明细</h3>
              <div class="person-actions">
                <span class="person-hint">勾选后批量催办；已发送的人可再次提醒</span>
                <el-button type="primary" :icon="Message" :loading="busy" :disabled="selectedPeople.length === 0"
                           @click="sendSelected">发送所选（{{ selectedPeople.length }}）</el-button>
              </div>
            </div>
            <el-table :data="people" class="person-table" @selection-change="onSelectionChange">
              <el-table-column type="selection" width="44"
                               :selectable="(row: FollowupPerson) => row.status !== '异常' && row.sendStatus !== '已关闭'" />
              <el-table-column label="负责人" min-width="110">
                <template #default="{ row }">
                  <div class="person-name">{{ row.name }}</div>
                </template>
              </el-table-column>
              <el-table-column label="邮箱" min-width="160" show-overflow-tooltip>
                <template #default="{ row }">
                  <span :class="{ 'muted-cell': !row.email }">{{ row.email || "—" }}</span>
                </template>
              </el-table-column>
              <el-table-column label="缺失内容" min-width="150">
                <template #default="{ row }">{{ row.missing.join("、") || "无" }}</template>
              </el-table-column>
              <el-table-column prop="sourceRows" label="来源行" width="90" />
              <el-table-column label="状态" width="90" align="center">
                <template #default="{ row }">
                  <el-tag :type="personTagType(row.status)" effect="light" round>{{ row.status }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="发送状态" width="110">
                <template #default="{ row }">
                  <div>{{ row.sendStatus }}</div>
                  <small class="person-sub">{{ row.sentAt }}</small>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="170" align="center" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" size="small"
                             :disabled="row.status === '异常' || row.sendStatus === '已关闭'"
                             @click="sendOne(row.id)">发送</el-button>
                  <el-button link type="primary" size="small" @click="openEditPerson(row)">修改</el-button>
                  <el-button link type="danger" size="small" @click="handleDeletePerson(row)">删除</el-button>
                </template>
              </el-table-column>
              <template #empty>
                <div class="table-empty">这个任务暂无人员明细</div>
              </template>
            </el-table>
          </section>
        </el-tab-pane>

        <el-tab-pane label="发送记录" name="events">
          <section class="panel">
            <h3>催办留痕</h3>
            <el-table :data="reminderEvents">
              <el-table-column label="收件人" min-width="150">
                <template #default="{ row }">
                  <div>{{ row.personName || row.recipient }}</div>
                  <small v-if="row.personName" class="person-sub">{{ row.personEmail || row.recipient }}</small>
                </template>
              </el-table-column>
              <el-table-column prop="channel" label="渠道" width="100" />
              <el-table-column label="发送内容" min-width="300" show-overflow-tooltip>
                <template #default="{ row }">{{ row.messageSnapshot }}</template>
              </el-table-column>
              <el-table-column prop="sentAt" label="发送时间" width="150" />
              <el-table-column label="结果" width="90" align="center">
                <template #default="{ row }">
                  <el-tag :type="row.status === 'sent' ? 'success' : 'danger'" size="small" effect="light" round>
                    {{ row.status === "sent" ? "成功" : "失败" }}
                  </el-tag>
                </template>
              </el-table-column>
              <template #empty>
                <div class="table-empty">这个任务还没有发送记录</div>
              </template>
            </el-table>
          </section>
        </el-tab-pane>
      </el-tabs>
    </main>

    <main v-else class="detail-workspace">
      <section class="panel empty-panel">
        <p v-if="store.loading">正在加载任务…</p>
        <p v-else-if="store.error">{{ store.error }}</p>
        <p v-else>任务不存在，或后端数据已被清除。</p>
        <el-button @click="router.push({ name: 'console' })">返回首页</el-button>
      </section>
    </main>
  </div>

  <el-dialog v-model="previewVisible" title="上传最新版 · 差异预览" width="720px" :close-on-click-modal="false"
             append-to-body>
    <div v-if="preview" class="refresh-preview">
      <div class="diff-summary">
        <span class="diff-chip add">新增 {{ preview.added.length }}</span>
        <span class="diff-chip done">已补齐 {{ preview.resolved.length }}</span>
        <span class="diff-chip change">缺项变化 {{ preview.updated.length }}</span>
        <span class="diff-chip none">无变化 {{ preview.unchanged }}</span>
      </div>
      <p class="diff-hint">
        {{ hasChanges ? "以下变更确认后将应用到当前任务，已发送的留痕不会被清除。" : "新表格与当前数据一致，没有需要更新的变化。" }}
      </p>
      <el-table v-if="hasChanges" :data="previewRows" size="small" max-height="300" class="diff-table">
        <el-table-column label="负责人" prop="owner" min-width="110" show-overflow-tooltip />
        <el-table-column label="变化" min-width="260">
          <template #default="{ row }">
            <el-tag :type="diffTagType(row.kind)" size="small" effect="light" round>{{ row.note }}</el-tag>
            <p v-if="row.previousMissing.length" class="diff-old">原缺失：{{ row.previousMissing.join("、") }}</p>
            <p v-if="row.missing.length" class="diff-new">现缺失：{{ row.missing.join("、") }}</p>
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="table-empty">没有检测到与当前数据不一致的变化</div>
    </div>
    <template #footer>
      <el-button @click="previewVisible = false">{{ hasChanges ? "取消" : "关闭" }}</el-button>
      <el-button v-if="hasChanges" type="primary" :loading="busy" @click="applyRefresh">确认更新</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="editVisible" title="修改人员信息" width="420px" :close-on-click-modal="false"
             append-to-body>
    <el-form label-position="top" class="settings-form">
      <el-form-item label="姓名">
        <el-input v-model="editForm.name" placeholder="负责人姓名" />
      </el-form-item>
      <el-form-item label="邮箱">
        <el-input v-model="editForm.email" placeholder="用于发送催办提醒" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="editVisible = false">取消</el-button>
      <el-button type="primary" :loading="savingEdit" @click="saveEditPerson">保存</el-button>
    </template>
  </el-dialog>

  <Teleport to="body">
    <Transition name="overlay-fade">
      <div v-if="progressTask" class="progress-overlay">
        <div class="progress-card" role="status" aria-live="polite">
          <div class="progress-ring"></div>
          <h3>{{ progressTask.title }}</h3>
          <p v-if="progressTask.fileName" class="progress-file" :title="progressTask.fileName">
            {{ progressTask.fileName }}
          </p>

          <div class="progress-stage">
            <el-progress v-if="progressTask.phase === 'upload'" :percentage="progressTask.percent"
                         :stroke-width="8" :show-text="false" />
            <el-progress v-else :percentage="100" :stroke-width="8" :show-text="false" indeterminate :duration="2" />
            <p class="progress-note">
              {{ progressTask.phase === "upload"
                ? `正在传输文件 ${progressTask.percent}%`
                : "文件已上传，服务端正在解析表格并比对差异…" }}
            </p>
          </div>

          <ul class="progress-steps">
            <li :class="progressTask.phase === 'upload' ? 'active' : 'done'">
              {{ progressTask.phase === "upload" ? "上传文件" : "文件已上传" }}
            </li>
            <li :class="{ active: progressTask.phase === 'process' }">解析表格并比对差异</li>
          </ul>

          <p class="progress-timer">已用时 {{ progressTask.seconds }} 秒</p>
        </div>
      </div>
    </Transition>
  </Teleport>

  <el-dialog v-model="editMetaVisible" title="编辑任务信息" width="420px" :close-on-click-modal="false"
             append-to-body>
    <el-form label-position="top" class="settings-form">
      <el-form-item label="任务名称">
        <el-input v-model="editMetaForm.title" placeholder="任务名称" maxlength="60" show-word-limit />
      </el-form-item>
      <el-form-item label="截止时间">
        <el-date-picker v-model="editMetaForm.dueAt" type="date" placeholder="选择截止日期"
                        value-format="YYYY-MM-DD" style="width: 100%" clearable />
        <small class="form-hint">不设置表示无截止时间</small>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="editMetaVisible = false">取消</el-button>
      <el-button type="primary" :loading="savingMeta" @click="saveEditMeta">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { Back, Download, EditPen, Message, Refresh } from "@element-plus/icons-vue";
import {
  deleteFollowupItem,
  previewRefreshSession,
  sendFollowups,
  updateFollowupItem,
  updateSessionMeta,
  type ReconcilePreview,
  type ReconcilePreviewRow,
} from "../services/followupApi";
import { useFollowupStore, type FollowupPerson } from "../stores/followup";

const props = defineProps<{ id: string }>();
const router = useRouter();
const store = useFollowupStore();
const busy = ref(false);
const previewBusy = ref(false);
const refreshInput = ref<HTMLInputElement>();
const taskId = computed(() => Number(props.id));
const task = computed(() => store.taskById(taskId.value));
const people = computed(() => store.peopleByTask(taskId.value));
const completion = computed(() => task.value?.completion ?? 0);
const activeTab = ref("progress");
const reminderEvents = computed(() =>
  store.reminderEvents
    .filter((event) => event.taskId === taskId.value)
    .map((event) => {
      // 留痕按 followupTaskId 关联到人员（people.backendTaskId 存的是 task id），
      // 收件人展示负责人姓名，避免显示工号/邮箱与负责人对不上。
      const person = people.value.find((item) => item.backendTaskId === event.personId);
      return { ...event, personName: person?.name ?? "", personEmail: person?.email ?? "" };
    }),
);

const previewVisible = ref(false);
const preview = ref<ReconcilePreview | null>(null);
const pendingFile = ref<File | null>(null);

/** 上传/解析期间的醒目进度浮层。upload 阶段是真实传输百分比，process 阶段服务端耗时未知，用不确定态。 */
interface ProgressTask {
  title: string;
  phase: "upload" | "process";
  percent: number;
  fileName: string;
  seconds: number;
}

const progressTask = ref<ProgressTask | null>(null);
let secondTimer: ReturnType<typeof setInterval> | null = null;

function startProgress(title: string, fileName = "") {
  progressTask.value = {
    title,
    phase: fileName ? "upload" : "process",
    percent: 0,
    fileName,
    seconds: 0,
  };
  secondTimer = setInterval(() => {
    if (progressTask.value) progressTask.value.seconds += 1;
  }, 1000);
}

function stopProgress() {
  if (secondTimer) {
    clearInterval(secondTimer);
    secondTimer = null;
  }
  progressTask.value = null;
}

onUnmounted(stopProgress);

const previewRows = computed<Array<ReconcilePreviewRow & { kind: string }>>(() => {
  const data = preview.value;
  if (!data) return [];
  return [
    ...data.added.map((row) => ({ ...row, kind: "added" })),
    ...data.updated.map((row) => ({ ...row, kind: "updated" })),
    ...data.resolved.map((row) => ({ ...row, kind: "resolved" })),
  ];
});

const hasChanges = computed(() => {
  const data = preview.value;
  return !!data && (data.added.length > 0 || data.updated.length > 0 || data.resolved.length > 0);
});

function diffTagType(kind: string): "success" | "warning" | "primary" {
  if (kind === "resolved") return "success";
  if (kind === "updated") return "warning";
  return "primary";
}

const progressColor = computed(() => {
  if (completion.value >= 80) return "#17b890";
  if (completion.value >= 40) return "#1468f4";
  return "#ff933d";
});

function personTagType(status: string): "success" | "danger" | "primary" {
  if (status === "已完成") return "success";
  if (status === "异常") return "danger";
  return "primary";
}

onMounted(() => {
  if (!store.taskById(taskId.value)) {
    store.loadSession(taskId.value);
  }
});

async function handleRefreshFile(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  target.value = "";
  previewBusy.value = true;
  pendingFile.value = file;
  startProgress("正在解析最新版表格", file.name);
  try {
    preview.value = await previewRefreshSession(taskId.value, file, (percent) => {
      if (!progressTask.value) return;
      progressTask.value.percent = percent;
      // 传输完成后进入服务端解析阶段，这一阶段耗时无法预估，改用不确定态。
      if (percent >= 100) progressTask.value.phase = "process";
    });
    previewVisible.value = true;
  } catch (error) {
    pendingFile.value = null;
    ElMessage.error(error instanceof Error ? error.message : "解析新表格失败");
  } finally {
    previewBusy.value = false;
    stopProgress();
  }
}

/** 用户在差异预览中确认后，复用预览阶段的分析结果快速对账，不再重复调用模型。 */
async function applyRefresh() {
  if (!pendingFile.value) return;
  busy.value = true;
  startProgress("正在应用更新");
  try {
    await store.confirmRefresh(taskId.value);
    previewVisible.value = false;
    pendingFile.value = null;
    ElMessage.success("已重新解析并增量对账");
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失败";
    if (message.includes("预览已失效")) {
      pendingFile.value = null;
      previewVisible.value = false;
      ElMessage.warning("预览已失效，请重新上传最新版文件");
    } else {
      ElMessage.error(message);
    }
  } finally {
    busy.value = false;
    stopProgress();
  }
}

const selectedPeople = ref<FollowupPerson[]>([]);

function onSelectionChange(rows: FollowupPerson[]) {
  selectedPeople.value = rows;
}

const editVisible = ref(false);
const savingEdit = ref(false);
const editForm = ref({ id: 0, name: "", email: "" });

function openEditPerson(row: FollowupPerson) {
  editForm.value = { id: row.id, name: row.name, email: row.email };
  editVisible.value = true;
}

async function saveEditPerson() {
  if (!editForm.value.name.trim()) {
    ElMessage.warning("姓名不能为空");
    return;
  }
  savingEdit.value = true;
  try {
    const detail = await updateFollowupItem(editForm.value.id, {
      displayName: editForm.value.name.trim(),
      email: editForm.value.email.trim(),
    });
    store.upsertSessionDetail(detail);
    editVisible.value = false;
    ElMessage.success("已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  } finally {
    savingEdit.value = false;
  }
}

/** 编辑任务信息：任务名称 + 截止时间。 */
const editMetaVisible = ref(false);
const savingMeta = ref(false);
const editMetaForm = ref({ title: "", dueAt: "" });

function openEditMeta() {
  const current = task.value;
  if (!current) return;
  editMetaForm.value = {
    title: current.title,
    dueAt: current.due === "未设置" ? "" : current.due,
  };
  editMetaVisible.value = true;
}

async function saveEditMeta() {
  const title = editMetaForm.value.title.trim();
  if (!title) {
    ElMessage.warning("任务名称不能为空");
    return;
  }
  savingMeta.value = true;
  try {
    const detail = await updateSessionMeta(taskId.value, {
      title,
      dueAt: editMetaForm.value.dueAt || "",
    });
    store.upsertSessionDetail(detail);
    editMetaVisible.value = false;
    ElMessage.success("已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  } finally {
    savingMeta.value = false;
  }
}

async function handleDeletePerson(row: FollowupPerson) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${row.name}」吗？该人员的催办任务与发送留痕会一并删除，且无法恢复。`,
      "删除人员",
      { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" },
    );
  } catch {
    return; // 用户取消
  }
  try {
    const detail = await deleteFollowupItem(row.id);
    store.upsertSessionDetail(detail);
    selectedPeople.value = selectedPeople.value.filter((person) => person.id !== row.id);
    ElMessage.success("已删除");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "删除失败");
  }
}

/** 批量催办勾选的人；已发送的人也可以再次提醒。 */
async function sendSelected() {
  await send(selectedPeople.value.map((person) => person.id));
}

async function sendOne(personId: number) {
  await send([personId]);
}

async function send(itemIds: number[]) {
  if (itemIds.length === 0) {
    ElMessage.info("没有可发送的对象");
    return;
  }
  busy.value = true;
  try {
    const detail = await sendFollowups(taskId.value, itemIds);
    store.upsertSessionDetail(detail);
    ElMessage.success("已记录发送结果");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "发送失败");
  } finally {
    busy.value = false;
  }
}

function exportProgress() {
  const header = ["负责人", "部门", "缺失内容", "来源行", "状态", "发送状态"];
  const rows = people.value.map((person) => [
    person.name,
    person.department,
    person.missing.join("、"),
    person.sourceRows,
    person.status,
    person.sendStatus,
  ]);
  const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${task.value?.title ?? "催办任务"}-进度.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
</script>
