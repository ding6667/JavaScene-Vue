<script setup lang="ts">
/**
 * 账号中心（三端共用入口）
 * - GET  /api/user/info                基础资料 + 角色 / 状态 / 最近登录
 * - PUT  /api/user/info/update         仅 realName / email / phone / avatar
 * - GET  /api/user/student/info        学生扩展档案（权限 STUDENT）
 * - PUT  /api/user/student/info/update 仅 studentNo / major / college / enrollYear
 * - GET  /api/user/teacher/info        教师扩展档案（权限 TEACHER）
 * - PUT  /api/user/teacher/info/update 仅 teacherNo / title / college / department / office / researchArea
 * - PUT  /api/user/password/change     成功后旧 token 立即失效
 *
 * 角色档案只在账号确实挂了该角色时才请求：对无权限的端发请求会拿到 403，
 * 而 403 会被响应拦截器当成越权事件强制登出。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  AlertCircle,
  Briefcase,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  UserRound,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import {
  changePassword,
  fetchStudentInfo,
  fetchTeacherInfo,
  fetchUserInfo,
  updateStudentInfo,
  updateTeacherInfo,
  updateUserInfo,
} from '@/api/user';
import type { StudentInfoResponse, TeacherInfoResponse, UserInfoResponse } from '@/types/user';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();
const router = useRouter();

/** 拦截器已弹过一次提示，卡片里仍要留原文，否则刷新后就看不到失败原因了 */
function errText(e: unknown, fallback: string): string {
  return (e instanceof Error ? e.message : String(e ?? '')) || fallback;
}

/** 后端时间字段是字符串：能解析就统一成 YYYY-MM-DD HH:mm，解析不了原样显示 */
function fmtTime(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ==================== 基础资料 ====================

const baseLoading = ref(false);
const baseSaving = ref(false);
const baseError = ref('');
const info = ref<UserInfoResponse | null>(null);
const baseForm = reactive({ realName: '', email: '', phone: '', avatar: '' });
const avatarFailed = ref(false);

async function loadBase(silent = false) {
  if (!silent) baseLoading.value = true;
  baseError.value = '';
  try {
    const data = await fetchUserInfo();
    info.value = data;
    baseForm.realName = data.realName ?? '';
    baseForm.email = data.email ?? '';
    baseForm.phone = data.phone ?? '';
    baseForm.avatar = data.avatar ?? '';
  } catch (e: unknown) {
    if (!silent) info.value = null;
    baseError.value = errText(e, '基础资料加载失败');
  } finally {
    baseLoading.value = false;
  }
}

const baseDirty = computed(() => {
  const d = info.value;
  if (!d) return false;
  return (
    baseForm.realName.trim() !== (d.realName ?? '') ||
    baseForm.email.trim() !== (d.email ?? '') ||
    baseForm.phone.trim() !== (d.phone ?? '') ||
    baseForm.avatar.trim() !== (d.avatar ?? '')
  );
});

async function saveBase() {
  if (!baseDirty.value || baseSaving.value) return;
  baseSaving.value = true;
  try {
    await updateUserInfo({
      realName: baseForm.realName.trim(),
      email: baseForm.email.trim(),
      phone: baseForm.phone.trim(),
      avatar: baseForm.avatar.trim(),
    });
    // 顶栏与侧栏读的是 store 缓存，改完立刻回写姓名，省掉整页刷新
    authStore.cacheProfile({ realName: baseForm.realName.trim() });
    ElMessage.success('基础资料已保存');
    await loadBase(true);
  } catch {
    // 失败输入保留，提示由响应拦截器给出
  } finally {
    baseSaving.value = false;
  }
}

// ==================== 学生角色档案 ====================

const studentLoading = ref(false);
const studentSaving = ref(false);
const studentError = ref('');
const studentInfo = ref<StudentInfoResponse | null>(null);
const studentForm = reactive({ studentNo: '', major: '', college: '', enrollYear: '' });

async function loadStudent(silent = false) {
  if (!silent) studentLoading.value = true;
  studentError.value = '';
  try {
    const data = await fetchStudentInfo();
    studentInfo.value = data;
    studentForm.studentNo = data.studentNo ?? '';
    studentForm.major = data.major ?? '';
    studentForm.college = data.college ?? '';
    studentForm.enrollYear = data.enrollYear ? String(data.enrollYear) : '';
  } catch (e: unknown) {
    if (!silent) studentInfo.value = null;
    studentError.value = errText(e, '学生档案加载失败');
  } finally {
    studentLoading.value = false;
  }
}

/** 档案记录为空（后端缺记录时返回空对象而不是 null） */
const studentProfileMissing = computed(
  () =>
    !!studentInfo.value &&
    !studentInfo.value.studentNo &&
    !studentInfo.value.classId &&
    !studentInfo.value.major &&
    !studentInfo.value.enrollYear,
);

const enrollYearInvalid = computed(() => {
  const raw = studentForm.enrollYear.trim();
  if (raw === '') return false;
  return !/^\d{4}$/.test(raw) || Number(raw) < 1900 || Number(raw) > 2999;
});

const studentDirty = computed(() => {
  const d = studentInfo.value;
  if (!d) return false;
  return (
    studentForm.studentNo.trim() !== (d.studentNo ?? '') ||
    studentForm.major.trim() !== (d.major ?? '') ||
    studentForm.college.trim() !== (d.college ?? '') ||
    studentForm.enrollYear.trim() !== (d.enrollYear ? String(d.enrollYear) : '')
  );
});

async function saveStudent() {
  if (!studentDirty.value || studentSaving.value || enrollYearInvalid.value) return;
  studentSaving.value = true;
  try {
    const raw = studentForm.enrollYear.trim();
    await updateStudentInfo({
      studentNo: studentForm.studentNo.trim(),
      major: studentForm.major.trim(),
      college: studentForm.college.trim(),
      enrollYear: raw === '' ? undefined : Number(raw),
    });
    ElMessage.success('学生档案已保存');
    await loadStudent(true);
  } catch {
    // 失败输入保留，提示由响应拦截器给出
  } finally {
    studentSaving.value = false;
  }
}

// ==================== 教师角色档案 ====================

const teacherLoading = ref(false);
const teacherSaving = ref(false);
const teacherError = ref('');
const teacherInfo = ref<TeacherInfoResponse | null>(null);
const teacherForm = reactive({
  teacherNo: '',
  title: '',
  college: '',
  department: '',
  office: '',
  researchArea: '',
});

async function loadTeacher(silent = false) {
  if (!silent) teacherLoading.value = true;
  teacherError.value = '';
  try {
    const data = await fetchTeacherInfo();
    teacherInfo.value = data;
    teacherForm.teacherNo = data.teacherNo ?? '';
    teacherForm.title = data.title ?? '';
    teacherForm.college = data.college ?? '';
    teacherForm.department = data.department ?? '';
    teacherForm.office = data.office ?? '';
    teacherForm.researchArea = data.researchArea ?? '';
  } catch (e: unknown) {
    if (!silent) teacherInfo.value = null;
    teacherError.value = errText(e, '教师档案加载失败');
  } finally {
    teacherLoading.value = false;
  }
}

const teacherProfileMissing = computed(
  () =>
    !!teacherInfo.value &&
    !teacherInfo.value.teacherNo &&
    !teacherInfo.value.title &&
    !teacherInfo.value.college,
);

const teacherDirty = computed(() => {
  const d = teacherInfo.value;
  if (!d) return false;
  return (
    teacherForm.teacherNo.trim() !== (d.teacherNo ?? '') ||
    teacherForm.title.trim() !== (d.title ?? '') ||
    teacherForm.college.trim() !== (d.college ?? '') ||
    teacherForm.department.trim() !== (d.department ?? '') ||
    teacherForm.office.trim() !== (d.office ?? '') ||
    teacherForm.researchArea.trim() !== (d.researchArea ?? '')
  );
});

async function saveTeacher() {
  if (!teacherDirty.value || teacherSaving.value) return;
  teacherSaving.value = true;
  try {
    await updateTeacherInfo({
      teacherNo: teacherForm.teacherNo.trim(),
      title: teacherForm.title.trim(),
      college: teacherForm.college.trim(),
      department: teacherForm.department.trim(),
      office: teacherForm.office.trim(),
      researchArea: teacherForm.researchArea.trim(),
    });
    ElMessage.success('教师档案已保存');
    await loadTeacher(true);
  } catch {
    // 失败输入保留，提示由响应拦截器给出
  } finally {
    teacherSaving.value = false;
  }
}

// ==================== 修改密码 ====================

const pwdForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });
const showPwd = ref(false);
const pwdSaving = ref(false);
const pwdError = ref('');

const pwdTooShort = computed(() => pwdForm.newPassword !== '' && pwdForm.newPassword.length < 6);
const pwdSameAsOld = computed(
  () => pwdForm.newPassword !== '' && pwdForm.newPassword === pwdForm.oldPassword,
);
const pwdMismatch = computed(
  () => pwdForm.confirmPassword !== '' && pwdForm.confirmPassword !== pwdForm.newPassword,
);
const canChangePwd = computed(
  () =>
    pwdForm.oldPassword !== '' &&
    pwdForm.newPassword.length >= 6 &&
    !pwdSameAsOld.value &&
    pwdForm.confirmPassword === pwdForm.newPassword &&
    !pwdSaving.value,
);

function resetPwdForm() {
  pwdForm.oldPassword = '';
  pwdForm.newPassword = '';
  pwdForm.confirmPassword = '';
  pwdError.value = '';
}

async function handleChangePwd() {
  if (!canChangePwd.value) return;
  pwdSaving.value = true;
  pwdError.value = '';
  try {
    await changePassword({
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword,
    });
    ElMessage.success('密码已修改，请重新登录');
    // 旧 token 此刻已失效，再调吊销接口毫无意义：只清本地会话并回登录页
    authStore.clearAuth();
    resetPwdForm();
    await router.replace('/login');
  } catch (e: unknown) {
    pwdError.value = errText(e, '密码修改失败');
  } finally {
    pwdSaving.value = false;
  }
}

onMounted(() => {
  void loadBase();
  if (authStore.isStudent) void loadStudent();
  if (authStore.isTeacher) void loadTeacher();
});
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">账号中心</h1>
      <p class="st-page-subtitle">
        {{ authStore.displayName }} · {{ authStore.roleLabel }} · 基础资料与角色档案在此维护，密码修改后需重新登录
      </p>
    </header>

    <!-- ==================== 基础资料 ==================== -->
    <section class="st-card">
      <div class="st-card__header">
        <UserRound :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">基础资料</h2>
          <p class="st-card__hint">
            PUT /api/user/info/update · 只有姓名 / 邮箱 / 电话 / 头像可改，用户名与角色由管理端维护
          </p>
        </div>
        <div class="card-actions">
          <button class="st-btn st-btn--secondary" :disabled="baseLoading" @click="loadBase()">
            <RefreshCw :size="13" /> 重新加载
          </button>
          <button
            class="st-btn st-btn--primary"
            :disabled="!baseDirty || baseSaving"
            :title="baseDirty ? '提交本卡片的改动' : '没有需要保存的改动'"
            @click="saveBase"
          >
            <Loader2 v-if="baseSaving" :size="13" class="spin" />
            <Save v-else :size="13" />
            {{ baseSaving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>

      <div class="st-card__body">
        <div v-if="baseLoading" class="st-empty">
          <Loader2 :size="22" class="spin" />
          <div class="st-empty__text">正在读取账号资料…</div>
        </div>
        <div v-else-if="baseError && !info" class="st-empty">
          <AlertCircle :size="28" :stroke-width="1.4" class="st-empty__icon" />
          <div class="st-empty__text">{{ baseError }}</div>
          <button class="st-btn st-btn--secondary" @click="loadBase()">
            <RefreshCw :size="13" /> 重试
          </button>
        </div>
        <template v-else-if="info">
          <div class="form-grid">
            <div class="form-item">
              <label class="form-label" for="acc-realname">姓名</label>
              <input id="acc-realname" v-model="baseForm.realName" class="form-input" maxlength="32" placeholder="真实姓名" />
            </div>
            <div class="form-item">
              <label class="form-label" for="acc-email">邮箱</label>
              <input id="acc-email" v-model="baseForm.email" class="form-input" maxlength="64" placeholder="name@example.com" />
            </div>
            <div class="form-item">
              <label class="form-label" for="acc-phone">电话</label>
              <input id="acc-phone" v-model="baseForm.phone" class="form-input" maxlength="20" placeholder="手机号" />
            </div>
            <div class="form-item">
              <label class="form-label" for="acc-avatar">头像 URL</label>
              <div class="avatar-row">
                <input
                  id="acc-avatar"
                  v-model="baseForm.avatar"
                  class="form-input"
                  placeholder="https://…"
                />
                <img
                  v-if="baseForm.avatar.trim()"
                  class="avatar-preview"
                  :src="baseForm.avatar.trim()"
                  alt="头像预览"
                  @error="avatarFailed = true"
                  @load="avatarFailed = false"
                />
              </div>
              <p v-if="baseForm.avatar.trim() && avatarFailed" class="form-hint form-hint--bad">
                该链接没能加载出图片，确认地址可直接访问
              </p>
              <p v-else class="form-hint">后端只提供头像直链字段，没有上传接口</p>
            </div>
          </div>

          <div class="ro-list">
            <div class="ro-item">
              <span class="ro-label">用户名</span>
              <span class="ro-value mono">{{ info.username || authStore.username || '—' }}</span>
            </div>
            <div class="ro-item">
              <span class="ro-label">角色</span>
              <span class="ro-value">{{ info.roleDesc || authStore.roleLabel }}</span>
            </div>
            <div class="ro-item">
              <span class="ro-label">状态</span>
              <span :class="['st-badge', info.enabled === 1 ? 'st-badge--success' : 'st-badge--neutral']">
                {{ info.enabled === 1 ? '启用' : '禁用' }}
              </span>
            </div>
            <div class="ro-item">
              <span class="ro-label">最近登录</span>
              <span class="ro-value">{{ fmtTime(info.lastLoginTime) }}</span>
            </div>
          </div>

          <p v-if="baseError" class="form-hint form-hint--bad">{{ baseError }}</p>
        </template>
        <div v-else class="st-empty">
          <AlertCircle :size="28" :stroke-width="1.4" class="st-empty__icon" />
          <div class="st-empty__text">没有取到账号资料</div>
          <button class="st-btn st-btn--secondary" @click="loadBase()">
            <RefreshCw :size="13" /> 重新加载
          </button>
        </div>
      </div>
    </section>

    <!-- ==================== 角色档案：学生 ==================== -->
    <section v-if="authStore.isStudent" class="st-card section-gap">
      <div class="st-card__header">
        <GraduationCap :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">角色档案 · 学生</h2>
          <p class="st-card__hint">
            GET /api/user/student/info · PUT /api/user/student/info/update
            （学号 / 专业 / 学院 / 入学年份可改，班级与年级由管理端排定）
          </p>
        </div>
        <div class="card-actions">
          <button class="st-btn st-btn--secondary" :disabled="studentLoading" @click="loadStudent()">
            <RefreshCw :size="13" /> 重新加载
          </button>
          <button
            class="st-btn st-btn--primary"
            :disabled="!studentDirty || studentSaving || enrollYearInvalid"
            @click="saveStudent"
          >
            <Loader2 v-if="studentSaving" :size="13" class="spin" />
            <Save v-else :size="13" />
            {{ studentSaving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>

      <div class="st-card__body">
        <div v-if="studentLoading" class="st-empty">
          <Loader2 :size="22" class="spin" />
          <div class="st-empty__text">正在读取学生档案…</div>
        </div>
        <div v-else-if="!studentInfo" class="st-empty">
          <AlertCircle :size="28" :stroke-width="1.4" class="st-empty__icon" />
          <div class="st-empty__text">{{ studentError || '学生档案加载失败' }}</div>
          <button class="st-btn st-btn--secondary" @click="loadStudent()">
            <RefreshCw :size="13" /> 重试
          </button>
        </div>
        <template v-else>
          <p v-if="studentError" class="form-hint form-hint--bad">{{ studentError }}</p>
          <p v-if="studentProfileMissing" class="table-note">
            该账号还没有学生档案记录，下面是空表单；填写并保存即可写入学号、专业等资料。
          </p>
          <div class="form-grid">
            <div class="form-item">
              <label class="form-label" for="stu-no">学号</label>
              <input id="stu-no" v-model="studentForm.studentNo" class="form-input" maxlength="32" />
            </div>
            <div class="form-item">
              <label class="form-label" for="stu-major">专业</label>
              <input id="stu-major" v-model="studentForm.major" class="form-input" maxlength="64" />
            </div>
            <div class="form-item">
              <label class="form-label" for="stu-college">学院</label>
              <input id="stu-college" v-model="studentForm.college" class="form-input" maxlength="64" />
            </div>
            <div class="form-item">
              <label class="form-label" for="stu-enroll">入学年份</label>
              <input
                id="stu-enroll"
                v-model="studentForm.enrollYear"
                class="form-input"
                inputmode="numeric"
                maxlength="4"
                placeholder="如 2023"
              />
              <p v-if="enrollYearInvalid" class="form-hint form-hint--bad">入学年份需为 4 位数字（1900-2999）</p>
            </div>
          </div>
          <div class="ro-list">
            <div class="ro-item">
              <span class="ro-label">班级</span>
              <span class="ro-value">{{ studentInfo.className || '—' }}</span>
            </div>
            <div class="ro-item">
              <span class="ro-label">年级</span>
              <span class="ro-value">{{ studentInfo.grade || '—' }}</span>
            </div>
            <div class="ro-item">
              <span class="ro-label">预计毕业</span>
              <span class="ro-value">{{ studentInfo.graduationYear || '—' }}</span>
            </div>
            <div class="ro-item">
              <span class="ro-label">班级 ID</span>
              <span class="ro-value mono">{{ studentInfo.classId || '—' }}</span>
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- ==================== 角色档案：教师 ==================== -->
    <section v-if="authStore.isTeacher" class="st-card section-gap">
      <div class="st-card__header">
        <Briefcase :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">角色档案 · 教师</h2>
          <p class="st-card__hint">
            GET /api/user/teacher/info · PUT /api/user/teacher/info/update
            （工号 / 职称 / 学院 / 院系 / 办公室 / 研究方向）
          </p>
        </div>
        <div class="card-actions">
          <button class="st-btn st-btn--secondary" :disabled="teacherLoading" @click="loadTeacher()">
            <RefreshCw :size="13" /> 重新加载
          </button>
          <button
            class="st-btn st-btn--primary"
            :disabled="!teacherDirty || teacherSaving"
            @click="saveTeacher"
          >
            <Loader2 v-if="teacherSaving" :size="13" class="spin" />
            <Save v-else :size="13" />
            {{ teacherSaving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>

      <div class="st-card__body">
        <div v-if="teacherLoading" class="st-empty">
          <Loader2 :size="22" class="spin" />
          <div class="st-empty__text">正在读取教师档案…</div>
        </div>
        <div v-else-if="!teacherInfo" class="st-empty">
          <AlertCircle :size="28" :stroke-width="1.4" class="st-empty__icon" />
          <div class="st-empty__text">{{ teacherError || '教师档案加载失败' }}</div>
          <button class="st-btn st-btn--secondary" @click="loadTeacher()">
            <RefreshCw :size="13" /> 重试
          </button>
        </div>
        <template v-else>
          <p v-if="teacherError" class="form-hint form-hint--bad">{{ teacherError }}</p>
          <p v-if="teacherProfileMissing" class="table-note">
            该账号还没有教师档案记录，下面是空表单；填写并保存即可写入工号、职称等资料。
          </p>
          <div class="form-grid">
            <div class="form-item">
              <label class="form-label" for="tea-no">工号</label>
              <input id="tea-no" v-model="teacherForm.teacherNo" class="form-input" maxlength="32" />
            </div>
            <div class="form-item">
              <label class="form-label" for="tea-title">职称</label>
              <input id="tea-title" v-model="teacherForm.title" class="form-input" maxlength="32" placeholder="如 副教授" />
            </div>
            <div class="form-item">
              <label class="form-label" for="tea-college">学院</label>
              <input id="tea-college" v-model="teacherForm.college" class="form-input" maxlength="64" />
            </div>
            <div class="form-item">
              <label class="form-label" for="tea-dept">院系</label>
              <input id="tea-dept" v-model="teacherForm.department" class="form-input" maxlength="64" />
            </div>
            <div class="form-item">
              <label class="form-label" for="tea-office">办公室</label>
              <input id="tea-office" v-model="teacherForm.office" class="form-input" maxlength="32" />
            </div>
            <div class="form-item">
              <label class="form-label" for="tea-research">研究方向</label>
              <input id="tea-research" v-model="teacherForm.researchArea" class="form-input" maxlength="64" />
            </div>
          </div>
        </template>
      </div>
    </section>

    <!-- 只挂了 ADMIN 角色时没有扩展档案可维护 -->
    <section v-if="!authStore.isStudent && !authStore.isTeacher" class="st-card section-gap">
      <div class="st-card__header">
        <UserRound :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">角色档案</h2>
          <p class="st-card__hint">/api/user/student/info 与 /api/user/teacher/info 只面向学生、教师角色</p>
        </div>
      </div>
      <div class="st-card__body st-empty">
        <AlertCircle :size="28" :stroke-width="1.4" class="st-empty__icon" />
        <div class="st-empty__text">当前账号是{{ authStore.roleLabel }}，没有学生 / 教师扩展档案</div>
      </div>
    </section>

    <!-- ==================== 修改密码 ==================== -->
    <section class="st-card section-gap">
      <div class="st-card__header">
        <KeyRound :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">修改密码</h2>
          <p class="st-card__hint">
            PUT /api/user/password/change {oldPassword, newPassword} ·
            成功后当前会话立即失效，需要重新登录
          </p>
        </div>
        <div class="card-actions">
          <button
            class="st-btn st-btn--primary"
            :disabled="!canChangePwd"
            @click="handleChangePwd"
          >
            <Loader2 v-if="pwdSaving" :size="13" class="spin" />
            <Save v-else :size="13" />
            {{ pwdSaving ? '提交中…' : '确认修改' }}
          </button>
        </div>
      </div>
      <div class="st-card__body">
        <div class="form-grid">
          <div class="form-item">
            <label class="form-label" for="pwd-old">原密码</label>
            <div class="input-with-action">
              <input
                id="pwd-old"
                v-model="pwdForm.oldPassword"
                :type="showPwd ? 'text' : 'password'"
                class="form-input"
                maxlength="32"
                autocomplete="current-password"
              />
              <button class="icon-btn" type="button" @click="showPwd = !showPwd">
                <Eye v-if="!showPwd" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
            </div>
          </div>
          <div class="form-item">
            <label class="form-label" for="pwd-new">新密码</label>
            <div class="input-with-action">
              <input
                id="pwd-new"
                v-model="pwdForm.newPassword"
                :type="showPwd ? 'text' : 'password'"
                class="form-input"
                maxlength="32"
                autocomplete="new-password"
              />
              <button class="icon-btn" type="button" @click="showPwd = !showPwd">
                <Eye v-if="!showPwd" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
            </div>
            <p v-if="pwdTooShort" class="form-hint form-hint--bad">新密码至少 6 位</p>
            <p v-else-if="pwdSameAsOld" class="form-hint form-hint--bad">新密码不能与原密码相同</p>
            <p v-else class="form-hint">6-32 位，后端 BCrypt 加密存储</p>
          </div>
          <div class="form-item">
            <label class="form-label" for="pwd-confirm">确认新密码</label>
            <input
              id="pwd-confirm"
              v-model="pwdForm.confirmPassword"
              :type="showPwd ? 'text' : 'password'"
              class="form-input"
              maxlength="32"
              autocomplete="new-password"
            />
            <p v-if="pwdMismatch" class="form-hint form-hint--bad">两次输入的新密码不一致</p>
          </div>
        </div>

        <p v-if="pwdError" class="form-hint form-hint--bad">{{ pwdError }}</p>
        <div v-if="pwdForm.oldPassword && pwdForm.newPassword.length >= 6 && !pwdSameAsOld && !pwdMismatch" class="table-note">
          提交后旧 token 立即失效：保存成功会清空本地会话并跳转到登录页。
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.section-gap {
  margin-top: 20px;
}

.card-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* ---- 表单：与设置页一致的密度 ---- */
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 24px;
}

.form-item {
  min-width: 0;
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
  transition: border-color var(--transition), box-shadow var(--transition);
}

.form-input:hover {
  border-color: var(--border-strong);
}

.form-input:focus {
  border-color: var(--text-primary);
}

.form-hint {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.form-hint--bad {
  color: var(--status-danger);
}

.input-with-action {
  position: relative;
  display: flex;
  align-items: center;
}

.input-with-action .form-input {
  padding-right: 36px;
}

.icon-btn {
  position: absolute;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.icon-btn:hover {
  background: var(--bg-subtle);
  color: var(--text-primary);
}

.avatar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.avatar-row .form-input {
  flex: 1;
  min-width: 0;
}

.avatar-preview {
  width: 34px;
  height: 34px;
  object-fit: cover;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  flex-shrink: 0;
}

/* ---- 只读字段 ---- */
.ro-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px 24px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.ro-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ro-label {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.ro-value {
  font-size: 13px;
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.mono {
  font-family: Consolas, monospace;
  font-size: 12.5px;
}

.table-note {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
  padding: 8px 12px;
  margin: 0 0 16px;
  background: var(--bg-subtle);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
}

.spin {
  animation: acc-spin 0.9s linear infinite;
}

@keyframes acc-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 860px) {
  .st-card__header {
    flex-wrap: wrap;
  }
  .card-actions {
    margin-left: 0;
    width: 100%;
  }
  .form-grid,
  .ro-list {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
