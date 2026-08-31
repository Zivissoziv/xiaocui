<template>
  <header class="home-header">
    <div>
      <h1>通讯录</h1>
      <p>维护人员姓名与邮箱。新建催办任务时，表格里只有姓名、没有邮箱的人会自动来这里匹配。</p>
    </div>
    <div class="detail-actions">
      <el-button :icon="Document" @click="handleTemplate">下载模板</el-button>
      <el-button :icon="Upload" @click="openImport">导入</el-button>
      <el-button :icon="Download" @click="handleExport">导出</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增联系人</el-button>
    </div>
  </header>

  <section class="panel contact-panel stagger">
    <div class="panel-head">
      <div>
        <h2>联系人</h2>
        <p>
          共 {{ filtered.length }} 人<template v-if="keyword.trim()">（从 {{ contacts.length }} 人中筛选）</template>
          · 匹配按姓名精确比对，去空格后一致即可
        </p>
      </div>
      <el-input v-model="keyword" class="task-search" placeholder="搜索姓名、邮箱或部门" clearable>
        <template #prefix><el-icon><Search /></el-icon></template>
      </el-input>
    </div>

    <el-table v-loading="loading" :data="filtered" class="task-table" max-height="520">
      <el-table-column prop="name" label="姓名" min-width="120" show-overflow-tooltip />
      <el-table-column prop="email" label="邮箱" min-width="210" show-overflow-tooltip />
      <el-table-column prop="department" label="部门" min-width="140" show-overflow-tooltip>
        <template #default="{ row }">
          <span :class="{ 'muted-cell': !row.department }">{{ row.department || "—" }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="phone" label="手机" min-width="140">
        <template #default="{ row }">
          <span :class="{ 'muted-cell': !row.phone }">{{ row.phone || "—" }}</span>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="140">
        <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" align="center" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" size="small" @click="handleDelete(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <div class="table-empty">
          <template v-if="error">{{ error }}，请确认后端已启动</template>
          <template v-else-if="loading">正在加载通讯录…</template>
          <template v-else-if="contacts.length === 0">还没有联系人，点「新增联系人」或「导入」开始维护</template>
          <template v-else>没有匹配的联系人</template>
        </div>
      </template>
    </el-table>
  </section>

  <el-dialog v-model="formVisible" :title="editing ? '编辑联系人' : '新增联系人'" width="440px"
             :close-on-click-modal="false">
    <el-form label-position="top" @submit.prevent>
      <el-form-item label="姓名" required>
        <el-input v-model="form.name" placeholder="与表格中的负责人姓名保持一致" />
      </el-form-item>
      <el-form-item label="邮箱" required>
        <el-input v-model="form.email" placeholder="name@example.com" />
      </el-form-item>
      <el-form-item label="部门">
        <el-input v-model="form.department" placeholder="选填，仅用于区分同名" />
      </el-form-item>
      <el-form-item label="手机">
        <el-input v-model="form.phone" placeholder="选填" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="formVisible = false">取消</el-button>
      <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="importVisible" title="导入通讯录" width="540px" :close-on-click-modal="false">
    <input ref="fileInput" class="hidden-input" type="file" accept=".xlsx,.xls" @change="handleFileChange">

    <div class="upload-compact" :class="{ 'has-file': importFile }" @click="fileInput?.click()">
      <img class="bot-image bot-excel upload-mascot" src="/assets/xiaocui-slices/excel.png" alt="小崔">
      <div class="upload-text">
        <strong>{{ importFile ? importFile.name : "点击选择通讯录 Excel" }}</strong>
        <span>{{ importFile ? "已选择 · 点击可重新选择" : "支持 .xlsx / .xls，表头含「姓名」「邮箱」" }}</span>
      </div>
      <el-button v-if="importFile" link type="primary" @click.stop="clearFile">移除</el-button>
    </div>

    <div class="import-mode">
      <span>导入方式</span>
      <el-radio-group v-model="importMode">
        <el-radio value="append">追加新增</el-radio>
        <el-radio value="overwrite">覆盖更新</el-radio>
      </el-radio-group>
    </div>
    <p class="instruction-note">
      {{ importMode === "append"
        ? "只添加通讯录里还没有的姓名，已存在的记录保持不变。"
        : "按姓名覆盖已有记录的邮箱、部门、手机；文件中没出现的联系人不会被删除。" }}
      表头认不出时按 A、B、C、D 列依次读取姓名、邮箱、部门、手机。
    </p>

    <el-alert v-if="importResult" :type="importResult.errors.length ? 'warning' : 'success'" :closable="false"
              class="risk-alert">
      <template #title>
        导入完成：新增 {{ importResult.added }} 人，更新 {{ importResult.updated }} 人，跳过
        {{ importResult.skipped }} 人
      </template>
      <p v-for="(message, index) in importResult.errors.slice(0, 6)" :key="index" class="risk-line">{{ message }}</p>
      <p v-if="importResult.errors.length > 6" class="risk-line">
        …… 还有 {{ importResult.errors.length - 6 }} 行有问题，请修正后重新导入
      </p>
    </el-alert>

    <template #footer>
      <el-button link type="primary" class="footer-left" :icon="Document" @click="handleTemplate">下载模板</el-button>
      <el-button @click="importVisible = false">关闭</el-button>
      <el-button type="primary" :loading="importing" :disabled="!importFile" @click="startImport">开始导入</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Document, Download, Plus, Search, Upload } from "@element-plus/icons-vue";
import {
  createContact,
  deleteContact,
  downloadContactTemplate,
  exportContacts,
  importContacts,
  listContacts,
  updateContact,
  type AddressBookContact,
  type ContactImportResult,
  type ImportMode,
} from "../services/addressBookApi";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const contacts = ref<AddressBookContact[]>([]);
const loading = ref(false);
const error = ref("");
const keyword = ref("");

const formVisible = ref(false);
const editing = ref<AddressBookContact | null>(null);
const saving = ref(false);
const form = reactive({ name: "", email: "", department: "", phone: "" });

const importVisible = ref(false);
const importFile = ref<File | null>(null);
const importMode = ref<ImportMode>("append");
const importing = ref(false);
const importResult = ref<ContactImportResult | null>(null);
const fileInput = ref<HTMLInputElement>();

const filtered = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  if (!text) return contacts.value;
  return contacts.value.filter((contact) =>
    [contact.name, contact.email, contact.department, contact.phone]
      .some((value) => (value || "").toLowerCase().includes(text)),
  );
});

onMounted(load);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    contacts.value = await listContacts();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "通讯录加载失败";
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editing.value = null;
  form.name = "";
  form.email = "";
  form.department = "";
  form.phone = "";
  formVisible.value = true;
}

function openEdit(contact: AddressBookContact) {
  editing.value = contact;
  form.name = contact.name;
  form.email = contact.email;
  form.department = contact.department ?? "";
  form.phone = contact.phone ?? "";
  formVisible.value = true;
}

async function submitForm() {
  const name = form.name.trim();
  const email = form.email.trim();
  if (!name) {
    ElMessage.warning("请填写姓名");
    return;
  }
  if (!EMAIL_PATTERN.test(email)) {
    ElMessage.warning("邮箱格式不正确");
    return;
  }
  saving.value = true;
  try {
    const payload = { name, email, department: form.department.trim(), phone: form.phone.trim() };
    if (editing.value) await updateContact(editing.value.id, payload);
    else await createContact(payload);
    ElMessage.success(editing.value ? "已保存" : "已新增联系人");
    formVisible.value = false;
    await load();
  } catch (caught) {
    ElMessage.error(caught instanceof Error ? caught.message : "保存失败");
  } finally {
    saving.value = false;
  }
}

async function handleDelete(contact: AddressBookContact) {
  try {
    await ElMessageBox.confirm(
      `确定删除「${contact.name}」吗？之后新建任务将无法自动匹配到这个人的邮箱。`,
      "删除联系人",
      { confirmButtonText: "删除", cancelButtonText: "取消", type: "warning" },
    );
  } catch {
    return;
  }
  try {
    await deleteContact(contact.id);
    ElMessage.success("已删除");
    await load();
  } catch (caught) {
    ElMessage.error(caught instanceof Error ? caught.message : "删除失败");
  }
}

function handleTemplate() {
  downloadContactTemplate().catch(() => ElMessage.error("模板下载失败，请确认后端已启动"));
}

function handleExport() {
  if (contacts.value.length === 0) {
    ElMessage.warning("通讯录还是空的，没有可导出的内容");
    return;
  }
  exportContacts().catch(() => ElMessage.error("导出失败，请确认后端已启动"));
}

function openImport() {
  importFile.value = null;
  importMode.value = "append";
  importResult.value = null;
  if (fileInput.value) fileInput.value.value = "";
  importVisible.value = true;
}

function handleFileChange(event: Event) {
  importFile.value = (event.target as HTMLInputElement).files?.[0] ?? null;
  importResult.value = null;
}

function clearFile() {
  importFile.value = null;
  if (fileInput.value) fileInput.value.value = "";
}

async function startImport() {
  if (!importFile.value) return;
  importing.value = true;
  try {
    importResult.value = await importContacts(importFile.value, importMode.value);
    await load();
  } catch (caught) {
    ElMessage.error(caught instanceof Error ? caught.message : "导入失败");
  } finally {
    importing.value = false;
  }
}

function formatTime(value: string) {
  if (!value) return "—";
  return value.replace("T", " ").slice(5, 16);
}
</script>
