<script setup lang="ts">
/**
 * 作业智能批改（教师端批阅任务控制台）
 *
 * 真实能力：
 * - 任务列表：GET /api/grading/task/zipList、GET /api/grading/task/fileList
 * - 任务详情与进度：GET /api/grading/task/detail/{taskId}（studentCount / processedStudentCount / status）
 * - 任务控制：POST /api/grading/pause | resume | cancel | retry（统一走 useGradingStore）
 * - 关联作业：GET /api/teach/homework/list
 *
 * 接口预留：后端未提供按批阅任务查询各学生得分明细的接口，
 * 因此"逐份提交与 AI 评分明细"仅为 UI 骨架，不发请求、不做复核写库。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  Bot,
  FileClock,
  FolderSearch,
  Link2,
  Loader2,
  RefreshCw,
  Table2,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { getFileTaskList, getZipTaskList } from '@/api/history';
import { fetchPublishedHomeworks } from '@/api/teacher';
import { useGradingStore } from '@/stores/grading';
import ProgressPanel from '@/components/ProgressPanel.vue';
import type { PublishedHomework } from '@/types/teacher';
import type { GradingTask, TaskQuery } from '@/types/history';
import { categoryMap, FileType, statusMap } from '@/types/history';

const grading = useGradingStore();

/** 任务来源：ZIP 压缩包批阅 / Word 文件批阅 */
const source = ref<'zip' | 'word'>('zip');
const tasks = ref<GradingTask[]>([]);
/** 下拉选中值（与 store 的 taskId 单向同步，避免 store 的 null 进入 el-select） */
const selectedTaskId = ref<string>('');
const homeworks = ref<PublishedHomework[]>([]);
const selectedHomeworkId = ref<number | null>(null);
const listLoading = ref(false);
const autoPoll = ref(true);

const SOURCE_OPTIONS = [
  { value: 'zip', label: 'ZIP 批阅任务' },
  { value: 'word', label: 'Word 批阅任务' },
] as const;

const selectedHomework = computed(
  () => homeworks.value.find((h) => h.id === selectedHomeworkId.value) ?? null,
);

const taskStatus = computed(() => {
  const t = grading.task;
  return t ? (statusMap[t.status] ?? { label: t.status, type: 'info' }) : null;
});

const categoryLabel = computed(() => {
  const t = grading.task;
  if (!t) return '—';
  return categoryMap[t.taskCategory] ?? String(t.taskCategory ?? '—');
});

const sourceLabel = computed(() => {
  const t = grading.task;
  if (!t) return '—';
  return t.fileType === FileType.ZIP ? 'ZIP 压缩包' : 'Word 文件';
});

function fmt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ==================== 任务列表 ====================
async function loadTasks() {
  listLoading.value = true;
  try {
    const query: TaskQuery = { page: 1, size: 50, sortOrder: 'desc' };
    const res = source.value === 'zip' ? await getZipTaskList(query) : await getFileTaskList(query);
    tasks.value = res.data?.records ?? [];
    if (tasks.value.length === 0) {
      grading.reset();
      selectedTaskId.value = '';
      return;
    }
    // 默认选中第一条并接管进度轮询
    selectTask(tasks.value[0].id);
  } catch {
    // 错误由响应拦截器统一提示
  } finally {
    listLoading.value = false;
  }
}

/** 切换任务：写入 store 的 taskId，拉一次进度后按需开启轮询 */
function selectTask(taskId: string) {
  selectedTaskId.value = taskId;
  grading.setTaskId(taskId);
  grading.fetchProgress();
  if (autoPoll.value) grading.startPolling(2000);
  else grading.stopPolling();
}

function onTaskChange(id: string) {
  selectTask(id);
}

/** 切换任务来源：先改 source 再按新来源重新拉列表 */
function switchSource(value: 'zip' | 'word') {
  if (source.value === value) return;
  source.value = value;
  loadTasks();
}

function onPollChange(value: boolean) {
  if (value) grading.startPolling(2000);
  else grading.stopPolling();
}

// ==================== 任务控制 ====================
async function handlePause() {
  if (await grading.pause()) ElMessage.success('已暂停批阅');
}

async function handleResume() {
  if (await grading.resume()) ElMessage.success('已继续批阅');
}

async function handleCancel() {
  if (await grading.cancel()) ElMessage.success('已取消批阅');
}

async function handleRetry() {
  if (await grading.retry()) ElMessage.success('已重新发起批阅');
}

async function handleRefresh() {
  await grading.fetchProgress();
  ElMessage.success('进度已刷新');
}

onMounted(async () => {
  try {
    homeworks.value = await fetchPublishedHomeworks();
    if (homeworks.value.length) selectedHomeworkId.value = homeworks.value[0].id;
  } catch {
    // 错误由响应拦截器统一提示
  }
  await loadTasks();
});

onBeforeUnmount(() => {
  grading.stopPolling();
});

watch(autoPoll, onPollChange);
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">作业智能批改</h1>
      <p class="st-page-subtitle">批阅任务控制台 · 查看批改进度并执行暂停、继续、取消、重试</p>
    </header>

    <!-- 任务选择栏 -->
    <div class="st-card">
      <div class="st-card__body toolbar-row">
        <div class="st-seg">
          <div
            class="st-seg__slider"
            :style="{
              left: `calc(${SOURCE_OPTIONS.findIndex((o) => o.value === source)} * 50% + 3px)`,
              width: 'calc(50% - 4px)',
            }"
          ></div>
          <button
            v-for="o in SOURCE_OPTIONS"
            :key="o.value"
            class="st-seg__option"
            style="flex: 1;"
            :class="{ 'st-seg__option--active': source === o.value }"
            @click="switchSource(o.value)"
          >
            {{ o.label }}
          </button>
        </div>

        <el-select
          v-model="selectedTaskId"
          placeholder="选择批阅任务"
          filterable
          style="width: 320px;"
          :loading="listLoading"
          @change="onTaskChange"
        >
          <el-option
            v-for="t in tasks"
            :key="t.id"
            :label="`${t.fileName || t.id}（${t.processedStudentCount}/${t.studentCount}）`"
            :value="t.id"
          />
        </el-select>

        <button class="st-btn st-btn--secondary" :disabled="listLoading" @click="loadTasks">
          <RefreshCw v-if="listLoading" :size="13" class="spin" />
          <FolderSearch v-else :size="13" />
          重新加载任务
        </button>

        <label class="poll-switch">
          <el-switch v-model="autoPoll" />
          <span>自动轮询进度</span>
        </label>
      </div>
    </div>

    <div v-if="listLoading && tasks.length === 0" class="st-card" style="margin-top: 20px;">
      <div class="st-card__body st-empty" style="padding: 70px;">
        <Loader2 :size="24" class="spin" />
        <div class="st-empty__text">正在加载批阅任务…</div>
      </div>
    </div>

    <div v-else-if="tasks.length === 0" class="st-card" style="margin-top: 20px;">
      <div class="st-card__body st-empty" style="padding: 70px;">
        <FileClock :size="40" :stroke-width="1.2" class="st-empty__icon" />
        <div class="st-empty__text">暂无批阅任务，请先在「开始批阅」页上传文件并启动批阅</div>
      </div>
    </div>

    <template v-else>
      <!-- 批阅进度与控制（数据来自 GET /api/grading/task/detail/{taskId}） -->
      <section class="st-card" style="margin-top: 20px;">
        <div class="st-card__body">
          <ProgressPanel
            :task="grading.task"
            @refresh="handleRefresh"
            @pause="handlePause"
            @resume="handleResume"
            @cancel="handleCancel"
            @retry="handleRetry"
          />
        </div>
      </section>

      <div v-if="grading.error" class="st-card error-card" style="margin-top: 20px;">
        <div class="st-card__body">{{ grading.error }}</div>
      </div>

      <div class="report-grid" style="margin-top: 20px;">
        <!-- 任务元信息 -->
        <section class="st-card">
          <div class="st-card__header">
            <FileClock :size="16" class="card-icon" />
            <div>
              <h2 class="st-card__title">任务信息</h2>
              <p class="st-card__hint">来源：任务详情接口字段</p>
            </div>
            <span
              v-if="taskStatus"
              class="st-badge"
              :class="`st-badge--${taskStatus.type}`"
              style="margin-left: auto;"
            >
              <Loader2 v-if="grading.gradingActive" :size="11" class="spin" />
              {{ taskStatus.label }}
            </span>
          </div>
          <div class="st-card__body">
            <dl class="meta-list">
              <div class="meta-row"><dt>任务 ID</dt><dd><code>{{ grading.task?.id ?? '—' }}</code></dd></div>
              <div class="meta-row"><dt>文件名称</dt><dd>{{ grading.task?.fileName ?? '—' }}</dd></div>
              <div class="meta-row"><dt>文件类型</dt><dd>{{ sourceLabel }}</dd></div>
              <div class="meta-row"><dt>任务类别</dt><dd>{{ categoryLabel }}<template v-if="grading.task"> · 第 {{ grading.task.taskSequence }} 次</template></dd></div>
              <div class="meta-row"><dt>班级 / 学期</dt><dd>{{ grading.task?.classId || '—' }} · {{ grading.task?.semester || '—' }}</dd></div>
              <div class="meta-row"><dt>评分模板</dt><dd>{{ grading.task?.rubricId ?? '—' }}</dd></div>
              <div class="meta-row"><dt>已重试次数</dt><dd>{{ grading.task?.retryCount ?? 0 }}</dd></div>
              <div class="meta-row"><dt>开始时间</dt><dd>{{ fmt(grading.task?.createTime ?? '') }}</dd></div>
              <div class="meta-row"><dt>结束时间</dt><dd>{{ fmt(grading.task?.finishTime ?? '') }}</dd></div>
            </dl>
          </div>
        </section>

        <!-- 关联作业 -->
        <section class="st-card">
          <div class="st-card__header">
            <Link2 :size="16" class="card-icon" />
            <div>
              <h2 class="st-card__title">关联作业</h2>
              <p class="st-card__hint">GET /api/teach/homework/list · 仅作布置内容对照</p>
            </div>
          </div>
          <div class="st-card__body">
            <el-select v-model="selectedHomeworkId" placeholder="选择已发布作业" clearable style="width: 100%;">
              <el-option v-for="h in homeworks" :key="h.id" :label="h.title" :value="h.id" />
            </el-select>
            <div v-if="selectedHomework" class="hw-detail">
              <div class="hw-detail__row">
                <span class="st-badge st-badge--outline">ID {{ selectedHomework.id }}</span>
                <span class="hw-detail__time">截止 {{ fmt(selectedHomework.deadline) }}</span>
              </div>
              <div class="hw-detail__content">{{ selectedHomework.content }}</div>
            </div>
            <div v-else class="st-empty" style="padding: 32px 16px;">
              <div class="st-empty__text">未选择作业，批阅任务与作业在后端无直接关联字段</div>
            </div>
          </div>
        </section>
      </div>

      <!-- 逐份提交与 AI 评分明细：UI 骨架 -->
      <section class="st-card" style="margin-top: 20px;">
        <div class="st-card__header">
          <Table2 :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">逐份提交与 AI 评分明细</h2>
            <p class="st-card__hint">
              接口预留：后端未提供按批阅任务查询各学生得分明细的接口
            </p>
          </div>
          <span class="st-badge st-badge--neutral shell-badge"><Bot :size="11" /> UI 骨架</span>
        </div>
        <div class="st-card__body">
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>学生</th>
                  <th>班级</th>
                  <th>批阅任务</th>
                  <th>提交状态</th>
                  <th>AI 得分</th>
                  <th>最终得分</th>
                  <th>AI 评语</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="8">
                    <div class="st-empty" style="padding: 60px 16px;">
                      <Table2 :size="34" :stroke-width="1.2" class="st-empty__icon" />
                      <div class="st-empty__text">暂无明细数据</div>
                      <div class="shell-note">
                        待后端补充"按 taskId 查询各学生批阅结果"接口后，此处接分数、评语与教师复核操作；
                        当前页面不发起请求，也不做评分写库。
                      </div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>
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
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.poll-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
}

.error-card {
  border-color: var(--status-danger);
  background: var(--status-danger-bg);
  font-size: 13px;
  color: var(--status-danger);
}

.report-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 960px) {
  .report-grid {
    grid-template-columns: 1fr;
  }
}

/* 任务元信息 */
.meta-list {
  margin: 0;
  display: flex;
  flex-direction: column;
}

.meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 9px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.meta-row:last-child {
  border-bottom: none;
}

.meta-row dt {
  font-size: 12.5px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.meta-row dd {
  margin: 0;
  font-size: 13px;
  color: var(--text-primary);
  text-align: right;
  word-break: break-all;
}

.meta-row dd code {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  padding: 1px 8px;
}

/* 关联作业 */
.hw-detail {
  margin-top: 14px;
  padding: 12px 14px;
  background: var(--bg-subtle);
  border-radius: var(--radius-md);
}

.hw-detail__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hw-detail__time {
  font-size: 12px;
  color: var(--text-tertiary);
}

.hw-detail__content {
  font-size: 12.5px;
  color: var(--text-secondary);
  line-height: 1.65;
  margin-top: 8px;
  white-space: pre-wrap;
  max-height: 180px;
  overflow-y: auto;
}

/* 明细表骨架 */
.shell-badge {
  margin-left: auto;
  flex-shrink: 0;
}

.table-wrapper {
  overflow-x: auto;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th,
.data-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
}

.data-table th {
  background: var(--bg-subtle);
  font-weight: 500;
  color: var(--text-secondary);
  font-size: 12px;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.shell-note {
  font-size: 11.5px;
  color: var(--text-tertiary);
  line-height: 1.7;
  max-width: 560px;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
