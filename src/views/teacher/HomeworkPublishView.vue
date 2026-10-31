<script setup lang="ts">
/**
 * 作业发布
 * - POST /api/teach/homework/publish  { title, content, chapterId, deadline, classId | grade, allowLateSubmit, questions[] }
 * - GET  /api/teach/homework/list     { id, title, content, chapterId, deadline, status, createTime }
 * - GET  /api/teach/homework/detail?homeworkId=   作业详情 + 题目完整快照（含后端给的 statusName）
 * - POST /api/teach/homework/close    { homeworkId, closeReason? } 截止收题，返回后端提示语
 * - GET  /api/class/list              班级下拉（classId 取 classId 字段）
 *
 * 字段口径：
 * - 发布范围二选一：指定班级传 classId，全年级传 grade，两者都不传或都传后端报 400；
 * - 题目从选题面板勾选（也可随机抽题），随作业一起提交 questions[{questionId, score}]，
 *   后端在同一事务里写作业主表与题目关联表；
 * - 带题目时不传 totalScore（题量与总分都由后端按题目分值汇总）；不带题目时才按前端传的总分落库；
 * - allowLateSubmit（0/1）直接提交；
 * - status 码值语义由后端 openapi 注明（1未发布/2已发布/3已截止/4已归档），徽章据此渲染，
 *   详情接口回填的中文 statusName 优先使用。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { ArrowLeft, Ban, CalendarClock, Eye, FileEdit, Layers, Loader2, Send } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import ChapterSelect from '@/components/ChapterSelect.vue';
import QuestionPicker from '@/components/teacher/QuestionPicker.vue';
import { closeHomework, fetchHomeworkDetail, fetchPublishedHomeworks, publishHomework } from '@/api/teacher';
import { fetchClasses } from '@/api/class';
import { useChapters } from '@/composables/useChapters';
import type { ClassResponse } from '@/types/class';
import type { QuestionAdminItem } from '@/types/exam';
import type {
  HomeworkDetail,
  HomeworkPublishRequest,
  HomeworkQuestionSnapshot,
  PublishedHomework,
} from '@/types/teacher';
import { HOMEWORK_STATUS_LABELS, isHomeworkClosed } from '@/types/teacher';

/** closeReason 的库表列长 */
const CLOSE_REASON_MAX = 200;

type Scope = 'class' | 'grade';
const SCOPES: { key: Scope; label: string }[] = [
  { key: 'class', label: '指定班级' },
  { key: 'grade', label: '全年级' },
];

/** 章节名回显与下拉共用 useChapters（章节树构树逻辑也统一到 utils/chapterTree） */
const { findById: findChapter, load: loadChapters } = useChapters();
const classes = ref<ClassResponse[]>([]);
const published = ref<PublishedHomework[]>([]);
const loading = ref(true);
const publishing = ref(false);

// ---------- 发布表单 ----------
const title = ref('');
const formChapterId = ref<number | null>(null);
const deadline = ref('');
const content = ref('');
const scope = ref<Scope>('class');
/** 发布范围=指定班级时必填 */
const classId = ref<number | null>(null);
/** 发布范围=全年级时必填 */
const grade = ref('');
const allowLateSubmit = ref(0);
const totalScore = ref(0);
/** 老师手动改过总分后，不再跟着已选题目分值自动变 */
const totalScoreTouched = ref(false);

// ---------- 从题库选题（面板与题库页共用） ----------
const pickerVisible = ref(false);
const picked = ref<QuestionAdminItem[]>([]);
const pickedIds = computed(() => picked.value.map((q) => Number(q.id)));
const pickedScore = computed(() =>
  picked.value.reduce((sum, q) => sum + (Number(q.score) || 0), 0),
);
/** 已选题目涉及的章节：一次作业只覆盖一个章节，跨章节要挡下来 */
const pickedChapters = computed(() => [
  ...new Set(picked.value.map((q) => Number(q.chapterId ?? 0)).filter((id) => id > 0)),
]);
const chapterMismatch = computed(
  () =>
    formChapterId.value != null &&
    pickedChapters.value.some((id) => id !== Number(formChapterId.value)),
);

watch(picked, () => {
  if (!totalScoreTouched.value) totalScore.value = pickedScore.value;
  // 还没选章节时，用已选题目的章节自动带上
  if (formChapterId.value == null && pickedChapters.value.length === 1) {
    formChapterId.value = pickedChapters.value[0];
  }
});

function removePicked(id: number) {
  picked.value = picked.value.filter((q) => Number(q.id) !== id);
}

// ---------- 列表操作状态 ----------
/** homeworkId -> 详情接口返回的 statusName，列表徽章优先取这里的权威状态名 */
const statusNameById = ref<Record<number, string>>({});
const closingId = ref<number | null>(null);
const detailVisible = ref(false);
const detailLoading = ref(false);
const detail = ref<HomeworkDetail | null>(null);

const scopeIndex = computed(() => SCOPES.findIndex((s) => s.key === scope.value));
const segSliderStyle = computed(() => ({
  left: `calc(${scopeIndex.value} * 50% + 3px)`,
  width: 'calc(50% - 4px)',
}));

const chapterTitle = (id: number) => findChapter(id)?.title ?? `章节 ${id}`;
const classNameOf = (id: number | null) =>
  id == null ? '' : classes.value.find((c) => c.classId === id)?.className ?? `班级 ${id}`;

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 截止时间是否已过（仅在状态码未知时作为兜底依据） */
const isExpired = (hw: PublishedHomework) => {
  const t = new Date(hw.deadline).getTime();
  return Number.isNaN(t) ? false : t < Date.now();
};

/** 详情接口回填的中文 statusName 优先，其次用列表 status 的码值映射 */
function hwStatusText(hw: PublishedHomework): string {
  return statusNameById.value[hw.id] ?? HOMEWORK_STATUS_LABELS[hw.status] ?? '作业状态未知';
}

function hwStatusBadgeClass(hw: PublishedHomework): string {
  if (isHomeworkClosed(hw.status)) return 'st-badge--neutral';
  if (hw.status === 1) return 'st-badge--outline';
  return isExpired(hw) ? 'st-badge--warning' : 'st-badge--success';
}

/** 已截止 / 已归档不可再关闭 */
function isClosed(hw: PublishedHomework): boolean {
  return hw.status in HOMEWORK_STATUS_LABELS ? isHomeworkClosed(hw.status) : isExpired(hw);
}

async function refreshList() {
  try {
    published.value = await fetchPublishedHomeworks();
  } catch {
    // 错误由响应拦截器统一提示
  }
}

async function load() {
  loading.value = true;
  try {
    [classes.value, published.value] = await Promise.all([
      fetchClasses(),
      fetchPublishedHomeworks(),
    ]);
    await loadChapters();
  } catch {
    // 错误由响应拦截器统一提示
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const canPublish = computed(() => {
  if (!title.value.trim() || !formChapterId.value || !deadline.value || !content.value.trim()) return false;
  // 作业必须带题，且题目都得属于所选章节
  if (!picked.value.length || chapterMismatch.value) return false;
  return scope.value === 'class' ? classId.value != null : !!grade.value.trim();
});

function resetForm() {
  title.value = '';
  formChapterId.value = null;
  deadline.value = '';
  content.value = '';
  classId.value = null;
  grade.value = '';
  scope.value = 'class';
  allowLateSubmit.value = 0;
  totalScore.value = 0;
  totalScoreTouched.value = false;
  picked.value = [];
}

async function handlePublish() {
  if (!canPublish.value || publishing.value) return;
  publishing.value = true;
  try {
    const payload: HomeworkPublishRequest = {
      title: title.value.trim(),
      content: content.value.trim(),
      chapterId: formChapterId.value!,
      // el-date-picker 已按 value-format 输出 'YYYY-MM-DD HH:mm:ss' 字符串
      deadline: deadline.value,
      allowLateSubmit: allowLateSubmit.value,
      // 带题目时，题量与总分都由后端按题目分值汇总，前端不再传 totalScore
      questions: picked.value.map((q) => ({
        questionId: Number(q.id),
        score: Number.isFinite(Number(q.score)) ? Number(q.score) : undefined,
      })),
    };
    // 发布范围二选一，只带上其一
    let scopeText = '';
    if (scope.value === 'class') {
      payload.classId = classId.value!;
      scopeText = `班级「${classNameOf(payload.classId)}」`;
    } else {
      payload.grade = grade.value.trim();
      scopeText = `全年级 ${payload.grade}`;
    }
    await publishHomework(payload);
    ElMessage.success(`作业已发布到${scopeText}，共 ${pickedIds.value.length} 题，学生端可见`);
    await refreshList();
    resetForm();
  } catch {
    // 错误由响应拦截器统一提示
  } finally {
    publishing.value = false;
  }
}

// ---------- 详情 ----------

/** options / answer / knowledgePoints 都是 JSON 字符串，解析失败则回退原文展示 */
interface ParsedField {
  text: string;
  items: string[];
  parsed: boolean;
  empty: boolean;
}

interface QuestionRow {
  q: HomeworkQuestionSnapshot;
  options: ParsedField;
  answer: ParsedField;
  knowledge: ParsedField;
}

/** 题目快照里需要 JSON.parse 后展示的三列 */
const JSON_FIELDS = ['options', 'answer', 'knowledge'] as const;

function stringifyNode(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function flatten(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(stringifyNode);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}：${stringifyNode(v)}`);
  }
  return [stringifyNode(value)];
}

/**
 * options / answer / knowledgePoints 快照里是 JSON 字符串，解析失败则回退原文展示。
 * 入参放开成 unknown：若哪天后端改成直接下发数组/对象，也不会渲染成 [object Object]。
 */
function parseJsonField(raw: unknown): ParsedField {
  if (raw !== null && raw !== undefined && typeof raw === 'object') {
    return { text: JSON.stringify(raw), items: flatten(raw), parsed: true, empty: false };
  }
  const text = String(raw ?? '').trim();
  if (!text) return { text, items: [], parsed: false, empty: true };
  try {
    return { text, items: flatten(JSON.parse(text)), parsed: true, empty: false };
  } catch {
    return { text, items: [], parsed: false, empty: false };
  }
}

const questionRows = computed<QuestionRow[]>(() =>
  (detail.value?.questions ?? []).map((q) => ({
    q,
    options: parseJsonField(q.options),
    answer: parseJsonField(q.answer),
    knowledge: parseJsonField(q.knowledgePoints),
  })),
);

function rememberStatusName(d: HomeworkDetail) {
  if (!d.statusName) return;
  statusNameById.value = { ...statusNameById.value, [d.id]: d.statusName };
}

async function openDetail(hw: PublishedHomework) {
  detailVisible.value = true;
  detailLoading.value = true;
  detail.value = null;
  try {
    const d = await fetchHomeworkDetail(hw.id);
    detail.value = d;
    rememberStatusName(d);
  } catch {
    // 非本人作业等场景后端会拒绝，提示已由拦截器统一处理，这里只收起弹窗
    detailVisible.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  detailVisible.value = false;
  detail.value = null;
}

// ---------- 关闭作业 ----------

async function handleClose(hw: PublishedHomework) {
  if (isClosed(hw) || closingId.value === hw.id) return;
  let reason = '';
  try {
    const { value } = await ElMessageBox.prompt(
      `关闭后「${hw.title}」即截止收题，学生不能再提交。可填写关闭原因（选填）。`,
      '关闭作业',
      {
        confirmButtonText: '确认关闭',
        cancelButtonText: '取消',
        inputType: 'textarea',
        inputPlaceholder: `关闭原因，选填，最多 ${CLOSE_REASON_MAX} 字`,
        inputValidator: (v: string) =>
          (v ?? '').trim().length > CLOSE_REASON_MAX ? `关闭原因不能超过 ${CLOSE_REASON_MAX} 字` : true,
      },
    );
    reason = String(value ?? '').trim();
  } catch {
    return; // 用户取消
  }
  if (reason.length > CLOSE_REASON_MAX) {
    reason = reason.slice(0, CLOSE_REASON_MAX);
    ElMessage.warning(`关闭原因超长，已截断为 ${CLOSE_REASON_MAX} 字`);
  }

  closingId.value = hw.id;
  try {
    const msg = await closeHomework({ homeworkId: hw.id, closeReason: reason || undefined });
    ElMessage.success(msg || '作业已关闭，学生端停止接收提交');
    await refreshList();
    // 重新拉一次详情，把后端权威状态名回填到列表徽章
    try {
      rememberStatusName(await fetchHomeworkDetail(hw.id));
    } catch {
      // 状态名刷新失败不影响关闭结果，错误已由拦截器提示
    }
    if (detail.value?.id === hw.id) closeDetail();
  } catch {
    // 错误由响应拦截器统一提示
  } finally {
    closingId.value = null;
  }
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">作业发布</h1>
      <p class="st-page-subtitle">
        基于教材章节布置作业 · 可选择发布到班级或全年级 · 发布后可查看详情与截止收题
      </p>
    </header>

    <div class="publish-grid">
      <!-- 发布表单 -->
      <section class="st-card">
        <div class="st-card__header">
          <FileEdit :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">发布新作业</h2>
            <p class="st-card__hint">
              填写标题、作答要求、教材章节与截止时间，再选择发布到班级或全年级
            </p>
          </div>
        </div>
        <div class="st-card__body">
          <div class="form-item">
            <label class="form-label">作业标题</label>
            <input v-model="title" class="form-input" maxlength="100" placeholder="如：面向对象基础 · 课后作业" />
          </div>
          <div class="form-item">
            <label class="form-label">教材章节</label>
            <ChapterSelect v-model="formChapterId" placeholder="选择章节" style="width: 100%;" />
          </div>
          <div class="form-item">
            <label class="form-label">截止时间</label>
            <el-date-picker
              v-model="deadline"
              type="datetime"
              placeholder="选择截止时间"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DD HH:mm:ss"
              style="width: 100%;"
            />
          </div>

          <!-- 发布范围：班级 classId / 全年级 grade 二选一 -->
          <div class="form-item">
            <label class="form-label">发布范围（二选一）</label>
            <div class="st-seg scope-seg">
              <div class="st-seg__slider" :style="segSliderStyle"></div>
              <button
                v-for="s in SCOPES"
                :key="s.key"
                class="st-seg__option scope-seg__option"
                :class="{ 'st-seg__option--active': scope === s.key }"
                @click="scope = s.key"
              >
                {{ s.label }}
              </button>
            </div>
          </div>

          <div class="form-row">
            <div class="form-item" style="flex: 1;">
              <label class="form-label">
                {{ scope === 'class' ? '布置班级（必选）' : '年级（必填）' }}
              </label>
              <el-select
                v-if="scope === 'class'"
                v-model="classId"
                placeholder="选择班级"
                filterable
                style="width: 100%;"
              >
                <el-option v-for="c in classes" :key="c.classId" :label="c.className" :value="c.classId" />
              </el-select>
              <input
                v-else
                v-model="grade"
                class="form-input"
                maxlength="20"
                placeholder="如：2024 级 / 大一"
              />
            </div>
            <div class="form-item" style="width: 150px;">
              <label class="form-label">
                {{ picked.length ? '作业总分（按题目汇总）' : '作业总分' }}
              </label>
              <el-input-number
                v-model="totalScore"
                :min="0"
                :max="1000"
                :step="5"
                :disabled="picked.length > 0"
                style="width: 100%;"
                @change="totalScoreTouched = true"
              />
            </div>
          </div>

          <div class="form-item">
            <div class="pick-head">
              <label class="form-label">作业题目（必选）</label>
              <div class="pick-ops">
                <span class="pick-count">已选 {{ picked.length }} 题 · 总分 {{ pickedScore }}</span>
                <button class="st-btn st-btn--secondary" @click="pickerVisible = true">
                  <Layers :size="13" /> 从题库选题
                </button>
                <button class="st-btn st-btn--ghost" :disabled="!picked.length" @click="picked = []">
                  清空
                </button>
              </div>
            </div>
            <div class="pick-list">
              <span v-for="q in picked" :key="String(q.id)" class="pick-tag" :title="q.content">
                {{ (q.content || '').slice(0, 14) || '题目' }}
                <button class="pick-tag__x" title="移出本次作业" @click="removePicked(Number(q.id))">×</button>
              </span>
              <span v-if="!picked.length" class="pick-empty">
                还没有选题，点「从题库选题」按条件勾选，或随机抽一组
              </span>
            </div>
            <p v-if="chapterMismatch" class="pick-warn">
              已选题目里有不属于当前章节的题目，请先把章节改成题目所在章节，或移除跨章节的题目。
            </p>
          </div>

          <div class="form-row">
            <div class="form-item" style="flex: 1;">
              <label class="form-label">允许迟交</label>
              <div class="switch-line">
                <el-switch v-model="allowLateSubmit" :active-value="1" :inactive-value="0" />
                <span class="switch-text">{{ allowLateSubmit === 1 ? '过期后学生仍可提交' : '过期即停止收题' }}</span>
              </div>
            </div>
          </div>

          <div class="form-item">
            <label class="form-label">作答要求</label>
            <textarea
              v-model="content"
              class="form-textarea"
              rows="5"
              placeholder="如：完成全部题目；编程题须在代码实操环境运行通过后提交。"
            ></textarea>
          </div>

          <p class="form-foot">
            总分默认按已选题目的分值求和，可手动调整；布置班级与全年级只需选择其中一种填写。
          </p>

          <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
            <button class="st-btn st-btn--primary" :disabled="!canPublish || publishing" @click="handlePublish">
              <Loader2 v-if="publishing" :size="14" class="spin" />
              <Send v-else :size="14" />
              {{ publishing ? '发布中…' : '发布作业' }}
            </button>
          </div>
        </div>
      </section>

      <!-- 已发布列表 -->
      <section class="st-card">
        <div class="st-card__header">
          <CalendarClock :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">已发布作业</h2>
            <p class="st-card__hint">共 {{ published.length }} 份 · 只列出你自己发布的作业</p>
          </div>
        </div>
        <div class="st-card__body hw-list">
          <div v-if="loading" class="st-empty" style="padding: 60px;">
            <Loader2 :size="22" class="spin" />
            <div class="st-empty__text">正在加载作业列表…</div>
          </div>
          <div v-else-if="published.length === 0" class="st-empty" style="padding: 40px;">
            <div class="st-empty__text">暂无已发布作业</div>
          </div>
          <template v-else>
            <p class="list-note">
              状态徽章表示这份作业当前所处的阶段（未发布、已发布、已截止、已归档），
              查看过详情的作业会显示最新状态；班级、总分等信息列表里看不到，点开详情即可查阅。
            </p>
            <div v-for="hw in published" :key="hw.id" class="hw-item">
              <div class="hw-item__top">
                <span class="hw-item__title">{{ hw.title }}</span>
                <span class="st-badge" :class="hwStatusBadgeClass(hw)">{{ hwStatusText(hw) }}</span>
              </div>
              <div class="hw-item__meta">
                <span class="st-badge st-badge--outline">{{ chapterTitle(hw.chapterId) }}</span>
                <span class="hw-item__id">作业编号 {{ hw.id }}</span>
              </div>
              <div class="hw-item__info">截止 {{ fmt(hw.deadline) }} · 发布于 {{ fmt(hw.createTime) }}</div>
              <div class="hw-item__req">{{ hw.content }}</div>
              <div class="hw-item__ops">
                <button class="st-text-btn" @click="openDetail(hw)">
                  <Eye :size="13" /> 详情
                </button>
                <button
                  class="st-text-btn st-text-btn--danger"
                  :disabled="isClosed(hw) || closingId === hw.id"
                  @click="handleClose(hw)"
                >
                  <Loader2 v-if="closingId === hw.id" :size="13" class="spin" />
                  <Ban v-else :size="13" />
                  关闭作业
                </button>
              </div>
            </div>
          </template>
        </div>
      </section>
    </div>

    <!-- 作业详情 -->
    <div v-if="detailVisible" class="overlay" @click.self="closeDetail">
      <div class="dialog">
        <header class="dialog__head">
          <div>
            <h3 class="dialog__title">
              {{ detail?.title ?? '作业详情' }}
              <span v-if="detail" class="st-badge st-badge--neutral">{{ detail.statusName || '作业状态未知' }}</span>
            </h3>
            <p class="dialog__sub">作业编号 {{ detail?.id ?? '—' }}</p>
          </div>
          <!-- 这里只是收起详情面板，写成「返回」：避免和「关闭作业（截止收题）」混淆 -->
          <button class="st-btn st-btn--ghost" title="返回作业列表" @click="closeDetail">
            <ArrowLeft :size="13" /> 返回
          </button>
        </header>

        <div class="dialog__body">
          <Loader2 v-if="detailLoading" :size="18" class="spin" />
          <template v-else-if="detail">
            <dl class="detail-grid">
              <div class="detail-cell">
                <dt>教材章节</dt>
                <dd>{{ chapterTitle(detail.chapterId) }}</dd>
              </div>
              <div class="detail-cell">
                <dt>发布范围</dt>
                <dd>
                  <template v-if="detail.classId">{{ classNameOf(detail.classId) }}</template>
                  <template v-else-if="detail.grade">全年级 {{ detail.grade }}</template>
                  <template v-else>—</template>
                </dd>
              </div>
              <div class="detail-cell">
                <dt>班级编号 / 年级</dt>
                <dd>{{ detail.classId || '—' }} · {{ detail.grade || '—' }}</dd>
              </div>
              <div class="detail-cell">
                <dt>作业总分</dt>
                <dd>{{ detail.totalScore }}</dd>
              </div>
              <div class="detail-cell">
                <dt>题目数量</dt>
                <dd>{{ detail.questionCount }} 题</dd>
              </div>
              <div class="detail-cell">
                <dt>允许迟交</dt>
                <dd>{{ detail.allowLateSubmit === 1 ? '是' : '否' }}</dd>
              </div>
              <div class="detail-cell">
                <dt>截止时间</dt>
                <dd>{{ fmt(detail.deadline) }}</dd>
              </div>
              <div class="detail-cell">
                <dt>发布时间</dt>
                <dd>{{ fmt(detail.publishTime) }}</dd>
              </div>
              <div class="detail-cell">
                <dt>关闭时间</dt>
                <dd>{{ fmt(detail.closeTime) }}</dd>
              </div>
              <div class="detail-cell">
                <dt>创建时间</dt>
                <dd>{{ fmt(detail.createTime) }}</dd>
              </div>
              <div class="detail-cell detail-cell--wide">
                <dt>关闭原因</dt>
                <dd>{{ detail.closeReason || '—' }}</dd>
              </div>
            </dl>

            <div class="detail-block">
              <h4 class="detail-block__title">作答要求</h4>
              <p class="detail-block__text">{{ detail.content || '—' }}</p>
            </div>

            <div class="detail-block">
              <h4 class="detail-block__title">题目快照（{{ detail.questions?.length ?? 0 }} 题，按题目先后排列）</h4>
              <p v-if="!questionRows.length" class="detail-block__empty">
                这份作业还没有题目，题目会在题库组题后出现
              </p>
              <table v-else class="q-table">
                <thead>
                  <tr>
                    <th class="col-no">#</th>
                    <th>题干</th>
                    <th class="col-type">题型</th>
                    <th class="col-diff">难度</th>
                    <th class="col-score">分值</th>
                    <th class="col-json">选项</th>
                    <th class="col-json">标准答案</th>
                    <th class="col-json">知识点</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in questionRows" :key="row.q.id">
                    <td class="cell-mono">{{ i + 1 }}</td>
                    <td class="cell-content">
                      <div v-if="row.q.shortTitle" class="q-short-title">{{ row.q.shortTitle }}</div>
                      {{ row.q.content || '—' }}
                    </td>
                    <td>
                      <span class="st-badge st-badge--outline">{{ row.q.typeName || `题型 ${row.q.type}` }}</span>
                    </td>
                    <td class="cell-mono">{{ row.q.difficulty }}</td>
                    <td class="cell-mono">{{ row.q.score }}</td>
                    <td v-for="key in JSON_FIELDS" :key="key" class="cell-json">
                      <span v-if="row[key].empty" class="json-empty">—</span>
                      <ul v-else-if="row[key].parsed" class="json-list">
                        <li v-for="(item, idx) in row[key].items" :key="idx">{{ item }}</li>
                      </ul>
                      <span v-else class="json-raw">{{ row[key].text }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-if="questionRows.length" class="json-note">
                选项、标准答案与知识点会逐项列出；
                无法拆分的题目会按原文整段显示。
              </p>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 从题库选题：与题库页共用同一个面板 -->
    <div v-if="pickerVisible" class="overlay" @click.self="pickerVisible = false">
      <div class="dialog">
        <header class="dialog__head">
          <div>
            <h3 class="dialog__title">从题库选题</h3>
            <p class="dialog__sub">按条件勾选或随机抽题，选中后带回作业表单</p>
          </div>
          <button class="st-btn st-btn--ghost" @click="pickerVisible = false">关闭</button>
        </header>
        <div class="dialog__body">
          <QuestionPicker v-model="picked" :initial-chapter-id="formChapterId" />
          <div class="pick-done">
            <span class="pick-count">共选中 {{ picked.length }} 题 · 总分 {{ pickedScore }}</span>
            <button class="st-btn st-btn--primary" :disabled="!picked.length" @click="pickerVisible = false">
              完成
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.publish-grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 960px) {
  .publish-grid {
    grid-template-columns: 1fr;
  }
}

.form-item {
  margin-bottom: 14px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.field-note {
  font-size: 11px;
  line-height: 1.5;
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
  transition: border-color var(--transition);
}

.form-input:focus {
  border-color: var(--border-strong);
}

.form-textarea {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: border-color var(--transition);
}

.form-textarea:focus {
  border-color: var(--border-strong);
}

.scope-seg {
  width: 100%;
}

.scope-seg__option {
  flex: 1;
}

.switch-line {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 34px;
}

.switch-text {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

/* 从题库选题 */
.pick-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.pick-head .form-label {
  margin-bottom: 0;
}

.pick-ops {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pick-count {
  font-size: 12px;
  color: var(--text-tertiary);
}

.pick-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 34px;
  padding: 8px 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.pick-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--border-default);
  border-radius: 999px;
  background: var(--bg-surface);
  font-size: 11.5px;
  color: var(--text-secondary);
  max-width: 220px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pick-tag__x {
  border: none;
  background: none;
  padding: 0;
  font-size: 13px;
  line-height: 1;
  color: var(--text-tertiary);
  cursor: pointer;
}

.pick-tag__x:hover {
  color: var(--text-primary);
}

.pick-empty {
  font-size: 11.5px;
  color: var(--text-tertiary);
  align-self: center;
}

.pick-warn {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.pick-done {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.form-foot {
  margin: 0 0 12px;
  padding: 9px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
  background: var(--bg-subtle);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
}

/* 已发布列表 */
.hw-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 720px;
  overflow-y: auto;
}

.list-note {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.hw-item {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 14px 16px;
}

.hw-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.hw-item__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.hw-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.hw-item__id {
  font-size: 11.5px;
  color: var(--text-tertiary);
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.hw-item__info {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 6px;
}

.hw-item__req {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 88px;
  overflow-y: auto;
}

.hw-item__ops {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
}

/* 弹层 */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1500;
  padding: 24px;
}

.dialog {
  width: min(1040px, 100%);
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
  overflow: hidden;
}

.dialog__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-subtle);
}

.dialog__head > div:first-child {
  flex: 1;
  min-width: 0;
}

.dialog__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 10px;
}

.dialog__sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.dialog__body {
  padding: 20px 22px;
  overflow-y: auto;
}

/* 详情字段 */
.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px 16px;
  margin: 0;
}

.detail-cell {
  min-width: 0;
}

.detail-cell--wide {
  grid-column: 1 / -1;
}

.detail-cell dt {
  font-size: 11.5px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.detail-cell dd {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-primary);
  word-break: break-word;
}

.detail-block {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}

.detail-block__title {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.detail-block__text {
  margin: 0;
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-block__empty {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-tertiary);
}

/* 题目快照表 */
.q-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.q-table th {
  text-align: left;
  font-weight: 600;
  font-size: 11.5px;
  color: var(--text-tertiary);
  padding: 0 8px 8px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.q-table td {
  padding: 10px 8px;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: top;
  color: var(--text-primary);
}

.col-no {
  width: 32px;
}

.col-type {
  width: 84px;
}

.col-diff,
.col-score {
  width: 52px;
}

.col-json {
  width: 18%;
}

.cell-mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: var(--text-secondary);
}

.cell-content {
  line-height: 1.6;
  word-break: break-word;
}

.q-short-title {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.cell-json {
  line-height: 1.6;
  word-break: break-word;
}

.json-empty {
  color: var(--text-tertiary);
}

.json-list {
  margin: 0;
  padding-left: 16px;
}

.json-item {
  margin: 2px 0;
  color: var(--text-secondary);
}

.json-raw {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11.5px;
  color: var(--text-secondary);
  background: var(--bg-subtle);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
}

.json-note {
  margin: 10px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>

