<template>
  <header class="home-header">
    <div>
      <h1>你好，我是小崔，有什么可以帮到你</h1>
      <p>{{ todayText }}</p>
    </div>
    <el-button type="primary" :icon="Plus" @click="router.push({ name: 'new-task' })">新建催办任务</el-button>
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
    <el-table :data="filteredTasks" class="task-table">
      <el-table-column prop="title" label="任务名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="file" label="文件名" min-width="150" show-overflow-tooltip />
      <el-table-column label="总催办人数" width="100" align="center">
        <template #default="{ row }">{{ store.peopleByTask(row.id).length }}</template>
      </el-table-column>
      <el-table-column label="已完成人数" width="100" align="center">
        <template #default="{ row }">{{ row.done }}</template>
      </el-table-column>
      <el-table-column label="异常人数" width="100" align="center">
        <template #default="{ row }">
          <span :class="{ 'danger-text': row.manual > 0 }">{{ row.manual }}</span>
        </template>
      </el-table-column>
      <el-table-column label="最近催办时间" width="140">
        <template #default="{ row }">{{ lastSentAt(row.id) }}</template>
      </el-table-column>
      <el-table-column prop="due" label="截止时间" width="120" />
      <el-table-column label="操作" width="130" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click.stop="openTask(row.id)">详情</el-button>
          <el-button link type="danger" size="small" @click.stop="handleDeleteTask(row)">删除</el-button>
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
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  Bell,
  CircleCheckFilled,
  DocumentChecked,
  Plus,
  Promotion,
  Search,
} from "@element-plus/icons-vue";
import { deleteSession } from "../services/followupApi";
import { useFollowupStore, type FollowupTask } from "../stores/followup";

const router = useRouter();
const store = useFollowupStore();
const taskKeyword = ref("");

/** 最近催办时间 = 该任务最新一条发送留痕的时间，无留痕显示 —。 */
function lastSentAt(taskId: number): string {
  const times = store.reminderEvents
    .filter((event) => event.taskId === taskId)
    .map((event) => event.sentAt)
    .filter((value) => value && value !== "--")
    .sort();
  return times.length > 0 ? times[times.length - 1] : "—";
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
  { label: "总催办次数", value: store.reminderEvents.length, icon: Promotion, tone: "orange" },
  { label: "需人工确认", value: store.totalManual, icon: Bell, tone: "red" },
]);

function openTask(id: number) {
  if (!id) return;
  router.push({ name: "task-detail", params: { id } });
}

async function handleDeleteTask(task: FollowupTask) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${task.title}」吗？该任务的催办记录与发送留痕会一并删除，且无法恢复。`,
      "删除催办任务",
      { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" },
    );
  } catch {
    return; // 用户取消
  }
  try {
    await deleteSession(task.id);
    store.removeTask(task.id);
    ElMessage.success("已删除");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "删除失败");
  }
}
</script>
