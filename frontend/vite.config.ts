import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// 前端通过同源的 /api 访问后端，由 dev server 转发，避免跨域拦截。
// 后端地址可用 FOLLOWUP_API_TARGET 覆盖，默认 127.0.0.1:8080。
const backendTarget = process.env.FOLLOWUP_API_TARGET ?? "http://127.0.0.1:8080";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
});
