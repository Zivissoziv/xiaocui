<template>
  <div class="detail-page">
    <header class="detail-top">
      <button class="back-button" aria-label="返回" @click="router.push({ name: 'console' })">
        <el-icon><Back /></el-icon>
      </button>
      <h1>任务进度详情</h1>
      <div class="detail-actions">
        <input ref="refreshInput" class="hidden-input" type="file" accept=".xlsx,.xls" @change="handleRefreshFile">
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
              <h2>{{ task.title }}</h2>
              <el-tag :type="taskTagType(task.status)" size="small" effect="light" round>{{ task.status }}</el-tag>
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
            <el-tag v-for="field in task.fields" :key="field" type="success" size="small" effect="light" round>
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
              <el-table-column label="负责人" min-width="130">
                <template #default="{ row }">
                  <div class="person-name">{{ row.name }}</div>
                </template>
              </el-table-column>
              <el-table-column label="缺失内容" min-width="150">
                <template #default="{ row }">{{ row.missing.join("、") || "无" }}</template>
              </el-table-column>
              <el-table-column prop="sourceRows" label="来源行" width="100" />
              <el-table-column label="状态" width="100" align="center">
                <template #default="{ row }">
                  <el-tag :type="personTagType(row.status)" size="small" effect="light" round>{{ row.status }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="发送状态" width="120">
                <template #default="{ row }">
                  <div>{{ row.sendStatus }}</div>
                  <small class="person-sub">{{ row.sentAt }}</small>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="90" align="center">
                <template #default="{ row }">
                  <el-button link type="primary" size="small"
                             :disabled="row.status === '异常' || row.sendStatus === '已关闭'"
                             @click="sendOne(row.id)">发送</el-button>
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
              <el-table-column prop="recipient" label="收件人" min-width="150" />
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

  <el-dialog v-model="previewVisible" title="上传最新版 · 差异预览" width="720px" :close-on-click-modal="false">
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
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Back, Download, Message, Refresh } from "@element-plus/icons-vue";
import {
  previewRefreshSession,
  sendFollowups,
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
const reminderEvents = computed(() => store.reminderEvents.filter((event) => event.taskId === taskId.value));

const previewVisible = ref(false);
const preview = ref<ReconcilePreview | null>(null);
const pendingFile = ref<File | null>(null);

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

function taskTagType(status: string): "success" | "warning" | "primary" {
  if (status === "已完成") return "success";
  if (status === "有异常") return "warning";
  return "primary";
}

function personTagType(status: string): "success" | "warning" | "primary" {
  if (status === "已完成") return "success";
  if (status === "异常") return "warning";
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
  try {
    preview.value = await previewRefreshSession(taskId.value, file);
    previewVisible.value = true;
  } catch (error) {
    pendingFile.value = null;
    ElMessage.error(error instanceof Error ? error.message : "解析新表格失败");
  } finally {
    previewBusy.value = false;
  }
}

/** 用户在差异预览中确认后，复用预览阶段的分析结果快速对账，不再重复调用模型。 */
async function applyRefresh() {
  if (!pendingFile.value) return;
  busy.value = true;
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
  }
}

const selectedPeople = ref<FollowupPerson[]>([]);

function onSelectionChange(rows: FollowupPerson[]) {
  selectedPeople.value = rows;
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
