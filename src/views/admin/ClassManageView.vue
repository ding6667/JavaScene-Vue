<script setup lang="ts">
/**
 * 班级管理（ADMIN）
 * - GET    /api/class/list?courseId=        班级列表，不传 courseId 即全部
 * - GET    /api/class/students?classId=     班级学生名单
 * - POST   /api/class                       { className, teacherId, grade, courseId }
 * - PUT    /api/class/{id}                  同上请求体
 * - DELETE /api/class/{id}
 * - GET    /api/user/admin/list?roleId=2    教师下拉（fetchTeacherOptions，只取 enabled=1）
 *
 * 后端没有课程简表接口，课程维度只能用 courseId 数字入参（筛选与表单都是）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import {
  AlertCircle,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  createClass,
  deleteClass,
  fetchClassStudents,
  fetchClasses,
  fetchTeacherOptions,
  updateClass,
} from '@/api/class';
import type { ClassResponse, ClassSaveRequest, ClassStudentItem } from '@/types/class';
import type { UserListResponse } from '@/types/user';

type CourseMode = 'all' | 'id';
const COURSE_MODES: { key: CourseMode; label: string }[] = [
  { key: 'all', label: '全部课程' },
  { key: 'id', label: '按课程 ID' },
];

const loading = ref(false);
const loadError = ref('');
const classes = ref<ClassResponse[]>([]);

const courseMode = ref<CourseMode>('all');
const courseIdFilter = ref<number | null>(null);
const keyword = ref('');

const courseModeIndex = computed(() => (courseMode.value === 'all' ? 0 : 1));
const segSliderStyle = computed(() => ({
  left: `calc(${courseModeIndex.value} * 50% + 3px)`,
  width: 'calc(50% - 4px)',
}));

/** 「按课程 ID」还没填 ID 时不发请求，避免把「指定课程」查成全量 */
const queryCourseId = computed(() =>
  courseMode.value === 'id' ? courseIdFilter.value : null,
);

const visibleClasses = computed(() => {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return classes.value;
  return classes.value.filter((c) => c.className.toLowerCase().includes(kw));
});

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    classes.value = await fetchClasses(queryCourseId.value ?? undefined);
  } catch (e: unknown) {
    classes.value = [];
    loadError.value = (e instanceof Error ? e.message : String(e ?? '')) || '班级列表加载失败';
  } finally {
    loading.value = false;
  }
}

watch([courseMode, courseIdFilter], () => {
  if (courseMode.value === 'all' || courseIdFilter.value != null) void load();
});

// ==================== 教师下拉 ====================

const teacherOptions = ref<UserListResponse[]>([]);
const teacherLoading = ref(false);
const teacherError = ref('');

async function loadTeachers() {
  teacherLoading.value = true;
  teacherError.value = '';
  try {
    teacherOptions.value = await fetchTeacherOptions();
  } catch (e: unknown) {
    teacherOptions.value = [];
    teacherError.value = (e instanceof Error ? e.message : String(e ?? '')) || '教师列表加载失败';
  } finally {
    teacherLoading.value = false;
  }
}

// ==================== 新建 / 编辑 ====================

const dialogVisible = ref(false);
const editingRow = ref<ClassResponse | null>(null);
const saving = ref(false);

/** 下拉只列 enabled=1 的教师；编辑时把行自带的任课教师补进去，否则历史教师会显示成裸 ID */
const teacherSelectOptions = computed(() => {
  const list = teacherOptions.value.map((t) => ({
    userId: t.userId,
    label: `${t.realName || '未填姓名'}（${t.username}）`,
  }));
  const row = editingRow.value;
  if (row && row.teacherId && !list.some((t) => t.userId === row.teacherId)) {
    list.unshift({ userId: row.teacherId, label: `${row.teacherName || '未回填姓名'}（教师 ${row.teacherId}）` });
  }
  return list;
});

const emptyForm = () => ({
  className: '',
  grade: '',
  teacherId: null as number | null,
  courseId: null as number | null,
});
const form = ref(emptyForm());

/** ClassSaveRequest 四个字段都必填，任一为空不允许提交 */
const canSave = computed(
  () =>
    !!form.value.className.trim() &&
    !!form.value.grade.trim() &&
    form.value.teacherId != null &&
    form.value.courseId != null,
);

function openCreate() {
  editingRow.value = null;
  form.value = emptyForm();
  dialogVisible.value = true;
  if (!teacherOptions.value.length && !teacherLoading.value) void loadTeachers();
}

function openEdit(row: ClassResponse) {
  editingRow.value = row;
  form.value = {
    className: row.className,
    grade: row.grade,
    teacherId: row.teacherId || null,
    courseId: row.courseId || null,
  };
  dialogVisible.value = true;
  if (!teacherOptions.value.length && !teacherLoading.value) void loadTeachers();
}

async function handleSave() {
  if (!canSave.value || saving.value) return;
  const payload: ClassSaveRequest = {
    className: form.value.className.trim(),
    grade: form.value.grade.trim(),
    teacherId: form.value.teacherId!,
    courseId: form.value.courseId!,
  };
  saving.value = true;
  try {
    if (editingRow.value) {
      await updateClass(editingRow.value.classId, payload);
      ElMessage.success(`班级「${payload.className}」已更新`);
    } else {
      const id = await createClass(payload);
      ElMessage.success(`班级已创建${id ? `（ID ${id}）` : ''}`);
    }
    dialogVisible.value = false;
    await load();
  } catch {
    // 请求失败保留弹窗便于重试，提示由响应拦截器统一给出
  } finally {
    saving.value = false;
  }
}

// ==================== 名单 ====================

const rosterVisible = ref(false);
const rosterLoading = ref(false);
const rosterError = ref('');
const rosterClass = ref<ClassResponse | null>(null);
const students = ref<ClassStudentItem[]>([]);

async function openRoster(row: ClassResponse) {
  rosterClass.value = row;
  students.value = [];
  rosterError.value = '';
  rosterVisible.value = true;
  rosterLoading.value = true;
  try {
    students.value = await fetchClassStudents(row.classId);
  } catch (e: unknown) {
    rosterError.value = (e instanceof Error ? e.message : String(e ?? '')) || '名单加载失败';
  } finally {
    rosterLoading.value = false;
  }
}

function closeRoster() {
  rosterVisible.value = false;
  rosterClass.value = null;
  students.value = [];
}

// ==================== 删除 ====================

async function handleDelete(row: ClassResponse) {
  try {
    await ElMessageBox.confirm(
      `确定删除班级「${row.className}」？删除后该班级下的学生需要重新指派。`,
      '删除确认',
      { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' },
    );
  } catch {
    return; // 用户取消
  }
  try {
    await deleteClass(row.classId);
  } catch {
    return; // 提示由响应拦截器统一给出
  }
  ElMessage.success('班级已删除');
  await load();
}

const courseLabel = (row: ClassResponse) =>
  row.courseName && row.courseName.trim() ? row.courseName : `courseId ${row.courseId}`;

onMounted(() => {
  void load();
  void loadTeachers();
});
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">班级管理</h1>
      <p class="st-page-subtitle">维护班级名称、年级、关联课程与任课教师 · 可查看班级学生名单</p>
    </header>

    <!-- 筛选 / 操作栏 -->
    <div class="st-card">
      <div class="st-card__body toolbar-row">
        <div class="st-seg course-seg">
          <div class="st-seg__slider" :style="segSliderStyle"></div>
          <button
            v-for="m in COURSE_MODES"
            :key="m.key"
            class="st-seg__option course-seg__option"
            :class="{ 'st-seg__option--active': courseMode === m.key }"
            @click="courseMode = m.key"
          >
            {{ m.label }}
          </button>
        </div>
        <el-input-number
          v-if="courseMode === 'id'"
          v-model="courseIdFilter"
          :min="1"
          :controls="false"
          placeholder="课程 ID"
          style="width: 120px;"
        />
        <div class="search-box">
          <Search :size="14" />
          <input v-model="keyword" class="search-input" placeholder="按班级名称过滤（本页内）" />
        </div>
        <span v-if="courseMode === 'id' && courseIdFilter == null" class="filter-hint">
          GET /api/class/list?courseId= · 填写课程 ID 后查询
        </span>
        <div class="toolbar-actions">
          <button class="st-btn st-btn--secondary" :disabled="loading" @click="load">
            <Loader2 v-if="loading" :size="13" class="spin" />
            <RefreshCw v-else :size="13" />
            刷新
          </button>
          <button class="st-btn st-btn--primary" @click="openCreate">
            <Plus :size="14" /> 新建班级
          </button>
        </div>
      </div>
    </div>

    <!-- 班级表格 -->
    <div class="st-card" style="margin-top: 20px;">
      <div v-if="loading" class="st-card__body st-empty" style="padding: 70px;">
        <Loader2 :size="24" class="spin" />
        <div class="st-empty__text">正在加载班级列表…</div>
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
          列表来自 GET /api/class/list（接口不分页，一次返回全部可见班级）；
          学生数取列表回传的 studentCount，实际名单以「名单」里的 GET /api/class/students 为准；
          班级名称过滤在前端完成，该接口不接受名称参数。
        </p>
        <table class="class-table">
          <thead>
            <tr>
              <th>班级名称</th>
              <th>年级</th>
              <th>关联课程</th>
              <th>任课教师</th>
              <th class="col-num">学生数</th>
              <th style="text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in visibleClasses" :key="row.classId">
              <td class="cell-name">{{ row.className }}</td>
              <td class="muted">{{ row.grade || '—' }}</td>
              <td class="muted">
                {{ courseLabel(row) }}
                <span v-if="!row.courseName" class="st-badge st-badge--outline">无课程名</span>
              </td>
              <td class="muted">{{ row.teacherName || '—' }}</td>
              <td class="cell-num mono">{{ row.studentCount }}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="st-text-btn" title="PUT /api/class/{id}" @click="openEdit(row)">
                  <Pencil :size="12" style="vertical-align: -2px;" /> 编辑
                </button>
                <button
                  class="st-text-btn"
                  :title="`GET /api/class/students?classId=${row.classId}`"
                  @click="openRoster(row)"
                >
                  <Users :size="12" style="vertical-align: -2px;" /> 名单
                </button>
                <button
                  class="st-text-btn st-text-btn--danger"
                  :title="`DELETE /api/class/${row.classId}`"
                  @click="handleDelete(row)"
                >
                  <Trash2 :size="12" style="vertical-align: -2px;" /> 删除
                </button>
              </td>
            </tr>
            <tr v-if="visibleClasses.length === 0">
              <td colspan="6" class="muted cell-empty">
                <template v-if="classes.length === 0">
                  暂无班级数据：{{
                    courseMode === 'id' && courseIdFilter != null
                      ? `课程 ${courseIdFilter} 下没有班级`
                      : '后端还没有创建班级'
                  }}
                </template>
                <template v-else>
                  共 {{ classes.length }} 个班级，没有名称包含「{{ keyword.trim() }}」的班级
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="table-foot">
          <span class="pager__total">
            当前 {{ visibleClasses.length }} / {{ classes.length }} 个班级 · 学生合计
            {{ classes.reduce((s, c) => s + (c.studentCount || 0), 0) }} 人
          </span>
        </div>
      </div>
    </div>

    <!-- 新建 / 编辑弹窗 -->
    <Teleport to="body">
      <div v-if="dialogVisible" class="mask" @click.self="dialogVisible = false">
        <div class="st-card panel">
          <div class="st-card__header">
            <h2 class="st-card__title">{{ editingRow ? '编辑班级' : '新建班级' }}</h2>
            <p class="st-card__hint">
              {{ editingRow ? `PUT /api/class/${editingRow.classId}` : 'POST /api/class' }}
              · 四项均为必填
            </p>
          </div>
          <div class="st-card__body">
            <div class="form-row">
              <div class="form-item">
                <label class="form-label">班级名称</label>
                <input v-model="form.className" class="form-input" maxlength="50" placeholder="如：软件工程2401班" />
              </div>
              <div class="form-item form-item--narrow">
                <label class="form-label">年级</label>
                <input v-model="form.grade" class="form-input" maxlength="20" placeholder="如：2024 级 / 大一" />
              </div>
            </div>
            <div class="form-item">
              <label class="form-label">任课教师（提交 teacherId）</label>
              <el-select v-model="form.teacherId" placeholder="选择教师" filterable style="width: 100%;">
                <el-option
                  v-for="t in teacherSelectOptions"
                  :key="t.userId"
                  :label="t.label"
                  :value="t.userId"
                />
              </el-select>
              <p v-if="teacherLoading" class="field-hint">教师下拉加载中…</p>
              <p v-else-if="teacherError" class="field-hint field-hint--error">
                {{ teacherError }}
                <button class="st-text-btn" @click="loadTeachers">重试</button>
              </p>
              <p v-else-if="!teacherSelectOptions.length" class="field-hint">
                GET /api/user/admin/list?roleId=2 未返回启用中的教师
              </p>
            </div>
            <div class="form-item">
              <label class="form-label">关联课程 ID（courseId）</label>
              <el-input-number v-model="form.courseId" :min="1" :controls="false" placeholder="课程 ID" style="width: 200px;" />
              <p class="field-hint">后端没有课程下拉接口，此处按课程 ID 数字填写（可从课程方或后端数据里取）。</p>
            </div>
            <div class="panel-actions">
              <button class="st-btn st-btn--ghost" @click="dialogVisible = false">取消</button>
              <button class="st-btn st-btn--primary" :disabled="!canSave || saving" @click="handleSave">
                <Loader2 v-if="saving" :size="13" class="spin" />
                {{ saving ? '提交中…' : editingRow ? '保存修改' : '创建班级' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 学生名单 -->
    <Teleport to="body">
      <div v-if="rosterVisible" class="mask" @click.self="closeRoster">
        <div class="st-card panel panel--wide">
          <div class="st-card__header">
            <Users :size="16" class="card-icon" />
            <div>
              <h2 class="st-card__title">{{ rosterClass?.className ?? '班级学生名单' }}</h2>
              <p class="st-card__hint">
                GET /api/class/students?classId={{ rosterClass?.classId ?? '—' }} · 共 {{ students.length }} 人
              </p>
            </div>
          </div>
          <div class="st-card__body">
            <div v-if="rosterLoading" class="st-empty" style="padding: 50px;">
              <Loader2 :size="22" class="spin" />
              <div class="st-empty__text">正在加载名单…</div>
            </div>
            <div v-else-if="rosterError" class="st-empty" style="padding: 40px;">
              <AlertCircle :size="26" :stroke-width="1.4" class="st-empty__icon" />
              <div class="st-empty__text">{{ rosterError }}</div>
              <button v-if="rosterClass" class="st-btn st-btn--secondary" @click="openRoster(rosterClass)">
                <RefreshCw :size="13" /> 重新加载
              </button>
            </div>
            <div v-else class="table-wrap table-wrap--plain">
              <table class="class-table">
                <thead>
                  <tr>
                    <th>学号</th>
                    <th>姓名</th>
                    <th>年级</th>
                    <th style="text-align: right;">状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="s in students" :key="s.userId">
                    <td class="mono">{{ s.studentNo || '—' }}</td>
                    <td class="cell-name">{{ s.realName || '—' }}</td>
                    <td class="muted">{{ s.grade || '—' }}</td>
                    <td style="text-align: right;">
                      <span :class="['st-badge', s.enabled === 1 ? 'st-badge--success' : 'st-badge--neutral']">
                        {{ s.enabled === 1 ? '启用' : '停用' }}
                      </span>
                    </td>
                  </tr>
                  <tr v-if="!students.length">
                    <td colspan="4" class="muted cell-empty">
                      该班级暂无学生（GET /api/class/students 返回空数组），可先在学生名册里把学生指派到该班级
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="panel-actions">
              <button class="st-btn st-btn--ghost" @click="closeRoster">关闭</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

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

.filter-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.course-seg__option {
  flex: 1;
  min-width: 88px;
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
  width: 200px;
}

/* 表格 */
.table-wrap {
  padding: 8px 24px 18px;
  overflow-x: auto;
}

.table-wrap--plain {
  padding: 0;
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

.class-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.class-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.class-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  white-space: nowrap;
}

.class-table tr:last-child td {
  border-bottom: none;
}

.class-table tr:hover td {
  background: var(--bg-subtle);
}

.cell-name {
  font-weight: 500;
  color: var(--text-primary);
}

.muted {
  color: var(--text-tertiary);
  font-size: 12.5px;
}

.mono {
  font-family: Consolas, monospace;
  font-size: 12.5px;
}

.col-num,
.cell-num {
  text-align: right;
}

.cell-empty {
  text-align: center;
  padding: 40px 0;
}

.table-foot {
  display: flex;
  align-items: center;
  padding-top: 14px;
  margin-top: 4px;
  border-top: 1px solid var(--border-subtle);
}

.pager__total {
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
  width: 520px;
  max-width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
}

.panel--wide {
  width: 640px;
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
  transition: border-color var(--transition);
}

.form-input:focus {
  border-color: var(--border-strong);
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

.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.spin {
  animation: cm-spin 0.9s linear infinite;
}

@keyframes cm-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
