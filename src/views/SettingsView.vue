<template>
  <header class="detail-top">
    <button class="back-button" aria-label="返回" @click="router.push({ name: 'console' })">
      <el-icon><Back /></el-icon>
    </button>
    <h1>AI 模型设置</h1>
  </header>

  <section class="settings-card page-card">
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
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Back } from "@element-plus/icons-vue";
import {
  getAiSettings,
  saveAiSettings as saveAiSettingsApi,
  testAiSettings,
} from "../services/followupApi";

const router = useRouter();
const saving = ref(false);
const testing = ref(false);
const apiKeyMasked = ref("");
const aiForm = ref({ enabled: false, baseUrl: "", model: "", apiKey: "" });

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

onMounted(async () => {
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
});

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
</script>
