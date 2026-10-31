<script setup lang="ts">
/**
 * AI 智能备课（异步生成）
 *
 * 流程要点：
 * - POST /api/agent/teach/prepare 秒回收理回执（recordId + status=2 生成中），材料由后台工作流异步写入；
 * - 轮询由 stores/prepare 负责（先等 3 秒，之后每 20 秒查一次 GET /api/teach/prepare/record/status?id=，
 *   状态转 1 才拉 detail），状态在全局 store 里，中途切到别的产品页再回来，等待态与结果都不丢；
 * - 「取消生成」只停本地轮询并清空记录编号，不通知后端，任务在服务端继续跑，稍后可在「备课记录」页看到；
 * - 生成开关是字符串：'1' 开启 / '0' 关闭；五类材料正文均为 Markdown 文本；
 * - PPT 下载走 GET /api/teach/ppt/download?recordId=，教案导出走 GET /api/teach/prepare/record/export?recordId=；
 *   直链 pptxUrl 可能 404，以下载接口为准。
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Ban,
  Check,
  ClipboardCheck,
  ClipboardList,
  Download,
  FileText,
  Lightbulb,
  ListTree,
  Loader2,
  Presentation,
  ScrollText,
  Sparkles,
  TriangleAlert,
  Wrench,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import ChapterSelect from '@/components/ChapterSelect.vue';
import PptDeck from '@/components/teacher/PptDeck.vue';
import { downloadPpt, fetchPptTemplates } from '@/api/teacher';
import { usePrepareStore } from '@/stores/prepare';
import { useChapters } from '@/composables/useChapters';
import type { PptTemplate, TeachPrepareRequest } from '@/types/teacher';
import { isBlankPptx, saveBlob } from '@/utils/download';
import { renderMarkdown, splitMarkdownSlides } from '@/utils/markdown';

/** 生成开关字段名（与 TeachPrepareRequest 的字符串开关一一对应） */
type SwitchKey = 'lessonPlan' | 'pptx' | 'keyPoints' | 'homework' | 'lab';

const SWITCHES: { key: SwitchKey; label: string }[] = [
  { key: 'lessonPlan', label: '章节教案' },
  { key: 'pptx', label: '课堂 PPT' },
  { key: 'keyPoints', label: '重难点' },
  { key: 'homework', label: '课后习题' },
  { key: 'lab', label: '上机实训' },
];

interface ChoiceOption {
  label: string;
  value: string;
}

const YES_NO: ChoiceOption[] = [
  { label: '是', value: '1' },
  { label: '否', value: '0' },
];

const COURSE_TYPES: ChoiceOption[] = [
  { label: '新授课', value: 'new' },
  { label: '复习课', value: 'review' },
];

const DETAIL_LEVELS: ChoiceOption[] = [
  { label: '简案', value: 'brief' },
  { label: '标准', value: 'medium' },
  { label: '详案', value: 'detailed' },
];

const router = useRouter();
const chapterId = ref<number | null>(null);
const templates = ref<PptTemplate[]>([]);
const templateId = ref<number | null>(null);
/** 模板列表改为按需加载：不在登录落地页启动时请求，避免辅助接口权限问题把登录态踢掉 */
const templatesLoaded = ref(false);
const templatesLoading = ref(false);
const prepare = usePrepareStore();
const pptDownloading = ref(false);
/** 结果一律来自全局轮询任务，页面本地不另存一份 */
const detail = computed(() => prepare.detail);
const slides = computed(() => splitMarkdownSlides(detail.value?.pptxMd ?? ''));
/** 本次生成实际勾选的开关，用于决定结果区展示哪几块 */
const requested = reactive<Record<SwitchKey, boolean>>({
  lessonPlan: true,
  pptx: true,
  keyPoints: true,
  homework: true,
  lab: true,
});
/** 以下三组参数：选中对应材料后才展开，未填写的数值字段提交时省略，由工作流兜底 */
const pptConfig = reactive({
  pageRange: '10-14',
  includeOutline: '1',
  includeSummary: '1',
  codeBlockMax: '3',
});
const lessonPlanConfig = reactive({
  courseType: 'new',
  duration: '45',
  detailLevel: 'medium',
  includeBoardDesign: '1',
  includeExercise: '1',
});
const homeworkConfig = reactive({
  questionCount: '5',
  difficultyDistribution: '2,2,1',
});
/** 其他要求 → userMessage */
const userMessage = ref('');
const messageRef = ref<HTMLTextAreaElement | null>(null);

/** 输入框随内容自动增高：先归零再按 scrollHeight 撑开，超过 max-height 后改为内部滚动 */
function resizeMessage() {
  const el = messageRef.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + 2}px`; // +2 补上下边框，避免出现多余滚动条
}

watch(userMessage, () => nextTick(resizeMessage));

/** 章节下拉：统一走 <ChapterSelect> + useChapters，页面不再自己拉章节列表 */
const { labelOf, load: loadChapters } = useChapters();

const selectedChapterTitle = computed(() => labelOf(chapterId.value));

onMounted(() => {
  void loadChapters();
});

/** 用户展开模板下拉时再拉列表，不占用登录后的首屏请求 */
async function loadPptTemplateOptions() {
  if (templatesLoaded.value || templatesLoading.value) return;
  templatesLoading.value = true;
  try {
    templates.value = await fetchPptTemplates();
    templatesLoaded.value = true;
  } catch {
    // 错误由响应拦截器统一提示
  } finally {
    templatesLoading.value = false;
  }
}

function onTemplateVisible(open: boolean) {
  if (open) void loadPptTemplateOptions();
}

const anySwitchOn = computed(() => SWITCHES.some((s) => requested[s.key]));

async function handleGenerate() {
  if (!chapterId.value) {
    ElMessage.warning('请先选择章节');
    return;
  }
  if (!anySwitchOn.value) {
    ElMessage.warning('请至少勾选一项要生成的内容');
    return;
  }
  const payload: TeachPrepareRequest = {
    chapterId: chapterId.value,
    // 后端要求字符串开关：'1' 生成、'0' 跳过
    lessonPlan: requested.lessonPlan ? '1' : '0',
    pptx: requested.pptx ? '1' : '0',
    keyPoints: requested.keyPoints ? '1' : '0',
    homework: requested.homework ? '1' : '0',
    lab: requested.lab ? '1' : '0',
    userMessage: userMessage.value.trim() || undefined,
  };
  if (requested.pptx) {
    if (templateId.value) payload.templateId = templateId.value;
    payload.pptConfig = {
      pageRange: pptConfig.pageRange.trim() || undefined,
      includeOutline: pptConfig.includeOutline,
      includeSummary: pptConfig.includeSummary,
      codeBlockMax: pptConfig.codeBlockMax.trim() || undefined,
    };
  }
  if (requested.lessonPlan) {
    payload.lessonPlanConfig = {
      courseType: lessonPlanConfig.courseType,
      duration: lessonPlanConfig.duration.trim() || undefined,
      detailLevel: lessonPlanConfig.detailLevel,
      includeBoardDesign: lessonPlanConfig.includeBoardDesign,
      includeExercise: lessonPlanConfig.includeExercise,
    };
  }
  if (requested.homework) {
    payload.homeworkConfig = {
      questionCount: homeworkConfig.questionCount.trim() || undefined,
      difficultyDistribution: homeworkConfig.difficultyDistribution.trim() || undefined,
    };
  }

  await prepare.run(payload);
}

/** 备课记录编号：优先用任务里的，刷新后也能从结果里取到 */
const activeRecordId = computed(() => prepare.recordId ?? detail.value?.id ?? null);

/**
 * PPT 下载可用：有记录编号，且本次备课确实留下了课件正文（pptxMd 能切出页）。
 * pptxMd 为空时连下载入口都不展示——没有课件内容，后端也生成不出文件。
 */
const canDownloadPpt = computed(() => !!activeRecordId.value && !!slides.value.length);

/** GET /api/teach/ppt/download?recordId= —— 真实文件流下载，不依赖 pptxUrl 直链 */
async function handleDownloadPpt() {
  const id = activeRecordId.value;
  if (!id || !canDownloadPpt.value || pptDownloading.value) return;
  pptDownloading.value = true;
  try {
    const blob = await downloadPpt(id);
    if (await isBlankPptx(blob)) {
      ElMessage.warning('课件文件还没生成好，请稍后再试');
      return;
    }
    saveBlob(blob, `备课PPT_第${detail.value?.chapterId ?? id}章_${id}.pptx`);
    ElMessage.success('课堂 PPT 已下载');
  } catch {
    // 下载失败（403/404/业务码）已由响应拦截器统一提示
  } finally {
    pptDownloading.value = false;
  }
}

function goRecords() {
  router.push('/teach/records');
}

/** 某一 Markdown 分区的正文（结果未到或后端返回空串都按空处理） */
function sectionText(key: 'lessonPlan' | 'keyPoints' | 'homework' | 'lab'): string {
  return (detail.value?.[key] ?? '').trim();
}

/** 已到手的任一材料，用于判断是否要展示结果区 */
const hasAnyMaterial = computed(
  () => !!detail.value && (!!slides.value.length || !!sectionText('lessonPlan') || !!sectionText('keyPoints') || !!sectionText('homework') || !!sectionText('lab')),
);

function fmt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

</script>

<template>
  <div class="st-view">
    <header class="st-page-header page-head">
      <div class="page-head__text">
        <h1 class="st-page-title">AI 智能备课</h1>
        <p class="st-page-subtitle">教学备课辅助智能体 · 按教材章节生成教案、PPT、重难点、课后习题与上机实训方案</p>
      </div>
      <button class="st-btn st-btn--secondary page-head__btn" @click="goRecords">
        <ClipboardList :size="14" /> 查看备课记录
      </button>
    </header>

    <!-- 配置 -->
    <div class="st-card">
      <div class="st-card__body config-body">
        <div class="config-row">
          <div class="config-item">
            <label class="config-label">教材章节</label>
            <ChapterSelect v-model="chapterId" placeholder="选择章节" style="width: 320px;" />
          </div>
          <button
            class="st-btn st-btn--primary generate-btn"
            :disabled="prepare.busy || !chapterId || !anySwitchOn"
            @click="handleGenerate"
          >
            <Loader2 v-if="prepare.busy" :size="14" class="spin" />
            <Sparkles v-else :size="14" />
            {{ prepare.stage === 'submitting' ? '正在提交备课任务…' : prepare.busy ? '备课任务进行中…' : '一键生成备课材料' }}
          </button>
        </div>

        <!-- 生成开关：点一下即选中，选中态黑底白勾；提交时映射为后端的 '1' / '0' -->
        <div class="config-item" style="margin-top: 4px;">
          <label class="config-label">生成内容</label>
          <div class="switch-list">
            <button
              v-for="s in SWITCHES"
              :key="s.key"
              type="button"
              :class="['switch-chip', requested[s.key] && 'switch-chip--on']"
              :aria-pressed="requested[s.key] ? 'true' : 'false'"
              @click="requested[s.key] = !requested[s.key]"
            >
              <span class="switch-chip__box">
                <Check v-if="requested[s.key]" :size="11" :stroke-width="3" />
              </span>
              {{ s.label }}
            </button>
          </div>
        </div>

        <!-- 已选材料的参数：勾选才展开，块与块之间用细线分隔，展开/收起带淡入淡出 -->
        <div class="param-stack">
          <Transition name="param">
            <div v-if="requested.pptx" class="param-block">
              <div class="param-block__clip">
                <div class="param-block__body">
                  <h3 class="param-block__title">课堂 PPT 参数</h3>
                  <div class="param-fields">
                    <div class="param-field">
                      <span class="param-field__label">PPT 模板</span>
                      <el-select
                        v-model="templateId"
                        placeholder="系统默认模板"
                        clearable
                        :loading="templatesLoading"
                        style="width: 190px;"
                        @visible-change="onTemplateVisible"
                      >
                        <el-option v-for="t in templates" :key="t.id" :label="t.name" :value="t.id" />
                      </el-select>
                    </div>
                    <label class="param-field">
                      <span class="param-field__label">页数范围</span>
                      <input v-model="pptConfig.pageRange" class="param-input" placeholder="10-14" />
                    </label>
                    <div class="param-field">
                      <span class="param-field__label">包含目录页</span>
                      <div class="param-choices" role="group" aria-label="是否包含目录页">
                        <button
                          v-for="o in YES_NO"
                          :key="o.value"
                          type="button"
                          class="param-choice"
                          :class="{ 'is-on': pptConfig.includeOutline === o.value }"
                          :aria-pressed="pptConfig.includeOutline === o.value ? 'true' : 'false'"
                          @click="pptConfig.includeOutline = o.value"
                        >
                          {{ o.label }}
                        </button>
                      </div>
                    </div>
                    <div class="param-field">
                      <span class="param-field__label">包含总结页</span>
                      <div class="param-choices" role="group" aria-label="是否包含总结页">
                        <button
                          v-for="o in YES_NO"
                          :key="o.value"
                          type="button"
                          class="param-choice"
                          :class="{ 'is-on': pptConfig.includeSummary === o.value }"
                          :aria-pressed="pptConfig.includeSummary === o.value ? 'true' : 'false'"
                          @click="pptConfig.includeSummary = o.value"
                        >
                          {{ o.label }}
                        </button>
                      </div>
                    </div>
                    <label class="param-field">
                      <span class="param-field__label">每页代码块上限</span>
                      <input
                        v-model="pptConfig.codeBlockMax"
                        class="param-input param-input--sm"
                        inputmode="numeric"
                        placeholder="3"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </Transition>

          <Transition name="param">
            <div v-if="requested.lessonPlan" class="param-block">
              <div class="param-block__clip">
                <div class="param-block__body">
                  <h3 class="param-block__title">章节教案参数</h3>
                  <div class="param-fields">
                    <div class="param-field">
                      <span class="param-field__label">课型</span>
                      <div class="param-choices" role="group" aria-label="课型">
                        <button
                          v-for="o in COURSE_TYPES"
                          :key="o.value"
                          type="button"
                          class="param-choice"
                          :class="{ 'is-on': lessonPlanConfig.courseType === o.value }"
                          :aria-pressed="lessonPlanConfig.courseType === o.value ? 'true' : 'false'"
                          @click="lessonPlanConfig.courseType = o.value"
                        >
                          {{ o.label }}
                        </button>
                      </div>
                    </div>
                    <label class="param-field">
                      <span class="param-field__label">课时时长（分钟）</span>
                      <input
                        v-model="lessonPlanConfig.duration"
                        class="param-input param-input--sm"
                        inputmode="numeric"
                        placeholder="45"
                      />
                    </label>
                    <div class="param-field">
                      <span class="param-field__label">详细度</span>
                      <div class="param-choices" role="group" aria-label="教案详细度">
                        <button
                          v-for="o in DETAIL_LEVELS"
                          :key="o.value"
                          type="button"
                          class="param-choice"
                          :class="{ 'is-on': lessonPlanConfig.detailLevel === o.value }"
                          :aria-pressed="lessonPlanConfig.detailLevel === o.value ? 'true' : 'false'"
                          @click="lessonPlanConfig.detailLevel = o.value"
                        >
                          {{ o.label }}
                        </button>
                      </div>
                    </div>
                    <div class="param-field">
                      <span class="param-field__label">包含板书设计</span>
                      <div class="param-choices" role="group" aria-label="是否包含板书设计">
                        <button
                          v-for="o in YES_NO"
                          :key="o.value"
                          type="button"
                          class="param-choice"
                          :class="{ 'is-on': lessonPlanConfig.includeBoardDesign === o.value }"
                          :aria-pressed="lessonPlanConfig.includeBoardDesign === o.value ? 'true' : 'false'"
                          @click="lessonPlanConfig.includeBoardDesign = o.value"
                        >
                          {{ o.label }}
                        </button>
                      </div>
                    </div>
                    <div class="param-field">
                      <span class="param-field__label">包含课堂练习</span>
                      <div class="param-choices" role="group" aria-label="是否包含课堂练习环节">
                        <button
                          v-for="o in YES_NO"
                          :key="o.value"
                          type="button"
                          class="param-choice"
                          :class="{ 'is-on': lessonPlanConfig.includeExercise === o.value }"
                          :aria-pressed="lessonPlanConfig.includeExercise === o.value ? 'true' : 'false'"
                          @click="lessonPlanConfig.includeExercise = o.value"
                        >
                          {{ o.label }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Transition>

          <Transition name="param">
            <div v-if="requested.homework" class="param-block">
              <div class="param-block__clip">
                <div class="param-block__body">
                  <h3 class="param-block__title">课后习题参数</h3>
                  <div class="param-fields">
                    <label class="param-field">
                      <span class="param-field__label">题目数量</span>
                      <input
                        v-model="homeworkConfig.questionCount"
                        class="param-input param-input--sm"
                        inputmode="numeric"
                        placeholder="5"
                      />
                    </label>
                    <label class="param-field">
                      <span class="param-field__label">难度分布（易,中,难）</span>
                      <input
                        v-model="homeworkConfig.difficultyDistribution"
                        class="param-input param-input--wide"
                        placeholder="2,2,1"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </Transition>

          <div class="config-item param-foot">
            <label class="config-label">其他要求（选填）</label>
            <textarea
              ref="messageRef"
              v-model="userMessage"
              class="form-textarea"
              rows="2"
              placeholder="如：面向零基础本科一年级，教案多用生活化类比；习题侧重继承与多态的辨析题。"
            ></textarea>
          </div>
        </div>
      </div>
    </div>

    <!-- 等待：轮询由全局任务驱动，切到别的页面也不会中断 -->
    <div v-if="prepare.busy" class="st-card wait-card" style="margin-top: 20px;">
      <div class="st-card__body wait-body">
        <Loader2 :size="24" class="spin" />
        <div class="wait-text">
          <p class="wait-title">
            {{ prepare.stage === 'submitting' ? '正在把备课任务交给智能体…' : '智能体正在研读本章内容并生成材料…' }}
          </p>
          <p v-if="prepare.recordId" class="wait-meta">
            已等待 {{ prepare.waitedSeconds }} 秒
          </p>
          <p class="wait-hint">AI 正在拼命生成，请耐心等待；您可以离开此页面，记录不会消失。</p>
        </div>
        <button class="st-btn st-btn--secondary wait-cancel" @click="prepare.cancel()">
          <Ban :size="14" /> 取消生成
        </button>
      </div>
    </div>

    <template v-else>
      <!-- 超时或查询出错：已到手的内容照常展示 -->
      <div v-if="prepare.stage === 'failed'" class="st-card fail-card" style="margin-top: 20px;">
        <div class="st-card__body fail-body">
          <TriangleAlert :size="16" class="card-icon" />
          <div class="fail-text">
            <p class="fail-title">这次备课没有完成</p>
            <p class="fail-msg">{{ prepare.error }}</p>
            <p v-if="prepare.recordId" class="fail-msg">
              材料可能还在后台生成，稍后可到「备课记录」页回看这次备课的产出。
            </p>
          </div>
          <div class="fail-ops">
            <button class="st-btn st-btn--secondary" @click="goRecords">备课记录</button>
            <button class="st-btn st-btn--ghost" @click="prepare.clear()">清空状态</button>
          </div>
        </div>
      </div>

      <!-- 空态 -->
      <div v-else-if="!hasAnyMaterial" class="st-card" style="margin-top: 20px;">
        <div class="st-card__body st-empty" style="padding: 90px 16px;">
          <Presentation :size="44" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">选择章节并勾选要生成的内容，备课智能体将基于教材本章内容生成材料</div>
        </div>
      </div>

      <div v-if="hasAnyMaterial && detail" class="result-wrap">
        <!-- 结果元信息 -->
        <div class="st-card meta-card">
          <div class="st-card__body meta-body">
            <div class="meta-group">
              <span class="meta-sub">{{ selectedChapterTitle || '本章' }}</span>
              <span class="meta-sub">备课时间 {{ fmt(detail.createTime) }}</span>
            </div>
            <div class="meta-ops">
              <button class="st-btn st-btn--secondary" @click="goRecords">
                <ClipboardList :size="14" /> 备课记录
              </button>
            </div>
            <div class="meta-extra">
              <p class="meta-line">材料已逐项生成，未生成的类别不显示卡片；随时可在「备课记录」页回看并导出教案。</p>
            </div>
          </div>
        </div>

        <div class="result-grid">
          <!-- 教案 -->
          <section v-if="sectionText('lessonPlan')" class="st-card">
            <div class="st-card__header">
              <FileText :size="16" class="card-icon" />
              <h2 class="st-card__title">章节教案</h2>
            </div>
            <div class="st-card__body">
              <div class="md" v-html="renderMarkdown(detail.lessonPlan)" />
            </div>
          </section>

          <!-- 重难点 -->
          <section v-if="sectionText('keyPoints')" class="st-card">
            <div class="st-card__header">
              <ListTree :size="16" class="card-icon" />
              <h2 class="st-card__title">重难点清单</h2>
            </div>
            <div class="st-card__body">
              <div class="md" v-html="renderMarkdown(detail.keyPoints)" />
            </div>
          </section>

          <!-- 课后习题 -->
          <section v-if="sectionText('homework')" class="st-card">
            <div class="st-card__header">
              <Lightbulb :size="16" class="card-icon" />
              <h2 class="st-card__title">课后习题</h2>
              <p class="st-card__hint title-hint">可直接用于作业发布环节</p>
            </div>
            <div class="st-card__body">
              <div class="md" v-html="renderMarkdown(detail.homework)" />
            </div>
          </section>

          <!-- 上机实训 -->
          <section v-if="sectionText('lab')" class="st-card">
            <div class="st-card__header">
              <Wrench :size="16" class="card-icon" />
              <h2 class="st-card__title">上机实训方案</h2>
            </div>
            <div class="st-card__body">
              <div class="md" v-html="renderMarkdown(detail.lab)" />
            </div>
          </section>
        </div>

        <!-- 课件：整行卡片，直接渲染分页正文 -->
        <section v-if="slides.length || detail.pptxUrl" class="st-card ppt-card">
          <div class="st-card__header">
            <Presentation :size="16" class="card-icon" />
            <h2 class="st-card__title">
              课堂 PPT
              <span v-if="slides.length" class="ppt-count">{{ slides.length }} 页</span>
            </h2>
            <div class="ppt-ops">
              <a
                v-if="detail.pptxUrl"
                class="meta-path"
                :href="detail.pptxUrl"
                target="_blank"
                rel="noopener"
              >
                课件文件
              </a>
              <button
                v-if="slides.length"
                class="st-btn st-btn--ghost"
                :disabled="pptDownloading"
                @click="handleDownloadPpt"
              >
                <Loader2 v-if="pptDownloading" :size="13" class="spin" />
                <Download v-else :size="13" /> 下载 PPT
              </button>
            </div>
          </div>
          <div class="st-card__body">
            <PptDeck :md="detail.pptxMd" />
          </div>
        </section>
      <!-- AI 内容校验：仅保留入口，逻辑待后端接口 -->
      <section class="st-card" style="margin-top: 20px;">
        <div class="st-card__header">
          <ClipboardCheck :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">AI 内容校验</h2>
            <p class="st-card__hint">
              内容校验功能正在准备中，暂时无法使用
            </p>
          </div>
        </div>
        <div class="st-card__body verify-body">
          <div class="verify-item">
            <span class="verify-label">待校验内容</span>
            <el-select :model-value="null" placeholder="选择上方已生成的分区" disabled style="width: 200px;">
              <el-option label="章节教案" value="lessonPlan" />
              <el-option label="重难点清单" value="keyPoints" />
              <el-option label="课后习题" value="homework" />
              <el-option label="上机实训方案" value="lab" />
            </el-select>
            <span class="verify-hint">
              <ScrollText :size="13" /> 校验将比对教材原文，标记与教材不符的题目与表述
            </span>
          </div>
          <div class="verify-actions">
            <button class="st-btn st-btn--secondary" disabled>
              <ClipboardCheck :size="13" /> 发起内容校验
            </button>
            <button class="st-btn st-btn--ghost" disabled>查看校验报告</button>
          </div>
        </div>
      </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.page-head__text {
  flex: 1;
  min-width: 0;
}

.page-head__btn {
  flex-shrink: 0;
  margin-top: 4px;
}

.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.config-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.config-row {
  display: flex;
  align-items: flex-end;
  gap: 20px;
  flex-wrap: wrap;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
}

.switch-list {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

/* 生成项：未选是白底空心框，选中变黑底白勾，与主按钮同一套黑白主题 */
.switch-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px 0 11px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition), color var(--transition);
}

.switch-chip:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.switch-chip__box {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: transparent;
  color: var(--bg-surface);
  transition: background var(--transition), border-color var(--transition);
}

.switch-chip--on {
  border-color: var(--text-primary);
  color: var(--text-primary);
}

.switch-chip--on .switch-chip__box {
  background: var(--text-primary);
  border-color: var(--text-primary);
}

.generate-btn {
  margin-left: auto;
  height: 36px;
}

.form-textarea {
  display: block;
  width: 100%;
  max-width: 720px;
  min-height: 60px;
  max-height: 260px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.6;
  resize: none; /* 高度由内容自动撑开，不再保留手动拖拽 */
  overflow-y: auto;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: border-color var(--transition), height 0.12s ease;
}

.form-textarea:focus {
  border-color: var(--border-strong);
}

/* ---------- 材料参数：勾选对应材料后才展开 ---------- */
.param-stack {
  display: flex;
  flex-direction: column;
}

/* 高度用 grid 行高过渡，避免展开/收起时零帧撑开 */
.param-block {
  display: grid;
  grid-template-rows: 1fr;
}

.param-block__clip {
  min-height: 0;
  overflow: hidden;
}

.param-block__body {
  /* 上下各留 16px：分隔线两侧与内容距离相等 */
  padding: 16px 0;
  border-top: 1px solid var(--text-tertiary);
}

.param-block__title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.1px;
  color: var(--text-primary);
}

.param-fields {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 24px;
}

.param-field {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.param-field__label {
  font-size: 12.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.param-input {
  width: 112px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12.5px;
  outline: none;
  transition: border-color var(--transition);
}

.param-input--sm {
  width: 84px;
}

.param-input--wide {
  width: 148px;
}

.param-input::placeholder {
  color: var(--text-tertiary);
}

.param-input:focus {
  border-color: var(--border-strong);
}

/* 是否 / 枚举：黑白小分段按钮，和生成项开关同一套语言 */
.param-choices {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.param-choice {
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}

.param-choice:hover {
  color: var(--text-primary);
}

.param-choice.is-on {
  background: var(--text-primary);
  color: var(--bg-surface);
}

.param-choice:focus-visible {
  outline: 2px solid var(--text-primary);
  outline-offset: 1px;
}

.param-enter-active,
.param-leave-active {
  transition: grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.24s ease;
}

.param-enter-from,
.param-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

.param-foot {
  padding: 16px 0;
  border-top: 1px solid var(--text-tertiary);
}

/* ---------- 结果元信息 ---------- */
.meta-card {
  margin-top: 20px;
}

.meta-body {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.meta-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.meta-sub {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.meta-ops {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.meta-extra {
  flex-basis: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.meta-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.meta-path {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 11.5px;
  color: var(--text-secondary);
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
}

.meta-path:hover {
  color: var(--text-primary);
}

/* ---------- 布局 ---------- */
.result-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 960px) {
  .result-grid {
    grid-template-columns: 1fr;
  }
}

.title-hint {
  margin-left: auto;
}

/* ---------- 内容校验（UI 骨架） ---------- */
.verify-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.verify-item {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.verify-label {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
}

.verify-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.verify-actions {
  display: flex;
  gap: 10px;
}

/* ---------- Markdown 渲染 ---------- */
.md {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.8;
}

.md :deep(.md-h) {
  font-weight: 600;
  color: var(--text-primary);
  margin: 18px 0 8px;
  letter-spacing: -0.2px;
}

.md :deep(.md-h:first-child) {
  margin-top: 0;
}

.md :deep(h4.md-h) { font-size: 15px; }
.md :deep(h5.md-h) { font-size: 13.5px; }
.md :deep(h6.md-h) { font-size: 13px; color: var(--text-secondary); }

.md :deep(.md-p) {
  margin: 6px 0;
}

.md :deep(.md-list) {
  margin: 8px 0 8px 20px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.md :deep(.md-list li) {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.7;
}

.md :deep(.md-quote) {
  margin: 10px 0;
  padding: 8px 14px;
  border-left: 2px solid var(--border-strong);
  background: var(--bg-subtle);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  color: var(--text-secondary);
}

.md :deep(.md-pre) {
  margin: 10px 0;
  padding: 12px 14px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow-x: auto;
}

.md :deep(.md-pre code) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.65;
  color: #44403c;
  white-space: pre;
}

.md :deep(.md-code) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 12.5px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 1px 5px;
  color: #1c1917;
}

.md :deep(.md-hr) {
  border: none;
  border-top: 1px solid var(--border-default);
  margin: 14px 0;
}

.md :deep(.md-link) {
  color: var(--text-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.md :deep(strong) {
  font-weight: 600;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 结果区：元信息 + 材料卡片栅格 + 课件整行 */
.result-wrap {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
}

.ppt-ops {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

.ppt-count {
  margin-left: 6px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
}

/* 等待与失败提示 */
.wait-body,
.fail-body {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
  padding: 26px 24px;
}

.wait-text,
.fail-text {
  flex: 1;
  min-width: 240px;
}

.wait-title {
  margin: 0 0 6px;
  font-size: 14px;
  color: var(--text-primary);
}

.wait-meta,
.wait-hint,
.fail-msg {
  margin: 0 0 4px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.wait-hint,
.fail-msg:last-child {
  margin-bottom: 0;
  color: var(--text-tertiary);
}

.fail-title {
  margin: 0 0 4px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.wait-cancel {
  flex-shrink: 0;
}

.fail-ops {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
</style>

