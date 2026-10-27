<script setup lang="ts">
/**
 * 用户管理（ADMIN）
 * - GET    /api/user/admin/list                       分页；roleId / enabled / classId / keyword 四项筛选全在后端
 * - POST   /api/user/admin/add                        { username, password, realName, email, phone, roleId, enabled } → 新 userId
 * - PUT    /api/user/admin/{userId}                   编辑 realName / email / phone / roleId / enabled（username 不可改）
 * - PUT    /api/user/admin/toggle-status/{userId}     启停；后端拒绝作用于当前登录账号
 * - PUT    /api/user/password/reset/{userId}          返回新的初始密码，前端不硬编码
 * - DELETE /api/user/admin/delete/{userId}
 * - POST   /api/user/student/batch-add?classId=       学生名单批量导入（multipart，一行一名学生「学号,姓名[,初始密码]」）
 * - GET    /api/user/student/import-template          导入模板文件流
 * - GET    /api/class/list                            班级筛选与导入目标班级的下拉
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  Users,
  XCircle,
} from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  batchAddStudents,
  createUser,
  deleteUser,
  downloadStudentTemplate,
  fetchUsers,
  resetPassword,
  toggleUserStatus,
  updateUser,
} from '@/api/user';
import { fetchClasses } from '@/api/class';
import { saveBlob } from '@/utils/download';
import type { ClassResponse } from '@/types/class';
import type { BatchImportResult, UserListResponse, UserRoleName } from '@/types/user';
import { ROLE_IDS, ROLE_LABELS, roleCodeOf } from '@/types/user';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const ROLE_BADGE: Record<UserRoleName, string> = {
  STUDENT: 'st-badge--neutral',
  TEACHER: 'st-badge--info',
  ADMIN: 'st-badge--dark',
};

/** 下拉与请求体都只提交 roleId 码值（接口不认 roleName） */
const ROLE_OPTIONS = (Object.keys(ROLE_IDS) as UserRoleName[]).map((code) => ({
  value: ROLE_IDS[code],
  label: ROLE_LABELS[code],
}));

const loading = ref(false);
const loadError = ref('');
const users = ref<UserListResponse[]>([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(10);

const keyword = ref('');
const roleIdFilter = ref<number | null>(null);
const enabledFilter = ref<number | null>(null);
const classIdFilter = ref<number | null>(null);

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const hasActiveFilter = computed(
  () =>
    keyword.value.trim() !== '' ||
    roleIdFilter.value != null ||
    enabledFilter.value != null ||
    classIdFilter.value != null,
);

/** 启停只能翻转别人：后端拒绝把权限操作打在自己账号上 */
const isSelf = (row: UserListResponse) => row.userId === authStore.userId;

/** 角色列优先用后端回传的 roleDesc，缺省时按 roleName 映射中文 */
const roleLabelOf = (row: UserListResponse) =>
  row.roleDesc || ROLE_LABELS[row.roleName] || `角色 ${row.roleId}`;

const roleBadgeOf = (row: UserListResponse) => {
  const code = roleCodeOf(row.roleId);
  return code ? ROLE_BADGE[code] : 'st-badge--outline';
};

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const page = await fetchUsers({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      roleId: roleIdFilter.value ?? undefined,
      enabled: enabledFilter.value ?? undefined,
      keyword: keyword.value.trim() || undefined,
      classId: classIdFilter.value ?? undefined,
    });
    users.value = page.records ?? [];
    total.value = page.total ?? 0;
  } catch (e: unknown) {
    users.value = [];
    total.value = 0;
    loadError.value = (e instanceof Error ? e.message : String(e ?? '')) || '用户列表加载失败';
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

function resetFilters() {
  keyword.value = '';
  roleIdFilter.value = null;
  enabledFilter.value = null;
  classIdFilter.value = null; // 只改筛选值，重查由各自的 watch 负责
}

// keyword 走后端模糊查（用户名/姓名/学号工号），输入防抖 400ms 后回第一页
let searchTimer: number | undefined;
watch(keyword, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(reloadFirstPage, 400);
});

watch([roleIdFilter, enabledFilter, classIdFilter], reloadFirstPage);
watch(pageSize, reloadFirstPage);
watch(pageNum, () => void load());

onUnmounted(() => window.clearTimeout(searchTimer));

// ==================== 班级下拉 ====================

const classes = ref<ClassResponse[]>([]);
const classError = ref('');

async function loadClasses() {
  classError.value = '';
  try {
    classes.value = await fetchClasses();
  } catch (e: unknown) {
    classes.value = [];
    classError.value = (e instanceof Error ? e.message : String(e ?? '')) || '班级选项加载失败';
  }
}

onMounted(() => {
  void load();
  void loadClasses();
});

// ==================== 新增 / 编辑 ====================

const dialogVisible = ref(false);
const editing = ref<UserListResponse | null>(null);
const saving = ref(false);

const emptyForm = () => ({
  username: '',
  password: '',
  realName: '',
  email: '',
  phone: '',
  roleId: ROLE_IDS.STUDENT as number,
  enabled: 1,
});
const form = ref(emptyForm());

function openCreate() {
  editing.value = null;
  form.value = { ...emptyForm(), roleId: roleIdFilter.value ?? ROLE_IDS.STUDENT };
  dialogVisible.value = true;
}

function openEdit(row: UserListResponse) {
  editing.value = row;
  form.value = {
    username: row.username,
    password: '',
    realName: row.realName ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    roleId: row.roleId,
    enabled: row.enabled,
  };
  dialogVisible.value = true;
}

const canSave = computed(() => {
  if (form.value.realName.trim() === '') return false;
  if (editing.value) return true;
  const len = form.value.password.length;
  return form.value.username.trim() !== '' && len >= 6 && len <= 32;
});

async function handleSave() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  try {
    if (editing.value) {
      // PUT /api/user/admin/{userId}：userId 在路径上，body 不含 username，一次调用改完
      await updateUser(editing.value.userId, {
        realName: form.value.realName.trim(),
        email: form.value.email.trim(),
        phone: form.value.phone.trim(),
        roleId: form.value.roleId,
        enabled: form.value.enabled,
      });
      ElMessage.success('账号信息已更新');
    } else {
      const userId = await createUser({
        username: form.value.username.trim(),
        password: form.value.password,
        realName: form.value.realName.trim(),
        email: form.value.email.trim() || undefined,
        phone: form.value.phone.trim() || undefined,
        roleId: form.value.roleId,
        enabled: form.value.enabled,
      });
      ElMessage.success(`账号创建成功（用户 ID ${userId || '-'}）`);
    }
    dialogVisible.value = false;
    await load();
  } catch {
    // 请求失败保留弹窗便于重试，提示由响应拦截器统一给出
  } finally {
    saving.value = false;
  }
}

function goStudentRoster() {
  dialogVisible.value = false;
  void router.push('/admin/students');
}

// ==================== 启停 / 重置密码 / 删除 ====================

/** ElMessageBox 取消会 reject，统一转成布尔，避免未捕获的 Promise 异常 */
async function confirmAction(message: string, title: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, { type: 'warning' });
    return true;
  } catch {
    return false;
  }
}

const togglingId = ref<number | null>(null);

async function toggleEnabled(row: UserListResponse) {
  if (isSelf(row) || togglingId.value === row.userId) return;
  togglingId.value = row.userId;
  try {
    await toggleUserStatus(row.userId);
  } catch {
    return; // 提示由响应拦截器统一给出，状态以列表为准不本地猜
  } finally {
    togglingId.value = null;
  }
  row.enabled = row.enabled === 1 ? 0 : 1; // 该接口只翻转 enabled，回不到值就按翻转结果同步
  ElMessage.success(row.enabled === 1 ? '账号已启用' : '账号已停用');
}

const resettingId = ref<number | null>(null);

async function handleReset(row: UserListResponse) {
  if (resettingId.value === row.userId) return;
  const name = row.realName || row.username;
  if (!(await confirmAction(`确定重置「${name}」的登录密码？重置后要用后端下发的新初始密码登录。`, '重置密码'))) {
    return;
  }
  resettingId.value = row.userId;
  let newPassword = '';
  try {
    newPassword = await resetPassword(row.userId);
  } catch {
    return;
  } finally {
    resettingId.value = null;
  }
  if (!newPassword) {
    ElMessage.warning('密码已提交重置，但接口没有回传新密码，请与后端确认');
    return;
  }
  try {
    await ElMessageBox.alert(
      `「${name}」的新初始密码：${newPassword}`,
      '密码已重置',
      { confirmButtonText: '我已记下', type: 'success' },
    );
  } catch {
    // 弹窗被直接关掉，无需处理
  }
}

async function handleDelete(row: UserListResponse) {
  const name = row.realName || row.username;
  if (!(await confirmAction(`确定删除账号「${name}（${row.username}）」？该操作不可恢复。`, '删除确认'))) return;
  try {
    await deleteUser(row.userId);
  } catch {
    return;
  }
  ElMessage.success('账号已删除');
  await load();
}

// ==================== 学生名单批量导入 ====================

const importVisible = ref(false);
const importClassId = ref<number | null>(null);
const importFile = ref<File | null>(null);
const importing = ref(false);
const importError = ref('');
const importResult = ref<BatchImportResult | null>(null);
const templateDownloading = ref(false);

const canImport = computed(() => importClassId.value != null && importFile.value != null && !importing.value);

function openImport() {
  importVisible.value = true;
  importError.value = '';
  importFile.value = null;
  importResult.value = null;
  if (!classes.value.length && !classError.value) void loadClasses();
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  importFile.value = input.files?.[0] ?? null;
  input.value = ''; // 否则再次选同一个文件不会触发 change
}

async function handleImport() {
  if (!canImport.value || importClassId.value == null || !importFile.value) return;
  importing.value = true;
  importError.value = '';
  importResult.value = null;
  try {
    importResult.value = await batchAddStudents(importClassId.value, importFile.value);
    importFile.value = null;
    await Promise.all([load(), loadClasses()]);
  } catch (e: unknown) {
    importError.value = (e instanceof Error ? e.message : String(e ?? '')) || '批量导入失败';
  } finally {
    importing.value = false;
  }
}

/** 拦截器已把 blob 里的 JSON 错误识别成失败，这里只管落盘 */

async function handleTemplate() {
  if (templateDownloading.value) return;
  templateDownloading.value = true;
  try {
    saveBlob(await downloadStudentTemplate(), '学生导入模板.txt');
  } catch {
    // 提示由响应拦截器统一给出
  } finally {
    templateDownloading.value = false;
  }
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">用户管理</h1>
      <p class="st-page-subtitle">学生 / 教师 / 管理员账号管理 · 支持新增、编辑、密码重置与账号启停</p>
    </header>

    <!-- 筛选栏：四项筛选条件都由后端处理，改动即回到第一页重查 -->
    <div class="st-card">
      <div class="st-card__body toolbar-row">
        <el-select v-model="roleIdFilter" placeholder="全部角色" clearable style="width: 130px;">
          <el-option v-for="r in ROLE_OPTIONS" :key="r.value" :label="r.label" :value="r.value" />
        </el-select>
        <el-select v-model="enabledFilter" placeholder="全部状态" clearable style="width: 120px;">
          <el-option :value="1" label="启用" />
          <el-option :value="0" label="停用" />
        </el-select>
        <div class="class-filter">
          <el-select
            v-model="classIdFilter"
            placeholder="全部班级"
            clearable
            filterable
            style="width: 190px;"
          >
            <el-option v-for="c in classes" :key="c.classId" :label="c.className" :value="c.classId" />
          </el-select>
          <p v-if="classError" class="field-hint field-hint--error">
            {{ classError }}
            <button class="st-text-btn" @click="loadClasses">重试</button>
          </p>
        </div>
        <div class="search-box">
          <Search :size="14" />
          <input
            v-model="keyword"
            class="search-input"
            placeholder="搜索用户名 / 姓名 / 学号工号"
            @keyup.enter="reloadFirstPage"
          />
        </div>
        <button v-if="hasActiveFilter" class="st-text-btn" @click="resetFilters">清空筛选</button>
        <div class="toolbar-actions">
          <button class="st-btn st-btn--secondary" title="POST /api/user/student/batch-add" @click="openImport">
            <Upload :size="14" /> 批量导入学生名单
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
      <div v-else-if="loadError" class="st-card__body st-empty" style="padding: 60px;">
        <AlertCircle :size="30" :stroke-width="1.4" class="st-empty__icon" />
        <div class="st-empty__text">{{ loadError }}</div>
        <button class="st-btn st-btn--secondary" @click="load">
          <RefreshCw :size="13" /> 重新加载
        </button>
      </div>
      <div v-else class="table-wrap">
        <p class="table-note">
          GET /api/user/admin/list · pageNum / pageSize / roleId / enabled / classId / keyword，
          筛选与分页都在后端做；关键字输入防抖 400ms。
        </p>
        <table class="user-table">
          <thead>
            <tr>
              <th>用户名</th>
              <th>姓名</th>
              <th>角色</th>
              <th>学号 / 工号</th>
              <th>班级</th>
              <th>状态</th>
              <th>最近登录</th>
              <th>创建时间</th>
              <th style="text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in users" :key="row.userId">
              <td class="mono">{{ row.username }}</td>
              <td>{{ row.realName || '—' }}</td>
              <td>
                <span class="st-badge" :class="roleBadgeOf(row)">{{ roleLabelOf(row) }}</span>
                <span v-if="isSelf(row)" class="self-tag">本人</span>
              </td>
              <td class="muted mono">{{ row.userNo || '—' }}</td>
              <td class="muted">{{ row.className || '—' }}</td>
              <td>
                <button
                  class="st-text-btn status-btn"
                  :disabled="isSelf(row) || togglingId === row.userId"
                  :title="isSelf(row) ? '不能操作自己' : (row.enabled === 1 ? '点击停用该账号' : '点击启用该账号')"
                  @click="toggleEnabled(row)"
                >
                  <Loader2 v-if="togglingId === row.userId" :size="13" class="spin" />
                  <CheckCircle2 v-else-if="row.enabled === 1" :size="13" style="color: var(--status-success);" />
                  <XCircle v-else :size="13" style="color: var(--text-tertiary);" />
                  {{ row.enabled === 1 ? '启用' : '停用' }}
                </button>
              </td>
              <td class="muted mono">{{ fmt(row.lastLoginTime) }}</td>
              <td class="muted mono">{{ fmt(row.createTime) }}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="st-text-btn" @click="openEdit(row)">
                  <Pencil :size="12" style="vertical-align: -2px;" /> 编辑
                </button>
                <button
                  class="st-text-btn"
                  :disabled="resettingId === row.userId"
                  title="PUT /api/user/password/reset/{userId}"
                  @click="handleReset(row)"
                >
                  <Loader2 v-if="resettingId === row.userId" :size="12" class="spin" style="vertical-align: -2px;" />
                  <KeyRound v-else :size="12" style="vertical-align: -2px;" /> 重置密码
                </button>
                <button
                  class="st-text-btn st-text-btn--danger"
                  :disabled="isSelf(row)"
                  :title="isSelf(row) ? '不能操作自己' : 'DELETE /api/user/admin/delete/{userId}'"
                  @click="handleDelete(row)"
                >
                  <Trash2 :size="12" style="vertical-align: -2px;" /> 删除
                </button>
              </td>
            </tr>
            <tr v-if="users.length === 0">
              <td colspan="9" class="muted" style="text-align: center; padding: 40px 0;">
                <template v-if="hasActiveFilter">当前筛选条件下没有账号，可清空筛选或换条件重查</template>
                <template v-else>后端还没有任何账号数据</template>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- 分页 -->
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
            <p class="st-card__hint">
              {{ editing ? `PUT /api/user/admin/${editing.userId}` : 'POST /api/user/admin/add' }}
              · 初始密码 6-32 位，后端加密存储
            </p>
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
              <input
                v-model="form.password"
                type="password"
                class="form-input"
                maxlength="32"
                placeholder="6-32 位，创建后可在列表中重置"
              />
            </div>
            <div class="form-row">
              <div class="form-item" style="flex: 1;">
                <label class="form-label">角色（提交 roleId）</label>
                <el-select v-model="form.roleId" style="width: 100%;">
                  <el-option v-for="r in ROLE_OPTIONS" :key="r.value" :label="r.label" :value="r.value" />
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

            <!-- create/update 请求体都不含学号与班级，学生档案只能在名册里批量导入 -->
            <div v-if="form.roleId === ROLE_IDS.STUDENT" class="roster-entry">
              <p class="profile-note">
                账号接口不含学号 / 班级 / 专业：学生的这些档案在学生名册里按班级批量导入，
                建号与名单分两步，不在这一步里补。
              </p>
              <button class="st-btn st-btn--secondary" @click="goStudentRoster">
                <Users :size="13" /> 学生名单批量导入
              </button>
            </div>

            <div class="panel-actions">
              <button class="st-btn st-btn--ghost" @click="dialogVisible = false">取消</button>
              <button class="st-btn st-btn--primary" :disabled="!canSave || saving" @click="handleSave">
                <Loader2 v-if="saving" :size="13" class="spin" />
                {{ saving ? '提交中…' : editing ? '保存修改' : '创建账号' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量导入学生名单 -->
    <Teleport to="body">
      <div v-if="importVisible" class="mask" @click.self="importVisible = false">
        <div class="st-card panel panel--wide">
          <div class="st-card__header">
            <h2 class="st-card__title">批量导入学生名单</h2>
            <p class="st-card__hint">
              POST /api/user/student/batch-add?classId= · 一行一名学生「学号,姓名[,初始密码]」，
              单条失败不回滚整批
            </p>
          </div>
          <div class="st-card__body">
            <div class="form-row import-tools">
              <div class="form-item">
                <label class="form-label">目标班级（classId）</label>
                <el-select v-model="importClassId" placeholder="选择班级" filterable style="width: 100%;">
                  <el-option v-for="c in classes" :key="c.classId" :label="c.className" :value="c.classId" />
                </el-select>
                <p v-if="classError" class="field-hint field-hint--error">
                  {{ classError }}
                  <button class="st-text-btn" @click="loadClasses">重试</button>
                </p>
                <p v-else-if="!classes.length" class="field-hint">GET /api/class/list 未返回可见班级</p>
              </div>
              <div class="form-item form-item--narrow">
                <label class="form-label">导入模板</label>
                <button
                  class="st-btn st-btn--secondary st-btn--block"
                  :disabled="templateDownloading"
                  title="GET /api/user/student/import-template"
                  @click="handleTemplate"
                >
                  <Loader2 v-if="templateDownloading" :size="13" class="spin" />
                  <Download v-else :size="13" /> 下载模板
                </button>
              </div>
            </div>

            <label class="import-drop">
              <Upload :size="22" style="color: var(--text-tertiary);" />
              <span v-if="!importFile">点击选择名单文件（.txt / .md）</span>
              <span v-else class="import-file">{{ importFile.name }}（{{ (importFile.size / 1024).toFixed(1) }} KB）</span>
              <input type="file" accept=".txt,.md" style="display: none;" @change="onFileChange" />
            </label>

            <div v-if="importing" class="st-empty" style="padding: 26px 0 6px;">
              <Loader2 :size="20" class="spin" />
              <div class="st-empty__text">正在导入名单…</div>
            </div>
            <p v-else-if="importError" class="field-hint field-hint--error">
              {{ importError }}
              <button v-if="canImport" class="st-text-btn" @click="handleImport">重试</button>
            </p>

            <!-- 导入结果：后端逐行返回失败清单，原样列出 -->
            <div v-if="importResult" class="import-result">
              <div class="result-stats">
                <div>
                  <span class="st-stat-value">{{ importResult.total }}</span>
                  <p class="st-stat-label">总行数</p>
                </div>
                <div>
                  <span class="st-stat-value">{{ importResult.successNum }}</span>
                  <p class="st-stat-label">成功</p>
                </div>
                <div>
                  <span class="st-stat-value">{{ importResult.failNum }}</span>
                  <p class="st-stat-label">失败</p>
                </div>
              </div>
              <table v-if="importResult.failList.length" class="user-table fail-table">
                <thead>
                  <tr>
                    <th class="col-line">行号</th>
                    <th>学号</th>
                    <th>姓名</th>
                    <th>失败原因</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in importResult.failList" :key="f.line">
                    <td class="col-line mono">{{ f.line }}</td>
                    <td class="mono">{{ f.studentNo || '—' }}</td>
                    <td>{{ f.realName || '—' }}</td>
                    <td class="muted">{{ f.reason || '后端未给出原因' }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="field-hint">全部行导入成功，没有失败记录。</p>
            </div>

            <div class="panel-actions">
              <button class="st-btn st-btn--ghost" @click="importVisible = false">关闭</button>
              <button
                class="st-btn st-btn--primary"
                :disabled="!canImport"
                :title="importClassId == null ? '请先选择目标班级' : (importFile ? 'POST /api/user/student/batch-add' : '请先选择名单文件')"
                @click="handleImport"
              >
                <Loader2 v-if="importing" :size="13" class="spin" />
                开始导入
              </button>
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
  align-items: flex-start;
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

.class-filter {
  display: flex;
  flex-direction: column;
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
  margin: 0 0 6px;
  background: var(--bg-subtle);
  border: 1px dashed var(--border-strong);
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

.self-tag {
  margin-left: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
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

.pager__label {
  font-size: 12.5px;
  color: var(--text-tertiary);
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

.panel--wide {
  width: 680px;
}

.form-item {
  margin-bottom: 14px;
  flex: 1;
}

.form-item--narrow {
  flex: 0 0 160px;
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

.field-hint {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.field-hint--error {
  color: var(--status-warning);
}

.roster-entry {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.profile-note {
  flex: 1;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
  margin: 0;
  padding: 8px 10px;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

/* 批量导入 */
.import-tools {
  align-items: flex-start;
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

.import-result {
  margin-top: 16px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 14px;
}

.result-stats {
  display: flex;
  gap: 32px;
  margin-bottom: 12px;
}

.fail-table {
  font-size: 12.5px;
}

.col-line {
  width: 64px;
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
