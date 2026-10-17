<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
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
} from '@/api/user';
import type { AdminUser, UserRoleName } from '@/types/user';

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
const loadError = ref<string | null>(null);
const users = ref<AdminUser[]>([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);
const keyword = ref('');
const roleFilter = ref<UserRoleName | 'all'>('all');

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));

/**
 * 角色筛选为当前页本地过滤：
 * 已对接 GET /api/user/records 仅接受 pageNum / pageSize / keyword，
 * 后端未开放 roleName 查询参数，也无角色聚合接口，故只能在当前页内过滤。
 */
const visibleUsers = computed(() =>
  roleFilter.value === 'all' ? users.value : users.value.filter((u) => u.roleName === roleFilter.value),
);

async function load() {
  loading.value = true;
  loadError.value = null;
  try {
    const data = await fetchUsers({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
    });
    users.value = data.records ?? [];
    total.value = data.total ?? 0;
  } catch (e: unknown) {
    // 已对接接口：失败只保留空态 + 重试入口；若后端函数仍是桩，按其抛错文案提示待实现
    const message = e instanceof Error ? e.message : String(e ?? '');
    loadError.value = message.includes('未实现')
      ? '接口待实现：@/api/user.fetchUsers'
      : message || '用户列表加载失败';
    users.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

function reloadFirstPage() {
  if (pageNum.value === 1) {
    void load();
    return;
  }
  pageNum.value = 1; // 由 watch(pageNum) 触发 load
}

function goPage(page: number) {
  const target = Math.min(Math.max(1, page), totalPages.value);
  if (target === pageNum.value) return;
  pageNum.value = target; // 由 watch(pageNum) 触发 load
}

// keyword 支持用户名/姓名模糊查，交由后端：输入防抖 400ms 后回到第一页重查
let searchTimer: number | undefined;
watch(keyword, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(reloadFirstPage, 400);
});

watch(pageSize, reloadFirstPage);
watch(pageNum, () => void load());

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

/**
 * 新增必须给 6-32 位密码（后端 BCrypt 加密存储）；编辑时留空表示不改密码
 * POST /api/user/create 的请求体不含 studentNo/className/major/title，
 * 所以新增学生/教师时这些扩展字段要先收集，创建成功后再用返回的 id 二次 update 补全。
 */
const canSave = computed(() => {
  const basic = form.value.username.trim() !== '' && form.value.realName.trim() !== '';
  if (!basic) return false;
  if (editing.value) return true;
  const len = form.value.password.length;
  return len >= 6 && len <= 32;
});

/** 学生/教师扩展字段（create 请求体不支持，只能创建后 update） */
function extraProfileFields(roleName: UserRoleName): Partial<AdminUser> {
  if (roleName === 'STUDENT') {
    return {
      studentNo: form.value.studentNo.trim(),
      className: form.value.className.trim(),
      major: form.value.major.trim(),
    };
  }
  if (roleName === 'TEACHER') {
    return { title: form.value.title.trim() };
  }
  return {};
}

function hasContent(fields: Partial<AdminUser>): boolean {
  return Object.values(fields).some((v) => typeof v === 'string' && v.trim() !== '');
}

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
      // 第一步 POST /api/user/create：请求体仅 username/password/realName/email/phone/roleName
      const created = await createUser({
        username: form.value.username.trim(),
        password: form.value.password,
        realName: form.value.realName.trim(),
        email: form.value.email.trim() || undefined,
        phone: form.value.phone.trim() || undefined,
        roleName,
      });
      const newId = created?.id;
      const extra = extraProfileFields(roleName);
      // 第二步 PUT /api/user/update：用新建用户 id 串行补全学号/班级/专业或职称
      if (newId && hasContent(extra)) {
        try {
          await updateUser({ id: newId, ...extra });
          ElMessage.success(`账号创建成功，学号/班级等扩展信息已补全（ID ${newId}）`);
        } catch {
          // 部分失败：账号已存在，仅扩展字段缺失，保留在列表可编辑补全
          ElMessage.warning(
            `账号已创建（ID ${newId}），但扩展信息补全失败，请在列表中「编辑」重试（已对接 PUT /api/user/update）`,
          );
        }
      } else {
        ElMessage.success(`账号创建成功（ID ${newId ?? '-'}）`);
      }
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

/** 统一错误文案：桩函数抛「未实现：…」时转为「接口待实现：@/api/user.<fn>」 */
function userApiError(e: unknown, fn: string): string {
  const message = e instanceof Error ? e.message : String(e ?? '');
  return message.includes('未实现') ? `接口待实现：@/api/user.${fn}` : message || `${fn} 调用失败`;
}

async function handleDelete(u: AdminUser) {
  if (!(await confirmAction(`确定删除账号「${u.realName}（${u.username}）」？该操作不可恢复。`, '删除确认'))) return;
  try {
    await deleteUser(u.id);
  } catch (e: unknown) {
    ElMessage.error(userApiError(e, 'deleteUser'));
    return;
  }
  ElMessage.success('账号已删除');
  await load();
}

/** resetPassword 返回的是初始密码字符串（非对象），直接展示 */
async function handleReset(u: AdminUser) {
  if (!(await confirmAction(`确定重置「${u.realName}」的登录密码？重置后为后端初始密码。`, '重置密码'))) return;
  let pwd = '';
  try {
    pwd = await resetPassword(u.id);
  } catch (e: unknown) {
    ElMessage.error(userApiError(e, 'resetPassword'));
    return;
  }
  ElMessage.success(`密码已重置为初始密码：${pwd}`);
}

/** enabled 为数字 1/0，不是布尔；走 PUT /api/user/update 单字段提交 */
const togglingId = ref<number | null>(null);

async function toggleEnabled(u: AdminUser) {
  if (togglingId.value === u.id) return;
  const next = u.enabled === 1 ? 0 : 1;
  togglingId.value = u.id;
  try {
    await updateUser({ id: u.id, enabled: next });
  } catch (e: unknown) {
    ElMessage.error(userApiError(e, 'updateUser'));
    return;
  } finally {
    togglingId.value = null;
  }
  u.enabled = next;
  ElMessage.success(next === 1 ? '账号已启用' : '账号已停用');
}

// ==================== 批量导入（后端未提供该接口，仅保留入口） ====================

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

/** 后端未提供该接口：@/api/user 无批量导入函数，故此处不发起任何请求 */
function handleImport() {
  ElMessage.warning('后端未提供该接口：批量导入账号（@/api/user 无对应函数）');
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
          <!-- 后端未提供该接口：批量导入仅保留入口，点击后只提示不落库 -->
          <button
            class="st-btn st-btn--secondary"
            title="后端未提供该接口：批量导入账号"
            @click="openImport"
          >
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
      <!-- 加载失败：保留空态 + 错误文案 + 重试 -->
      <div v-else-if="loadError" class="st-card__body st-empty" style="padding: 60px;">
        <AlertCircle :size="30" :stroke-width="1.4" class="st-empty__icon" />
        <div class="st-empty__text">{{ loadError }}</div>
        <button class="st-btn st-btn--secondary" @click="load">
          <RefreshCw :size="13" /> 重新加载
        </button>
      </div>
      <div v-else class="table-wrap">
        <div class="table-note">
          分页由后端提供（GET /api/user/records · pageNum / pageSize / keyword）；
          角色筛选为当前页前端过滤 —— 后端不接受 roleName 查询参数，跨页角色统计需自行翻页。
        </div>
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
                <button
                  class="st-text-btn status-btn"
                  :disabled="togglingId === u.id"
                  :title="u.enabled === 1 ? '点击停用该账号（PUT /api/user/update · enabled=0）' : '点击启用该账号（PUT /api/user/update · enabled=1）'"
                  @click="toggleEnabled(u)"
                >
                  <Loader2 v-if="togglingId === u.id" :size="13" class="spin" />
                  <CheckCircle2 v-else-if="u.enabled === 1" :size="13" style="color: var(--status-success);" />
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
              <td colspan="8" class="muted" style="text-align: center; padding: 40px 0;">
                <template v-if="total === 0">暂无账号数据</template>
                <template v-else>当前页没有匹配该角色的账号（角色筛选只在当前页生效），可切换页码或清空筛选</template>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 分页：页码 / 每页 / 关键词搜索 -->
        <div class="pager">
          <span class="pager__total">共 {{ total }} 条 · 第 {{ pageNum }} / {{ totalPages }} 页</span>
          <div class="pager__ctrl">
            <button class="st-btn st-btn--secondary" :disabled="pageNum <= 1" @click="goPage(1)">首页</button>
            <button class="st-btn st-btn--secondary" :disabled="pageNum <= 1" @click="goPage(pageNum - 1)">上一页</button>
            <button class="st-btn st-btn--secondary" :disabled="pageNum >= totalPages" @click="goPage(pageNum + 1)">下一页</button>
            <button class="st-btn st-btn--secondary" :disabled="pageNum >= totalPages" @click="goPage(totalPages)">末页</button>
            <span class="pager__label">跳至</span>
            <el-input-number
              v-model="pageNum"
              :min="1"
              :max="totalPages"
              :controls="false"
              size="small"
              style="width: 68px;"
            />
            <span class="pager__label">页</span>
            <el-select v-model="pageSize" style="width: 96px;">
              <el-option :value="10" label="10 条/页" />
              <el-option :value="20" label="20 条/页" />
              <el-option :value="50" label="50 条/页" />
              <el-option :value="100" label="100 条/页" />
            </el-select>
            <button class="st-btn st-btn--ghost" @click="load">
              <RefreshCw :size="13" /> 刷新
            </button>
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
            <p class="st-card__hint">{{ editing ? '用户名由后端主键锁定，不可修改' : '初始密码 6-32 位，后端 BCrypt 加密存储；学号/班级/专业/职称在创建后二次 update 补全' }}</p>
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

            <!-- 学生专属 / 教师专属字段：POST /api/user/create 请求体不含这些字段，
                 新增时先创建账号，再用返回的 id 串行调 PUT /api/user/update 补全 -->
            <template v-if="form.roleName === 'STUDENT'">
              <p class="two-step-hint">
                学号 / 班级 / 专业不在 create 请求体内：创建成功后会用返回的用户 ID 追加一次
                PUT /api/user/update 补全（两步串行，若第二步失败账号已存在，可在列表中「编辑」重试）。
              </p>
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
            <div v-if="form.roleName === 'TEACHER'" class="form-item">
              <p class="two-step-hint">职称同样由创建后的第二次 PUT /api/user/update 补全。</p>
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

    <!-- 批量导入弹窗（后端未提供该接口，仅保留交互骨架） -->
    <Teleport to="body">
      <div v-if="importVisible" class="mask" @click.self="importVisible = false">
        <div class="st-card panel">
          <div class="st-card__header">
            <h2 class="st-card__title">批量导入账号</h2>
            <p class="st-card__hint">后端未提供该接口：@/api/user 无批量导入函数，当前仅保留界面骨架</p>
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
              <button
                class="st-btn st-btn--primary"
                :disabled="!importFile"
                :title="importFile ? '后端未提供该接口：批量导入账号' : '请先选择账号文件'"
                @click="handleImport"
              >开始导入</button>
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

.table-note {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
  padding: 8px 12px;
  margin-bottom: 6px;
  background: var(--bg-subtle);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
}

.two-step-hint {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
  margin: 0 0 10px;
  padding: 8px 10px;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
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
