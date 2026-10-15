<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  createUser,
  deleteUser,
  fetchUsers,
  resetPassword,
  toRoleName,
  updateUser,
} from '@/api/admin';
import type { AdminUser, UserRoleName } from '@/types/admin';

/** 角色中文标签（本文件内映射，后端 roleName 仅认 STUDENT/TEACHER/ADMIN） */
const ROLE_LABELS: Record<UserRoleName, string> = {
  STUDENT: '学生',
  TEACHER: '教师',
  ADMIN: '管理员',
};

const ROLE_BADGE: Record<UserRoleName, string> = {
  STUDENT: 'st-badge--neutral',
  TEACHER: 'st-badge--info',
  ADMIN: 'st-badge--dark',
};

const loading = ref(false);
const users = ref<AdminUser[]>([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const keyword = ref('');
const roleFilter = ref<UserRoleName | 'all'>('all');

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

/**
 * 角色筛选为当前页本地过滤：
 * GET /api/user/records 仅接受 pageNum / pageSize / keyword，后端未开放 roleName 查询参数。
 */
const visibleUsers = computed(() =>
  roleFilter.value === 'all' ? users.value : users.value.filter((u) => u.roleName === roleFilter.value),
);

async function load() {
  loading.value = true;
  try {
    const data = await fetchUsers({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
    });
    users.value = data.records ?? [];
    total.value = data.total ?? 0;
  } catch {
    // 错误提示已由 axios 响应拦截器统一弹出，此处仅保证表格不残留脏数据
    users.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function reloadFirstPage() {
  pageNum.value = 1;
  void load();
}

function goPage(page: number) {
  const target = Math.min(Math.max(1, page), totalPages.value);
  if (target === pageNum.value) return;
  pageNum.value = target;
  void load();
}

// keyword 支持用户名/姓名模糊查，交由后端：输入防抖 400ms 后回到第一页重查
let searchTimer: number | undefined;
watch(keyword, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(reloadFirstPage, 400);
});

watch(pageSize, reloadFirstPage);

onMounted(load);

// ==================== 新增 / 编辑 ====================

const dialogVisible = ref(false);
const editing = ref<AdminUser | null>(null);
const saving = ref(false);

const form = ref({
  username: '',
  password: '',
  realName: '',
  email: '',
  phone: '',
  roleName: 'STUDENT' as UserRoleName,
  enabled: 1 as number,
  studentNo: '',
  className: '',
  major: '',
  title: '',
});

function openCreate() {
  editing.value = null;
  form.value = {
    username: '',
    password: '',
    realName: '',
    email: '',
    phone: '',
    roleName: roleFilter.value === 'all' ? 'STUDENT' : roleFilter.value,
    enabled: 1,
    studentNo: '',
    className: '',
    major: '',
    title: '',
  };
  dialogVisible.value = true;
}

function openEdit(u: AdminUser) {
  editing.value = u;
  form.value = {
    username: u.username,
    password: '',
    realName: u.realName,
    email: u.email ?? '',
    phone: u.phone ?? '',
    roleName: u.roleName,
    enabled: u.enabled,
    studentNo: u.studentNo ?? '',
    className: u.className ?? '',
    major: u.major ?? '',
    title: u.title ?? '',
  };
  dialogVisible.value = true;
}

/** 新建必须给 6-32 位密码（后端 BCrypt 加密存储）；编辑时留空表示不改密码 */
const canSave = computed(() => {
  const basic = form.value.username.trim() !== '' && form.value.realName.trim() !== '';
  if (!basic) return false;
  if (editing.value) return true;
  const len = form.value.password.length;
  return len >= 6 && len <= 32;
});

async function handleSave() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  const roleName = toRoleName(form.value.roleName);
  try {
    if (editing.value) {
      // PUT /api/user/update：后端不支持修改 username，故不提交 username
      await updateUser({
        id: editing.value.id,
        realName: form.value.realName.trim(),
        email: form.value.email.trim(),
        phone: form.value.phone.trim(),
        roleName,
        enabled: form.value.enabled,
        studentNo: form.value.studentNo.trim(),
        className: form.value.className.trim(),
        major: form.value.major.trim(),
        title: form.value.title.trim(),
      });
      ElMessage.success('账号信息已更新');
    } else {
      // POST /api/user/create 请求体仅 username/password/realName/email/phone/roleName
      await createUser({
        username: form.value.username.trim(),
        password: form.value.password,
        realName: form.value.realName.trim(),
        email: form.value.email.trim() || undefined,
        phone: form.value.phone.trim() || undefined,
        roleName,
      });
      ElMessage.success('账号创建成功');
    }
    dialogVisible.value = false;
    await load();
  } catch {
    return; // 请求失败时保留弹窗便于重试，提示由 axios 响应拦截器统一给出
  } finally {
    saving.value = false;
  }
}

/** ElMessageBox 取消会 reject，统一转成布尔，避免未捕获的 Promise 异常 */
async function confirmAction(message: string, title: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, { type: 'warning' });
    return true;
  } catch {
    return false;
  }
}

async function handleDelete(u: AdminUser) {
  if (!(await confirmAction(`确定删除账号「${u.realName}（${u.username}）」？该操作不可恢复。`, '删除确认'))) return;
  try {
    await deleteUser(u.id);
  } catch {
    return; // 失败提示已由 axios 响应拦截器统一给出
  }
  ElMessage.success('账号已删除');
  await load();
}

/** resetPassword 返回的是初始密码字符串（非对象），直接展示 */
async function handleReset(u: AdminUser) {
  if (!(await confirmAction(`确定重置「${u.realName}」的登录密码？`, '重置密码'))) return;
  let pwd = '';
  try {
    pwd = await resetPassword(u.id);
  } catch {
    return;
  }
  ElMessage.success(`密码已重置为初始密码：${pwd}`);
}

/** enabled 为数字 1/0，不是布尔 */
async function toggleEnabled(u: AdminUser) {
  const next = u.enabled === 1 ? 0 : 1;
  try {
    await updateUser({ id: u.id, enabled: next });
  } catch {
    return;
  }
  u.enabled = next;
  ElMessage.success(next === 1 ? '账号已启用' : '账号已停用');
}

// ==================== 批量导入（仅 UI 骨架） ====================

// 接口预留：后端未提供批量导入接口
const importVisible = ref(false);
const importFile = ref<{ name: string; size: number } | null>(null);

function onFileChange(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) importFile.value = { name: f.name, size: f.size };
}

function openImport() {
  importVisible.value = true;
  importFile.value = null;
}

function handleImport() {
  // 接口预留：后端未提供批量导入接口，此处不发起请求
  ElMessage.info('接口预留：后端未提供批量导入接口');
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function belongOf(u: AdminUser): string {
  if (u.roleName === 'STUDENT') return u.studentNo || '—';
  if (u.roleName === 'TEACHER') return u.title || '—';
  return '—';
}

function classOf(u: AdminUser): string {
  if (u.roleName !== 'STUDENT') return '—';
  return [u.className, u.major].filter(Boolean).join(' · ') || '—';
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">用户管理</h1>
      <p class="st-page-subtitle">学生 / 教师 / 管理员三级账号管理 · 支持新增、编辑、密码重置与账号启停</p>
    </header>

    <!-- 工具栏 -->
    <div class="st-card">
      <div class="st-card__body toolbar-row">
        <div class="role-tabs">
          <button
            v-for="(label, key) in { all: '全部', ...ROLE_LABELS } as Record<string, string>"
            :key="key"
            class="role-tab"
            :class="{ 'role-tab--active': roleFilter === key }"
            @click="roleFilter = key as UserRoleName | 'all'"
          >
            {{ label }}
          </button>
        </div>
        <div class="search-box">
          <Search :size="14" />
          <input v-model="keyword" class="search-input" placeholder="搜索用户名 / 姓名（后端模糊查）" @keyup.enter="reloadFirstPage" />
        </div>
        <div class="toolbar-actions">
          <!-- 接口预留：后端未提供批量导入接口，仅保留入口 -->
          <button class="st-btn st-btn--secondary" @click="openImport">
            <Upload :size="14" /> 批量导入账号
          </button>
          <button class="st-btn st-btn--primary" @click="openCreate">
            <Plus :size="14" /> 新增账号
          </button>
        </div>
      </div>
    </div>

    <!-- 用户表格 -->
    <div class="st-card" style="margin-top: 20px;">
      <div v-if="loading" class="st-card__body st-empty" style="padding: 70px;">
        <Loader2 :size="24" class="spin" />
        <div class="st-empty__text">正在加载用户列表…</div>
      </div>
      <div v-else class="table-wrap">
        <table class="user-table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>姓名</th>
              <th>角色</th>
              <th>学号 / 职称</th>
              <th>班级 / 专业</th>
              <th>状态</th>
              <th>创建时间</th>
              <th style="text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in visibleUsers" :key="u.id">
              <td class="mono">{{ u.username }}</td>
              <td>{{ u.realName }}</td>
              <td>
                <span class="st-badge" :class="ROLE_BADGE[u.roleName]">{{ ROLE_LABELS[u.roleName] }}</span>
              </td>
              <td class="muted mono">{{ belongOf(u) }}</td>
              <td class="muted">{{ classOf(u) }}</td>
              <td>
                <button class="st-text-btn status-btn" @click="toggleEnabled(u)">
                  <CheckCircle2 v-if="u.enabled === 1" :size="13" style="color: var(--status-success);" />
                  <XCircle v-else :size="13" style="color: var(--text-tertiary);" />
                  {{ u.enabled === 1 ? '启用' : '停用' }}
                </button>
              </td>
              <td class="muted mono">{{ fmt(u.createTime) }}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="st-text-btn" @click="openEdit(u)"><Pencil :size="12" style="vertical-align: -2px;" /> 编辑</button>
                <button class="st-text-btn" @click="handleReset(u)"><KeyRound :size="12" style="vertical-align: -2px;" /> 重置密码</button>
                <button class="st-text-btn st-text-btn--danger" @click="handleDelete(u)"><Trash2 :size="12" style="vertical-align: -2px;" /> 删除</button>
              </td>
            </tr>
            <tr v-if="visibleUsers.length === 0">
              <td colspan="8" class="muted" style="text-align: center; padding: 40px 0;">没有匹配的账号</td>
            </tr>
          </tbody>
        </table>

        <!-- 分页 -->
        <div class="pager">
          <span class="pager__total">共 {{ total }} 条 · 第 {{ pageNum }} / {{ totalPages }} 页</span>
          <div class="pager__ctrl">
            <button class="st-btn st-btn--secondary" :disabled="pageNum <= 1" @click="goPage(pageNum - 1)">上一页</button>
            <button class="st-btn st-btn--secondary" :disabled="pageNum >= totalPages" @click="goPage(pageNum + 1)">下一页</button>
            <el-select v-model="pageSize" style="width: 96px;">
              <el-option :value="10" label="10 条/页" />
              <el-option :value="20" label="20 条/页" />
              <el-option :value="50" label="50 条/页" />
            </el-select>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增/编辑弹窗 -->
    <Teleport to="body">
      <div v-if="dialogVisible" class="mask" @click.self="dialogVisible = false">
        <div class="st-card panel">
          <div class="st-card__header">
            <h2 class="st-card__title">{{ editing ? '编辑账号' : '新增账号' }}</h2>
            <p class="st-card__hint">{{ editing ? '用户名由后端主键锁定，不可修改' : '初始密码 6-32 位，后端 BCrypt 加密存储' }}</p>
          </div>
          <div class="st-card__body">
            <div class="form-row">
              <div class="form-item" style="flex: 1;">
                <label class="form-label">用户名（登录账号）</label>
                <input v-model="form.username" class="form-input" :disabled="!!editing" placeholder="如：stu20240101" />
              </div>
              <div class="form-item" style="flex: 1;">
                <label class="form-label">真实姓名</label>
                <input v-model="form.realName" class="form-input" placeholder="如：张伟" />
              </div>
            </div>
            <div v-if="!editing" class="form-item">
              <label class="form-label">登录密码</label>
              <input v-model="form.password" type="password" class="form-input" maxlength="32" placeholder="6-32 位，创建后可在列表中重置" />
            </div>
            <div class="form-row">
              <div class="form-item" style="flex: 1;">
                <label class="form-label">角色权限</label>
                <el-select v-model="form.roleName" style="width: 100%;">
                  <el-option label="学生（学习 / 刷题 / 个人报告）" value="STUDENT" />
                  <el-option label="教师（备课 / 作业 / 班级学情）" value="TEACHER" />
                  <el-option label="管理员（系统运维）" value="ADMIN" />
                </el-select>
              </div>
              <div class="form-item" style="width: 150px;">
                <label class="form-label">账号状态</label>
                <el-select v-model="form.enabled" style="width: 100%;">
                  <el-option :value="1" label="启用" />
                  <el-option :value="0" label="停用" />
                </el-select>
              </div>
            </div>
            <div class="form-row">
              <div class="form-item" style="flex: 1;">
                <label class="form-label">邮箱</label>
                <input v-model="form.email" class="form-input" placeholder="如：zhangwei@example.com" />
              </div>
              <div class="form-item" style="flex: 1;">
                <label class="form-label">手机号</label>
                <input v-model="form.phone" class="form-input" maxlength="11" placeholder="11 位手机号" />
              </div>
            </div>

            <!-- 学生专属 / 教师专属字段：POST /api/user/create 暂不包含这些字段，仅编辑时可维护 -->
            <template v-if="editing && form.roleName === 'STUDENT'">
              <div class="form-row">
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">学号</label>
                  <input v-model="form.studentNo" class="form-input" placeholder="如：2024010101" />
                </div>
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">班级</label>
                  <input v-model="form.className" class="form-input" placeholder="如：软件工程2401班" />
                </div>
              </div>
              <div class="form-item">
                <label class="form-label">专业</label>
                <input v-model="form.major" class="form-input" placeholder="如：软件工程" />
              </div>
            </template>
            <div v-if="editing && form.roleName === 'TEACHER'" class="form-item">
              <label class="form-label">职称</label>
              <input v-model="form.title" class="form-input" placeholder="如：副教授" />
            </div>

            <div class="panel-actions">
              <button class="st-btn st-btn--ghost" @click="dialogVisible = false">取消</button>
              <button class="st-btn st-btn--primary" :disabled="!canSave || saving" @click="handleSave">
                <Loader2 v-if="saving" :size="13" class="spin" />
                {{ editing ? '保存修改' : '创建账号' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量导入弹窗（接口预留，未接后端） -->
    <Teleport to="body">
      <div v-if="importVisible" class="mask" @click.self="importVisible = false">
        <div class="st-card panel">
          <div class="st-card__header">
            <h2 class="st-card__title">批量导入账号</h2>
            <p class="st-card__hint">接口预留：后端未提供批量导入接口，当前仅保留交互骨架</p>
          </div>
          <div class="st-card__body">
            <p class="import-hint">规划格式：Excel（.xlsx），列为 用户名、姓名、角色、学号/班级；单次建议不超过 1000 条。</p>
            <label class="import-drop">
              <Upload :size="22" style="color: var(--text-tertiary);" />
              <span v-if="!importFile">点击选择账号文件</span>
              <span v-else class="import-file">{{ importFile.name }}（{{ (importFile.size / 1024).toFixed(1) }} KB）</span>
              <input type="file" accept=".xlsx,.xls,.csv" style="display: none;" @change="onFileChange" />
            </label>
            <div class="panel-actions">
              <button class="st-btn st-btn--ghost" @click="importVisible = false">关闭</button>
              <button class="st-btn st-btn--primary" :disabled="!importFile" @click="handleImport">开始导入</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.toolbar-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.toolbar-actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
}

.role-tabs {
  display: inline-flex;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 3px;
  gap: 2px;
}

.role-tab {
  background: transparent;
  border: none;
  font-size: 12.5px;
  font-family: inherit;
  color: var(--text-secondary);
  padding: 5px 14px;
  border-radius: calc(var(--radius-md) - 2px);
  cursor: pointer;
  transition: all var(--transition);
}

.role-tab:hover {
  color: var(--text-primary);
}

.role-tab--active {
  background: var(--text-primary);
  color: var(--bg-surface);
  font-weight: 600;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 12px;
  height: 34px;
  color: var(--text-tertiary);
  background: var(--bg-surface);
}

.search-input {
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-primary);
  width: 220px;
}

/* 表格 */
.table-wrap {
  padding: 8px 24px 18px;
  overflow-x: auto;
}

.user-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.user-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.user-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  white-space: nowrap;
}

.user-table tr:last-child td {
  border-bottom: none;
}

.user-table tr:hover td {
  background: var(--bg-subtle);
}

.status-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.mono {
  font-family: Consolas, monospace;
  font-size: 12.5px;
}

.muted {
  color: var(--text-tertiary);
  font-size: 12.5px;
}

/* 分页 */
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 16px;
  margin-top: 4px;
  border-top: 1px solid var(--border-subtle);
}

.pager__total {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.pager__ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 弹窗 */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 24px;
}

.panel {
  width: 560px;
  max-width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
}

.form-item {
  margin-bottom: 14px;
  flex: 1;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-label {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.form-input {
  width: 100%;
  height: 34px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 0 12px;
  font-size: 13px;
  font-family: inherit;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  box-sizing: border-box;
}

.form-input:focus {
  border-color: var(--border-strong);
}

.form-input:disabled {
  background: var(--bg-subtle);
  color: var(--text-tertiary);
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

/* 导入 */
.import-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
  margin-bottom: 12px;
}

.import-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  padding: 28px 16px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--text-secondary);
  transition: all var(--transition);
}

.import-drop:hover {
  border-color: var(--text-primary);
  background: var(--bg-subtle);
}

.import-file {
  color: var(--text-primary);
  font-weight: 500;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
