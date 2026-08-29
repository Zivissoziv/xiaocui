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
        <button><el-icon><Setting /></el-icon><span>设置</span></button>
      </nav>

      <div class="sidebar-tip">
        <div><el-icon><InfoFilled /></el-icon><strong>小崔小贴士</strong></div>
        <p>上传 Excel，AI 即时识别需要补充的负责人，一键发送催办通知。</p>
        <img class="bot-image bot-mini" src="/assets/xiaocui-slices/wave.png" alt="">
      </div>
    </aside>

    <main class="workspace">
      <header class="home-header">
        <div>
          <h1>你好，张管理员</h1>
          <p>今天是 2025年6月19日 星期四</p>
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
          <label class="task-search">
            <el-icon><Search /></el-icon>
            <input v-model="taskKeyword" type="search" placeholder="搜索任务、文件或状态">
          </label>
        </div>
        <table class="clean-table">
          <thead>
            <tr>
              <th>任务名称</th>
              <th>文件名</th>
              <th>发送人数</th>
              <th>待完成</th>
              <th>更新时间</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in filteredTasks" :key="task.id" @click="openTask(task.id)">
              <td>{{ task.title }}</td>
              <td>{{ task.file }}</td>
              <td>{{ task.pending }}</td>
              <td class="danger-text">{{ task.manual }}</td>
              <td>{{ task.lastRefresh }}</td>
              <td><span :class="['status-pill', task.status === '已完成' ? 'done' : 'running']">{{ task.status }}</span></td>
            </tr>
          </tbody>
        </table>
        <div v-if="filteredTasks.length === 0" class="empty-row">
          没有匹配的任务
        </div>
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

      <div class="steps-line">
        <div v-for="(step, index) in steps" :key="step" :class="['step-dot', { done: index < currentStep, active: index === currentStep }]">
          <span>{{ index < currentStep ? "✓" : index + 1 }}</span>
          <em>{{ step }}</em>
        </div>
      </div>

      <div v-if="currentStep === 0" class="wizard-body import-step">
        <div class="upload-panel">
          <img class="bot-image bot-excel" src="/assets/xiaocui-slices/excel.png" alt="小崔拿着 Excel">
          <strong>拖拽 Excel 文件到这里</strong>
          <span>或</span>
          <el-button type="primary" @click="selectedFile = '待填写信息清单_20250619.xlsx'">选取文件</el-button>
          <small>支持 .xlsx / .xls 格式，文件大小不超过 10MB</small>
        </div>
        <div class="file-row">
          <el-icon><Document /></el-icon>
          <span>{{ selectedFile }}</span>
          <em>Sheet1</em>
          <el-icon><Delete /></el-icon>
        </div>
      </div>

      <div v-else-if="currentStep === 1" class="wizard-body analysis-step">
        <div class="success-banner">
          <el-icon><CircleCheckFilled /></el-icon>
          <div>
            <strong>解析完成！共识别到 18 行数据</strong>
            <span>需要填写的内容：5 项　建议负责人列：负责人</span>
          </div>
          <img class="bot-image bot-wave" src="/assets/xiaocui-slices/wave.png" alt="小崔">
        </div>
        <table class="clean-table result-table">
          <tbody>
            <tr v-for="row in analysisRows" :key="row.label">
              <td>{{ row.label }}</td>
              <td><span class="green-chip">{{ row.result }}</span> {{ row.desc }}</td>
              <td><button>修改</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="currentStep === 2" class="wizard-body config-step">
        <section class="form-section">
          <h3>负责人映射（共 18 人）</h3>
          <p>AI 已为你识别负责人，如不正确可手动调整。</p>
          <table class="clean-table mapping-table">
            <thead>
              <tr>
                <th>Excel 中负责人</th>
                <th>映射到（组织通讯录的人）</th>
                <th>联系方式</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="person in mappingRows" :key="person.name">
                <td>{{ person.name }}</td>
                <td><select><option>{{ person.match }}</option></select></td>
                <td>{{ person.email }}</td>
                <td><button>修改</button></td>
              </tr>
            </tbody>
          </table>
          <el-button class="batch-button">批量导入联系人</el-button>
        </section>

        <section class="form-section">
          <h3>催办内容设置</h3>
          <div class="config-grid">
            <label>通知标题<input value="请填写《6月项目进度信息收集》"></label>
            <label>截止时间<input value="2025-06-30"></label>
            <label class="wide">通知内容<textarea>您好，请您协助填写《6月项目进度信息收集》，相关信息如下表，需于 2025-06-30 前完成，谢谢！</textarea></label>
            <label>提醒设置<select><option>截止前 1 天提醒</option></select></label>
          </div>
        </section>
      </div>

      <div v-else class="wizard-body send-step">
        <div class="send-card">
          <img class="bot-image bot-plane" src="/assets/xiaocui-slices/paper-plane.png" alt="小崔发送通知">
          <el-icon><CircleCheckFilled /></el-icon>
          <h2>通知已发送成功！</h2>
          <p>共发送给 <strong>18</strong> 人，提醒将在 <strong>截止前 1 天</strong> 发送给未完成的人员</p>
          <div class="send-actions">
            <el-button type="primary" plain @click="openTask(1)">查看任务进度</el-button>
            <el-button @click="closeWizard">返回首页</el-button>
          </div>
        </div>
        <div class="reminder-box">
          <strong><el-icon><InfoFilled /></el-icon> 温馨提示</strong>
          <p>收件人将收到邮件 / 企业微信通知，你可以在「催办任务」中查看实时进度。</p>
        </div>
      </div>

      <footer class="wizard-footer">
        <el-button v-if="currentStep > 0 && currentStep < 3" @click="currentStep--">上一步</el-button>
        <el-button v-if="currentStep === 1" plain type="primary">重新解析</el-button>
        <el-button v-if="currentStep < 3" type="primary" @click="currentStep++">
          下一步：{{ steps[currentStep + 1] }} <el-icon><ArrowRight /></el-icon>
        </el-button>
      </footer>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import {
  ArrowRight,
  Bell,
  CircleCheckFilled,
  Clock,
  Compass,
  Delete,
  Document,
  HomeFilled,
  InfoFilled,
  Plus,
  Search,
  Setting,
  Stopwatch,
  Message,
} from "@element-plus/icons-vue";
import { useFollowupStore } from "../stores/followup";

const router = useRouter();
const store = useFollowupStore();
const wizardVisible = ref(false);
const currentStep = ref(0);
const taskKeyword = ref("");
const selectedFile = ref("待填写信息清单_20250619.xlsx");
const steps = ["导入文件", "AI解析", "配置信息", "发送通知"];

const filteredTasks = computed(() => {
  const keyword = taskKeyword.value.trim().toLowerCase();
  if (!keyword) return store.tasks;
  return store.tasks.filter((task) => {
    return [task.title, task.file, task.status, task.owner, task.lastRefresh]
      .some((value) => value.toLowerCase().includes(keyword));
  });
});
const metrics = computed(() => [
  { label: "进行中", value: 3, icon: Message, tone: "blue" },
  { label: "已完成", value: 15, icon: CircleCheckFilled, tone: "green" },
  { label: "待完成", value: 12, icon: Stopwatch, tone: "orange" },
  { label: "今日待处理", value: 4, icon: Bell, tone: "red" },
]);
const stepSubtitle = computed(() => {
  return [
    "上传需要催办的 Excel 文件，小崔会帮你智能解析",
    "小崔已识别出以下信息，请确认是否正确",
    "确认负责人和催办内容，小崔会帮你发送通知",
    "确认信息无误后，小崔将为你发送催办通知",
  ][currentStep.value];
});

const analysisRows = [
  { label: "需要填写的人所在列", result: "负责人", desc: "识别到员工姓名 / 负责人信息" },
  { label: "需要填写的内容所在列", result: "待填写内容", desc: "识别到需要填写的具体内容" },
  { label: "需要填写的内容列", result: "进度说明、备注、附件", desc: "共 3 列" },
  { label: "数据起始行", result: "第 2 行", desc: "表头在第 1 行" },
  { label: "需要发送的人数", result: "18 人", desc: "" },
];

const mappingRows = [
  { name: "张三", match: "张三（市场部）", email: "zhangsan@company.com" },
  { name: "李四", match: "李四（产品部）", email: "lisi@company.com" },
  { name: "王五", match: "王五（技术部）", email: "wangwu@company.com" },
];

function openWizard() {
  currentStep.value = 0;
  wizardVisible.value = true;
}

function closeWizard() {
  wizardVisible.value = false;
}

function openTask(id: number) {
  router.push({ name: "task-detail", params: { id } });
}
</script>
