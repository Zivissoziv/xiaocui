<template>
  <div class="detail-page">
    <header class="detail-top">
      <button class="back-button" @click="router.push({ name: 'console' })">
        <el-icon><Back /></el-icon>
      </button>
      <h1>任务进度详情</h1>
      <div class="detail-actions">
        <input ref="refreshInput" class="hidden-input" type="file" accept=".xlsx,.xls" @change="handleRefreshFile">
        <el-button :icon="Refresh" plain :loading="busy" @click="refreshInput?.click()">上传最新版</el-button>
        <el-button :icon="Message" type="primary" :loading="busy" @click="sendAllReady">发送待催</el-button>
        <el-button :icon="Download" plain @click="exportProgress">导出进度</el-button>
      </div>
    </header>

    <main v-if="task" class="detail-workspace">
      <section class="progress-hero panel">
        <div class="hero-title">
          <div class="clip-icon"><el-icon><DocumentChecked /></el-icon></div>
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
          <el-progress type="dashboard" :percentage="completion" :width="128" :color="progressColor" />
          <ul class="ring-legend">
            <li><i class="green"></i>已发送/完成 <strong>{{ task.done }} 人</strong></li>
            <li><i class="orange"></i>待发送 <strong>{{ task.pending }} 人</strong></li>
            <li><i class="red"></i>需确认 <strong>{{ task.manual }} 人</strong></li>
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

      <el-tabs v-model="activeTab" class="detail-tabs">
        <el-tab-pane label="整体进度" name="progress">
          <section class="chart-grid">
            <article class="panel chart-panel">
              <h3>完成度</h3>
              <el-progress type="dashboard" :percentage="completion" :width="132" :color="progressColor" />
              <p class="chart-caption">{{ task.done }} / {{ totalPeople }} 人已处理</p>
            </article>

            <article class="panel chart-panel">
              <h3>进度分布</h3>
              <ul class="ratio-list">
                <li v-for="item in distribution" :key="item.label">
                  <span class="ratio-label">{{ item.label }}</span>
                  <el-progress class="ratio-bar" :percentage="item.ratio" :stroke-width="10"
                               :show-text="false" :color="item.color" />
                  <strong class="ratio-value">{{ item.count }} 人</strong>
                </li>
              </ul>
            </article>
          </section>

          <section class="panel">
            <h3>人员进度明细</h3>
            <el-table :data="people" class="person-table" size="small">
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
                             :disabled="row.status === '异常' || row.sendStatus === '已发送'"
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
            <el-table :data="reminderEvents" size="small">
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
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Back, DocumentChecked, Download, Message, Refresh } from "@element-plus/icons-vue";
import { sendFollowups } from "../services/followupApi";
import { useFollowupStore } from "../stores/followup";

const props = defineProps<{ id: string }>();
const router = useRouter();
const store = useFollowupStore();
const busy = ref(false);
const refreshInput = ref<HTMLInputElement>();
const taskId = computed(() => Number(props.id));
const task = computed(() => store.taskById(taskId.value));
const people = computed(() => store.peopleByTask(taskId.value));
const totalPeople = computed(() => Math.max(1, people.value.length));
const completion = computed(() => task.value?.completion ?? 0);
const activeTab = ref("progress");
const reminderEvents = computed(() => store.reminderEvents.filter((event) => event.taskId === taskId.value));

const progressColor = computed(() => {
  if (completion.value >= 80) return "#17b890";
  if (completion.value >= 40) return "#1468f4";
  return "#ff933d";
});

const distribution = computed(() => {
  const base = totalPeople.value;
  return [
    { label: "已发送/完成", count: task.value?.done ?? 0, color: "#17b890" },
    { label: "待发送", count: task.value?.pending ?? 0, color: "#ff933d" },
    { label: "需人工确认", count: task.value?.manual ?? 0, color: "#ff5b78" },
  ].map((item) => ({ ...item, ratio: Math.round((item.count / base) * 100) }));
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
  busy.value = true;
  try {
    await store.refreshTask(taskId.value, file);
    ElMessage.success("已重新解析并增量对账");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "刷新失败");
  } finally {
    busy.value = false;
    target.value = "";
  }
}

async function sendAllReady() {
  const ids = people.value.filter((person) => person.status !== "异常" && person.sendStatus !== "已发送").map((person) => person.id);
  await send(ids);
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
