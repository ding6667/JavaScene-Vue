<script setup lang="ts">
/**
 * 我的作业 —— 学生本人的作业清单
 *
 * 已对接：
 *   GET /api/exam/homework/my-list              作业列表（status 2=已发布 / 3=已截止，不传=2+3）
 *   GET /api/knowledge/chapter/list             章节下拉
 *   GET /api/exam/grading/result/{homeworkId}   批改结果（只在 gradingStatus=1 已批改时查）
 *
 * 口径（与后端《我的作业列表》约定一致）：
 *   - classId / grade 一律不传：后端用 UserApi.getUserById 从 sys_student_info 取当前学生的
 *     班级与年级，传了也不生效（防止越权查别班作业）
 *   - 「未完成」tab 后端没有对应参数，只能拿当页 records 前端过滤（没交 或 还没批改完）
 *   - expired / canSubmit 都以接口字段为准，前端不自己拿 deadline 判是否截止
 *
 * 作答页是独立页面（/student/homework/solve/:homeworkId，挂在 StandaloneLayout 下，
 * 新标签页打开、无侧边栏），本页只负责入口；作业草稿没有接口，答案在作答页内存里保留到最后一次提交。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowLeft,
  BookOpen,
  CheckCheck,
  CircleAlert,
  ClipboardList,
  Clock,
  Loader2,
  RotateCcw,
  Send,
  Timer,
} from 'lucide-vue-next';
import { fetchMyHomeworks, fetchHomeworkGradingResult } from '@/api/exam';
import ChapterSelect from '@/components/ChapterSelect.vue';
import { useChapters } from '@/composables/useChapters';
import type { HomeworkGradingResult, StudentHomeworkItem } from '@/types/exam';

type TabKey = 'all' | 'undone' | 'expired';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'undone', label: '未完成' },
  { key: 'expired', label: '已截止' },
];

const PAGE_SIZES = [10, 20, 50];
const GRADING_LABELS = ['待批改', '批改完成', '批改失败'];

const router = useRouter();

function describeError(what: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return /未实现/.test(msg) ? `${what}暂未开放` : `${what}失败：${msg}`;
}

// ==================== 筛选与列表 ====================
/** 章节下拉数据统一走 useChapters（<ChapterSelect> 内部也会加载） */
const { load: loadChapters } = useChapters();
const activeTab = ref<TabKey>('all');

const filters = reactive({
  chapterId: 0,
  onlyNotExpired: false,
  pageNum: 1,
  pageSize: 10,
});

const records = ref<StudentHomeworkItem[]>([]);
const total = ref<number | null>(null);
const loading = ref(false);
const listError = ref<string | null>(null);
/** 当前选中的作业（右侧详情用）；列表刷新后若还在就保持选中 */
const selectedId = ref<number | null>(null);

/** 「未完成」只在当页过滤，后端没有这个筛选参数 */
const visibleRecords = computed(() => {
  if (activeTab.value !== 'undone') return records.value;
  return records.value.filter((h) => !h.submitted || h.gradingStatus === 0);
});

const pageCount = computed(() => {
  const t = total.value;
  if (t === null || t <= 0) return 0;
  return Math.max(1, Math.ceil(t / filters.pageSize));
});

async function loadList() {
  loading.value = true;
  listError.value = null;
  try {
    const page = await fetchMyHomeworks({
      // 已截止 tab 走 status=3；其余（全部 / 未完成）不传，拿 2+3
      status: activeTab.value === 'expired' ? 3 : undefined,
      chapterId: filters.chapterId || undefined,
      onlyNotExpired: filters.onlyNotExpired || undefined,
      pageNum: filters.pageNum,
      pageSize: filters.pageSize,
    });
    records.value = Array.isArray(page?.records) ? page.records : [];
    total.value = Number(page?.total ?? records.value.length);
    // 选中项默认落在第一条，翻页/换筛选后同理；找不到就清空右侧面板
    if (!records.value.some((h) => h.homeworkId === selectedId.value)) {
      selectedId.value = records.value[0]?.homeworkId ?? null;
    }
  } catch (e) {
    records.value = [];
    total.value = null;
    listError.value = describeError('作业列表加载', e);
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  filters.pageNum = 1;
  void loadList();
}

function switchTab(key: TabKey) {
  if (activeTab.value === key) return;
  activeTab.value = key;
  filters.pageNum = 1;
  void loadList();
}

function goPage(next: number) {
  const max = pageCount.value || 1;
  if (next < 1 || next > max || next === filters.pageNum) return;
  filters.pageNum = next;
  void loadList();
}

// ==================== 选中项与批改结果 ====================
const selected = computed(
  () => records.value.find((h) => h.homeworkId === selectedId.value) ?? null,
);

const grading = ref<HomeworkGradingResult | null>(null);
const gradingLoading = ref(false);
const gradingError = ref<string | null>(null);

/**
 * 只有「已批改完成」才去查明细：其余状态下后端没有结果，查了只会多一次 404/403。
 */
async function loadGrading(force = false) {
  const h = selected.value;
  grading.value = null;
  gradingError.value = null;
  if (!h || h.gradingStatus !== 1) return;
  if (gradingLoading.value && !force) return;
  gradingLoading.value = true;
  try {
    grading.value = await fetchHomeworkGradingResult(h.homeworkId);
  } catch (e) {
    gradingError.value = describeError('批改结果加载', e);
  } finally {
    gradingLoading.value = false;
  }
}

watch(selected, () => {
  void loadGrading();
});

function select(h: StudentHomeworkItem) {
  selectedId.value = h.homeworkId;
}

// ==================== 展示口径 ====================
/** 后端给 2026-11-01T23:59:59，统一展示成 2026-11-01 23:59 */
function formatDateTime(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '—';
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : text;
}

/** 截止倒计时；是否过期一律以后端 expired 为准，这里只负责「还剩多久」的观感 */
function countdownText(h: StudentHomeworkItem): string {
  if (h.expired) return '';
  const at = Date.parse(String(h.deadline ?? ''));
  if (!Number.isFinite(at)) return '';
  const diff = at - Date.now();
  if (diff <= 0) return '';
  const day = Math.floor(diff / 86400000);
  if (day >= 1) return `剩 ${day} 天`;
  const hour = Math.floor(diff / 3600000);
  if (hour >= 1) return `剩 ${hour} 小时`;
  return `剩 ${Math.max(1, Math.floor(diff / 60000))} 分钟`;
}

function chapterLabel(h: StudentHomeworkItem): string {
  const name = String(h.chapterName ?? '').trim();
  if (name) return name;
  return h.chapterId ? `章节 ${h.chapterId}` : '未关联章节';
}

function statusLabel(h: StudentHomeworkItem): string {
  return h.statusName || (h.status === 3 || h.expired ? '已截止' : '已发布');
}

function statusBadge(h: StudentHomeworkItem): string {
  return h.status === 3 || h.expired ? 'st-badge--neutral' : 'st-badge--info';
}

function gradingLabel(h: StudentHomeworkItem): string {
  return h.gradingStatusName || GRADING_LABELS[h.gradingStatus] || '—';
}

function gradingBadge(h: StudentHomeworkItem): string {
  if (h.gradingStatus === 1) return 'st-badge--success';
  if (h.gradingStatus === 2) return 'st-badge--danger';
  return 'st-badge--warning';
}

/**
 * 卡片/详情上的「提交-批改」合并状态。
 * 没交过的作业 gradingStatus 也是 0（待批改），直接渲染会误导成「已交等批改」，
 * 所以未提交优先显示「未提交」。
 */
function stateLabel(h: StudentHomeworkItem): string {
  return h.submitted ? gradingLabel(h) : '未提交';
}

function stateBadge(h: StudentHomeworkItem): string {
  return h.submitted ? gradingBadge(h) : 'st-badge--neutral';
}

function scoreText(h: StudentHomeworkItem): string {
  if (h.studentScore === null || h.studentScore === undefined) return '—';
  return `${h.studentScore} / ${h.totalScore}`;
}

function progressPercent(h: StudentHomeworkItem): number {
  const done = Number(h.submittedQuestionCount) || 0;
  const all = Number(h.questionCount) || 0;
  if (all <= 0) return h.submitted ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((done / all) * 100)));
}

/** 作答页地址：优先用路由名解析，路由表异常时按路径手工兜底 */
function solveHref(id: number): string {
  const raw = String(id);
  try {
    return router.resolve({ name: 'StudentHomeworkSolve', params: { homeworkId: raw } }).href;
  } catch {
    return `/student/homework/solve/${encodeURIComponent(raw)}`;
  }
}

/**
 * 进入作答：新标签页打开独立作答页（用户点击触发的 window.open，不会被拦截）。
 *
 * 已截止也允许进入：作答页会回填已保存的草稿 / 已交内容，只是交卷按钮禁用。
 * 不能再拿 canSubmit 当入口条件，否则学生连自己写过的东西都看不到。
 */
function enterHomework(h: StudentHomeworkItem) {
  window.open(solveHref(h.homeworkId), '_blank', 'noopener');
}

onMounted(async () => {
  void loadChapters();
  await loadList();
});
</script>

<template>
  <div class="st-view">
    <div class="detail-topbar">
      <button class="st-text-btn" @click="router.push('/student/dashboard')">
        <ArrowLeft :size="14" style="margin-right: 4px;" /> 返回仪表盘
      </button>
    </div>

    <header class="st-page-header">
      <h1 class="st-page-title">我的作业</h1>
      <p class="st-page-subtitle">老师布置的作业、我的提交进度与智能批改结果</p>
    </header>

    <!-- ==================== 筛选栏 ==================== -->
    <div class="st-card filter-card">
      <div class="st-card__body">
        <div class="filter-row">
          <div class="hw-tabs">
            <button
              v-for="t in TABS"
              :key="t.key"
              type="button"
              class="hw-tab"
              :class="{ 'hw-tab--active': activeTab === t.key }"
              @click="switchTab(t.key)"
            >
              {{ t.label }}
            </button>
          </div>

          <div class="filter-fields">
            <ChapterSelect v-model="filters.chapterId" allow-all class="filter-select" @change="applyFilters" />

            <label class="filter-switch">
              <el-switch v-model="filters.onlyNotExpired" @change="applyFilters" />
              <span>只看未过期</span>
            </label>

            <el-select v-model="filters.pageSize" class="filter-select filter-select--size" @change="applyFilters">
              <el-option v-for="s in PAGE_SIZES" :key="s" :label="`${s} 条/页`" :value="s" />
            </el-select>

            <button class="st-btn st-btn--secondary" :disabled="loading" @click="loadList">
              <Loader2 v-if="loading" :size="14" class="spin" />
              <RotateCcw v-else :size="13" />
              刷新
            </button>
          </div>
        </div>

        <p v-if="activeTab === 'undone'" class="filter-note">
          这里只显示当前页中未提交、或还没批改完的作业。
        </p>
      </div>
    </div>

    <!-- ==================== 列表 + 详情 ==================== -->
    <div class="hw-layout">
      <section class="st-card hw-list-card">
        <div class="st-card__header">
          <ClipboardList :size="15" class="card-icon" />
          <div>
            <h2 class="st-card__title">作业列表</h2>
          </div>
          <span class="list-count">共 {{ total === null ? '—' : total }} 份</span>
        </div>

        <div class="st-card__body" style="padding-top: 12px;">
          <div v-if="loading" class="st-empty">
            <Loader2 :size="30" :stroke-width="1.4" class="st-empty__icon spin" />
            <div class="st-empty__text">作业加载中…</div>
          </div>

          <div v-else-if="listError" class="st-empty">
            <CircleAlert :size="32" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">{{ listError }}</div>
            <button class="st-btn st-btn--secondary" @click="loadList">重新加载</button>
          </div>

          <div v-else-if="visibleRecords.length === 0" class="st-empty">
            <ClipboardList :size="32" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">
              {{ activeTab === 'undone' ? '当前页没有未完成的作业，试试翻页或看「全部」' : '暂无作业' }}
            </div>
            <button class="st-btn st-btn--secondary" @click="loadList">重新加载</button>
          </div>

          <div v-else class="hw-list">
            <button
              v-for="h in visibleRecords"
              :key="h.homeworkId"
              type="button"
              class="hw-card"
              :class="{ 'hw-card--active': h.homeworkId === selectedId }"
              @click="select(h)"
            >
              <div class="hw-card__top">
                <h3 class="hw-card__title">{{ h.title || `作业 ${h.homeworkId}` }}</h3>
                <span class="st-badge" :class="statusBadge(h)">{{ statusLabel(h) }}</span>
              </div>

              <p v-if="h.content" class="hw-card__content">{{ h.content }}</p>

              <div class="hw-card__meta">
                <span class="hw-card__meta-item">
                  <BookOpen :size="12" /> {{ chapterLabel(h) }}
                </span>
                <span class="hw-card__meta-item">
                  {{ h.questionCount }} 题 · {{ h.totalScore }} 分
                </span>
                <span class="hw-card__meta-item">
                  <Clock :size="12" /> 截止 {{ formatDateTime(h.deadline) }}
                  <em v-if="countdownText(h)" class="hw-card__countdown">{{ countdownText(h) }}</em>
                </span>
              </div>

              <div class="hw-card__foot">
                <div class="hw-progress">
                  <span class="hw-progress__bar">
                    <i :style="{ width: `${progressPercent(h)}%` }"></i>
                  </span>
                  <span class="hw-progress__text">
                    已交 {{ h.submittedQuestionCount }}/{{ h.questionCount }} 题
                  </span>
                </div>
                <div class="hw-card__state">
                  <span class="st-badge" :class="stateBadge(h)">{{ stateLabel(h) }}</span>
                  <span v-if="h.studentScore !== null && h.studentScore !== undefined" class="hw-card__score">
                    {{ scoreText(h) }}
                  </span>
                </div>
              </div>
            </button>
          </div>

          <div v-if="!loading && pageCount > 0" class="hw-pager">
            <button class="st-text-btn" :disabled="filters.pageNum <= 1" @click="goPage(filters.pageNum - 1)">
              上一页
            </button>
            <span class="hw-pager__info">第 {{ filters.pageNum }} / {{ pageCount }} 页</span>
            <button class="st-text-btn" :disabled="filters.pageNum >= pageCount" @click="goPage(filters.pageNum + 1)">
              下一页
            </button>
          </div>
        </div>
      </section>

      <!-- 右侧：作业详情 + 批改结果 -->
      <aside class="st-card hw-side">
        <template v-if="selected">
          <div class="side-head">
            <span class="side-head__icon">
              <ClipboardList :size="15" />
            </span>
            <div class="side-head__meta">
              <h2 class="side-head__title">{{ selected.title || `作业 ${selected.homeworkId}` }}</h2>
              <p class="side-head__sub">{{ chapterLabel(selected) }}</p>
            </div>
            <span class="st-badge" :class="statusBadge(selected)">{{ statusLabel(selected) }}</span>
          </div>

          <div class="hw-side__body">
            <div class="side-meta">
              <div class="side-meta__cell">
                <span class="side-meta__label">题量</span>
                <span class="side-meta__value">{{ selected.questionCount }} 题</span>
              </div>
              <div class="side-meta__cell">
                <span class="side-meta__label">总分</span>
                <span class="side-meta__value">{{ selected.totalScore }} 分</span>
              </div>
              <div class="side-meta__cell">
                <span class="side-meta__label">我的得分</span>
                <span class="side-meta__value">{{ scoreText(selected) }}</span>
              </div>
              <div class="side-meta__cell">
                <span class="side-meta__label">批改状态</span>
                <span class="side-meta__value">
                  <span class="st-badge" :class="stateBadge(selected)">{{ stateLabel(selected) }}</span>
                </span>
              </div>
            </div>

            <section class="side-section">
              <div class="side-section__head">作业说明</div>
              <p class="side-text">{{ selected.content || '老师未填写作业说明' }}</p>
            </section>

            <section class="side-section">
              <div class="side-section__head">时间与提交</div>
              <ul class="info-list">
                <li>
                  <span class="info-list__label">发布</span>
                  <span class="info-list__value">{{ formatDateTime(selected.publishTime) }}</span>
                </li>
                <li>
                  <span class="info-list__label">截止</span>
                  <span class="info-list__value">
                    {{ formatDateTime(selected.deadline) }}
                    <em v-if="countdownText(selected)" class="info-list__accent">{{ countdownText(selected) }}</em>
                    <em v-else-if="selected.expired" class="info-list__muted">已截止</em>
                  </span>
                </li>
                <li>
                  <span class="info-list__label">逾期提交</span>
                  <span class="info-list__value">{{ selected.allowLateSubmit ? '允许' : '不允许' }}</span>
                </li>
                <li>
                  <span class="info-list__label">最近提交</span>
                  <span class="info-list__value">{{ formatDateTime(selected.lastSubmitTime) }}</span>
                </li>
              </ul>
            </section>

            <section class="side-section">
              <div class="side-section__head">我的进度</div>
              <div class="progress-row">
                <span class="hw-progress__bar hw-progress__bar--lg">
                  <i :style="{ width: `${progressPercent(selected)}%` }"></i>
                </span>
                <span class="progress-row__text">{{ progressPercent(selected) }}%</span>
              </div>
              <p class="side-text side-text--muted">
                已提交 {{ selected.submittedQuestionCount }} / {{ selected.questionCount }} 题
                · {{ selected.submitted ? '已提交过' : '尚未提交' }}
              </p>
              <div class="side-actions">
                <button
                  class="st-btn st-btn--primary"
                  :title="selected.canSubmit ? '进入作业作答' : '已截止，可回看已作答内容'"
                  @click="enterHomework(selected)"
                >
                  <Send :size="13" />
                  {{ selected.canSubmit ? '进入作答' : '查看作答' }}
                </button>
              </div>
              <p class="side-tip">
                点「进入作答」会在新标签页打开作答页，可以来回切题，作答会自动保存草稿。
              </p>
            </section>

            <!-- 批改结果 -->
            <section class="side-section">
              <div class="side-section__head">
                批改结果
                <button
                  v-if="selected.gradingStatus === 1"
                  class="st-text-btn side-refresh"
                  :disabled="gradingLoading"
                  @click="loadGrading(true)"
                >
                  <Loader2 v-if="gradingLoading" :size="12" class="spin" />
                  <RotateCcw v-else :size="12" />
                  刷新
                </button>
              </div>

              <div v-if="!selected.submitted" class="side-note side-note--muted">
                <CheckCheck :size="13" /> 还没提交，交卷后才会生成批改结果。
              </div>
              <div v-else-if="selected.gradingStatus === 0" class="side-note">
                <Timer :size="13" /> 已提交，智能批改还在进行中，稍后回来查看。
              </div>
              <div v-else-if="selected.gradingStatus === 2" class="side-note side-note--danger">
                <CircleAlert :size="13" /> 批改失败{{ selected.gradingStatusName ? `：${selected.gradingStatusName}` : '' }}
              </div>

              <template v-else>
                <div v-if="gradingLoading" class="st-empty" style="padding: 20px 8px;">
                  <Loader2 :size="20" :stroke-width="1.4" class="st-empty__icon spin" />
                  <div class="st-empty__text">批改结果加载中…</div>
                </div>
                <div v-else-if="gradingError" class="side-note side-note--danger">
                  <CircleAlert :size="13" /> {{ gradingError }}
                </div>
                <template v-else-if="grading">
                  <div class="score-row">
                    <div class="score-box">
                      <div class="st-stat-value">{{ grading.studentScore }}</div>
                      <div class="st-stat-label">得分 / {{ grading.totalScore }}</div>
                    </div>
                    <div class="score-box">
                      <div class="st-stat-value">{{ grading.status || '—' }}</div>
                      <div class="st-stat-label">批阅状态</div>
                    </div>
                  </div>
                  <div v-if="grading.errorMessage" class="side-note side-note--danger">
                    <CircleAlert :size="13" /> {{ grading.errorMessage }}
                  </div>
                  <div v-for="d in grading.scoreDetail" :key="d.questionId" class="grade-item">
                    <div class="grade-item__head">
                      <span class="grade-item__q">{{ d.questionContent }}</span>
                      <span
                        class="st-badge"
                        :class="d.score >= d.fullScore ? 'st-badge--success' : 'st-badge--warning'"
                      >
                        {{ d.score }} / {{ d.fullScore }}
                      </span>
                    </div>
                    <p v-if="d.errorReason" class="grade-item__reason">{{ d.errorReason }}</p>
                  </div>
                </template>
              </template>
            </section>
          </div>
        </template>

        <div v-else class="st-empty" style="padding: 48px 16px;">
          <ClipboardList :size="32" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">选择左侧作业查看详情</div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.detail-topbar {
  margin-bottom: 12px;
}

.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.list-count {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ---------- 筛选栏 ---------- */
.filter-card {
  margin-bottom: 18px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.hw-tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-subtle);
}

.hw-tab {
  padding: 5px 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.hw-tab:hover {
  color: var(--text-primary);
}

.hw-tab--active {
  background: var(--bg-surface);
  color: var(--text-primary);
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.filter-fields {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-left: auto;
}

.filter-select {
  width: 190px;
}

.filter-select--size {
  width: 120px;
}

.filter-switch {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
}

.filter-note {
  margin: 10px 0 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

/* ---------- 布局 ---------- */
.hw-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 1fr);
  gap: 20px;
  align-items: start;
}

@media (max-width: 1080px) {
  .hw-layout {
    grid-template-columns: 1fr;
  }
}

.hw-side {
  position: sticky;
  top: 16px;
  /* 批改明细可能很长：面板自己滚，别把整页撑高 */
  max-height: calc(100vh - 32px);
  overflow: auto;
}

@media (max-width: 1080px) {
  .hw-side {
    position: static;
    max-height: none;
  }
}

/* ---------- 作业卡片 ---------- */
.hw-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hw-card {
  width: 100%;
  display: block;
  text-align: left;
  padding: 14px 16px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  font-family: inherit;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition), box-shadow var(--transition);
}

.hw-card:hover {
  border-color: var(--border-strong);
  background: #fdfdfc;
}

.hw-card--active {
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
  background: var(--bg-subtle);
}

.hw-card__top {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.hw-card__title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hw-card__content {
  margin: 6px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.hw-card__meta {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.hw-card__meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.hw-card__countdown {
  font-style: normal;
  color: var(--status-warning);
}

.hw-card__foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed var(--border-subtle);
}

.hw-card__state {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  flex-shrink: 0;
}

.hw-card__score {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
}

/* 进度条 */
.hw-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.hw-progress__bar {
  display: block;
  width: 108px;
  height: 5px;
  border-radius: 999px;
  background: var(--bg-muted);
  overflow: hidden;
  flex-shrink: 0;
}

.hw-progress__bar--lg {
  width: auto;
  flex: 1;
  height: 6px;
}

.hw-progress__bar i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width var(--transition);
}

.hw-progress__text {
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* 分页 */
.hw-pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.hw-pager__info {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* ---------- 右侧详情 ---------- */
.side-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: linear-gradient(180deg, #ffffff 0%, #fcfcfb 100%);
}

.side-head__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

.side-head__meta {
  flex: 1;
  min-width: 0;
}

.side-head__title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 600;
  letter-spacing: -0.2px;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.side-head__sub {
  margin: 1px 0 0;
  font-size: 11.5px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hw-side__body {
  padding: 16px 18px 20px;
}

.side-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.side-meta__cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 9px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  background: #fcfcfb;
  min-width: 0;
}

.side-meta__label {
  font-size: 11px;
  letter-spacing: 0.3px;
  color: var(--text-tertiary);
}

.side-meta__value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.side-section + .side-section {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}

.side-section__head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--text-secondary);
}

.side-section__head::before {
  content: '';
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: var(--text-secondary);
  opacity: 0.55;
}

.side-refresh {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 400;
}

.side-text {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.side-text--muted {
  margin-top: 8px;
  color: var(--text-tertiary);
  font-size: 11.5px;
}

.info-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.info-list li {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 12.5px;
}

.info-list__label {
  width: 68px;
  flex-shrink: 0;
  color: var(--text-tertiary);
  font-size: 11.5px;
}

.info-list__value {
  color: var(--text-primary);
}

.info-list__accent {
  font-style: normal;
  color: var(--status-warning);
  font-size: 11.5px;
  margin-left: 6px;
}

.info-list__muted {
  font-style: normal;
  color: var(--text-tertiary);
  font-size: 11.5px;
  margin-left: 6px;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.progress-row__text {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;
}

.side-actions {
  display: flex;
  gap: 10px;
  margin-top: 12px;
}

.side-tip {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.side-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--status-warning-bg);
  font-size: 12px;
  line-height: 1.6;
  color: var(--status-warning);
}

.side-note--danger {
  background: var(--status-danger-bg);
  color: var(--status-danger);
}

.side-note--muted {
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

.score-row {
  display: flex;
  gap: 28px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.score-box {
  min-width: 90px;
}

.grade-item {
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.grade-item:last-child {
  border-bottom: none;
}

.grade-item__head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.grade-item__q {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-primary);
}

.grade-item__reason {
  margin: 6px 0 0;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-subtle);
  font-size: 11.5px;
  line-height: 1.65;
  color: var(--text-secondary);
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
