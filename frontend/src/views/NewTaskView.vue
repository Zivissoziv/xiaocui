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
          <strong>分析完成：需要催办 {{ analysisDetail?.progress.total ?? 0 }} 人</strong>
          <span>
            {{ analysisSummaryText }}
            <em v-if="recognitionTag" class="recognition-tag">{{ recognitionTag }}</em>
          </span>
        </div>
        <img class="bot-image bot-wave" src="/assets/xiaocui-slices/xiaocui-analyse.png" alt="小崔">
      </div>
      <el-descriptions :column="1" border size="small" class="analysis-desc">
        <el-descriptions-item v-for="row in analysisCards" :key="row.label" :label="row.label">
          <el-tag :type="row.tagType" size="small" effect="light" round>{{ row.result }}</el-tag>
          <span class="desc-text">{{ row.desc }}</span>
        </el-descriptions-item>
      </el-descriptions>
      <el-alert v-if="analysisDetail?.analysis.risks.length" type="warning" :closable="false" class="risk-alert">
        <template #title>需要你留意</template>
        <p v-for="risk in analysisDetail.analysis.risks" :key="risk" class="risk-line">{{ risk }}</p>
      </el-alert>
    </div>

    <div v-else-if="currentStep === 2" class="wizard-body config-step">
      <section class="form-section">
        <h3>负责人与催办文案</h3>
        <p>匹配异常的对象不会自动发送，补充邮箱后再发送。</p>

        <div v-if="matchSummary" class="match-banner" :class="{ warn: matchSummary.unmatched > 0 }">
          <el-icon><component :is="matchSummary.unmatched > 0 ? WarningFilled : CircleCheckFilled" /></el-icon>
          <div>
            <strong>
              通讯录匹配：已补全 {{ matchSummary.filled }} 人
              <template v-if="matchSummary.unmatched > 0">，{{ matchSummary.unmatched }} 人没匹配到</template>
            </strong>
            <p>
              没匹配到的人可以在下方表格里直接填，或去
              <el-button link type="primary" size="small" @click="router.push({ name: 'contacts' })">通讯录</el-button>
              补录后再点「重新匹配」。
            </p>
          </div>
          <el-button size="small" plain :loading="matching" @click="autoMatchEmails">重新匹配</el-button>
        </div>

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
          <el-descriptions-item label="可发送">{{ readyCount }} 人</el-descriptions-item>
          <el-descriptions-item label="需人工确认">{{ analysisDetail?.progress.needsManualReview ?? 0 }} 条（异常对象，可在详情页补充邮箱后发送）</el-descriptions-item>
          <el-descriptions-item label="催办记录">创建时不登记；在详情页对选中的人点「发送」后才产生记录</el-descriptions-item>
        </el-descriptions>
        <el-alert type="info" :closable="false" class="risk-alert">
          <template #title>发送模式说明</template>
          <p class="risk-line">当前为手动记录模式：确认创建只保存催办草稿和待发送状态，不会真正发邮件，也不会登记任何催办记录；之后在详情页手动点「发送」，才登记一条催办留痕。</p>
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
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { ArrowRight, Back, CircleCheckFilled, WarningFilled } from "@element-plus/icons-vue";
import {
  createAnalysisSession,
  updateFollowupItem,
  type BackendSessionDetail,
} from "../services/followupApi";
import { matchContacts } from "../services/addressBookApi";
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
/** 通讯录匹配结果：进入「配置信息」这一步时自动按姓名补全邮箱。 */
const matchSummary = ref<{ filled: number; unmatched: number } | null>(null);
const matching = ref(false);

watch(currentStep, (step) => {
  if (step === 2 && currentTaskId.value) void autoMatchEmails();
});

/** 只为「有姓名、没邮箱」的人回查通讯录；失败时静默降级，用户仍可手动填写。 */
async function autoMatchEmails() {
  const targets = currentPeople.value.filter((person) => person.name.trim() && !person.email.trim());
  if (targets.length === 0) {
    matchSummary.value = null;
    return;
  }
  matching.value = true;
  try {
    const hits = await matchContacts(targets.map((person) => person.name));
    let filled = 0;
    for (const hit of hits) {
      if (!hit.matched) continue;
      const person = targets.find((item) => normalizeName(item.name) === normalizeName(hit.name));
      if (!person) continue;
      person.email = hit.email;
      if (!person.phone.trim() && hit.phone) person.phone = hit.phone;
      filled++;
    }
    matchSummary.value = { filled, unmatched: targets.length - filled };
    if (filled > 0) ElMessage.success(`已从通讯录补全 ${filled} 人的邮箱`);
  } catch {
    matchSummary.value = null;
  } finally {
    matching.value = false;
  }
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, "");
}

const stepSubtitle = computed(() => {
  return [
    "上传需要催办的 Excel 文件，并输入自然语言催办要求",
    "后端已完成表格画像、列裁剪和缺项提取，请确认结果",
    "确认负责人和催办内容，异常对象补充联系方式后再发送",
    "核对无误后确认创建，当前为手动记录模式，不会真正发送邮件",
  ][currentStep.value];
});
/** 用人话总结分析结果：「要催谁/要补什么/需要你帮忙」三件事。 */
const analysisCards = computed(() => {
  const detail = analysisDetail.value;
  if (!detail) return [];
  const plan = detail.analysis.columnPlan;
  const total = detail.progress.total;
  const manual = detail.progress.needsManualReview;
  const sheetCount = detail.workbookProfile.sheets.length;
  const cards: Array<{ label: string; result: string; tagType: string; desc: string }> = [
    {
      label: "要催谁",
      result: plan.ownerColumn ? `${total} 位负责人` : "待确认",
      tagType: plan.ownerColumn ? "success" : "warning",
      desc: plan.ownerColumn
        ? `从「${plan.ownerColumn}」列区分每个人，同一个人多行缺项会合并催办`
        : "没识别出负责人列，需要你手动指定或分配",
    },
    {
      label: "要补什么",
      result: plan.requiredColumns.length ? plan.requiredColumns.join("、") : "待确认",
      tagType: plan.requiredColumns.length ? "success" : "warning",
      desc: plan.requiredColumns.length
        ? "这些字段有缺失的行会生成催办事项"
        : "没识别出要催的字段，在下一步手动指定",
    },
    {
      label: "需要你帮忙",
      result: `${manual} 人`,
      tagType: manual > 0 ? "warning" : "success",
      desc: manual > 0
        ? "姓名或邮箱缺失，可以去通讯录补一下，也能在下一步手动填"
        : "联系方式都齐了，可以直接催办",
    },
  ];
  if (sheetCount > 1) {
    cards.unshift({
      label: "分析范围",
      result: plan.sheetName,
      tagType: "primary",
      desc: `工作簿共 ${sheetCount} 个工作表，本次只看行数最多的这个`,
    });
  }
  return cards;
});

/** banner 副标题：把工作表规模 + 识别结论用一句人话写出来。 */
const analysisSummaryText = computed(() => {
  const detail = analysisDetail.value;
  if (!detail) return "";
  const plan = detail.analysis.columnPlan;
  const sheetName = plan.sheetName || "工作表";
  const rowCount = detail.workbookProfile.sheets[0]?.rowCount ?? 0;
  const total = detail.progress.total;
  const owner = plan.ownerColumn;
  const required = plan.requiredColumns;

  if (owner && required.length > 0) {
    return `${sheetName} 共 ${rowCount} 行数据，其中 ${total} 位负责人的「${required.join("、")}」还没填`;
  }
  if (owner) {
    return `${sheetName} 共 ${rowCount} 行数据，识别 ${total} 位负责人需要催办`;
  }
  if (required.length > 0) {
    return `${sheetName} 共 ${rowCount} 行数据，${total} 行的「${required.join("、")}」缺失`;
  }
  return `${sheetName} 共 ${rowCount} 行数据，识别出 ${total} 个待补充对象`;
});

/** 告诉用户这一轮是 AI 还是关键词规则给的结论，便于判断是否要相信。 */
const recognitionTag = computed(() => {
  if (!analysisDetail.value) return "";
  const isRule = analysisDetail.value.analysis.risks.some(
    (risk) => risk.includes("规则") || risk.includes("未使用大模型"),
  );
  return isRule ? "关键词规则" : "AI 识别";
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
  matchSummary.value = null;
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

/** 最后一步「确认创建」：只保存催办草稿（手动模式，不发送、不登记留痕），完成后跳转详情页，由用户在详情页决定何时发送。 */
async function confirmCreate() {
  busy.value = true;
  try {
    let detail: BackendSessionDetail | null = null;
    for (const person of currentPeople.value) {
      detail = await updateFollowupItem(person.id, {
        displayName: person.name,
        employeeId: person.employee === "待确认" ? "" : person.employee,
        departmentId: person.department === "待确认" ? "" : person.department,
        email: person.email,
        phone: person.phone,
        status: person.status === "异常" ? "needs_manual_review" : "ready_to_send",
        messageFinal: person.messageFinal,
      });
    }
    if (detail) store.upsertSessionDetail(detail);
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
