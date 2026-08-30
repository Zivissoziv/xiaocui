<template>
  <header class="detail-top">
    <button class="back-button" aria-label="返回" @click="router.push({ name: 'console' })">
      <el-icon><Back /></el-icon>
    </button>
    <h1>新建催办任务</h1>
  </header>

  <section class="wizard-card page-card" aria-label="导入催办向导">
    <div class="wizard-title">
      <span>{{ currentStep + 1 }}. {{ steps[currentStep] }}</span>
      <p>{{ stepSubtitle }}</p>
    </div>

    <el-steps :active="currentStep" finish-status="success" align-center class="wizard-steps">
      <el-step v-for="(step, index) in steps" :key="step" :title="step" :description="stepDescriptions[index]" />
    </el-steps>

    <div v-if="currentStep === 0" class="wizard-body import-step">
      <input ref="fileInput" class="hidden-input" type="file" accept=".xlsx,.xls" @change="handleFileChange">

      <div class="upload-compact" :class="{ 'has-file': selectedFile }" @click="fileInput?.click()">
        <img class="bot-image bot-excel upload-mascot" src="/assets/xiaocui-slices/excel.png" alt="小崔">
        <div class="upload-text">
          <strong>{{ selectedFile ? selectedFile.name : "点击选择 Excel 文件" }}</strong>
          <span>{{ selectedFile ? `已选择 · ${fileSizeText} · 点击可重新选择` : "支持 .xlsx / .xls，最大 10MB" }}</span>
        </div>
        <el-button v-if="selectedFile" link type="primary" @click.stop="clearFile">移除</el-button>
        <el-tag v-else type="info" size="small" effect="plain">必填</el-tag>
      </div>

      <div class="config-grid">
        <label>任务名称
          <el-input v-model="taskTitle" placeholder="留空则使用文件名" />
        </label>
        <label>截止时间
          <el-date-picker v-model="dueAt" type="date" value-format="YYYY-MM-DD"
                          placeholder="选择截止日期" style="width: 100%" />
        </label>
      </div>

      <div class="instruction-block">
        <div class="instruction-head">
          <span>催办要求</span>
          <em>写得越具体，识别越准</em>
        </div>
        <el-input v-model="instruction" type="textarea" :rows="5" resize="none"
                  placeholder="用一句话说明：要催谁、催哪几列。例：请催G列的人完成H~K列" />
        <p class="instruction-note">
          直接写出要催的列名（如「合同金额」）识别最准；也可以用 Excel 的列标（A、B、C…）指代第几列。
          不点名时会按各列填写情况自动推断，可能把备注类字段也算进去。
        </p>
      </div>
    </div>

    <div v-else-if="currentStep === 1" class="wizard-body analysis-step">
      <div class="success-banner">
        <el-icon><CircleCheckFilled /></el-icon>
        <div>
          <strong>分析完成：{{ analysisDetail?.progress.total ?? 0 }} 个待补充对象</strong>
          <span>{{ analysisDetail?.analysis.tableSummary }}</span>
        </div>
        <img class="bot-image bot-wave" src="/assets/xiaocui-slices/wave.png" alt="小崔">
      </div>
      <el-descriptions :column="1" border size="small" class="analysis-desc">
        <el-descriptions-item v-for="row in analysisRows" :key="row.label" :label="row.label">
          <el-tag type="success" size="small" effect="light" round>{{ row.result }}</el-tag>
          <span class="desc-text">{{ row.desc }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <el-alert v-if="analysisDetail?.analysis.risks.length" type="warning" :closable="false" class="risk-alert">
        <template #title>风险提示</template>
        <p v-for="risk in analysisDetail.analysis.risks" :key="risk" class="risk-line">{{ risk }}</p>
      </el-alert>
    </div>

    <div v-else-if="currentStep === 2" class="wizard-body config-step">
      <section class="form-section">
        <h3>负责人与催办文案</h3>
        <p>匹配异常的对象不会自动发送，补充邮箱后再发送。</p>
        <el-table :data="currentPeople" class="mapping-table" size="small" max-height="360">
          <el-table-column label="姓名" min-width="150">
            <template #default="{ row }">
              <el-input v-model="row.name" size="small" placeholder="姓名" />
            </template>
          </el-table-column>
          <el-table-column label="邮箱" min-width="210">
            <template #default="{ row }">
              <el-input v-model="row.email" size="small" placeholder="用于发送催办提醒" />
            </template>
          </el-table-column>
          <el-table-column label="缺失内容" min-width="170">
            <template #default="{ row }">
              <el-tag :type="row.status === '异常' ? 'danger' : 'primary'" effect="light" round>
                {{ row.status }}
              </el-tag>
              <p class="missing-text">{{ row.missing.join("、") }}</p>
              <small class="source-rows">来源行：{{ row.sourceRows }}</small>
            </template>
          </el-table-column>
          <el-table-column label="催办文案" min-width="250">
            <template #default="{ row }">
              <el-input v-model="row.messageFinal" type="textarea" :rows="3" size="small" resize="none" />
            </template>
          </el-table-column>
        </el-table>
      </section>
    </div>

    <div v-else class="wizard-body confirm-step">
      <section class="form-section">
        <h3>确认创建</h3>
        <p>请核对以下信息，确认后进入任务详情页。</p>
        <el-descriptions :column="1" border size="small" class="analysis-desc confirm-desc">
          <el-descriptions-item label="任务名称">{{ taskTitle || selectedFile?.name || "未命名任务" }}</el-descriptions-item>
          <el-descriptions-item label="截止时间">{{ dueAt || "未设置" }}</el-descriptions-item>
          <el-descriptions-item label="待催办对象">{{ analysisDetail?.progress.total ?? 0 }} 人</el-descriptions-item>
          <el-descriptions-item label="记录为待发送">{{ readyCount }} 条</el-descriptions-item>
          <el-descriptions-item label="需人工确认">{{ analysisDetail?.progress.needsManualReview ?? 0 }} 条（异常对象，可在详情页补充邮箱后发送）</el-descriptions-item>
        </el-descriptions>
        <el-alert type="info" :closable="false" class="risk-alert">
          <template #title>发送模式说明</template>
          <p class="risk-line">当前为手动记录模式：确认后系统只记录待发送文案和发送留痕，不会真正发出邮件；可在详情页继续发送或跟踪进度。</p>
        </el-alert>
      </section>
    </div>

    <footer class="wizard-footer">
      <el-button v-if="currentStep > 0" @click="currentStep--">上一步</el-button>
      <el-button v-if="currentStep === 1" plain type="primary" @click="reanalyze">重新解析</el-button>
      <el-button v-if="currentStep < 3" type="primary" :loading="busy" @click="goNext">
        下一步：{{ steps[currentStep + 1] }} <el-icon><ArrowRight /></el-icon>
      </el-button>
      <el-button v-else type="primary" :loading="busy" @click="confirmCreate">
        确认创建，进入详情 <el-icon><ArrowRight /></el-icon>
      </el-button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { ArrowRight, Back, CircleCheckFilled } from "@element-plus/icons-vue";
import {
  createAnalysisSession,
  sendFollowups,
  updateFollowupItem,
  type BackendSessionDetail,
} from "../services/followupApi";
import { useFollowupStore } from "../stores/followup";

const router = useRouter();
const store = useFollowupStore();
const currentStep = ref(0);
const selectedFile = ref<File | null>(null);
const fileInput = ref<HTMLInputElement>();
const taskTitle = ref("");
const dueAt = ref(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
const instruction = ref("");
const analysisDetail = ref<BackendSessionDetail | null>(null);
const currentTaskId = ref(0);
const busy = ref(false);
const steps = ["导入文件", "AI解析", "配置信息", "确认创建"];
const stepDescriptions = [
  "上传 Excel 与催办要求",
  "识别采集列与缺项",
  "补全联系方式与催办文案",
  "确认后进入详情页",
];

const fileSizeText = computed(() => {
  const file = selectedFile.value;
  if (!file) return "";
  const kb = file.size / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
});

const currentPeople = computed(() => store.peopleByTask(currentTaskId.value));
const readyCount = computed(() =>
  currentPeople.value.filter((person) => person.status !== "异常" && person.sendStatus !== "已发送").length,
);
const stepSubtitle = computed(() => {
  return [
    "上传需要催办的 Excel 文件，并输入自然语言催办要求",
    "后端已完成表格画像、列裁剪和缺项提取，请确认结果",
    "确认负责人和催办内容，异常对象补充联系方式后再发送",
    "核对无误后确认创建，当前为手动记录模式，不会真正发送邮件",
  ][currentStep.value];
});
const analysisRows = computed(() => {
  const detail = analysisDetail.value;
  if (!detail) return [];
  const plan = detail.analysis.columnPlan;
  const rows = [
    { label: "负责人列", result: plan.ownerColumn || "待确认", desc: "用于聚合每个人的缺项" },
    { label: "采集列", result: plan.requiredColumns.join("、") || "待确认", desc: "为空时生成待补充事项" },
    { label: "待处理对象", result: `${detail.progress.total} 人`, desc: `其中 ${detail.progress.needsManualReview} 人需要人工确认` },
  ];
  const sheetCount = detail.workbookProfile.sheets.length;
  if (sheetCount > 1) {
    rows.unshift({
      label: "分析范围",
      result: plan.sheetName,
      desc: `工作簿共 ${sheetCount} 个工作表，本次只分析行数最多的这个`,
    });
  }
  return rows;
});

function clearFile() {
  selectedFile.value = null;
  if (fileInput.value) fileInput.value.value = "";
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  selectedFile.value = target.files?.[0] ?? null;
  if (selectedFile.value && !taskTitle.value) {
    taskTitle.value = selectedFile.value.name.replace(/\.(xlsx|xls)$/i, "");
  }
}

async function goNext() {
  if (currentStep.value === 0) {
    await analyze();
    return;
  }
  currentStep.value++;
}

function reanalyze() {
  currentStep.value = 0;
}

async function analyze() {
  if (!selectedFile.value) {
    ElMessage.warning("请先选择一个 Excel 文件");
    return;
  }
  if (!instruction.value.trim()) {
    ElMessage.warning("请输入催办要求");
    return;
  }
  busy.value = true;
  try {
    const detail = await createAnalysisSession({
      file: selectedFile.value,
      title: taskTitle.value,
      instruction: instruction.value,
      dueAt: dueAt.value,
    });
    analysisDetail.value = detail;
    currentTaskId.value = store.upsertSessionDetail(detail);
    currentStep.value = 1;
    ElMessage.success("Excel 已由后端完成分析");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "分析失败");
  } finally {
    busy.value = false;
  }
}

/** 最后一步「确认创建」：只记录待发送文案与留痕（手动模式，不真正发送），完成后跳转详情页。 */
async function confirmCreate() {
  const readyPeople = currentPeople.value.filter((person) => person.status !== "异常" && person.sendStatus !== "已发送");
  busy.value = true;
  try {
    for (const person of currentPeople.value) {
      await updateFollowupItem(person.id, {
        displayName: person.name,
        employeeId: person.employee === "待确认" ? "" : person.employee,
        departmentId: person.department === "待确认" ? "" : person.department,
        email: person.email,
        phone: person.phone,
        status: person.status === "异常" ? "needs_manual_review" : "ready_to_send",
        messageFinal: person.messageFinal,
      });
    }
    const detail = await sendFollowups(currentTaskId.value, readyPeople.map((person) => person.id));
    store.upsertSessionDetail(detail);
    ElMessage.success("任务已创建，可随时在详情页发送催办");
    openTask(currentTaskId.value);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "创建失败");
  } finally {
    busy.value = false;
  }
}

function openTask(id: number) {
  if (!id) return;
  router.push({ name: "task-detail", params: { id } });
}
</script>
