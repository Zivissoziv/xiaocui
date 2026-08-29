<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="assistant-brand">
        <img class="bot-image bot-avatar" src="/assets/xiaocui-slices/avatar.png" alt="小崔">
        <div>
          <strong>小崔</strong>
          <span>AI催办小助手</span>
        </div>
      </div>

      <nav class="side-nav" aria-label="主导航">
        <button class="active"><el-icon><HomeFilled /></el-icon><span>首页</span></button>
        <button><el-icon><Compass /></el-icon><span>催办任务</span></button>
        <button><el-icon><Clock /></el-icon><span>历史记录</span></button>
        <button><el-icon><Bell /></el-icon><span>通知模板</span></button>
        <button @click="openSettings"><el-icon><Setting /></el-icon><span>设置</span></button>
      </nav>

      <div class="sidebar-tip">
        <div><el-icon><InfoFilled /></el-icon><strong>小崔小贴士</strong></div>
        <p>上传 Excel 后由后端解析表格，小崔只拿结构摘要和缺项行生成催办草稿。</p>
        <img class="bot-image bot-mini" src="/assets/xiaocui-slices/wave.png" alt="">
      </div>
    </aside>

    <main class="workspace">
      <header class="home-header">
        <div>
          <h1>你好，张管理员</h1>
          <p>{{ todayText }}</p>
        </div>
        <el-button type="primary" :icon="Plus" @click="openWizard">新建催办任务</el-button>
      </header>

      <section class="metric-grid" aria-label="任务统计">
        <article v-for="metric in metrics" :key="metric.label" :class="['metric-card', metric.tone]">
          <span>{{ metric.label }}</span>
          <strong>{{ metric.value }}</strong>
          <el-icon><component :is="metric.icon" /></el-icon>
        </article>
      </section>

      <section class="panel recent-panel">
        <div class="panel-head">
          <div>
            <h2>最近任务</h2>
            <p>任务不多，直接在这里筛选和进入详情。</p>
          </div>
          <el-input v-model="taskKeyword" class="task-search" placeholder="搜索任务、文件或状态" clearable>
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>
        <el-table :data="filteredTasks" class="task-table" row-class-name="clickable-row"
                  @row-click="(row: FollowupTask) => openTask(row.id)">
          <el-table-column prop="title" label="任务名称" min-width="190" show-overflow-tooltip />
          <el-table-column prop="file" label="文件名" min-width="170" show-overflow-tooltip />
          <el-table-column prop="pending" label="待发送" width="96" align="center" />
          <el-table-column prop="manual" label="需确认" width="96" align="center">
            <template #default="{ row }">
              <span :class="{ 'danger-text': row.manual > 0 }">{{ row.manual }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="lastRefresh" label="更新时间" width="150" />
          <el-table-column label="状态" width="110" align="center">
            <template #default="{ row }">
              <el-tag :type="taskTagType(row.status)" size="small" effect="light" round>{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <template #empty>
            <div class="table-empty">
              <template v-if="store.loading && store.tasks.length === 0">正在加载任务…</template>
              <template v-else-if="store.error">{{ store.error }}，请确认后端已启动</template>
              <template v-else-if="store.tasks.length === 0">还没有催办任务，点击右上角「新建催办任务」开始</template>
              <template v-else>没有匹配的任务</template>
            </div>
          </template>
        </el-table>
      </section>
    </main>
  </div>

  <section v-if="wizardVisible" class="wizard-overlay" aria-label="导入催办向导">
    <button class="ghost-close" aria-label="关闭" @click="closeWizard">×</button>

    <div class="wizard-card">
      <div class="wizard-title">
        <span>{{ currentStep + 1 }}. {{ steps[currentStep] }}</span>
        <p>{{ stepSubtitle }}</p>
      </div>

      <el-steps :active="currentStep" finish-status="success" align-center class="wizard-steps">
        <el-step v-for="(step, index) in steps" :key="step" :title="step" />
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
                    placeholder="用一句话说明：要催谁、催哪几列、什么时候前反馈" />
          <p class="instruction-note">
            直接写出要催的列名（如「合同金额」）识别最准；不点名时会按各列填写情况自动推断，可能把备注类字段也算进去。
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
                <el-tag :type="row.status === '异常' ? 'warning' : 'primary'" size="small" effect="light" round>
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

      <div v-else class="wizard-body send-step">
        <div class="send-card">
          <img class="bot-image bot-plane" src="/assets/xiaocui-slices/paper-plane.png" alt="小崔发送通知">
          <el-icon><CircleCheckFilled /></el-icon>
          <h2>催办任务已生成</h2>
          <p>已发送 <strong>{{ analysisDetail?.progress.sent ?? 0 }}</strong> 条，仍有 <strong>{{ analysisDetail?.progress.needsManualReview ?? 0 }}</strong> 条需要人工确认。</p>
          <div class="send-actions">
            <el-button type="primary" plain @click="openTask(currentTaskId)">查看任务进度</el-button>
            <el-button @click="closeWizard">返回首页</el-button>
          </div>
        </div>
        <div class="reminder-box">
          <strong><el-icon><InfoFilled /></el-icon> 发送模式</strong>
          <p>阶段一先使用 ManualCopySender 记录待发送文案和发送留痕，后续可替换为邮件或内部消息中心。</p>
        </div>
      </div>

      <footer class="wizard-footer">
        <el-button v-if="currentStep > 0 && currentStep < 3" @click="currentStep--">上一步</el-button>
        <el-button v-if="currentStep === 1" plain type="primary" @click="reanalyze">重新解析</el-button>
        <el-button v-if="currentStep < 3" type="primary" :loading="busy" @click="goNext">
          下一步：{{ steps[currentStep + 1] }} <el-icon><ArrowRight /></el-icon>
        </el-button>
      </footer>
    </div>
  </section>

  <section v-if="settingsVisible" class="wizard-overlay" aria-label="AI 设置">
    <button class="ghost-close" aria-label="关闭" @click="settingsVisible = false">×</button>

    <div class="settings-card">
      <header class="settings-head">
        <h2>AI 模型设置</h2>
        <p>配置后，表格列识别与催办文案由模型生成；未配置或调用失败时自动回退到关键词规则。</p>
      </header>

      <el-form label-position="top" class="settings-form">
        <el-form-item label="服务商预设">
          <el-radio-group v-model="presetKey" size="small" @change="applyPreset">
            <el-radio-button v-for="(preset, key) in presets" :key="key" :value="key">
              {{ preset.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="服务地址">
          <el-input v-model="aiForm.baseUrl" placeholder="https://api.deepseek.com" />
        </el-form-item>

        <el-form-item label="模型名称">
          <el-input v-model="aiForm.model" placeholder="deepseek-chat" />
        </el-form-item>

        <el-form-item label="API Key">
          <el-input v-model="aiForm.apiKey" type="password" show-password autocomplete="off"
                    :placeholder="apiKeyMasked ? `已保存（${apiKeyMasked}），留空表示不修改` : 'sk-...'" />
        </el-form-item>

        <el-form-item label="启用大模型分析">
          <div class="switch-row">
            <el-switch v-model="aiForm.enabled" />
            <span class="switch-hint">
              {{ aiForm.enabled ? "已启用，下次分析将调用模型" : "未启用，当前使用关键词规则" }}
            </span>
          </div>
        </el-form-item>
      </el-form>

      <el-alert type="info" :closable="false" class="settings-note">
        <template #title>关于密钥</template>
        保存在本机数据库，接口返回时脱敏，不会写入日志。使用 OpenAI 兼容协议，换服务商只需改地址和模型名。
      </el-alert>

      <footer class="settings-footer">
        <el-button :loading="testing" @click="testAiConnection">测试连接</el-button>
        <el-button type="primary" :loading="saving" @click="saveAiSettings">保存设置</el-button>
      </footer>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import {
  ArrowRight,
  Bell,
  CircleCheckFilled,
  Clock,
  Compass,
  DocumentChecked,
  HomeFilled,
  InfoFilled,
  Plus,
  Search,
  Setting,
  Stopwatch,
} from "@element-plus/icons-vue";
import {
  createAnalysisSession,
  getAiSettings,
  saveAiSettings as saveAiSettingsApi,
  sendFollowups,
  testAiSettings,
  updateFollowupItem,
  type BackendSessionDetail,
} from "../services/followupApi";
import { useFollowupStore, type FollowupTask } from "../stores/followup";

const router = useRouter();
const store = useFollowupStore();
const wizardVisible = ref(false);
const currentStep = ref(0);
const taskKeyword = ref("");
const selectedFile = ref<File | null>(null);
const fileInput = ref<HTMLInputElement>();
const taskTitle = ref("");
const dueAt = ref(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
const instruction = ref("请催还没补充合同金额和预计完成时间的人");
const analysisDetail = ref<BackendSessionDetail | null>(null);
const currentTaskId = ref(0);
const busy = ref(false);
const steps = ["导入文件", "AI解析", "配置信息", "发送通知"];

const presets = {
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  qwen: { label: "通义千问", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  local: { label: "本地/内网", baseUrl: "http://127.0.0.1:11434/v1", model: "qwen2.5:7b" },
};
const presetKey = ref<keyof typeof presets | "">("");

function applyPreset(key: string) {
  const preset = presets[key as keyof typeof presets];
  if (!preset) return;
  aiForm.value.baseUrl = preset.baseUrl;
  aiForm.value.model = preset.model;
}

const fileSizeText = computed(() => {
  const file = selectedFile.value;
  if (!file) return "";
  const kb = file.size / 1024;
  return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
});

function taskTagType(status: string): "success" | "warning" | "primary" {
  if (status === "已完成") return "success";
  if (status === "有异常") return "warning";
  return "primary";
}

function clearFile() {
  selectedFile.value = null;
  if (fileInput.value) fileInput.value.value = "";
}

const weekNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const todayText = computed(() => {
  const now = new Date();
  return `今天是 ${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekNames[now.getDay()]}`;
});

onMounted(() => {
  store.loadSessions();
});

const filteredTasks = computed(() => {
  const keyword = taskKeyword.value.trim().toLowerCase();
  if (!keyword) return store.tasks;
  return store.tasks.filter((task) => {
    return [task.title, task.file, task.status, task.owner, task.lastRefresh]
      .some((value) => value.toLowerCase().includes(keyword));
  });
});
const metrics = computed(() => [
  { label: "进行中", value: store.activeCount, icon: DocumentChecked, tone: "blue" },
  { label: "已完成", value: store.completedCount, icon: CircleCheckFilled, tone: "green" },
  { label: "待发送", value: store.totalPending, icon: Stopwatch, tone: "orange" },
  { label: "需人工确认", value: store.totalManual, icon: Bell, tone: "red" },
]);
const currentPeople = computed(() => store.peopleByTask(currentTaskId.value));
const stepSubtitle = computed(() => {
  return [
    "上传需要催办的 Excel 文件，并输入自然语言催办要求",
    "后端已完成表格画像、列裁剪和缺项提取，请确认结果",
    "确认负责人和催办内容，异常对象补充联系方式后再发送",
    "ManualCopySender 已记录发送结果，可进入进度页追踪",
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

const settingsVisible = ref(false);
const saving = ref(false);
const testing = ref(false);
const apiKeyMasked = ref("");
const aiForm = ref({ enabled: false, baseUrl: "", model: "", apiKey: "" });

async function openSettings() {
  settingsVisible.value = true;
  aiForm.value.apiKey = "";
  try {
    const view = await getAiSettings();
    aiForm.value = {
      enabled: view.enabled,
      baseUrl: view.baseUrl,
      model: view.model,
      apiKey: "",
    };
    apiKeyMasked.value = view.apiKeyMasked;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "读取设置失败");
  }
}

async function testAiConnection() {
  testing.value = true;
  try {
    const result = await testAiSettings({ ...aiForm.value, enabled: true });
    ElMessage.success(`连接成功，模型回复：${result.reply || "正常"}`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "连接失败");
  } finally {
    testing.value = false;
  }
}

async function saveAiSettings() {
  saving.value = true;
  try {
    const view = await saveAiSettingsApi({ ...aiForm.value });
    apiKeyMasked.value = view.apiKeyMasked;
    aiForm.value = { enabled: view.enabled, baseUrl: view.baseUrl, model: view.model, apiKey: "" };
    ElMessage.success(view.enabled ? "已保存，后续分析将由大模型完成" : "已保存，当前使用关键词规则");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  } finally {
    saving.value = false;
  }
}

function openWizard() {
  currentStep.value = 0;
  selectedFile.value = null;
  analysisDetail.value = null;
  currentTaskId.value = 0;
  taskTitle.value = "";
  wizardVisible.value = true;
}

function closeWizard() {
  wizardVisible.value = false;
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
  if (currentStep.value === 2) {
    await sendReadyItems();
    return;
  }
  currentStep.value++;
}

async function reanalyze() {
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

async function sendReadyItems() {
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
    analysisDetail.value = detail;
    store.upsertSessionDetail(detail);
    currentStep.value = 3;
    ElMessage.success(`已发送 ${detail.progress.sent} 条催办`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "发送失败");
  } finally {
    busy.value = false;
  }
}

function openTask(id: number) {
  if (!id) return;
  router.push({ name: "task-detail", params: { id } });
}
</script>
