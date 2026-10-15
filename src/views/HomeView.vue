<template>
  <div class="home-view">
    <!-- 页面标题 -->
    <header class="page-header">
      <h1 class="page-title">作业批阅</h1>
      <p class="page-subtitle">选择上传 word 或 zip 形式</p>
    </header>

    <!-- 模式滑块：ZIP / Word -->
    <div class="mode-toggle-wrapper">
      <div class="mode-toggle">
        <div
          class="toggle-slider"
          :class="{ 'toggle-slider--right': mode === 'word' }"
        ></div>
        <button
          type="button"
          class="toggle-option"
          :class="{ 'toggle-option--active': mode === 'zip' }"
          @click="switchMode('zip')"
        >
          ZIP 压缩包
        </button>
        <button
          type="button"
          class="toggle-option"
          :class="{ 'toggle-option--active': mode === 'word' }"
          @click="switchMode('word')"
        >
          Word 文件
        </button>
      </div>
    </div>

    <div class="home-grid">
      <!-- 上传区域 -->
      <section class="card upload-card">
        <div class="card-header">
          <h2 class="card-title">上传作业</h2>
        </div>

        <div class="card-body">
          <UploadArea
            :uploading="uploadStore.uploading"
            :progress="uploadStore.progress"
            :accept="acceptAttr"
            :multiple="mode === 'word'"
            :current-index="uploadStore.currentIndex"
            :total-count="uploadStore.totalCount"
            :placeholder="buildPlaceholder()"
            :hint="mode === 'zip' ? '仅接受 .zip 格式，单个文件' : '接受 .doc / .docx，可多选'"
            :completed-files="uploadedFileMetas"
            @upload="handleFilesReady"
          />
          <!-- 已上传时在区域外也提供"重新上传"入口 -->
          <div v-if="hasUploadedFiles" class="uploaded-actions">
            <button type="button" class="btn-text-danger" @click="clearUploaded">清空已上传，重新选择</button>
          </div>
          <div v-if="uploadError" class="error-text">{{ uploadError }}</div>
        </div>
      </section>

      <!-- 批阅参数 + 状态 -->
      <section class="card status-card">
        <div class="card-header">
          <h2 class="card-title">批阅参数</h2>
        </div>

        <div class="card-body">
          <el-form :model="gradeForm" label-position="top" class="grade-form">
            <el-form-item label="班级" required>
              <el-select v-model="gradeForm.classId" placeholder="请选择班级" filterable>
                <el-option
                  v-for="c in classList"
                  :key="c.id"
                  :label="c.className"
                  :value="String(c.id)"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="评分模板" required>
              <el-select v-model="gradeForm.standardConfigId" placeholder="请选择评分模板" filterable>
                <el-option
                  v-for="s in standardList"
                  :key="s.id"
                  :label="s.standardName"
                  :value="s.id!"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="任务类别" required>
              <el-select v-model="gradeForm.taskCategory" placeholder="请选择任务类别">
                <el-option label="作业" value="HOMEWORK" />
                <el-option label="期中" value="MIDTERM" />
                <el-option label="期末" value="FINAL" />
                <el-option label="项目" value="PROJECT" />
              </el-select>
            </el-form-item>
            <el-form-item label="任务频率" required>
              <el-input-number
                v-model="gradeForm.taskSequence"
                :min="1"
                :controls="false"
                placeholder="第几次"
                class="sequence-input"
              />
            </el-form-item>
          </el-form>

          <!-- 开始批阅按钮：必须先上传文件、填齐参数后才能点 -->
          <div class="start-grade-wrapper">
            <button
              type="button"
              class="btn btn-primary btn-block"
              :disabled="!canStartGrading || gradingStarting"
              @click="handleStartGrading"
            >
              {{ gradingStarting ? '启动批阅中...' : '开始批阅' }}
            </button>
            <p v-if="!hasUploadedFiles" class="start-grade-hint">请先在左侧上传文件</p>
          </div>

          <!-- 当前批阅状态（进度口径来自 GET /api/grading/task/detail/{taskId}） -->
          <div v-if="gradingStore.taskId" class="status-info">
            <div class="status-item">
              <span class="status-label">批阅任务 ID</span>
              <code class="status-value status-id">{{ gradingStore.taskId }}</code>
            </div>
            <div class="status-item">
              <span class="status-label">状态</span>
              <span :class="['status-badge', `status-badge--${taskStatusType}`]">{{ taskStatusLabel }}</span>
            </div>
            <div class="status-item">
              <span class="status-label">进度</span>
              <span class="status-value">
                {{ processedCount }} / {{ totalCount }}（{{ gradingStore.progressPercent }}%）
              </span>
            </div>

            <!-- 控制按钮：暂停 / 继续 / 取消 / 重试 -->
            <div v-if="gradingStore.gradingActive" class="control-actions">
              <button type="button" class="btn-control" @click="handlePause">暂停</button>
              <button type="button" class="btn-control btn-control--danger" @click="handleCancel">取消</button>
            </div>
            <div v-else class="control-actions">
              <button
                type="button"
                class="btn-control"
                :disabled="!canResume"
                @click="handleResume"
              >
                继续
              </button>
              <button
                v-if="canRetry"
                type="button"
                class="btn-control"
                @click="handleRetry"
              >
                重试任务
              </button>
            </div>

            <p v-if="taskErrorMessage" class="status-error">{{ taskErrorMessage }}</p>
          </div>

          <div v-else class="empty-state">
            <p class="empty-text">暂无批阅任务</p>
            <p class="empty-hint">填写参数并上传文件开始批阅</p>
          </div>
        </div>
      </section>
    </div>

    <!-- 批阅进度 -->
    <section v-if="gradingStore.task" class="card progress-card">
      <div class="card-header">
        <h2 class="card-title">批阅进度</h2>
      </div>
      <div class="card-body">
        <ProgressPanel
          :task="gradingStore.task"
          @refresh="gradingStore.fetchProgress()"
          @pause="handlePause"
          @resume="handleResume"
          @cancel="handleCancel"
          @retry="handleRetry"
        />
      </div>
    </section>

    <!-- 批阅结果 -->
    <!-- 接口预留：后端未提供批阅结果明细接口，此处仅展示表头与空态 -->
    <section v-if="gradingStore.task" class="card results-card">
      <div class="card-header">
        <h2 class="card-title">批阅结果</h2>
      </div>
      <div class="card-body">
        <ResultTable :loading="gradingStore.loading" />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import UploadArea from '@/components/UploadArea.vue';
import ProgressPanel from '@/components/ProgressPanel.vue';
import ResultTable from '@/components/ResultTable.vue';
import { useUploadStore } from '@/stores/upload';
import { useGradingStore } from '@/stores/grading';
import { getClassRecords } from '@/api/class';
import { getStandards } from '@/api/standard';
import type { ClassRecord } from '@/types/class';
import type { StandardConfig } from '@/types/standard';
import type { TaskCategory } from '@/types';
import { GradingTaskStatus, statusMap } from '@/types/history';

type UploadMode = 'zip' | 'word';
type FileMeta = { name: string; size: number };

const uploadStore = useUploadStore();
const gradingStore = useGradingStore();

// ==================== 模式 ====================
const mode = ref<UploadMode>('zip');
const acceptAttr = computed(() => (mode.value === 'zip' ? '.zip' : '.docx,.doc'));

function switchMode(target: UploadMode) {
  if (mode.value === target) return;
  mode.value = target;
  clearUploaded(); // 切换模式清空已上传缓存
  gradingStore.reset();
  uploadStore.reset();
}

// ==================== 下拉数据 ====================
const classList = ref<ClassRecord[]>([]);
const standardList = ref<StandardConfig[]>([]);

async function loadOptions() {
  try {
    const [classRes, stdRes] = await Promise.all([
      getClassRecords({ pageNum: 1, pageSize: 200, isAsc: true }),
      getStandards(),
    ]);
    classList.value = classRes.data.records || [];
    standardList.value = (stdRes.data || []).filter((s) => s.id !== undefined);
  } catch {
    // 错误由拦截器统一提示
  }
}

// ==================== 批阅参数 ====================
const gradeForm = reactive({
  classId: '',
  standardConfigId: undefined as number | undefined,
  taskCategory: undefined as TaskCategory | undefined,
  taskSequence: undefined as number | undefined,
});

const gradingStarting = ref(false);
const uploadError = computed(() => uploadStore.uploadError);

/** 已上传缓存：按模式保存 ZIP 单 id / WORD 多 id 与文件名 */
const uploadedZipId = ref<string | null>(null);
const uploadedWordIds = ref<string[]>([]);
const uploadedFileMetas = ref<FileMeta[]>([]);

const hasUploadedFiles = computed(() => {
  return mode.value === 'zip'
    ? !!uploadedZipId.value
    : uploadedWordIds.value.length > 0;
});

function buildPlaceholder(): string {
  if (uploadStore.uploading) return '上传中，请勿重复操作...';
  if (hasUploadedFiles.value) {
    return mode.value === 'zip'
      ? '已完成上传，可点击重新选择文件覆盖，或点击右侧开始批阅'
      : `已上传 ${uploadedWordIds.value.length} 个文件，可点击继续选择或点击右侧开始批阅`;
  }
  return mode.value === 'zip' ? '点击或拖拽上传 .zip 压缩包' : '点击或拖拽上传 Word 文件';
}

function clearUploaded() {
  uploadedZipId.value = null;
  uploadedWordIds.value = [];
  uploadedFileMetas.value = [];
  uploadStore.reset();
}

/** 是否可继续（任务仍在进行且尚有未批阅的学生） */
const canResume = computed(() => {
  const t = gradingStore.task;
  if (!t) return false;
  return t.studentCount > 0 && t.processedStudentCount < t.studentCount;
});

/** 仅失败 / 已过期的任务允许重发 */
const canRetry = computed(() => {
  const t = gradingStore.task;
  return !!t && (t.status === GradingTaskStatus.FAILED || t.status === GradingTaskStatus.EXPIRED);
});

const taskStatusLabel = computed(() => {
  const t = gradingStore.task;
  return t ? (statusMap[t.status]?.label ?? t.status) : '未开始';
});

/** statusMap 的 type 与 status-badge--* 修饰类同名（info / warning / success / danger） */
const taskStatusType = computed(() => {
  const t = gradingStore.task;
  return t ? (statusMap[t.status]?.type ?? 'info') : 'info';
});

const totalCount = computed(() => gradingStore.task?.studentCount ?? 0);
const processedCount = computed(() => gradingStore.task?.processedStudentCount ?? 0);
const taskErrorMessage = computed(() => gradingStore.task?.errorMessage ?? '');

function validateParams(): boolean {
  if (!gradeForm.classId) {
    ElMessage.warning('请选择班级');
    return false;
  }
  if (gradeForm.standardConfigId === undefined) {
    ElMessage.warning('请选择评分模板');
    return false;
  }
  if (!gradeForm.taskCategory) {
    ElMessage.warning('请选择任务类别');
    return false;
  }
  if (gradeForm.taskSequence === undefined || gradeForm.taskSequence < 1) {
    ElMessage.warning('请填写任务频率');
    return false;
  }
  return true;
}

/** 校验文件格式与所选模式一致性（只校验文件，不校验批阅参数） */
function validateFiles(files: File[]): boolean {
  if (mode.value === 'zip') {
    if (files.length !== 1) {
      ElMessage.error('ZIP 模式仅支持上传 1 个压缩包');
      return false;
    }
    if (!/\.zip$/i.test(files[0].name)) {
      ElMessage.error('请上传 .zip 格式的文件');
      return false;
    }
  } else {
    if (files.length === 0) {
      ElMessage.error('请至少选择一个 Word 文件');
      return false;
    }
    const invalid = files.find((f) => !/\.(docx|doc)$/i.test(f.name));
    if (invalid) {
      ElMessage.error(`文件 "${invalid.name}" 不是 Word 格式，仅支持 .doc / .docx`);
      return false;
    }
  }
  return true;
}

// ==================== 用户选择 / 拖拽文件就绪 → 立刻调上传接口（不批阅） ====================
async function handleFilesReady(files: File[]) {
  if (!validateFiles(files)) return;

  // 覆盖式上传：如果之前已上传，先清缓存（保留旧 gradingStore 状态不影响）
  clearUploaded();
  gradingStore.reset();

  // 保存本次文件名，等上传成功后展示
  const metas: FileMeta[] = files.map((f) => ({ name: f.name, size: f.size }));

  if (mode.value === 'zip') {
    const uploadId = await uploadStore.uploadZipOnly(files[0]);
    if (uploadId) {
      uploadedZipId.value = uploadId;
      uploadedFileMetas.value = metas;
      ElMessage.success('上传成功，请填写批阅参数并点击"开始批阅"');
    }
  } else {
    const ids = await uploadStore.uploadWordsOnly(files);
    if (ids && ids.length > 0) {
      uploadedWordIds.value = ids;
      uploadedFileMetas.value = metas;
      ElMessage.success(`已上传 ${ids.length} 个文件，请填写批阅参数并点击"开始批阅"`);
    }
  }
  // 上传失败时由响应拦截器统一提示错误文案
}

// ==================== 开始批阅：必须已上传 + 参数齐全 ====================
const canStartGrading = computed(() => hasUploadedFiles.value && !gradingStarting.value);

async function handleStartGrading() {
  if (!hasUploadedFiles.value) {
    ElMessage.warning('请先上传文件');
    return;
  }
  if (!validateParams()) return;

  const params = {
    classId: gradeForm.classId,
    standardConfigId: gradeForm.standardConfigId!,
    taskCategory: gradeForm.taskCategory!,
    taskSequence: gradeForm.taskSequence!,
  };

  gradingStarting.value = true;
  try {
    let taskId: string | null = null;
    if (mode.value === 'zip' && uploadedZipId.value) {
      taskId = await uploadStore.startZipGrading(uploadedZipId.value, params);
    } else if (mode.value === 'word' && uploadedWordIds.value.length > 0) {
      taskId = await uploadStore.startWordGrading(uploadedWordIds.value, params);
    }
    if (taskId) {
      ElMessage.success('批阅已启动');
      gradingStore.setTaskId(taskId);
      gradingStore.fetchProgress();
      gradingStore.startPolling(2000);
    }
    // 启动失败由拦截器提示
  } finally {
    gradingStarting.value = false;
  }
}

// ==================== 暂停 / 继续 / 取消 ====================
async function handlePause() {
  const ok = await gradingStore.pause();
  if (ok) ElMessage.success('已暂停批阅');
}

async function handleResume() {
  const ok = await gradingStore.resume();
  if (ok) ElMessage.success('已继续批阅');
}

async function handleCancel() {
  const ok = await gradingStore.cancel();
  if (ok) {
    ElMessage.success('已取消批阅');
  }
}

// 重试任务（后端 POST /api/grading/retry）
async function handleRetry() {
  const ok = await gradingStore.retry();
  if (ok) ElMessage.success('已重新发起批阅任务');
}

// ==================== 生命周期 ====================
onMounted(() => {
  loadOptions();
});
</script>

<style scoped>
.home-view {
  max-width: 1280px;
  margin: 0 auto;
  padding: 40px 32px;
}

.page-header {
  margin-bottom: 24px;
}

.page-title {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px 0;
  letter-spacing: -0.3px;
}

.page-subtitle {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
}

/* ==================== 模式滑块 ==================== */
.mode-toggle-wrapper {
  margin-bottom: 24px;
}

.mode-toggle {
  position: relative;
  display: inline-flex;
  width: 280px;
  height: 40px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 4px;
  box-sizing: border-box;
  overflow: hidden;
}

.toggle-slider {
  position: absolute;
  top: 4px;
  left: 4px;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  background: var(--text-primary);
  border-radius: calc(var(--radius-md) - 2px);
  box-shadow: 0 1px 3px rgba(28, 25, 23, 0.12);
  transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 0;
}

.toggle-slider--right {
  transform: translateX(100%);
}

.toggle-option {
  flex: 1;
  position: relative;
  z-index: 1;
  background: transparent;
  border: none;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.28s ease;
  font-family: inherit;
}

.toggle-option--active {
  color: var(--bg-surface);
  font-weight: 600;
}

/* ==================== Grid ==================== */
.home-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

/* Card 基础样式 */
.card {
  background: var(--bg-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-default);
  overflow: hidden;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px 0;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.card-body {
  padding: 20px 24px 24px;
}

.upload-card {
  min-height: 320px;
}

.status-card {
  min-height: 320px;
}

/* ==================== 已上传操作区（UploadArea 下方） ==================== */
.uploaded-actions {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}
.btn-text-danger {
  background: transparent;
  border: none;
  color: var(--status-danger);
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  transition: background var(--transition);
}
.btn-text-danger:hover {
  background: var(--status-danger-bg);
}

/* ==================== 开始批阅按钮 ==================== */
.start-grade-wrapper {
  margin-top: 4px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.btn-block {
  width: 100%;
  justify-content: center;
  height: 42px !important;
  font-size: 14px !important;
  font-weight: 600 !important;
  letter-spacing: 0.02em;
}
.start-grade-hint {
  margin: 0;
  font-size: 12px;
  color: var(--status-warning);
  text-align: center;
}

/* ==================== 表单 ==================== */
.grade-form :deep(.el-form-item) {
  margin-bottom: 16px;
}

.grade-form :deep(.el-form-item__label) {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  padding-bottom: 6px;
  line-height: 1.4;
}

.grade-form :deep(.el-select),
.grade-form :deep(.el-input-number) {
  width: 100%;
}

.grade-form :deep(.el-select__wrapper),
.grade-form :deep(.el-input__wrapper) {
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  box-shadow: 0 0 0 1px var(--border-default) inset;
  transition: box-shadow var(--transition);
}

.grade-form :deep(.el-select__wrapper.is-focused),
.grade-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--border-strong) inset !important;
}

.grade-form :deep(.el-select__wrapper:hover),
.grade-form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--border-strong) inset;
}

.grade-form :deep(.el-input__inner) {
  font-size: 13px;
  color: var(--text-primary);
}

.sequence-input :deep(.el-input__inner) {
  text-align: left;
}

/* ==================== 状态信息 ==================== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
  text-align: center;
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin: 0 0 4px 0;
}

.empty-hint {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
}

.status-info {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  margin-top: 4px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.status-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.status-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.status-id {
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  background: var(--bg-subtle);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
}

.status-badge {
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: var(--radius-sm);
}

.status-badge--warning {
  background: var(--status-warning-bg);
  color: var(--status-warning);
}

.status-badge--success {
  background: var(--status-success-bg);
  color: var(--status-success);
}

.status-badge--danger {
  background: var(--status-danger-bg);
  color: var(--status-danger);
}

.status-badge--info {
  background: var(--status-info-bg);
  color: var(--status-info);
}

.status-error {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--status-danger);
  background: var(--status-danger-bg);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  word-break: break-all;
}

/* ==================== 控制按钮 ==================== */
.control-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.btn-control {
  flex: 1;
  height: 32px;
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  color: var(--text-secondary);
  transition: background var(--transition), border-color var(--transition), color var(--transition);
  font-family: inherit;
}

.btn-control:hover:not(:disabled) {
  background: var(--bg-muted);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.btn-control:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-control--danger:hover:not(:disabled) {
  background: var(--status-danger-bg);
  border-color: var(--status-danger);
  color: var(--status-danger);
}

.error-text {
  margin-top: 12px;
  color: var(--status-danger);
  font-size: 13px;
}

/* Progress & Results Cards */
.progress-card,
.results-card {
  margin-bottom: 20px;
}

/* 响应式 */
@media (max-width: 1024px) {
  .home-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .home-view {
    padding: 24px 16px;
  }

  .page-title {
    font-size: 20px;
  }

  .card-header {
    padding: 16px 16px 0;
  }

  .card-body {
    padding: 16px;
  }

  .mode-toggle {
    width: 100%;
  }
}
</style>
