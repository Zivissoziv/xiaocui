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
        <button :class="{ active: isActive(['console']) }" @click="router.push({ name: 'console' })">
          <el-icon><HomeFilled /></el-icon><span>首页</span>
        </button>
        <button :class="{ active: isActive(['settings']) }" @click="router.push({ name: 'settings' })">
          <el-icon><Setting /></el-icon><span>设置</span>
        </button>
      </nav>

      <div class="sidebar-tip">
        <div><el-icon><InfoFilled /></el-icon><strong>小崔小贴士</strong></div>
        <p>上传 Excel 后由后端解析表格，小崔只拿结构摘要和缺项行生成催办草稿。</p>
        <img class="bot-image bot-mini" src="/assets/xiaocui-slices/wave.png" alt="">
      </div>
    </aside>

    <main class="workspace">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { HomeFilled, InfoFilled, Setting } from "@element-plus/icons-vue";
const route = useRoute();
const router = useRouter();

/** 详情页归属首页，保持「首页」高亮 */
const isActive = computed(() => (names: string[]) => {
  const current = route.name as string | undefined;
  if (!current) return false;
  if (current === "task-detail") return names.includes("console");
  return names.includes(current);
});
</script>
