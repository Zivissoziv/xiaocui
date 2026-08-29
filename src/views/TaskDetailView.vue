<template>
  <div class="detail-page">
    <header class="detail-top">
      <button class="back-button" @click="router.push({ name: 'console' })">
        <el-icon><Back /></el-icon>
      </button>
      <h1>任务进度详情</h1>
      <el-button :icon="Download" plain>导出进度</el-button>
    </header>

    <main class="detail-workspace">
      <section class="progress-hero panel">
        <div class="hero-title">
          <div class="clip-icon"><el-icon><DocumentChecked /></el-icon></div>
          <div>
            <h2>{{ task.title }}</h2>
            <span class="status-pill running">{{ task.status }}</span>
            <dl>
              <div><dt>截止时间：</dt><dd>2025-06-30</dd></div>
              <div><dt>创建时间：</dt><dd>2025-06-19 10:30</dd></div>
              <div><dt>发送人数：</dt><dd>18 人</dd></div>
            </dl>
          </div>
        </div>
        <div class="ring-wrap">
          <div class="progress-ring" style="--percent: 33">
            <strong>33%</strong>
            <span>已完成</span>
          </div>
          <ul class="ring-legend">
            <li><i class="green"></i>已完成 <strong>6 人</strong></li>
            <li><i class="orange"></i>待完成 <strong>12 人</strong></li>
            <li><i class="red"></i>未开始 <strong>0 人</strong></li>
          </ul>
        </div>
      </section>

      <nav class="tabs">
        <button class="active">整体进度</button>
        <button>人员进度</button>
        <button>数据预览</button>
      </nav>

      <section class="chart-grid">
        <article class="panel chart-panel">
          <h3>整体趋势</h3>
          <div class="line-chart" aria-label="整体趋势图">
            <span v-for="(point, index) in trendPoints" :key="index" :style="{ '--x': `${index * 16.6}%`, '--y': `${100 - point}%` }"></span>
            <svg viewBox="0 0 320 150" role="img" aria-hidden="true">
              <polyline points="8,136 58,116 108,96 158,90 208,66 258,42 312,28" />
            </svg>
          </div>
        </article>

        <article class="panel chart-panel distribution">
          <h3>进度分布</h3>
          <div class="donut"></div>
          <ul>
            <li><i class="green"></i>已完成 <span>6 (33%)</span></li>
            <li><i class="orange"></i>待完成 <span>12 (67%)</span></li>
            <li><i class="red"></i>未开始 <span>0 (0%)</span></li>
          </ul>
        </article>
      </section>

      <section class="panel">
        <h3>人员进度明细</h3>
        <table class="clean-table progress-table">
          <thead>
            <tr>
              <th>负责人</th>
              <th>部门</th>
              <th>填写进度</th>
              <th>状态</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="person in detailRows" :key="person.name">
              <td>{{ person.name }}</td>
              <td>{{ person.department }}</td>
              <td>
                <div class="mini-progress"><span :style="{ width: person.progress }"></span></div>
              </td>
              <td><span :class="['status-pill', person.tone]">{{ person.status }}</span></td>
              <td>{{ person.time }}</td>
              <td><button>查看</button></td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Back, DocumentChecked, Download } from "@element-plus/icons-vue";
import { useFollowupStore } from "../stores/followup";

const props = defineProps<{ id: string }>();
const router = useRouter();
const store = useFollowupStore();
const task = computed(() => store.taskById(Number(props.id)) ?? store.tasks[0]);
const trendPoints = [5, 20, 36, 40, 58, 78, 88];
const detailRows = [
  { name: "张三", department: "市场部", progress: "100%", status: "已完成", tone: "done", time: "06-19 16:20" },
  { name: "李四", department: "产品部", progress: "50%", status: "待完成", tone: "waiting", time: "06-19 14:10" },
  { name: "王五", department: "技术部", progress: "0%", status: "未开始", tone: "idle", time: "--" },
];
</script>
