<script setup lang="ts">
/**
 * 题库管理
 *
 * 用到的接口：
 * - GET    /api/exam/question/admin/list        题目分页（章节 / 题型 / 难度配置 / 关键字）
 * - GET    /api/exam/question/admin/{id}        题目详情（编辑回显，返回数据库实体）
 * - POST   /api/exam/question/admin/save        新增题目
 * - PUT    /api/exam/question/admin/update      修改题目（请求体带 id）
 * - DELETE /api/exam/question/admin/delete/{id} 删除题目
 * - POST   /api/exam/difficulty-config/list     难度档位（下拉数据源，前端不写死）
 * - POST   /api/exam/question/generate          AI 出题（data 1=已受理 0=失败，异步落库）
 * - GET    /api/knowledge/chapter/list          章节下拉数据源
 * 抽题走选题面板组件（/api/exam/question/admin/random，按题型 + 难度档配比）。
 *
 * 码值口径：题型 1=选择 2=填空 3=判断 4=程序阅读 5=编程 6=简答；判题方式 1=AI批改 2=用例判题 3=混合；
 * 难度不再是码值，一律用 difficultyConfigId + difficultyName。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import {
  AlertTriangle,
  ClipboardList,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import ChapterSelect from '@/components/ChapterSelect.vue';
import QuestionPicker from '@/components/teacher/QuestionPicker.vue';
import {
  createQuestion,
  deleteQuestion,
  fetchQuestionAdminDetail,
  fetchQuestionAdminList,
  generateQuestions,
  updateQuestion,
} from '@/api/exam';
import { fetchClasses } from '@/api/class';
import { publishHomework } from '@/api/teacher';
import type { ClassResponse } from '@/types/class';
import type { JudgeTestCase, QuestionAdminItem, QuestionAnswer, QuestionSaveRequest } from '@/types/exam';
import { useChapters } from '@/composables/useChapters';
import { useDifficultyConfigs } from '@/composables/useDifficultyConfigs';
import { defaultDeadline } from '@/utils/datetime';
import {
  COGNITIVE_OPTIONS,
  JUDGE_MODE_LABELS,
  TYPE_LABELS,
  codeFrom,
  toEntries,
  typeLabel,
} from '@/utils/questionCode';

// ==================== 下拉选项（码值映射见 utils/questionCode） ====================

const QUESTION_TYPE_OPTIONS = toEntries(TYPE_LABELS);
const difficultyStore = useDifficultyConfigs();
const difficultyOptions = difficultyStore.options;
const difficultyText = difficultyStore.difficultyText;
const JUDGE_MODE_OPTIONS = toEntries(JUDGE_MODE_LABELS);

/** 认知层级：后端是中文描述，兼容历史码值 */
function cognitiveText(raw: string | number | null | undefined): string {
  const text = String(raw ?? '').trim();
  if (!text) return '理解';
  const n = Number(text);
  if (Number.isInteger(n) && n >= 1 && n <= COGNITIVE_OPTIONS.length) {
    return COGNITIVE_OPTIONS[n - 1];
  }
  return text;
}

/** 通过率：后端为百分数（0~100） */
function ratePercent(value: number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

/** 统一的失败提示：只给用户看「做什么失败了 + 后端原因」，不出现接口名 */
function apiErrorText(action: string, e: unknown): string {
  const msg = (e as Error)?.message ?? '';
  return msg ? `${action}：${msg}` : action;
}

// ==================== 章节 ====================
/** 章节列表与下拉统一走 useChapters / <ChapterSelect> */
const { error: chaptersError, findById: findChapter, load: loadChapters } = useChapters();

const chapterTitle = (id: number | null | undefined) => {
  if (id == null) return '未分配章节';
  return findChapter(id)?.title ?? `章节 ${id}`;
};

/**
 * 表格「章节」列：编号 + 名称一起展示（如「03 函数与递归」）。
 * 题库里同名章节并不少见，只看名称无法区分是哪一章，编号才是唯一可辨识的定位。
 */
const chapterLabel = (id: number | null | undefined) => {
  if (id == null) return '未分配章节';
  const chapter = findChapter(id);
  if (!chapter) return `章节 ${id}`;
  return chapter.chapterCode ? `${chapter.chapterCode} ${chapter.title}` : chapter.title;
};

// ==================== 列表 + 筛选 ====================
const filters = reactive({
  chapterId: null as number | null,
  /** 0 = 全部题型（作为查询参数时转 undefined） */
  type: 0,
  /** 0 = 全部难度 */
  difficultyConfigId: 0,
  keyword: '',
});

const records = ref<QuestionAdminItem[]>([]);
const total = ref(0);
const page = ref(1);
const size = ref(10);
const listLoading = ref(false);
const listError = ref('');

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / size.value)));

const rows = computed(() => records.value);

async function loadList() {
  listLoading.value = true;
  listError.value = '';
  try {
    const res = await fetchQuestionAdminList({
      chapterId: filters.chapterId ?? undefined,
      type: filters.type || undefined,
      difficultyConfigId: filters.difficultyConfigId || undefined,
      keyword: filters.keyword.trim() || undefined,
      pageNum: page.value,
      pageSize: size.value,
    });
    records.value = res?.records ?? [];
    total.value = res?.total ?? 0;
    if (res?.current) page.value = res.current;
    if (res?.size) size.value = res.size;
  } catch (e) {
    records.value = [];
    total.value = 0;
    listError.value = apiErrorText('题目列表加载失败', e);
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
  /** 一话题名（≤100 字），列表/卡片优先展示 */
  shortTitle: string;
  type: number;
  /** 选择题：单选 / 多选，提交到 renderConfig.choiceMode */
  choiceMode: 'single' | 'multiple';
  /** 填空题空数，提交到 renderConfig.blankCount */
  blankCount: number;
  /** 选择题选项：逐条输入，提交时转成字符串数组 */
  options: string[];
  /** 选择题答案：选项字母，多选可以选多个 */
  answerLetters: string[];
  /** 判断题答案：正确 / 错误（提交时转成布尔值） */
  judgeAnswer: '正确' | '错误' | '';
  /** 填空题答案：按空顺序，一个空一条 */
  blanks: string[];
  /** 文本答案：程序阅读题存程序输出，编程题/简答题存参考答案 */
  answer: string;
  analysis: string;
  /** 一行一条 */
  requirements: string;
  codeFramework: string;
  /** 一行一条 */
  hints: string;
  solutionOutline: string;
  weight: number;
  judgeMode: number;
  /** JudgeTestCase[] 的 JSON 文本 */
  testCases: string;
  chapterId: number | null;
  difficultyConfigId: number;
  score: number;
  cognitiveLevel: string;
}

/** 选项数量范围：太少不像选择题，太多没有意义 */
const OPTION_MIN = 2;
const OPTION_MAX = 8;
/** 新建选择题时先摆 4 个空位 */
const DEFAULT_OPTIONS = ['', '', '', ''];

const drawerVisible = ref(false);
const drawerMode = ref<'create' | 'edit'>('create');
const drawerLoading = ref(false);
const drawerError = ref('');
const saving = ref(false);

const form = reactive<DrawerForm>({
  id: null,
  content: '',
  shortTitle: '',
  type: 1,
  choiceMode: 'single',
  blankCount: 1,
  options: [...DEFAULT_OPTIONS],
  answerLetters: [],
  judgeAnswer: '',
  blanks: [''],
  answer: '',
  analysis: '',
  requirements: '',
  codeFramework: '',
  hints: '',
  solutionOutline: '',
  weight: 1,
  judgeMode: 1,
  testCases: '',
  chapterId: null,
  difficultyConfigId: 0,
  score: 5,
  cognitiveLevel: '理解',
});

function resetForm() {
  form.id = null;
  form.content = '';
  form.shortTitle = '';
  form.type = 1;
  form.choiceMode = 'single';
  form.blankCount = 1;
  form.options = [...DEFAULT_OPTIONS];
  form.answerLetters = [];
  form.judgeAnswer = '';
  form.blanks = [''];
  form.answer = '';
  form.analysis = '';
  form.requirements = '';
  form.codeFramework = '';
  form.hints = '';
  form.solutionOutline = '';
  form.weight = 1;
  form.judgeMode = 1;
  form.testCases = '';
  form.chapterId = filters.chapterId;
  form.difficultyConfigId = 0;
  form.score = 5;
  form.cognitiveLevel = '理解';
}

/** 选项字母：0→A、1→B… */
const optionLetter = (index: number) => String.fromCharCode(65 + index);

/** 答案下拉的候选项：只列已填写的选项，空选项不给选 */
const answerChoices = computed(() =>
  form.options
    .map((text, i) => ({ value: optionLetter(i), text: text.trim() }))
    .filter((o) => o.text)
    .map((o) => ({ value: o.value, label: `${o.value}. ${o.text}` })),
);

function addOption() {
  if (form.options.length >= OPTION_MAX) return;
  form.options.push('');
}

/** 只有选项还填着内容的字母才算有效答案（清空选项后旧字母会自动作废） */
const validLetters = computed(() =>
  form.answerLetters.filter((letter) => !!form.options[letter.charCodeAt(0) - 65]?.trim()),
);

/** 删除选项：字母会整体前移，按「选项文本」把已选答案重新映射到新字母 */
function removeOption(index: number) {
  if (form.options.length <= OPTION_MIN) return;
  const selectedTexts = form.answerLetters
    .map((letter) => form.options[letter.charCodeAt(0) - 65]?.trim() ?? '')
    .filter(Boolean);
  form.options.splice(index, 1);
  form.answerLetters = form.options
    .map((text, i) => (selectedTexts.includes(text.trim()) ? optionLetter(i) : ''))
    .filter(Boolean);
}

/** 切换题型：选择题至少摆两个空位；判断题只接受「正确 / 错误」 */
function onTypeChange() {
  if (form.type === 1) {
    while (form.options.length < OPTION_MIN) form.options.push('');
  }
  if (form.type === 3 && form.answer && !['正确', '错误'].includes(form.answer)) {
    form.answer = '';
  }
}

/** 已保存的答案 → 选项字母：兼容 "A" / "A,B" / "A. 选项原文" / 选项原文 */
function parseAnswerLetters(raw: unknown, options: string[]): string[] {
  const text = String(raw ?? '').trim();
  if (!text) return [];
  const compact = text.replace(/\s+/g, '');
  if (/^[A-H]([,，、;；/][A-H])*$/i.test(compact)) {
    return compact.toUpperCase().split(/[,，、;；/]/).filter(Boolean);
  }
  const hit = options.findIndex((o) => o.trim() === text);
  if (hit >= 0) return [optionLetter(hit)];
  const prefixed = text.match(/^([A-H])[.．、:：]/i);
  return prefixed ? [prefixed[1].toUpperCase()] : [];
}

/** 判断题答案归一：后端新格式是布尔值，旧数据可能是 对/错、true/false、1/0 */
function normalizeJudgeAnswer(raw: string): '正确' | '错误' | '' {
  const text = raw.trim();
  if (/^(正确|对|是|true|t|1)$/i.test(text)) return '正确';
  if (/^(错误|错|否|false|f|0)$/i.test(text)) return '错误';
  return '';
}

/** answer.correct → 选项字母：新格式是数组，旧数据可能是 "A,B" 或 "A. 选项原文" */
function lettersFromAnswer(answer?: QuestionAnswer): string[] {
  const correct = answer?.correct;
  const raw = Array.isArray(correct) ? correct : typeof correct === 'string' ? [correct] : [];
  const letters = raw.flatMap((v) => parseAnswerLetters(v, form.options));
  return [...new Set(letters)];
}

/** answer.correct → 判断题答案：布尔值直接换算，字符串走归一 */
function judgeFromAnswer(answer?: QuestionAnswer): '正确' | '错误' | '' {
  const correct = answer?.correct;
  if (typeof correct === 'boolean') return correct ? '正确' : '错误';
  const first = Array.isArray(correct) ? String(correct[0] ?? '') : String(correct ?? '');
  return normalizeJudgeAnswer(first);
}

/** answer.blanks → 填空答案，空数组时留一行输入框 */
function blanksFromAnswer(answer?: QuestionAnswer): string[] {
  const list = (answer?.blanks ?? []).map((v) => String(v ?? ''));
  return list.length ? list : [''];
}

/** 文本答案：程序阅读题取 output，其余取 reference（缺键时互相兜底） */
function textAnswerFrom(answer: QuestionAnswer | undefined, type: number): string {
  if (!answer) return '';
  if (type === 4) return answer.output ?? answer.reference ?? '';
  return answer.reference ?? answer.output ?? '';
}

function addBlank() {
  if (form.blanks.length >= 10) return;
  form.blanks.push('');
  form.blankCount = form.blanks.length;
}

function removeBlank(index: number) {
  if (form.blanks.length <= 1) return;
  form.blanks.splice(index, 1);
  form.blankCount = form.blanks.length;
}

/** 「空数」输入框：与答案列表双向对齐，多退少补 */
function setBlankCount(value: number | undefined) {
  const size = Math.max(1, Math.min(10, Math.floor(Number(value) || 1)));
  form.blanks = Array.from({ length: size }, (_, i) => form.blanks[i] ?? '');
  form.blankCount = size;
}

function fillForm(item: QuestionAdminItem) {
  form.id = item.id ?? null;
  form.content = String(item.content ?? '');
  form.shortTitle = String(item.shortTitle ?? '');
  form.type = codeFrom(TYPE_LABELS, item.type, 1);
  form.choiceMode = item.renderConfig?.choiceMode === 'multiple' ? 'multiple' : 'single';

  const savedOptions = (item.options ?? []).map((s) => String(s ?? '').trim()).slice(0, OPTION_MAX);
  form.options = savedOptions.length >= OPTION_MIN ? savedOptions : [...DEFAULT_OPTIONS];

  const answer = item.answer;
  form.answerLetters = form.type === 1 ? lettersFromAnswer(answer) : [];
  form.judgeAnswer = form.type === 3 ? judgeFromAnswer(answer) : '';
  form.blanks = form.type === 2 ? blanksFromAnswer(answer) : [''];
  // 空数以 renderConfig.blankCount 为准；老数据没有时退回答案里的空数
  const savedBlankCount = Number(item.renderConfig?.blankCount);
  form.blankCount =
    Number.isFinite(savedBlankCount) && savedBlankCount > 0 ? savedBlankCount : Math.max(1, form.blanks.length);
  if (form.type === 2) {
    form.blanks = Array.from({ length: form.blankCount }, (_, i) => form.blanks[i] ?? '');
  }
  form.answer = textAnswerFrom(answer, form.type);

  form.analysis = String(item.analysis ?? '');
  form.requirements = (item.requirements ?? []).join('\n');
  form.codeFramework = String(item.codeFramework ?? '');
  form.hints = (item.hints ?? []).join('\n');
  form.solutionOutline = String(item.solutionOutline ?? '');
  form.weight = Number.isFinite(Number(item.weight)) ? Number(item.weight) : 1;
  form.judgeMode = codeFrom(JUDGE_MODE_LABELS, item.judgeMode, 1);
  form.testCases = item.testCases?.length ? JSON.stringify(item.testCases, null, 2) : '';
  form.chapterId = item.chapterId ?? null;
  form.difficultyConfigId = Number(item.difficultyConfigId) || 0;
  form.score = Number.isFinite(Number(item.score)) ? Number(item.score) : 5;
  form.cognitiveLevel = cognitiveText(item.cognitiveLevel);
}

function buildStringList(text: string): string[] | undefined {
  const list = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
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

function openDrawer(mode: 'create' | 'edit', row?: QuestionAdminItem) {
  drawerMode.value = mode;
  drawerError.value = '';
  drawerVisible.value = true;
  if (mode === 'create' || !row) {
    resetForm();
    return;
  }
  // 编辑：先用列表行回显，再拉详情补全答案与解析
  fillForm(row);
  drawerLoading.value = true;
  fetchQuestionAdminDetail(row.id)
    .then((detail) => {
      fillForm(detail);
      drawerError.value = '';
    })
    .catch((e: unknown) => {
      drawerError.value = `${apiErrorText('题目详情读取失败', e)}；已用列表中的内容回显，答案、解析等可能不完整`;
    })
    .finally(() => {
      drawerLoading.value = false;
    });
}

function closeDrawer() {
  drawerVisible.value = false;
}

/** 各题型需要填写的字段：选择=选项+字母答案；判断=正确/错误；程序阅读=代码+要求；编程=代码+用例+判题方式 */
const isChoice = computed(() => form.type === 1);
const isFill = computed(() => form.type === 2);
const isJudge = computed(() => form.type === 3);
const isReading = computed(() => form.type === 4);
const isProgramming = computed(() => form.type === 5);
const needsCode = computed(() => isReading.value || isProgramming.value);

/** 按题型组装 answer 对象：选择/判断用 correct、填空用 blanks、阅读用 output、编程/简答用 reference */
function buildAnswerPayload(): QuestionAnswer {
  if (isChoice.value) return { correct: validLetters.value };
  if (isJudge.value) return { correct: form.judgeAnswer === '正确' };
  if (isFill.value) {
    // 空数以 renderConfig.blankCount 为准：不足补空、超出截断，保证判分按空位对齐
    const values = Array.from({ length: Math.max(1, form.blankCount) }, (_, i) => (form.blanks[i] ?? '').trim());
    return { blanks: values };
  }
  if (isReading.value) return { output: form.answer.trim() };
  return { reference: form.answer.trim() };
}

function buildPayload(): QuestionSaveRequest {
  const payload: QuestionSaveRequest = {
    content: form.content.trim(),
    // 简短题目：空则传 undefined，由后端留空
    shortTitle: form.shortTitle.trim() || undefined,
    type: form.type,
    answer: buildAnswerPayload(),
    analysis: form.analysis.trim() || undefined,
    chapterId: form.chapterId ?? undefined,
    difficultyConfigId: form.difficultyConfigId || undefined,
    score: form.score,
    cognitiveLevel: form.cognitiveLevel,
  };
  if (isChoice.value) {
    payload.options = form.options.map((s) => s.trim()).filter(Boolean);
    // 多选必须显式声明：答案只勾了一个选项时后端无法推断
    payload.renderConfig = { choiceMode: form.choiceMode };
  }
  if (isFill.value) {
    payload.renderConfig = { blankCount: Math.max(1, form.blankCount) };
  }
  if (needsCode.value) {
    payload.codeFramework = form.codeFramework.trim() || undefined;
    payload.requirements = buildStringList(form.requirements);
  }
  if (isProgramming.value) {
    payload.hints = buildStringList(form.hints);
    payload.solutionOutline = form.solutionOutline.trim() || undefined;
    payload.weight = form.weight;
    payload.judgeMode = form.judgeMode;
  }
  if (drawerMode.value === 'edit' && form.id != null) payload.id = form.id;
  return payload;
}

async function handleSave() {
  if (saving.value) return;
  if (!form.content.trim()) {
    ElMessage.warning('题干不能为空');
    return;
  }
  if (isChoice.value) {
    const filledFlags = form.options.map((s) => !!s.trim());
    if (filledFlags.filter(Boolean).length < OPTION_MIN) {
      ElMessage.warning(`选择题至少需要 ${OPTION_MIN} 个选项`);
      return;
    }
    const firstEmpty = filledFlags.indexOf(false);
    if (firstEmpty >= 0 && filledFlags.slice(firstEmpty).some(Boolean)) {
      ElMessage.warning('选项要按顺序填写，中间不要留空');
      return;
    }
    if (!validLetters.value.length) {
      ElMessage.warning('请选择正确答案');
      return;
    }
  } else if (isJudge.value) {
    if (!form.judgeAnswer) {
      ElMessage.warning('请选择这道判断题的答案');
      return;
    }
  } else if (isFill.value) {
    if (!form.blanks.some((b) => b.trim())) {
      ElMessage.warning('请填写填空答案');
      return;
    }
  } else if (!form.answer.trim()) {
    ElMessage.warning('请填写参考答案');
    return;
  }
  if (form.chapterId == null) {
    ElMessage.warning('请选择章节');
    return;
  }
  if (drawerMode.value === 'edit' && form.id == null) {
    ElMessage.error('这道题缺少编号，无法保存修改，请重新从列表进入编辑');
    return;
  }

  let testCases: JudgeTestCase[] | undefined;
  if (isProgramming.value) {
    try {
      testCases = buildTestCases(form.testCases);
    } catch {
      ElMessage.error('测试用例格式不正确，本次没有保存。请按示例填写用例列表');
      return;
    }
  }

  const payload = buildPayload();
  if (isProgramming.value) payload.testCases = testCases;

  saving.value = true;
  try {
    if (drawerMode.value === 'create') {
      await createQuestion(payload);
      ElMessage.success('题目已新增');
    } else {
      // 提示固定用本地文案：后端写接口只回 { code, data: null }，没有可展示的 message
      await updateQuestion(payload);
      ElMessage.success('题目已更新');
    }
    closeDrawer();
    await loadList();
  } catch (e) {
    ElMessage.error(apiErrorText('保存题目失败', e));
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
      `删除题目「${String(row.content ?? '').slice(0, 30)}…」？删除后这道题不再出现在题库里。`,
      '删除题目',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    );
  } catch {
    return; // 用户取消
  }

  deletingId.value = row.id;
  try {
    await deleteQuestion(row.id);
    ElMessage.success('题目已删除');
    await loadList();
  } catch (e) {
    ElMessage.error(apiErrorText('删除题目失败', e));
  } finally {
    deletingId.value = null;
  }
}

// ==================== 选题组卷（面板与作业发布页共用） ====================
const pickerVisible = ref(false);
const picked = ref<QuestionAdminItem[]>([]);

/** 一次作业只对应一个章节，跨章节选题要先收敛 */
const pickedChapterIds = computed(() => [
  ...new Set(picked.value.map((q) => Number(q.chapterId ?? 0)).filter((id) => id > 0)),
]);
const pickedChapterId = computed(() =>
  pickedChapterIds.value.length === 1 ? pickedChapterIds.value[0] : null,
);
const pickedScore = computed(() =>
  picked.value.reduce((sum, q) => sum + (Number(q.score) || 0), 0),
);

function openPicker() {
  publishOpen.value = false;
  pickerVisible.value = true;
}

function closePicker() {
  pickerVisible.value = false;
  publishOpen.value = false;
}

// ---------- 把选好的题直接布置成作业 ----------
const classes = ref<ClassResponse[]>([]);
const publishOpen = ref(false);
const publishing = ref(false);
const publishForm = reactive({
  title: '',
  classId: null as number | null,
  deadline: '',
  content: '',
  allowLateSubmit: 0,
  totalScore: 0,
});

const canPublishPicked = computed(
  () =>
    !!publishForm.title.trim() &&
    publishForm.classId != null &&
    !!publishForm.deadline &&
    picked.value.length > 0 &&
    pickedChapterId.value != null,
);

async function openPublishForm() {
  if (!picked.value.length) {
    ElMessage.warning('请先在面板里勾选题目');
    return;
  }
  if (pickedChapterId.value == null) {
    ElMessage.warning('已选题目跨了多个章节，一次作业只能覆盖一个章节');
    return;
  }
  if (!classes.value.length) {
    try {
      classes.value = await fetchClasses();
    } catch {
      // 错误由响应拦截器统一提示
    }
  }
  const count = picked.value.length;
  publishForm.title = `${chapterTitle(pickedChapterId.value)} · 组卷练习（${count} 题）`;
  publishForm.classId = null;
  publishForm.deadline = defaultDeadline();
  publishForm.content = `本作业由题库组卷生成，共 ${count} 道题，请按时完成。`;
  publishForm.allowLateSubmit = 0;
  publishForm.totalScore = pickedScore.value;
  publishOpen.value = true;
}

async function submitPublish() {
  if (publishing.value || !canPublishPicked.value || pickedChapterId.value == null) return;
  publishing.value = true;
  try {
    await publishHomework({
      title: publishForm.title.trim(),
      content: publishForm.content.trim() || `共 ${picked.value.length} 道题`,
      chapterId: pickedChapterId.value,
      // 数组顺序即题目顺序；总分由后端按题目分值汇总，不再前端计算
      questions: picked.value.map((q) => ({
        questionId: Number(q.id),
        score: Number.isFinite(Number(q.score)) ? Number(q.score) : undefined,
      })),
      deadline: publishForm.deadline,
      classId: publishForm.classId ?? undefined,
      allowLateSubmit: publishForm.allowLateSubmit,
    });
    ElMessage.success('作业已发布，学生端可见');
    picked.value = [];
    closePicker();
  } catch (e) {
    ElMessage.error(apiErrorText('发布作业失败', e));
  } finally {
    publishing.value = false;
  }
}

// ==================== AI 出题（异步落库） ====================
const aiVisible = ref(false);
const aiLoading = ref(false);
const aiError = ref('');
const aiForm = reactive({
  chapterId: null as number | null,
  /** QuestionGenerateRequest.questionType 是 string：'all' 或 '1'~'6' */
  questionType: 'all',
  difficultyConfigId: 0,
  count: 5,
  userInstruction: '',
});

const AI_TYPE_OPTIONS = [
  { value: 'all', label: '全部题型' },
  ...QUESTION_TYPE_OPTIONS.map((t) => ({ value: String(t.value), label: t.label })),
];

function openAi() {
  aiForm.chapterId = filters.chapterId ?? aiForm.chapterId;
  aiForm.difficultyConfigId = filters.difficultyConfigId;
  aiError.value = '';
  aiVisible.value = true;
}

async function runGenerate() {
  if (aiLoading.value) return;
  aiLoading.value = true;
  aiError.value = '';
  try {
    const accepted = await generateQuestions({
      chapterId: aiForm.chapterId ?? undefined,
      difficultyConfigId: aiForm.difficultyConfigId || undefined,
      questionType: aiForm.questionType,
      count: aiForm.count,
      userInstruction: aiForm.userInstruction.trim() || undefined,
    });
    if (accepted === 0) {
      aiError.value = '出题任务没能提交成功，请稍后重试';
      return;
    }
    ElMessage.success('出题任务已提交，题目生成后会出现在列表里，稍后刷新即可看到');
    aiVisible.value = false;
    await loadList();
  } catch (e) {
    aiError.value = `出题任务提交失败：${(e as Error)?.message ?? '未知错误'}`;
  } finally {
    aiLoading.value = false;
  }
}

onMounted(() => {
  difficultyStore.load();
  loadChapters();
  loadList();
});
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">题库管理</h1>
      <p class="st-page-subtitle">维护章节题目 · 支持手动录入、AI 出题与选题组卷</p>
    </header>

    <!-- 筛选 -->
    <div class="st-card">
      <div class="st-card__header">
        <Search :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">题目筛选</h2>
          <p class="st-card__hint">按章节、题型、难度和题干关键词筛选题目</p>
        </div>
      </div>
      <div class="st-card__body filter-row">
        <div class="filter-item">
          <label class="filter-label">教材章节</label>
          <ChapterSelect v-model="filters.chapterId" placeholder="全部章节" clearable style="width: 220px;" />
        </div>
        <div class="filter-item">
          <label class="filter-label">题型</label>
          <el-select v-model="filters.type" style="width: 130px;">
            <el-option label="全部题型" :value="0" />
            <el-option v-for="t in QUESTION_TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </div>
        <div class="filter-item">
          <label class="filter-label">难度</label>
          <el-select v-model="filters.difficultyConfigId" style="width: 130px;">
            <el-option label="全部难度" :value="0" />
            <el-option v-for="d in difficultyOptions" :key="d.value" :label="d.label" :value="d.value" />
          </el-select>
        </div>
        <div class="filter-item">
          <label class="filter-label">题干关键词</label>
          <input v-model="filters.keyword" class="form-input" placeholder="模糊匹配题干" />
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
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="st-card" style="margin-top: 20px;">
      <div class="st-card__body toolbar-row">
        <span class="toolbar-count">
          共 {{ total }} 题 · 第 {{ page }} / {{ pageCount }} 页 · 本页 {{ rows.length }} 行
        </span>
        <div class="toolbar-actions">
          <button
            class="st-btn st-btn--secondary"
            title="勾选或随机抽题组卷，并可直接布置作业"
            @click="openPicker"
          >
            <Layers :size="13" /> 选题组卷
          </button>
          <button
            class="st-btn st-btn--secondary"
            :disabled="aiLoading"
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
            当前筛选条件下暂无题目
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
                  <th>编号</th>
                  <th>简短题目</th>
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
                  <td class="cell-content" :title="row.shortTitle || ''">{{ row.shortTitle || '—' }}</td>
                  <td class="cell-content" :title="row.content">{{ row.content || '—' }}</td>
                  <td><span class="st-badge st-badge--outline">{{ typeLabel(row.type) }}</span></td>
                  <td class="cell-secondary">{{ difficultyText(row) }}</td>
                  <td class="cell-secondary">{{ chapterLabel(row.chapterId) }}</td>
                  <td class="cell-secondary">{{ row.score ?? '—' }}</td>
                  <td class="cell-secondary">{{ row.submitCount ?? 0 }}</td>
                  <td class="cell-secondary">{{ ratePercent(row.acceptanceRate) }}</td>
                  <td>
                    <div class="row-actions">
                      <button
                        class="st-text-btn"
                        title="编辑题目"
                        @click="openDrawer('edit', row)"
                      >
                        <Pencil :size="12" /> 编辑
                      </button>
                      <button
                        class="st-text-btn st-text-btn--danger"
                        :disabled="deletingId === row.id"
                        title="删除题目"
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
              <h3>{{ drawerMode === 'create' ? '新增题目' : '编辑题目' }}</h3>
              <button class="drawer-close" @click="closeDrawer">
                <X :size="14" />
              </button>
            </div>
            <div class="drawer-body">
              <p v-if="drawerLoading" class="drawer-loading">
                <Loader2 :size="13" class="spin" /> 正在读取这道题的完整信息…
              </p>
              <p v-if="drawerError" class="inline-error">
                <AlertTriangle :size="12" /> {{ drawerError }}
              </p>

              <div class="form-item">
                <label class="form-label">题干（必填）</label>
                <textarea v-model="form.content" class="form-textarea" rows="3" placeholder="题干正文"></textarea>
              </div>

              <div class="form-item">
                <label class="form-label">简短题目（选填，≤100 字）</label>
                <input
                  v-model="form.shortTitle"
                  class="form-input"
                  maxlength="100"
                  placeholder="一话题名，如「接口与抽象类的区别」；留空时列表回退展示题干"
                />
              </div>

              <div class="form-row">
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">题型</label>
                  <el-select v-model="form.type" style="width: 100%;" @change="onTypeChange">
                    <el-option v-for="t in QUESTION_TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
                  </el-select>
                </div>
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">难度</label>
                  <el-select v-model="form.difficultyConfigId" placeholder="选择难度" style="width: 100%;">
                    <el-option v-for="d in difficultyOptions" :key="d.value" :label="d.label" :value="d.value" />
                  </el-select>
                </div>
              </div>

              <div class="form-row">
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">章节</label>
                  <ChapterSelect v-model="form.chapterId" placeholder="选择章节" clearable style="width: 100%;" />
                </div>
                <div class="form-item" style="width: 110px;">
                  <label class="form-label">分值</label>
                  <el-input-number v-model="form.score" :min="0" :max="100" style="width: 100%;" />
                </div>
                <div v-if="isProgramming" class="form-item" style="width: 110px;">
                  <label class="form-label">权重</label>
                  <el-input-number v-model="form.weight" :min="0" :step="0.1" style="width: 100%;" />
                </div>
              </div>

              <div class="form-row">
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">认知层级</label>
                  <el-select v-model="form.cognitiveLevel" style="width: 100%;">
                    <el-option v-for="c in COGNITIVE_OPTIONS" :key="c" :label="c" :value="c" />
                  </el-select>
                </div>
                <div v-if="isProgramming" class="form-item" style="flex: 1;">
                  <label class="form-label">判题方式</label>
                  <el-select v-model="form.judgeMode" style="width: 100%;">
                    <el-option v-for="j in JUDGE_MODE_OPTIONS" :key="j.value" :label="j.label" :value="j.value" />
                  </el-select>
                </div>
              </div>

              <!-- 选择题：逐条编辑选项 + 从选项里选答案 -->
              <template v-if="isChoice">
                <div class="form-item">
                  <label class="form-label">选择方式</label>
                  <!-- 显式声明：多选只勾一个选项时后端无法从答案推断，必须靠 renderConfig -->
                  <el-radio-group v-model="form.choiceMode">
                    <el-radio-button value="single">单选</el-radio-button>
                    <el-radio-button value="multiple">多选</el-radio-button>
                  </el-radio-group>
                </div>
                <div class="form-item">
                  <div class="option-head">
                    <label class="form-label">选项（至少 {{ OPTION_MIN }} 个，最多 {{ OPTION_MAX }} 个）</label>
                    <button
                      type="button"
                      class="st-text-btn"
                      :disabled="form.options.length >= OPTION_MAX"
                      @click="addOption"
                    >
                      <Plus :size="12" /> 添加选项
                    </button>
                  </div>
                  <div class="option-list">
                    <div v-for="(_, i) in form.options" :key="i" class="option-row">
                      <span class="option-letter">{{ optionLetter(i) }}</span>
                      <input
                        v-model="form.options[i]"
                        class="form-input"
                        :placeholder="`选项 ${optionLetter(i)} 的内容`"
                      />
                      <button
                        type="button"
                        class="option-remove"
                        :disabled="form.options.length <= OPTION_MIN"
                        title="删除这个选项"
                        @click="removeOption(i)"
                      >
                        <X :size="12" />
                      </button>
                    </div>
                  </div>
                </div>

                <div class="form-item">
                  <label class="form-label">正确答案（多选可以选多个）</label>
                  <el-select
                    v-model="form.answerLetters"
                    multiple
                    placeholder="从上面的选项里选择"
                    style="width: 100%;"
                  >
                    <el-option v-for="o in answerChoices" :key="o.value" :label="o.label" :value="o.value" />
                  </el-select>
                </div>
              </template>

              <!-- 判断题：答案只有正确 / 错误 -->
              <div v-else-if="isJudge" class="form-item">
                <label class="form-label">答案</label>
                <el-radio-group v-model="form.judgeAnswer">
                  <el-radio value="正确">正确</el-radio>
                  <el-radio value="错误">错误</el-radio>
                </el-radio-group>
              </div>

              <!-- 填空题：一个空一条答案，可增删 -->
              <div v-else-if="isFill" class="form-item">
                <div class="option-head">
                  <label class="form-label">答案（按空的顺序填写，最多 10 空）</label>
                  <button
                    type="button"
                    class="st-text-btn"
                    :disabled="form.blanks.length >= 10"
                    @click="addBlank"
                  >
                    <Plus :size="12" /> 添加空
                  </button>
                </div>
                <div class="form-item form-item--inline">
                  <label class="form-label">空数</label>
                  <el-input-number v-model="form.blankCount" :min="1" :max="10" @change="setBlankCount" />
                  <span class="form-hint">学生端按这个数量渲染输入框（renderConfig.blankCount）</span>
                </div>
                <div class="option-list">
                  <div v-for="(_, i) in form.blanks" :key="i" class="option-row">
                    <span class="option-letter">{{ i + 1 }}</span>
                    <input v-model="form.blanks[i]" class="form-input" :placeholder="`第 ${i + 1} 空的答案`" />
                    <button
                      type="button"
                      class="option-remove"
                      :disabled="form.blanks.length <= 1"
                      title="删除这个空"
                      @click="removeBlank(i)"
                    >
                      <X :size="12" />
                    </button>
                  </div>
                </div>
              </div>

              <!-- 程序阅读 / 编程 / 简答：文本答案 -->
              <div v-else class="form-item">
                <label class="form-label">
                  {{ isProgramming ? '参考答案（参考实现）' : isReading ? '参考答案（程序输出）' : '参考答案' }}
                </label>
                <textarea
                  v-model="form.answer"
                  class="form-textarea"
                  :class="{ 'code-textarea': isProgramming }"
                  rows="3"
                  :placeholder="isProgramming ? '参考实现代码' : isReading ? '程序的输出结果或结论' : '标准答案'"
                ></textarea>
              </div>

              <div class="form-item">
                <label class="form-label">解析（学生端可见）</label>
                <textarea v-model="form.analysis" class="form-textarea" rows="2" placeholder="答案解析"></textarea>
              </div>

              <template v-if="needsCode">
                <div class="form-item">
                  <label class="form-label">作答要求（一行一条）</label>
                  <textarea v-model="form.requirements" class="form-textarea" rows="2" placeholder="功能与规范要求"></textarea>
                </div>
                <div class="form-item">
                  <label class="form-label">代码框架（给学生的初始代码）</label>
                  <textarea
                    v-model="form.codeFramework"
                    class="form-textarea code-textarea"
                    rows="4"
                    placeholder="下发给学生的初始代码骨架"
                  ></textarea>
                </div>
              </template>

              <template v-if="isProgramming">
                <div class="form-item">
                  <label class="form-label">提示（一行一条）</label>
                  <textarea v-model="form.hints" class="form-textarea" rows="2" placeholder="分步提示"></textarea>
                </div>
                <div class="form-item">
                  <label class="form-label">解题思路</label>
                  <textarea v-model="form.solutionOutline" class="form-textarea" rows="2" placeholder="参考思路提纲"></textarea>
                </div>
                <div class="form-item">
                  <label class="form-label">测试用例（按示例格式填写）</label>
                  <textarea
                    v-model="form.testCases"
                    class="form-textarea code-textarea"
                    rows="7"
                    placeholder='[{"input":"3 5","expectedOutput":"8","description":"示例用例"}]'
                  ></textarea>
                  <p class="field-hint">留空的项会按默认值补齐；格式有误时会提示并暂停保存，不会漏掉用例。</p>
                </div>
              </template>
            </div>
            <div class="drawer-footer">
              <button class="st-btn st-btn--ghost" @click="closeDrawer">取消</button>
              <button
                class="st-btn st-btn--primary"
                :disabled="saving"
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

    <!-- 选题组卷：勾选与随机抽题共用一个面板（作业发布页也用同一个组件） -->
    <div v-if="pickerVisible" class="overlay" @click.self="closePicker">
      <div class="dialog">
        <header class="dialog__head">
          <div>
            <h3 class="dialog__title">选题组卷</h3>
            <p class="dialog__sub">按条件勾选或随机抽题，选好可以直接布置一次作业</p>
          </div>
          <button class="st-btn st-btn--ghost" @click="closePicker">关闭</button>
        </header>
        <div class="dialog__body">
          <QuestionPicker v-model="picked" :initial-chapter-id="filters.chapterId" />

          <div v-if="!publishOpen" class="dialog__actions">
            <button class="st-btn st-btn--primary" :disabled="!picked.length" @click="openPublishForm">
              <Send :size="14" /> 布置为作业（已选 {{ picked.length }} 题 · 总分 {{ pickedScore }}）
            </button>
          </div>

          <div v-else class="publish-box">
            <div class="form-item">
              <label class="form-label">作业标题</label>
              <input v-model="publishForm.title" class="form-input" placeholder="作业标题" />
            </div>
            <div class="form-row">
              <div class="form-item" style="flex: 1;">
                <label class="form-label">发布班级（必选）</label>
                <el-select v-model="publishForm.classId" placeholder="选择班级" filterable style="width: 100%;">
                  <el-option v-for="c in classes" :key="c.classId" :label="c.className" :value="c.classId" />
                </el-select>
              </div>
              <div class="form-item" style="flex: 1;">
                <label class="form-label">截止时间</label>
                <el-date-picker
                  v-model="publishForm.deadline"
                  type="datetime"
                  value-format="YYYY-MM-DD HH:mm:ss"
                  placeholder="选择截止时间"
                  style="width: 100%;"
                />
              </div>
            </div>
            <div class="form-row">
              <div class="form-item" style="width: 190px;">
                <label class="form-label">总分（按题目分值汇总）</label>
                <div class="publish-score">{{ publishForm.totalScore }} 分 · {{ picked.length }} 题</div>
              </div>
              <div class="form-item" style="flex: 1;">
                <label class="form-label">允许迟交</label>
                <el-switch v-model="publishForm.allowLateSubmit" :active-value="1" :inactive-value="0" />
              </div>
            </div>
            <div class="form-item">
              <label class="form-label">作业说明</label>
              <textarea
                v-model="publishForm.content"
                class="form-textarea"
                rows="2"
                placeholder="学生端显示的作业说明"
              ></textarea>
            </div>
            <div class="dialog__actions">
              <button class="st-btn st-btn--secondary" @click="publishOpen = false">取消</button>
              <button
                class="st-btn st-btn--primary"
                :disabled="publishing || !canPublishPicked"
                @click="submitPublish"
              >
                <Loader2 v-if="publishing" :size="14" class="spin" />
                <Send v-else :size="14" />
                {{ publishing ? '发布中' : '发布作业' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- AI 出题 -->
    <div v-if="aiVisible" class="overlay" @click.self="aiVisible = false">
      <div class="dialog">
        <header class="dialog__head">
          <div>
            <h3 class="dialog__title">AI 出题</h3>
            <p class="dialog__sub">让系统按章节和题型自动出题，出题结果会进入题库</p>
          </div>
          <button class="st-btn st-btn--ghost" @click="aiVisible = false">关闭</button>
        </header>
        <div class="dialog__body">
          <p class="drawer-hint">
            系统会按章节和题型自动出题并保存到题库；新题目需要一点时间才会出现，稍后刷新列表即可看到。
          </p>
          <div class="form-row">
            <div class="form-item" style="flex: 1;">
              <label class="form-label">章节（可选）</label>
              <ChapterSelect v-model="aiForm.chapterId" placeholder="不限章节" clearable style="width: 100%;" />
            </div>
            <div class="form-item" style="width: 150px;">
              <label class="form-label">题型</label>
              <el-select v-model="aiForm.questionType" style="width: 100%;">
                <el-option v-for="t in AI_TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
              </el-select>
            </div>
            <div class="form-item" style="width: 150px;">
              <label class="form-label">难度</label>
              <el-select v-model="aiForm.difficultyConfigId" placeholder="不限难度" clearable style="width: 100%;">
                <el-option label="不限难度" :value="0" />
                <el-option v-for="d in difficultyOptions" :key="d.value" :label="d.label" :value="d.value" />
              </el-select>
            </div>
            <div class="form-item" style="width: 120px;">
              <label class="form-label">数量</label>
              <el-input-number v-model="aiForm.count" :min="1" :max="20" style="width: 100%;" />
            </div>
          </div>
          <div class="form-item">
            <label class="form-label">附加要求（可选）</label>
            <textarea
              v-model="aiForm.userInstruction"
              class="form-textarea"
              rows="3"
              placeholder="如：围绕多态特性出题，题干带代码片段，难度偏中等"
            ></textarea>
          </div>
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

/* 标签 + 控件 + 说明同排（如填空题的「空数」） */
.form-item--inline {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.form-item--inline .form-label {
  margin-bottom: 0;
}

.form-hint {
  font-size: 11.5px;
  color: var(--text-tertiary);
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

/* 选择题选项编辑 */
.option-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.option-head .form-label {
  margin-bottom: 0;
}

.option-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.option-row .form-input {
  flex: 1;
  min-width: 0;
}

.option-letter {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-default);
  border-radius: 50%;
  background: var(--bg-subtle);
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

.option-remove {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color var(--transition), border-color var(--transition);
}

.option-remove:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--border-strong);
}

.option-remove:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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

/* 抽题结果直接布置作业 */
.publish-box {
  margin-top: 14px;
  padding: 14px 14px 4px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.publish-score {
  height: 34px;
  display: flex;
  align-items: center;
  font-size: 13px;
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
