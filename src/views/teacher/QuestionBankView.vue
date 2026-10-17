<script setup lang="ts">
/**
 * 题库管理 —— 视图侧取数逻辑已写完，@/api/exam 的实现方把桩函数里那一个 throw 替换掉即可联调
 *
 * 已接桩：待实现 @/api/exam.fetchQuestionAdminList   GET    /api/exam/question/admin/list?chapterId&type&page&size
 * 已接桩：待实现 @/api/exam.fetchQuestionAdminDetail GET    /api/exam/question/admin/{id}（编辑抽屉回显）
 * 已接桩：待实现 @/api/exam.createQuestion          POST   /api/exam/question/admin/save
 * 已接桩：待实现 @/api/exam.updateQuestion          PUT    /api/exam/question/admin/update（请求体必须带 id）
 * 已接桩：待实现 @/api/exam.deleteQuestion          DELETE /api/exam/question/admin/delete/{id}
 * 已接桩：待实现 @/api/exam.randomQuestions         POST   /api/exam/question/admin/random
 * 已对接：@/api/exam.generateQuestions              POST   /api/exam/question/generate（只回批次号，异步落库，成功后自动重查列表）
 * 已对接：@/api/knowledge.fetchChapters             GET    /api/knowledge/chapter/list?courseId（章节下拉数据源）
 *
 * 码值口径：type / difficulty / cognitiveLevel / judgeMode 入参一律用数字码值，中文标签在本页映射表维护，
 * **码值语义待与后端确认**。QuestionAdminItem 的 type、difficulty 类型是 string | number（列表接口可能直接回中文，
 * 随机抽题回码值），故 labelOf() 两种口径都兼容：能对上码值就取中文，否则原样展示后端文本。
 *
 * 两处与 @/types/exam 定义相关、只能在前端绕过的点（已在 api/types 层待修）：
 * 1) QuestionAdminQuery 只有 chapterId / type / page / size，没有 difficulty 与 keyword，
 *    因此「难度」「题干关键词」只对本页返回的 records 做本地过滤，不入库参；
 * 2) QuestionSaveRequest.cognitiveLevel 是 string，本页按码值字符串（'1'~'5'）提交。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import {
  AlertTriangle,
  ClipboardList,
  Database,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  createQuestion,
  deleteQuestion,
  fetchQuestionAdminDetail,
  fetchQuestionAdminList,
  generateQuestions,
  randomQuestions,
  updateQuestion,
} from '@/api/exam';
import { fetchChapters } from '@/api/knowledge';
import type { Chapter } from '@/types/knowledge';
import type { JudgeTestCase, QuestionAdminItem, QuestionSaveRequest } from '@/types/exam';

// ==================== 码值映射表（码值语义待与后端确认） ====================

/** 题型：后端 type 为整数编码 1~7 */
const TYPE_LABELS: Record<number, string> = {
  1: '单选题',
  2: '多选题',
  3: '判断题',
  4: '填空题',
  5: '简答题',
  6: '编程题',
  7: '阅读程序题',
};

/** 难度：对应 difficulty 编码 */
const DIFFICULTY_LABELS: Record<number, string> = {
  1: '入门',
  2: '简单',
  3: '中等',
  4: '较难',
  5: '困难',
};

/** 认知层级：cognitiveLevel 在类型里是 string，本页以码值字符串提交 */
const COGNITIVE_LABELS: Record<number, string> = {
  1: '记忆',
  2: '理解',
  3: '应用',
  4: '分析',
  5: '综合',
};

/** 判题方式：对应 judgeMode 编码 */
const JUDGE_MODE_LABELS: Record<number, string> = {
  1: '客观题比对',
  2: '用例判题',
  3: 'AI 评分',
};

const QUESTION_TYPE_OPTIONS = toEntries(TYPE_LABELS);
const DIFFICULTY_OPTIONS = toEntries(DIFFICULTY_LABELS);
const COGNITIVE_OPTIONS = toEntries(COGNITIVE_LABELS);
const JUDGE_MODE_OPTIONS = toEntries(JUDGE_MODE_LABELS);

function toEntries(map: Record<number, string>) {
  return Object.entries(map).map(([k, v]) => ({ value: Number(k), label: v }));
}

/** 码值 → 中文；后端回中文（string）时原样展示，不做二次猜测 */
function labelOf(map: Record<number, string>, raw: string | number | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '—';
  const n = Number(text);
  if (Number.isFinite(n) && map[n]) return map[n];
  return text;
}

const typeLabel = (raw: string | number | null | undefined) => labelOf(TYPE_LABELS, raw);
const difficultyLabel = (raw: string | number | null | undefined) => labelOf(DIFFICULTY_LABELS, raw);

/**
 * 回显方向：码值或中文标签 → 码值（编辑抽屉的下拉是码值）。
 * 映射不到就退回默认值，避免把后端文本写进 number 字段。
 */
function codeFrom(map: Record<number, string>, raw: string | number | null | undefined, fallback: number): number {
  const text = String(raw ?? '').trim();
  if (!text) return fallback;
  const n = Number(text);
  if (Number.isFinite(n) && map[n]) return n;
  const hit = Object.entries(map).find(([, label]) => label === text);
  return hit ? Number(hit[0]) : fallback;
}

/** 通过率：后端可能是 0~1 的小数，也可能是 0~100 的百分数，统一归一到百分比 */
function ratePercent(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const percent = n <= 1 ? n * 100 : n;
  return `${Math.max(0, Math.min(100, Math.round(percent)))}%`;
}

/** 桩函数同步 throw，统一渲染成「接口待实现：@/api/模块.函数」文案 */
function stubText(fn: string, e: unknown): string {
  const msg = (e as Error)?.message ?? '';
  return msg ? `接口待实现：${fn}（后端桩提示：${msg}）` : `接口待实现：${fn}`;
}

// ==================== 章节下拉（真实接口） ====================
const chapters = ref<Chapter[]>([]);
const chaptersError = ref('');

async function loadChapters() {
  try {
    chapters.value = await fetchChapters();
    chaptersError.value = '';
  } catch (e) {
    chapters.value = [];
    chaptersError.value = `章节加载失败：${(e as Error)?.message ?? '未知错误'}`;
  }
}

const chapterTitle = (id: number | null | undefined) => {
  if (id == null) return '未分配章节';
  return chapters.value.find((c) => c.id === Number(id))?.title ?? `章节 ${id}`;
};

// ==================== 列表 + 筛选 ====================
const filters = reactive({
  chapterId: null as number | null,
  /** 0 = 全部题型（作为查询参数时转 undefined） */
  type: 0,
  /** 0 = 全部难度；QuestionAdminQuery 无该字段，只对本页结果本地过滤 */
  difficulty: 0,
  /** 列表接口无关键词参数，只对本页结果本地过滤 */
  keyword: '',
});

const records = ref<QuestionAdminItem[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(10);
const listLoading = ref(false);
const listError = ref('');

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size.value)));

/** 本页可见行：接口分页结果 + 难度/关键词本地过滤 */
const rows = computed(() =>
  records.value.filter((r) => {
    if (filters.difficulty && !matchDifficulty(r.difficulty, filters.difficulty)) return false;
    const kw = filters.keyword.trim();
    if (kw && !String(r.content ?? '').includes(kw)) return false;
    return true;
  }),
);

/** difficulty 可能是码值也可能是中文（string | number），两种口径都比对一次 */
function matchDifficulty(raw: string | number | null | undefined, code: number): boolean {
  const text = String(raw ?? '').trim();
  if (!text) return false;
  if (Number(text) === code) return true;
  return text === DIFFICULTY_LABELS[code];
}

async function loadList() {
  listLoading.value = true;
  listError.value = '';
  try {
    const res = await fetchQuestionAdminList({
      chapterId: filters.chapterId ?? undefined,
      type: filters.type || undefined,
      page: page.value,
      size: size.value,
    });
    records.value = res?.records ?? [];
    total.value = res?.total ?? 0;
    if (res?.current) page.value = res.current;
    if (res?.size) size.value = res.size;
  } catch (e) {
    records.value = [];
    total.value = 0;
    listError.value = stubText('@/api/exam.fetchQuestionAdminList', e);
  } finally {
    listLoading.value = false;
  }
}

function search() {
  page.value = 1;
  loadList();
}

function goPage(next: number) {
  if (next < 1 || next > pageCount.value || listLoading.value) return;
  page.value = next;
  loadList();
}

function reloadAll() {
  loadChapters();
  loadList();
}

// ==================== 新增 / 编辑抽屉 ====================
interface DrawerForm {
  id: number | null;
  content: string;
  type: number;
  /** 一行一个选项，也可直接粘 JSON 数组；提交时序列化为 JSON 字符串 */
  options: string;
  /** 参考答案；合法 JSON 原样规范化，纯文本包成 JSON 字符串，多选按逗号切数组 */
  answer: string;
  analysis: string;
  /** 一行一条 */
  requirements: string;
  codeFramework: string;
  /** 一行一条 */
  hints: string;
  /** 逗号分隔的知识点 ID */
  knowledgePointIds: string;
  solutionOutline: string;
  weight: number;
  judgeMode: number;
  /** JudgeTestCase[] 的 JSON 文本 */
  testCases: string;
  chapterId: number | null;
  difficulty: number;
  score: number;
  cognitiveLevel: number;
}

const drawerVisible = ref(false);
const drawerMode = ref<'create' | 'edit'>('create');
const drawerLoading = ref(false);
const drawerError = ref('');
const saving = ref(false);

const form = reactive<DrawerForm>({
  id: null,
  content: '',
  type: 1,
  options: '',
  answer: '',
  analysis: '',
  requirements: '',
  codeFramework: '',
  hints: '',
  knowledgePointIds: '',
  solutionOutline: '',
  weight: 1,
  judgeMode: 1,
  testCases: '',
  chapterId: null,
  difficulty: 2,
  score: 5,
  cognitiveLevel: 2,
});

function resetForm() {
  form.id = null;
  form.content = '';
  form.type = 1;
  form.options = '';
  form.answer = '';
  form.analysis = '';
  form.requirements = '';
  form.codeFramework = '';
  form.hints = '';
  form.knowledgePointIds = '';
  form.solutionOutline = '';
  form.weight = 1;
  form.judgeMode = 1;
  form.testCases = '';
  form.chapterId = filters.chapterId;
  form.difficulty = 2;
  form.score = 5;
  form.cognitiveLevel = 2;
}

/** 后端下发的 JSON 字符串 → 表单可编辑文本；解析失败保留原文，提交时再兜一次 */
function jsonToText(raw: string | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => (item && typeof item === 'object' ? JSON.stringify(item) : String(item))).join('\n');
    }
    if (parsed && typeof parsed === 'object') return JSON.stringify(parsed, null, 2);
    return String(parsed);
  } catch {
    return text;
  }
}

/** 一行一个选项 → JSON 数组字符串；已是 JSON 数组则规范化 */
function buildOptionsJson(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return JSON.stringify(Array.isArray(parsed) ? parsed : [parsed]);
  } catch {
    // 非 JSON：按行切分成数组
  }
  return JSON.stringify(
    trimmed
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/** 答案 → JSON 字符串：合法 JSON 规范化；多选题按逗号切数组；其余包成 JSON 字符串 */
function buildAnswerJson(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    // 非 JSON：按下面的口径处理
  }
  if (form.type === 2) {
    return JSON.stringify(
      trimmed
        .split(/[,，、\s]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  return JSON.stringify(trimmed);
}

function buildStringList(text: string): string[] | undefined {
  const list = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

function buildIdList(text: string): number[] | undefined {
  const list = text
    .split(/[,，\s]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  return list.length ? list : undefined;
}

/**
 * 测试用例：JSON 文本 → JudgeTestCase[]，缺失字段补默认值；
 * 非法 JSON 抛错，由调用方提示（不能静默丢用例）。
 */
function buildTestCases(text: string): JudgeTestCase[] | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const parsed = JSON.parse(trimmed) as unknown;
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  return arr.map((raw, i) => {
    const o = (raw ?? {}) as Partial<JudgeTestCase>;
    return {
      caseIndex: Number.isFinite(Number(o.caseIndex)) && Number(o.caseIndex) > 0 ? Number(o.caseIndex) : i + 1,
      input: String(o.input ?? ''),
      expectedOutput: String(o.expectedOutput ?? ''),
      isSample: Boolean(o.isSample),
      caseType: String(o.caseType ?? 'normal'),
      weight: Number.isFinite(Number(o.weight)) ? Number(o.weight) : 1,
      timeLimit: Number.isFinite(Number(o.timeLimit)) ? Number(o.timeLimit) : 1000,
      memoryLimit: Number.isFinite(Number(o.memoryLimit)) ? Number(o.memoryLimit) : 256,
      description: String(o.description ?? ''),
    };
  });
}

function fillForm(item: QuestionAdminItem) {
  form.id = item.id ?? null;
  form.content = String(item.content ?? '');
  form.type = codeFrom(TYPE_LABELS, item.type, 1);
  form.options = jsonToText(item.options);
  form.answer = jsonToText(item.answer);
  form.analysis = String(item.analysis ?? '');
  form.requirements = (item.requirements ?? []).join('\n');
  form.codeFramework = String(item.codeFramework ?? '');
  form.hints = (item.hints ?? []).join('\n');
  form.knowledgePointIds = (item.knowledgePointIds ?? []).join(',');
  form.solutionOutline = String(item.solutionOutline ?? '');
  form.weight = Number.isFinite(Number(item.weight)) ? Number(item.weight) : 1;
  form.judgeMode = codeFrom(JUDGE_MODE_LABELS, item.judgeMode, 1);
  form.testCases = item.testCases?.length ? JSON.stringify(item.testCases, null, 2) : '';
  form.chapterId = item.chapterId ?? null;
  form.difficulty = codeFrom(DIFFICULTY_LABELS, item.difficulty, 2);
  form.score = Number.isFinite(Number(item.score)) ? Number(item.score) : 5;
  form.cognitiveLevel = codeFrom(COGNITIVE_LABELS, item.cognitiveLevel, 2);
}

function openDrawer(mode: 'create' | 'edit', row?: QuestionAdminItem) {
  drawerMode.value = mode;
  drawerError.value = '';
  drawerVisible.value = true;
  if (mode === 'create' || !row) {
    resetForm();
    return;
  }
  // 编辑：优先用详情接口回显（含答案与解析），桩未实现时退回列表行数据并标注
  fillForm(row);
  drawerLoading.value = true;
  fetchQuestionAdminDetail(row.id)
    .then((detail) => {
      fillForm(detail);
      drawerError.value = '';
    })
    .catch((e: unknown) => {
      drawerError.value = `${stubText('@/api/exam.fetchQuestionAdminDetail', e)}；已退回列表行数据回显，答案/解析等字段可能不完整`;
    })
    .finally(() => {
      drawerLoading.value = false;
    });
}

function closeDrawer() {
  drawerVisible.value = false;
}

const isProgramming = computed(() => form.type === 6 || form.type === 7);

function buildPayload(): QuestionSaveRequest {
  const payload: QuestionSaveRequest = {
    content: form.content.trim(),
    type: form.type,
    options: buildOptionsJson(form.options),
    answer: buildAnswerJson(form.answer),
    analysis: form.analysis.trim() || undefined,
    requirements: buildStringList(form.requirements),
    codeFramework: form.codeFramework || undefined,
    hints: buildStringList(form.hints),
    knowledgePointIds: buildIdList(form.knowledgePointIds),
    solutionOutline: form.solutionOutline.trim() || undefined,
    weight: form.weight,
    judgeMode: form.judgeMode,
    chapterId: form.chapterId ?? undefined,
    difficulty: form.difficulty,
    score: form.score,
    cognitiveLevel: String(form.cognitiveLevel),
  };
  if (drawerMode.value === 'edit' && form.id != null) payload.id = form.id;
  return payload;
}

async function handleSave() {
  if (saving.value) return;
  if (!form.content.trim()) {
    ElMessage.warning('题干（content）不能为空');
    return;
  }
  if (drawerMode.value === 'edit' && form.id == null) {
    ElMessage.error('缺少题目 ID，update 接口必须带 id，请重新从列表进入编辑');
    return;
  }

  let testCases: JudgeTestCase[] | undefined;
  try {
    testCases = buildTestCases(form.testCases);
  } catch {
    ElMessage.error('测试用例不是合法 JSON，未提交。请填写 JudgeTestCase[] 结构的 JSON 数组');
    return;
  }

  const payload = buildPayload();
  payload.testCases = testCases;

  saving.value = true;
  try {
    if (drawerMode.value === 'create') {
      const id = await createQuestion(payload);
      ElMessage.success(id ? `题目已新增（ID ${id}）` : '题目已新增');
    } else {
      const msg = await updateQuestion(payload);
      ElMessage.success(msg || '题目已更新');
    }
    closeDrawer();
    await loadList();
  } catch (e) {
    ElMessage.error(
      stubText(drawerMode.value === 'create' ? '@/api/exam.createQuestion' : '@/api/exam.updateQuestion', e),
    );
  } finally {
    saving.value = false;
  }
}

// ==================== 删除 ====================
const deletingId = ref<number | null>(null);

async function handleDelete(row: QuestionAdminItem) {
  if (deletingId.value != null) return;
  try {
    await ElMessageBox.confirm(
      `删除题目 #${row.id}（后端为逻辑删除），题干：${String(row.content ?? '').slice(0, 30)}…确认删除？`,
      '删除题目',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return; // 用户取消
  }

  deletingId.value = row.id;
  try {
    const msg = await deleteQuestion(row.id);
    ElMessage.success(msg || '题目已删除');
    await loadList();
  } catch (e) {
    ElMessage.error(stubText('@/api/exam.deleteQuestion', e));
  } finally {
    deletingId.value = null;
  }
}

// ==================== 随机抽题组卷 ====================
const randomVisible = ref(false);
const randomLoading = ref(false);
const randomError = ref('');
const randomResult = ref<QuestionAdminItem[]>([]);
const randomForm = reactive({
  chapterId: null as number | null,
  count: 5,
  type: 0,
  difficulty: 0,
});

function openRandom() {
  randomForm.chapterId = filters.chapterId ?? randomForm.chapterId;
  randomError.value = '';
  randomVisible.value = true;
}

async function runRandom() {
  if (randomLoading.value) return;
  if (randomForm.chapterId == null) {
    ElMessage.warning('随机抽题必须指定章节（RandomQuestionRequest.chapterId 必填）');
    return;
  }
  randomLoading.value = true;
  randomError.value = '';
  try {
    const list = await randomQuestions({
      chapterId: randomForm.chapterId,
      count: randomForm.count,
      type: randomForm.type || undefined,
      difficulty: randomForm.difficulty || undefined,
    });
    randomResult.value = list ?? [];
    if (!randomResult.value.length) ElMessage.info('该条件下没有可抽取的题目');
  } catch (e) {
    randomResult.value = [];
    randomError.value = stubText('@/api/exam.randomQuestions', e);
  } finally {
    randomLoading.value = false;
  }
}

// ==================== AI 出题（已对接，异步落库） ====================
const aiVisible = ref(false);
const aiLoading = ref(false);
const aiError = ref('');
const aiBatch = ref<number | null>(null);
const aiForm = reactive({
  chapterId: null as number | null,
  /** QuestionGenerateRequest.questionType 是 string：'all' 或 '1'~'7' */
  questionType: 'all',
  count: 5,
  userInstruction: '',
});

const AI_TYPE_OPTIONS = [
  { value: 'all', label: '全部题型' },
  ...QUESTION_TYPE_OPTIONS.map((t) => ({ value: String(t.value), label: t.label })),
];

function openAi() {
  aiForm.chapterId = filters.chapterId ?? aiForm.chapterId;
  aiError.value = '';
  aiVisible.value = true;
}

async function runGenerate() {
  if (aiLoading.value) return;
  aiLoading.value = true;
  aiError.value = '';
  try {
    const batch = await generateQuestions({
      chapterId: aiForm.chapterId ?? undefined,
      questionType: aiForm.questionType,
      count: aiForm.count,
      userInstruction: aiForm.userInstruction.trim() || undefined,
    });
    aiBatch.value = batch;
    ElMessage.success(`出题任务已提交（批次 ${batch}），题目异步入库，稍后刷新列表查看`);
    aiVisible.value = false;
    // 生成接口不回题目内容，只能回读列表接口
    await loadList();
  } catch (e) {
    aiError.value = `出题任务提交失败：${(e as Error)?.message ?? '未知错误'}`;
  } finally {
    aiLoading.value = false;
  }
}

onMounted(() => {
  loadChapters();
  loadList();
});
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">题库管理</h1>
      <p class="st-page-subtitle">维护章节题目 · 支持手动录入、AI 出题与随机抽题组卷</p>
    </header>

    <!-- 筛选 -->
    <div class="st-card">
      <div class="st-card__header">
        <Search :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">题目筛选</h2>
          <p class="st-card__hint">
            已接桩：待实现 @/api/exam.fetchQuestionAdminList · GET /api/exam/question/admin/list?chapterId&amp;type&amp;page&amp;size
          </p>
        </div>
        <span class="st-badge st-badge--neutral shell-badge"><Database :size="11" /> 已接桩</span>
      </div>
      <div class="st-card__body filter-row">
        <div class="filter-item">
          <label class="filter-label">教材章节</label>
          <el-select v-model="filters.chapterId" placeholder="全部章节" clearable filterable style="width: 200px;">
            <el-option v-for="c in chapters" :key="c.id" :label="`${c.chapterCode || c.id} ${c.title}`" :value="c.id" />
          </el-select>
        </div>
        <div class="filter-item">
          <label class="filter-label">题型</label>
          <el-select v-model="filters.type" style="width: 130px;">
            <el-option label="全部题型" :value="0" />
            <el-option v-for="t in QUESTION_TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </div>
        <div class="filter-item">
          <label class="filter-label">难度（本地过滤）</label>
          <el-select v-model="filters.difficulty" style="width: 130px;">
            <el-option label="全部难度" :value="0" />
            <el-option v-for="d in DIFFICULTY_OPTIONS" :key="d.value" :label="d.label" :value="d.value" />
          </el-select>
        </div>
        <div class="filter-item">
          <label class="filter-label">题干关键词（本地过滤）</label>
          <input v-model="filters.keyword" class="form-input" placeholder="QuestionAdminQuery 无关键词参数" />
        </div>
        <button class="st-btn st-btn--primary" :disabled="listLoading" @click="search">
          <Loader2 v-if="listLoading" :size="14" class="spin" />
          <Search v-else :size="14" />
          查询
        </button>
        <button class="st-btn st-btn--secondary" :disabled="listLoading" @click="reloadAll">
          <RefreshCw :size="13" /> 重新加载
        </button>
      </div>
      <div class="st-card__body filter-foot">
        <p v-if="chaptersError" class="inline-error">
          <AlertTriangle :size="12" /> {{ chaptersError }}
        </p>
        <p class="code-note">
          题型 / 难度下拉提交的是数字码值，中文标签由本页映射表给出，<b>码值语义待与后端确认</b>；
          列表接口若直接回中文，表格按后端文本展示。难度与关键词因
          <code>QuestionAdminQuery</code> 无对应字段，只对本页 {{ size }} 条结果生效。
        </p>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="st-card" style="margin-top: 20px;">
      <div class="st-card__body toolbar-row">
        <span class="toolbar-count">
          共 {{ total }} 题 · 第 {{ page }} / {{ pageCount }} 页 · 本页 {{ rows.length }} 行
          <span v-if="aiBatch !== null" class="toolbar-batch">最近 AI 出题批次 {{ aiBatch }}</span>
        </span>
        <div class="toolbar-actions">
          <button
            class="st-btn st-btn--secondary"
            :disabled="randomLoading"
            title="已接桩：待实现 @/api/exam.randomQuestions"
            @click="openRandom"
          >
            <Layers :size="13" /> 随机抽题组卷
          </button>
          <button
            class="st-btn st-btn--secondary"
            :disabled="aiLoading"
            title="已对接 @/api/exam.generateQuestions：只返回批次号，题目由后端异步入库"
            @click="openAi"
          >
            <Sparkles :size="13" /> AI 出题
          </button>
          <button class="st-btn st-btn--primary" @click="openDrawer('create')">
            <Plus :size="13" /> 新增题目
          </button>
        </div>
      </div>
    </div>

    <!-- 题目表 -->
    <section class="st-card" style="margin-top: 20px;">
      <div class="st-card__header">
        <ClipboardList :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">题目列表</h2>
          <p class="st-card__hint">
            数据源：@/api/exam.fetchQuestionAdminList 的 records（{ records, total, current, size }）
          </p>
        </div>
        <Loader2 v-if="listLoading" :size="15" class="spin header-spin" />
      </div>
      <div class="st-card__body">
        <div v-if="listError" class="st-empty">
          <AlertTriangle :size="22" :stroke-width="1.2" class="st-empty__icon" />
          <p class="st-empty__text">{{ listError }}</p>
          <button class="st-btn st-btn--secondary" style="margin-top: 12px;" @click="loadList">
            <RefreshCw :size="13" /> 重新加载
          </button>
        </div>

        <div v-else-if="listLoading" class="st-empty">
          <Loader2 :size="22" class="spin st-empty__icon" />
          <p class="st-empty__text">正在加载题目列表…</p>
        </div>

        <div v-else-if="rows.length === 0" class="st-empty">
          <ClipboardList :size="22" :stroke-width="1.2" class="st-empty__icon" />
          <p class="st-empty__text">
            {{ total ? '本页题目被难度 / 关键词本地过滤掉，调整筛选条件后再看' : '当前筛选条件下暂无题目' }}
          </p>
          <button class="st-btn st-btn--secondary" style="margin-top: 12px;" @click="loadList">
            <RefreshCw :size="13" /> 重新加载
          </button>
        </div>

        <template v-else>
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>题干</th>
                  <th>题型</th>
                  <th>难度</th>
                  <th>章节</th>
                  <th>分值</th>
                  <th>提交数</th>
                  <th>通过率</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows" :key="row.id">
                  <td class="cell-secondary">{{ row.id }}</td>
                  <td class="cell-content" :title="row.content">{{ row.content || '—' }}</td>
                  <td><span class="st-badge st-badge--outline">{{ typeLabel(row.type) }}</span></td>
                  <td class="cell-secondary">{{ difficultyLabel(row.difficulty) }}</td>
                  <td class="cell-secondary">{{ chapterTitle(row.chapterId) }}</td>
                  <td class="cell-secondary">{{ row.score ?? '—' }}</td>
                  <td class="cell-secondary">{{ row.submitCount ?? 0 }}</td>
                  <td class="cell-secondary">{{ ratePercent(row.acceptanceRate) }}</td>
                  <td>
                    <div class="row-actions">
                      <button
                        class="st-text-btn"
                        title="已接桩：待实现 @/api/exam.fetchQuestionAdminDetail"
                        @click="openDrawer('edit', row)"
                      >
                        <Pencil :size="12" /> 编辑
                      </button>
                      <button
                        class="st-text-btn st-text-btn--danger"
                        :disabled="deletingId === row.id"
                        title="已接桩：待实现 @/api/exam.deleteQuestion"
                        @click="handleDelete(row)"
                      >
                        <Loader2 v-if="deletingId === row.id" :size="12" class="spin" />
                        <Trash2 v-else :size="12" />
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 分页 -->
          <div class="pager">
            <el-select v-model="size" style="width: 110px;" :disabled="listLoading" @change="search">
              <el-option :value="10" label="10 条/页" />
              <el-option :value="20" label="20 条/页" />
              <el-option :value="50" label="50 条/页" />
            </el-select>
            <button class="page-btn" :disabled="page <= 1 || listLoading" @click="goPage(page - 1)">上一页</button>
            <span class="pager-info">第 {{ page }} / {{ pageCount }} 页</span>
            <button
              class="page-btn"
              :disabled="page >= pageCount || listLoading"
              @click="goPage(page + 1)"
            >
              下一页
            </button>
          </div>
        </template>
      </div>
    </section>

    <!-- 新增 / 编辑抽屉 -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="drawerVisible" class="drawer-overlay" @click.self="closeDrawer">
          <div class="drawer">
            <div class="drawer-header">
              <h3>{{ drawerMode === 'create' ? '新增题目' : `编辑题目 #${form.id ?? '—'}` }}</h3>
              <button class="drawer-close" @click="closeDrawer">
                <X :size="14" />
              </button>
            </div>
            <div class="drawer-body">
              <p class="drawer-hint">
                {{ drawerMode === 'create' ? 'POST /api/exam/question/admin/save' : 'PUT /api/exam/question/admin/update（带 id）' }}
                —— 已接桩：待实现 @/api/exam.{{ drawerMode === 'create' ? 'createQuestion' : 'updateQuestion' }}。
                options / answer 后端要求 JSON 字符串，本页自动序列化；testCases 填 JudgeTestCase[] 的 JSON 数组。
              </p>

              <p v-if="drawerLoading" class="drawer-loading">
                <Loader2 :size="13" class="spin" /> 正在拉取题目详情（@/api/exam.fetchQuestionAdminDetail）…
              </p>
              <p v-if="drawerError" class="inline-error">
                <AlertTriangle :size="12" /> {{ drawerError }}
              </p>

              <div class="form-item">
                <label class="form-label">题干（content，必填）</label>
                <textarea v-model="form.content" class="form-textarea" rows="3" placeholder="题干正文"></textarea>
              </div>

              <div class="form-row">
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">题型（type，码值）</label>
                  <el-select v-model="form.type" style="width: 100%;">
                    <el-option v-for="t in QUESTION_TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
                  </el-select>
                </div>
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">难度（difficulty，码值）</label>
                  <el-select v-model="form.difficulty" style="width: 100%;">
                    <el-option v-for="d in DIFFICULTY_OPTIONS" :key="d.value" :label="d.label" :value="d.value" />
                  </el-select>
                </div>
              </div>

              <div class="form-row">
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">章节（chapterId）</label>
                  <el-select v-model="form.chapterId" placeholder="选择章节" clearable filterable style="width: 100%;">
                    <el-option v-for="c in chapters" :key="c.id" :label="`${c.chapterCode || c.id} ${c.title}`" :value="c.id" />
                  </el-select>
                </div>
                <div class="form-item" style="width: 110px;">
                  <label class="form-label">分值（score）</label>
                  <el-input-number v-model="form.score" :min="0" :max="100" style="width: 100%;" />
                </div>
                <div class="form-item" style="width: 110px;">
                  <label class="form-label">权重（weight）</label>
                  <el-input-number v-model="form.weight" :min="0" :step="0.1" style="width: 100%;" />
                </div>
              </div>

              <div class="form-row">
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">认知层级（cognitiveLevel）</label>
                  <el-select v-model="form.cognitiveLevel" style="width: 100%;">
                    <el-option v-for="c in COGNITIVE_OPTIONS" :key="c.value" :label="c.label" :value="c.value" />
                  </el-select>
                </div>
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">判题方式（judgeMode）</label>
                  <el-select v-model="form.judgeMode" style="width: 100%;">
                    <el-option v-for="j in JUDGE_MODE_OPTIONS" :key="j.value" :label="j.label" :value="j.value" />
                  </el-select>
                </div>
              </div>

              <div v-if="!isProgramming" class="form-item">
                <label class="form-label">选项（options，一行一个，提交时转 JSON 数组字符串）</label>
                <textarea v-model="form.options" class="form-textarea" rows="4" placeholder="A. 选项一&#10;B. 选项二"></textarea>
              </div>

              <div class="form-item">
                <label class="form-label">参考答案（answer，提交时转 JSON 字符串）</label>
                <textarea
                  v-model="form.answer"
                  class="form-textarea"
                  rows="2"
                  placeholder="单选填 A；多选填 A,B（自动转数组）；编程题可填参考实现或 JSON 结构"
                ></textarea>
              </div>

              <div class="form-item">
                <label class="form-label">解析（analysis，学生端可见）</label>
                <textarea v-model="form.analysis" class="form-textarea" rows="2" placeholder="答案解析"></textarea>
              </div>

              <template v-if="isProgramming">
                <div class="form-item">
                  <label class="form-label">作答要求（requirements，一行一条）</label>
                  <textarea v-model="form.requirements" class="form-textarea" rows="2" placeholder="功能与规范要求"></textarea>
                </div>
                <div class="form-item">
                  <label class="form-label">代码框架（codeFramework）</label>
                  <textarea
                    v-model="form.codeFramework"
                    class="form-textarea code-textarea"
                    rows="4"
                    placeholder="下发给学生的初始代码骨架"
                  ></textarea>
                </div>
                <div class="form-item">
                  <label class="form-label">提示（hints，一行一条）</label>
                  <textarea v-model="form.hints" class="form-textarea" rows="2" placeholder="分步提示"></textarea>
                </div>
                <div class="form-item">
                  <label class="form-label">解题思路（solutionOutline）</label>
                  <textarea v-model="form.solutionOutline" class="form-textarea" rows="2" placeholder="参考思路提纲"></textarea>
                </div>
                <div class="form-item">
                  <label class="form-label">测试用例（testCases，JudgeTestCase[] 的 JSON）</label>
                  <textarea
                    v-model="form.testCases"
                    class="form-textarea code-textarea"
                    rows="7"
                    placeholder='[{"caseIndex":1,"input":"3 5","expectedOutput":"8","isSample":true,"caseType":"normal","weight":1,"timeLimit":1000,"memoryLimit":256,"description":"示例用例"}]'
                  ></textarea>
                  <p class="field-hint">
                    缺失字段按默认值补齐（caseType=normal、weight=1、timeLimit=1000、memoryLimit=256）；
                    JSON 非法时拦截提交并提示，不会静默丢用例。
                  </p>
                </div>
              </template>

              <div class="form-item">
                <label class="form-label">关联知识点（knowledgePointIds，逗号分隔）</label>
                <input v-model="form.knowledgePointIds" class="form-input" placeholder="如：12,15,23" />
              </div>
            </div>
            <div class="drawer-footer">
              <button class="st-btn st-btn--ghost" @click="closeDrawer">取消</button>
              <button
                class="st-btn st-btn--primary"
                :disabled="saving"
                :title="
                  drawerMode === 'create'
                    ? '已接桩：待实现 @/api/exam.createQuestion'
                    : '已接桩：待实现 @/api/exam.updateQuestion'
                "
                @click="handleSave"
              >
                <Loader2 v-if="saving" :size="14" class="spin" />
                {{ saving ? '保存中' : '保存题目' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 随机抽题组卷 -->
    <div v-if="randomVisible" class="overlay" @click.self="randomVisible = false">
      <div class="dialog">
        <header class="dialog__head">
          <div>
            <h3 class="dialog__title">随机抽题组卷</h3>
            <p class="dialog__sub">已接桩：待实现 @/api/exam.randomQuestions · POST /api/exam/question/admin/random</p>
          </div>
          <button class="st-btn st-btn--ghost" @click="randomVisible = false">关闭</button>
        </header>
        <div class="dialog__body">
          <div class="form-row">
            <div class="form-item" style="flex: 1;">
              <label class="form-label">章节（chapterId，必填）</label>
              <el-select v-model="randomForm.chapterId" placeholder="选择章节" filterable style="width: 100%;">
                <el-option v-for="c in chapters" :key="c.id" :label="`${c.chapterCode || c.id} ${c.title}`" :value="c.id" />
              </el-select>
            </div>
            <div class="form-item" style="width: 120px;">
              <label class="form-label">抽题数</label>
              <el-input-number v-model="randomForm.count" :min="1" :max="50" style="width: 100%;" />
            </div>
            <div class="form-item" style="width: 120px;">
              <label class="form-label">题型</label>
              <el-select v-model="randomForm.type" style="width: 100%;">
                <el-option label="不限" :value="0" />
                <el-option v-for="t in QUESTION_TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </div>
            <div class="form-item" style="width: 120px;">
              <label class="form-label">难度</label>
              <el-select v-model="randomForm.difficulty" style="width: 100%;">
                <el-option label="不限" :value="0" />
                <el-option v-for="d in DIFFICULTY_OPTIONS" :key="d.value" :label="d.label" :value="d.value" />
              </el-select>
            </div>
          </div>

          <div class="dialog__actions">
            <button class="st-btn st-btn--primary" :disabled="randomLoading" @click="runRandom">
              <Loader2 v-if="randomLoading" :size="14" class="spin" />
              <Layers v-else :size="14" />
              {{ randomLoading ? '抽题中' : '开始抽题' }}
            </button>
          </div>

          <div v-if="randomError" class="st-empty" style="padding: 28px 16px;">
            <AlertTriangle :size="20" :stroke-width="1.2" class="st-empty__icon" />
            <p class="st-empty__text">{{ randomError }}</p>
            <button class="st-btn st-btn--secondary" style="margin-top: 10px;" @click="runRandom">
              <RefreshCw :size="13" /> 重新加载
            </button>
          </div>

          <template v-else-if="randomResult.length">
            <table class="data-table" style="margin-top: 16px;">
              <thead>
                <tr>
                  <th>#</th>
                  <th>ID</th>
                  <th>题干</th>
                  <th>题型</th>
                  <th>难度</th>
                  <th>分值</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(q, i) in randomResult" :key="q.id">
                  <td class="cell-secondary">{{ i + 1 }}</td>
                  <td class="cell-secondary">{{ q.id }}</td>
                  <td class="cell-content" :title="q.content">{{ q.content || '—' }}</td>
                  <td><span class="st-badge st-badge--outline">{{ typeLabel(q.type) }}</span></td>
                  <td class="cell-secondary">{{ difficultyLabel(q.difficulty) }}</td>
                  <td class="cell-secondary">{{ q.score ?? '—' }}</td>
                </tr>
              </tbody>
            </table>
            <p class="json-note">
              合计 {{ randomResult.length }} 题 · 总分
              {{ randomResult.reduce((sum, q) => sum + (Number(q.score) || 0), 0) }}。
              后端未提供「保存为试卷/布置作业」的抽题落库接口，此处只列出结果，布置作业请到作业发布页。
            </p>
          </template>
        </div>
      </div>
    </div>

    <!-- AI 出题 -->
    <div v-if="aiVisible" class="overlay" @click.self="aiVisible = false">
      <div class="dialog">
        <header class="dialog__head">
          <div>
            <h3 class="dialog__title">AI 出题</h3>
            <p class="dialog__sub">已对接 @/api/exam.generateQuestions · POST /api/exam/question/generate</p>
          </div>
          <button class="st-btn st-btn--ghost" @click="aiVisible = false">关闭</button>
        </header>
        <div class="dialog__body">
          <p class="drawer-hint">
            后端异步出题并直接落库，接口只返回批次号，不返回题目内容；提交成功后本页会自动重查列表，
            题目入库有延迟，稍后再刷新即可看到。
          </p>
          <div class="form-row">
            <div class="form-item" style="flex: 1;">
              <label class="form-label">章节（chapterId，可选）</label>
              <el-select v-model="aiForm.chapterId" placeholder="不限章节" clearable filterable style="width: 100%;">
                <el-option v-for="c in chapters" :key="c.id" :label="`${c.chapterCode || c.id} ${c.title}`" :value="c.id" />
              </el-select>
            </div>
            <div class="form-item" style="width: 150px;">
              <label class="form-label">题型（'all' 或码值）</label>
              <el-select v-model="aiForm.questionType" style="width: 100%;">
                <el-option v-for="t in AI_TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </div>
            <div class="form-item" style="width: 120px;">
              <label class="form-label">数量（count）</label>
              <el-input-number v-model="aiForm.count" :min="1" :max="20" style="width: 100%;" />
            </div>
          </div>
          <div class="form-item">
            <label class="form-label">附加指令（userInstruction，可选）</label>
            <textarea
              v-model="aiForm.userInstruction"
              class="form-textarea"
              rows="3"
              placeholder="如：围绕多态特性出题，题干带代码片段，难度偏中等"
            ></textarea>
          </div>
          <p class="field-hint">
            difficultyConfigId 未提供配置列表接口（@/types/exam 要求关联 exam_question_difficulty_config.id），
            本页不提交该字段。
          </p>
          <p v-if="aiError" class="inline-error">
            <AlertTriangle :size="12" /> {{ aiError }}
          </p>
          <div class="dialog__actions">
            <button class="st-btn st-btn--secondary" @click="aiVisible = false">取消</button>
            <button class="st-btn st-btn--primary" :disabled="aiLoading" @click="runGenerate">
              <Loader2 v-if="aiLoading" :size="14" class="spin" />
              <Sparkles v-else :size="14" />
              {{ aiLoading ? '提交中' : '提交出题任务' }}
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

.shell-badge {
  margin-left: auto;
  flex-shrink: 0;
}

.header-spin {
  margin-left: auto;
}

/* 筛选 */
.filter-row {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
}

.filter-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
}

.form-input {
  width: 100%;
  min-width: 180px;
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

.filter-foot {
  padding-top: 0;
}

.code-note {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--text-tertiary);
}

.code-note b {
  color: var(--text-secondary);
}

.code-note code {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 11px;
  background: var(--bg-subtle);
  padding: 1px 5px;
  border-radius: 4px;
}

.inline-error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 0 10px;
  padding: 8px 10px;
  background: var(--bg-subtle);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.inline-error svg {
  flex-shrink: 0;
  margin-top: 2px;
}

/* 工具栏 */
.toolbar-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.toolbar-count {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.toolbar-batch {
  margin-left: 8px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11.5px;
}

.toolbar-actions {
  display: flex;
  gap: 10px;
  margin-left: auto;
}

/* 表格 */
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
  padding: 11px 14px;
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

.cell-content {
  color: var(--text-secondary);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cell-secondary {
  color: var(--text-secondary);
  white-space: nowrap;
}

.row-actions {
  display: flex;
  gap: 4px;
  white-space: nowrap;
}

/* 分页 */
.pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.pager-info {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.page-btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  font-size: 13px;
  color: var(--text-secondary);
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition), border-color var(--transition), color var(--transition);
}

.page-btn:hover:not(:disabled) {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 抽屉 */
.drawer-overlay {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.4);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
}

.drawer {
  width: 560px;
  max-width: 100%;
  height: 100%;
  background: var(--bg-surface);
  box-shadow: -4px 0 24px rgba(28, 25, 23, 0.08);
  display: flex;
  flex-direction: column;
}

.drawer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.drawer-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.drawer-close {
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-default);
  background: var(--bg-surface);
  border-radius: var(--radius-md);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  transition: background var(--transition), border-color var(--transition);
}

.drawer-close:hover {
  background: var(--bg-subtle);
  border-color: var(--border-strong);
}

.drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px 24px;
}

.drawer-hint {
  margin: 0 0 16px;
  padding: 8px 10px;
  background: var(--bg-subtle);
  border-radius: var(--radius-sm);
  font-size: 11.5px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

.drawer-loading {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.form-item {
  margin-bottom: 14px;
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

.code-textarea {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12.5px;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}

/* 弹窗（随机抽题 / AI 出题） */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 24px;
}

.dialog {
  width: min(900px, 100%);
  max-height: 86vh;
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

.dialog__head > div {
  flex: 1;
  min-width: 0;
}

.dialog__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
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

.dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}

.json-note {
  margin: 12px 0 0;
  padding: 9px 12px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-secondary);
  background: var(--bg-subtle);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
    gap: 0;
  }

  .drawer {
    width: 100%;
  }
}
</style>
