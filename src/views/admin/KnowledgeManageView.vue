<script setup lang="ts">
/**
 * 教材知识库维护 —— 三个分区数据流已接桩
 *
 * 真实接口：GET /api/knowledge/chapter/list（@/api/knowledge.fetchChapters，章节下拉与父级选项）
 * 已接桩：待实现 @/api/knowledge.fetchChapterTree（GET /api/knowledge/chapter/tree?courseId=）
 * 已接桩：待实现 @/api/knowledge.saveChapter（POST /api/knowledge/chapter/save
 *   {id,courseId,parentId,chapterCode,title,level,sortOrder,description,summary}）
 * 已接桩：待实现 @/api/knowledge.fetchKnowledgePoints（GET /api/knowledge/point/list?chapterId=）
 * 已接桩：待实现 @/api/knowledge.saveKnowledgePoint（POST /api/knowledge/point/save
 *   {id,chapterId,name,description,difficulty,keyword,pageRef,pageOrder}）
 * 已接桩：待实现 @/api/knowledge.fetchTextbookContent（GET /api/knowledge/content/list
 *   ?chapterId&contentType&keyword&pageNum&pageSize）
 * 已接桩：待实现 @/api/knowledge.saveTextbookContent（POST /api/knowledge/content/save
 *   {id,chapterId,knowledgePointId,contentType,content,page,pageOrder,syncDify}）
 * 已接桩：待实现 @/api/knowledge.deleteTextbookContent（PUT /api/knowledge/content/delete?id=）
 */
import { computed, onMounted, reactive, ref } from 'vue';
import {
  BookOpen,
  FileText,
  Info,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  DEFAULT_COURSE_ID,
  deleteTextbookContent,
  fetchChapters,
  fetchChapterTree,
  fetchKnowledgePoints,
  fetchTextbookContent,
  saveChapter,
  saveKnowledgePoint,
  saveTextbookContent,
} from '@/api/knowledge';
import type { Chapter, ChapterTreeNode, KnowledgePoint, TextbookContent } from '@/types/knowledge';

/** 教材原文类型（后端 contentType 为整数码值） */
const CONTENT_TYPES = [
  { value: 1, label: '概念定义' },
  { value: 2, label: '例题' },
  { value: 3, label: '代码案例' },
  { value: 4, label: '习题' },
];

const LEVEL_LABEL: Record<number, string> = { 1: '章', 2: '节', 3: '小节' };

// ==================== 真实只读数据：章节列表 ====================
const chapterLoading = ref(false);
const chapters = ref<Chapter[]>([]);
const selectedChapterId = ref<number | null>(null);

const selectedChapter = computed(() =>
  chapters.value.find((c) => c.id === selectedChapterId.value) ?? null,
);

async function loadChapters() {
  chapterLoading.value = true;
  try {
    chapters.value = await fetchChapters();
    if (!selectedChapterId.value && chapters.value.length) selectedChapterId.value = chapters.value[0].id;
  } catch {
    // 真实只读接口：失败提示由 axios 拦截器给出，保持空列表
    chapters.value = [];
  } finally {
    chapterLoading.value = false;
  }
}

// ==================== 分区一：章节目录（已接桩 fetchChapterTree / saveChapter） ====================
const treeNodes = ref<ChapterTreeNode[]>([]);
const treeLoading = ref(false);
const treeError = ref('');

interface TreeRow {
  node: ChapterTreeNode;
  depth: number;
}

const treeRows = computed<TreeRow[]>(() => {
  const out: TreeRow[] = [];
  const walk = (nodes: ChapterTreeNode[], depth: number) => {
    for (const n of [...nodes].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)) {
      out.push({ node: n, depth });
      walk(n.children ?? [], depth + 1);
    }
  };
  walk(treeNodes.value, 0);
  return out;
});

async function loadTree() {
  treeLoading.value = true;
  treeError.value = '';
  try {
    treeNodes.value = await fetchChapterTree(DEFAULT_COURSE_ID);
  } catch {
    treeNodes.value = [];
    treeError.value = '接口待实现：fetchChapterTree（GET /api/knowledge/chapter/tree?courseId=）';
  } finally {
    treeLoading.value = false;
  }
}

// ==================== 分区二：知识点（已接桩 fetchKnowledgePoints / saveKnowledgePoint） ====================
const points = ref<KnowledgePoint[]>([]);
const pointsLoading = ref(false);
const pointsError = ref('');

async function loadPoints() {
  if (!selectedChapterId.value) {
    points.value = [];
    pointsError.value = '请先选择章节';
    return;
  }
  pointsLoading.value = true;
  pointsError.value = '';
  try {
    points.value = await fetchKnowledgePoints(selectedChapterId.value);
  } catch {
    points.value = [];
    pointsError.value = '接口待实现：fetchKnowledgePoints（GET /api/knowledge/point/list?chapterId=）';
  } finally {
    pointsLoading.value = false;
  }
}

// ==================== 分区三：教材原文（已接桩 fetchTextbookContent / save / delete） ====================
const contents = ref<TextbookContent[]>([]);
const contentsLoading = ref(false);
const contentsError = ref('');
const contentType = ref<number | undefined>(undefined);
const keyword = ref('');
const contentPageNum = ref(1);
const contentPageSize = ref(10);
const contentTotal = ref(0);
const contentTotalPages = computed(() =>
  Math.max(1, Math.ceil(contentTotal.value / contentPageSize.value)),
);

async function loadContents() {
  if (!selectedChapterId.value) {
    contents.value = [];
    contentsError.value = '请先选择章节';
    return;
  }
  contentsLoading.value = true;
  contentsError.value = '';
  try {
    const page = await fetchTextbookContent({
      chapterId: selectedChapterId.value,
      contentType: contentType.value,
      keyword: keyword.value.trim() || undefined,
      pageNum: contentPageNum.value,
      pageSize: contentPageSize.value,
    });
    contents.value = page?.records ?? [];
    contentTotal.value = page?.total ?? 0;
  } catch {
    contents.value = [];
    contentTotal.value = 0;
    contentsError.value =
      '接口待实现：fetchTextbookContent（GET /api/knowledge/content/list?chapterId&contentType&keyword&pageNum&pageSize）';
  } finally {
    contentsLoading.value = false;
  }
}

function contentTypeLabel(row: TextbookContent): string {
  if (row.contentTypeName) return row.contentTypeName;
  return CONTENT_TYPES.find((t) => t.value === row.contentType)?.label ?? `类型 ${row.contentType}`;
}

/** 查询 / 筛选：分页回到第一页再拉 */
function handleQuery() {
  contentPageNum.value = 1;
  void loadContents();
}

function goContentPage(delta: number) {
  const target = Math.min(Math.max(1, contentPageNum.value + delta), contentTotalPages.value);
  if (target === contentPageNum.value) return;
  contentPageNum.value = target;
  void loadContents();
}

/** 删除教材原文（已接桩：PUT /api/knowledge/content/delete?id=） */
async function handleDelete(row: TextbookContent) {
  try {
    await ElMessageBox.confirm(
      `将删除 ${row.chapterName || `章节 ${row.chapterId}`} 下的${contentTypeLabel(row)}原文，` +
        '后端会逻辑删除并归档、同步移除 Dify 文档。确认继续？',
      '删除教材原文',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await deleteTextbookContent(row.id);
    ElMessage.success('已提交删除');
    void loadContents();
  } catch {
    ElMessage.warning('接口待实现：deleteTextbookContent（PUT /api/knowledge/content/delete?id=）');
  }
}

// ==================== 表单弹窗（新增 / 编辑） ====================
type DrawerMode = 'chapter' | 'point' | 'content';

const drawerMode = ref<DrawerMode | null>(null);
const drawerTitle = ref('');
const editingId = ref<number | null>(null);
const submitting = ref(false);
/** 教材原文分区的全局「同步 Dify」开关，作为新增/编辑表单的默认值 */
const syncDifyDefault = ref(true);

const drawerForm = reactive({
  /** 章节 */
  chapterCode: '',
  title: '',
  level: 1,
  parentId: 0,
  sortOrder: 1,
  description: '',
  summary: '',
  /** 知识点 */
  name: '',
  difficulty: 3,
  pointKeyword: '',
  pageRef: '',
  pageOrder: 1,
  /** 教材原文 */
  knowledgePointId: undefined as number | undefined,
  contentType: 1,
  content: '',
  page: 1,
  syncDify: true,
});

const DRAWER_TITLES: Record<DrawerMode, string> = {
  chapter: '章节维护',
  point: '知识点维护',
  content: '教材原文维护',
};

const DRAWER_PATHS: Record<DrawerMode, { fn: string; api: string }> = {
  chapter: { fn: 'saveChapter', api: 'POST /api/knowledge/chapter/save' },
  point: { fn: 'saveKnowledgePoint', api: 'POST /api/knowledge/point/save' },
  content: { fn: 'saveTextbookContent', api: 'POST /api/knowledge/content/save' },
};

function resetForm() {
  drawerForm.chapterCode = '';
  drawerForm.title = '';
  drawerForm.level = 1;
  drawerForm.parentId = 0;
  drawerForm.sortOrder = 1;
  drawerForm.description = '';
  drawerForm.summary = '';
  drawerForm.name = '';
  drawerForm.difficulty = 3;
  drawerForm.pointKeyword = '';
  drawerForm.pageRef = '';
  drawerForm.pageOrder = 1;
  drawerForm.knowledgePointId = undefined;
  drawerForm.contentType = 1;
  drawerForm.content = '';
  drawerForm.page = 1;
  drawerForm.syncDify = syncDifyDefault.value;
}

function openDrawer(mode: DrawerMode, action: '新增' | '编辑') {
  drawerMode.value = mode;
  editingId.value = null;
  resetForm();
  drawerTitle.value = `${action} · ${DRAWER_TITLES[mode]}`;
}

function openChapterEdit(node: ChapterTreeNode) {
  openDrawer('chapter', '编辑');
  editingId.value = node.id;
  drawerForm.chapterCode = node.chapterCode;
  drawerForm.title = node.title;
  drawerForm.level = node.level;
  drawerForm.parentId = node.parentId ?? 0;
  drawerForm.sortOrder = node.sortOrder;
  drawerForm.description = chapters.value.find((c) => c.id === node.id)?.description ?? '';
  drawerTitle.value = `编辑 · ${DRAWER_TITLES.chapter}`;
}

/** 章节树未实现时，用已对接的章节列表行进入同一套编辑表单 */
function editChapterFromList(c: Chapter) {
  openChapterEdit({
    id: c.id,
    courseId: c.courseId,
    parentId: c.parentId,
    chapterCode: c.chapterCode,
    title: c.title,
    level: c.level,
    sortOrder: c.sortOrder,
    children: [],
  });
}

function openPointEdit(p: KnowledgePoint) {
  openDrawer('point', '编辑');
  editingId.value = p.id;
  drawerForm.name = p.name;
  drawerForm.description = p.description ?? '';
  drawerForm.difficulty = p.difficulty;
  drawerForm.pointKeyword = p.keyword ?? '';
  drawerForm.pageRef = p.pageRef ?? '';
  drawerTitle.value = `编辑 · ${DRAWER_TITLES.point}`;
}

function openContentEdit(row: TextbookContent) {
  openDrawer('content', '编辑');
  editingId.value = row.id;
  drawerForm.knowledgePointId = row.knowledgePointId || undefined;
  drawerForm.contentType = row.contentType;
  drawerForm.content = row.content;
  drawerForm.page = row.page ?? 1;
  drawerForm.pageOrder = row.pageOrder ?? 1;
  drawerForm.syncDify = !!row.difyDocumentId;
  drawerTitle.value = `编辑 · ${DRAWER_TITLES.content}`;
}

function closeDrawer() {
  drawerMode.value = null;
}

const canSubmit = computed(() => {
  if (submitting.value) return false;
  if (drawerMode.value === 'chapter') {
    return !!drawerForm.chapterCode.trim() && !!drawerForm.title.trim();
  }
  if (drawerMode.value === 'point') return !!drawerForm.name.trim();
  return !!drawerForm.content.trim() && !!selectedChapterId.value;
});

/** 弹窗标题下的接口提示（保留路径信息，便于学生定位要替换的桩） */
const drawerHint = computed(() => {
  const mode = drawerMode.value;
  if (!mode) return '';
  const { fn, api } = DRAWER_PATHS[mode];
  return `已接桩：待实现 @/api/knowledge.${fn} · ${api}`;
});

/** 保存（已接桩：saveChapter / saveKnowledgePoint / saveTextbookContent） */
async function submitDrawer() {
  const mode = drawerMode.value;
  if (!mode || !canSubmit.value) return;
  submitting.value = true;
  try {
    if (mode === 'chapter') {
      await saveChapter({
        id: editingId.value ?? undefined,
        courseId: DEFAULT_COURSE_ID,
        parentId: drawerForm.parentId,
        chapterCode: drawerForm.chapterCode.trim(),
        title: drawerForm.title.trim(),
        level: drawerForm.level,
        sortOrder: drawerForm.sortOrder,
        description: drawerForm.description.trim() || undefined,
        summary: drawerForm.summary.trim() || undefined,
      });
    } else if (mode === 'point') {
      if (!selectedChapterId.value) {
        ElMessage.warning('请先在顶部选择章节，知识点需挂在章节下');
        return;
      }
      await saveKnowledgePoint({
        id: editingId.value ?? undefined,
        chapterId: selectedChapterId.value,
        name: drawerForm.name.trim(),
        description: drawerForm.description.trim() || undefined,
        difficulty: drawerForm.difficulty,
        keyword: drawerForm.pointKeyword.trim() || undefined,
        pageRef: drawerForm.pageRef.trim() || undefined,
        pageOrder: drawerForm.pageOrder,
      });
    } else {
      await saveTextbookContent({
        id: editingId.value ?? undefined,
        chapterId: selectedChapterId.value ?? 0,
        knowledgePointId: drawerForm.knowledgePointId,
        contentType: drawerForm.contentType,
        content: drawerForm.content,
        page: drawerForm.page,
        pageOrder: drawerForm.pageOrder,
        syncDify: drawerForm.syncDify,
      });
    }
    ElMessage.success(`${DRAWER_TITLES[mode]}已提交保存`);
    closeDrawer();
    if (mode === 'chapter') {
      void loadChapters();
      void loadTree();
    } else if (mode === 'point') {
      void loadPoints();
    } else {
      void loadContents();
    }
  } catch {
    ElMessage.warning(`接口待实现：${DRAWER_PATHS[mode].fn}（${DRAWER_PATHS[mode].api}）`);
  } finally {
    submitting.value = false;
  }
}

/** 章节切换：知识点与原文随之重载 */
function onChapterChange() {
  contentPageNum.value = 1;
  void loadPoints();
  void loadContents();
}

onMounted(() => {
  void loadChapters();
  void loadTree();
});
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">教材知识库维护</h1>
      <p class="st-page-subtitle">章节目录 · 知识点 · 教材原文三段式维护，更新后作为答疑 / 出题 / 批改的唯一依据</p>
    </header>

    <div class="km-notice">
      <Info :size="14" />
      <span>
        本页三个分区已按 @/api/knowledge 的桩函数接通：章节树 fetchChapterTree、章节保存 saveChapter、
        知识点 fetchKnowledgePoints / saveKnowledgePoint、原文 fetchTextbookContent / saveTextbookContent /
        deleteTextbookContent。桩未实现时各区显示「接口待实现」空态，可用「重新加载」重试；
        顶部章节下拉与父级选项来自已对接的 GET /api/knowledge/chapter/list。
      </span>
    </div>

    <!-- 全局筛选：课程章节 + 原文类型 + 关键词 -->
    <div class="st-card">
      <div class="st-card__body toolbar-row">
        <div class="field">
          <label class="field-label">教材章节</label>
          <el-select
            v-model="selectedChapterId"
            placeholder="选择章节"
            style="width: 260px;"
            :loading="chapterLoading"
            @change="onChapterChange"
          >
            <el-option v-for="c in chapters" :key="c.id" :label="`${c.chapterCode} ${c.title}`" :value="c.id" />
          </el-select>
        </div>
        <div class="field">
          <label class="field-label">原文类型</label>
          <el-select v-model="contentType" placeholder="全部类型" clearable style="width: 150px;" @change="handleQuery">
            <el-option v-for="t in CONTENT_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </div>
        <div class="field">
          <label class="field-label">关键词</label>
          <div class="search-box">
            <Search :size="14" />
            <input v-model="keyword" class="search-input" placeholder="搜索原文内容" @keydown.enter="handleQuery" />
          </div>
        </div>
        <div class="toolbar-actions">
          <button class="st-btn st-btn--secondary" @click="handleQuery">查询原文</button>
          <button class="st-btn st-btn--ghost" @click="loadTree">
            <RefreshCw :size="14" /> 重载章节树
          </button>
        </div>
      </div>
    </div>

    <!-- 分区一：章节目录 -->
    <section class="st-card block">
      <div class="st-card__header">
        <BookOpen :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">一、章节目录</h2>
          <p class="st-card__hint">
            已接桩：待实现 @/api/knowledge.fetchChapterTree（GET /api/knowledge/chapter/tree?courseId=）·
            saveChapter（POST /api/knowledge/chapter/save
            {id,courseId,parentId,chapterCode,title,level,sortOrder,description,summary}）
          </p>
        </div>
        <div class="block-ops">
          <button class="st-text-btn" :disabled="treeLoading" @click="loadTree">
            <RefreshCw :size="12" style="vertical-align: -2px;" /> 重新加载
          </button>
          <button class="st-btn st-btn--primary" @click="openDrawer('chapter', '新增')">
            <Plus :size="14" /> 新增章节
          </button>
        </div>
      </div>
      <div class="table-wrap">
        <div v-if="treeLoading" class="st-empty">
          <Loader2 :size="20" class="spin" />
          <div class="st-empty__text">正在加载章节树…</div>
        </div>
        <div v-else-if="treeError" class="st-empty">
          <BookOpen :size="36" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">{{ treeError }}</div>
          <div class="st-empty__text km-sub">
            下表数据来自已对接的章节列表（GET /api/knowledge/chapter/list），仍可直接维护
          </div>
        </div>
        <table v-if="!treeLoading" class="km-table">
          <thead>
            <tr>
              <th style="width: 130px;">章节编号</th>
              <th>标题</th>
              <th style="width: 80px;">层级</th>
              <th style="width: 80px;">排序</th>
              <th style="width: 90px;">来源</th>
              <th style="width: 140px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in treeRows" :key="`tree-${row.node.id}`">
              <td class="mono" :style="{ paddingLeft: `${12 + row.depth * 18}px` }">{{ row.node.chapterCode }}</td>
              <td>{{ row.node.title }}</td>
              <td class="muted">{{ LEVEL_LABEL[row.node.level] ?? `L${row.node.level}` }}</td>
              <td class="muted mono">{{ row.node.sortOrder }}</td>
              <td><span class="st-badge st-badge--dark">章节树</span></td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="st-text-btn" @click="openChapterEdit(row.node)">
                  <Pencil :size="12" style="vertical-align: -2px;" /> 编辑
                </button>
              </td>
            </tr>
            <tr v-for="c in chapters" :key="`flat-${c.id}`">
              <td class="mono">{{ c.chapterCode }}</td>
              <td>{{ c.title }}</td>
              <td class="muted">{{ LEVEL_LABEL[c.level] ?? `L${c.level}` }}</td>
              <td class="muted mono">{{ c.sortOrder }}</td>
              <td><span class="st-badge st-badge--neutral">章节列表</span></td>
              <td style="text-align: right; white-space: nowrap;">
                <button
                  class="st-text-btn"
                  title="章节树未实现时按列表行编辑，parentId 由章节列表取值"
                  @click="editChapterFromList(c)"
                >
                  <Pencil :size="12" style="vertical-align: -2px;" /> 编辑
                </button>
              </td>
            </tr>
            <tr v-if="treeRows.length === 0 && chapters.length === 0">
              <td colspan="6" class="muted" style="text-align: center; padding: 36px 0;">暂无章节数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 分区二：知识点 -->
    <section class="st-card block">
      <div class="st-card__header">
        <Layers :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">二、知识点</h2>
          <p class="st-card__hint">
            已接桩：待实现 @/api/knowledge.fetchKnowledgePoints（GET /api/knowledge/point/list?chapterId=）·
            saveKnowledgePoint（POST /api/knowledge/point/save
            {id,chapterId,name,description,difficulty,keyword,pageRef,pageOrder}）
          </p>
        </div>
        <div class="block-ops">
          <button class="st-text-btn" :disabled="pointsLoading || !selectedChapterId" @click="loadPoints">
            <RefreshCw :size="12" style="vertical-align: -2px;" /> 重新加载
          </button>
          <button class="st-btn st-btn--primary" :disabled="!selectedChapterId" @click="openDrawer('point', '新增')">
            <Plus :size="14" /> 新增知识点
          </button>
        </div>
      </div>
      <div class="table-wrap">
        <div v-if="pointsLoading" class="st-empty">
          <Loader2 :size="20" class="spin" />
          <div class="st-empty__text">正在加载知识点…</div>
        </div>
        <div v-else-if="pointsError" class="st-empty">
          <Layers :size="36" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">{{ pointsError }}</div>
          <div class="st-empty__text km-sub">
            目标章节：{{ selectedChapter ? `${selectedChapter.chapterCode} ${selectedChapter.title}` : '未选择' }}
          </div>
        </div>
        <template v-else>
          <table v-if="points.length" class="km-table">
            <thead>
              <tr>
                <th>知识点名称</th>
                <th style="width: 90px;">难度</th>
                <th style="width: 160px;">关键词</th>
                <th style="width: 110px;">教材页码</th>
                <th>描述</th>
                <th style="width: 140px; text-align: right;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in points" :key="p.id">
                <td>{{ p.name }}</td>
                <td class="mono">{{ p.difficulty }}</td>
                <td class="muted">{{ p.keyword || '—' }}</td>
                <td class="muted mono">{{ p.pageRef || '—' }}</td>
                <td class="muted">{{ p.description || '—' }}</td>
                <td style="text-align: right; white-space: nowrap;">
                  <button class="st-text-btn" @click="openPointEdit(p)">
                    <Pencil :size="12" style="vertical-align: -2px;" /> 编辑
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="st-empty">
            <Layers :size="36" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">该章节下暂无知识点记录</div>
          </div>
        </template>
      </div>
    </section>

    <!-- 分区三：教材原文 -->
    <section class="st-card block">
      <div class="st-card__header">
        <FileText :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">三、教材原文</h2>
          <p class="st-card__hint">
            已接桩：待实现 @/api/knowledge.fetchTextbookContent（GET /api/knowledge/content/list
            ?chapterId&contentType&keyword&pageNum&pageSize）· saveTextbookContent（POST /api/knowledge/content/save
            {id,chapterId,knowledgePointId,contentType,content,page,pageOrder,syncDify}）·
            deleteTextbookContent（PUT /api/knowledge/content/delete?id=）
          </p>
        </div>
        <div class="block-ops">
          <label class="sync-switch" title="新增原文时是否默认写入 Dify 知识库，可在表单里单独调整">
            <span>同步 Dify</span>
            <el-switch v-model="syncDifyDefault" size="small" />
          </label>
          <button class="st-text-btn" :disabled="contentsLoading || !selectedChapterId" @click="loadContents">
            <RefreshCw :size="12" style="vertical-align: -2px;" /> 重新加载
          </button>
          <button class="st-btn st-btn--primary" :disabled="!selectedChapterId" @click="openDrawer('content', '新增')">
            <Plus :size="14" /> 新增原文
          </button>
        </div>
      </div>
      <div class="table-wrap">
        <div v-if="contentsLoading" class="st-empty">
          <Loader2 :size="20" class="spin" />
          <div class="st-empty__text">正在加载教材原文…</div>
        </div>
        <div v-else-if="contentsError" class="st-empty">
          <FileText :size="36" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">{{ contentsError }}</div>
        </div>
        <template v-else>
          <table v-if="contents.length" class="km-table">
            <thead>
              <tr>
                <th style="width: 110px;">类型</th>
                <th>原文内容</th>
                <th style="width: 120px;">知识点</th>
                <th style="width: 80px;">页码</th>
                <th style="width: 100px;">Dify 文档</th>
                <th style="width: 170px; text-align: right;">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in contents" :key="row.id">
                <td><span class="st-badge st-badge--outline">{{ contentTypeLabel(row) }}</span></td>
                <td class="content-cell">{{ row.content }}</td>
                <td class="muted">{{ row.knowledgePointName || '—' }}</td>
                <td class="muted mono">{{ row.page }}</td>
                <td>
                  <span class="st-badge" :class="row.difyDocumentId ? 'st-badge--success' : 'st-badge--neutral'">
                    {{ row.difyDocumentId ? '已同步' : '未同步' }}
                  </span>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  <button class="st-text-btn" @click="openContentEdit(row)">
                    <Pencil :size="12" style="vertical-align: -2px;" /> 编辑
                  </button>
                  <button class="st-text-btn st-text-btn--danger" @click="handleDelete(row)">
                    <Trash2 :size="12" style="vertical-align: -2px;" /> 删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="st-empty">
            <FileText :size="36" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">该章节下暂无教材原文记录</div>
          </div>
        </template>
        <div class="pager">
          <span class="pager__total">
            共 {{ contentTotal }} 条 · 第 {{ contentPageNum }} / {{ contentTotalPages }} 页
          </span>
          <div class="pager__ctrl">
            <button class="st-btn st-btn--secondary" :disabled="contentPageNum <= 1" @click="goContentPage(-1)">
              上一页
            </button>
            <button
              class="st-btn st-btn--secondary"
              :disabled="contentPageNum >= contentTotalPages"
              @click="goContentPage(1)"
            >
              下一页
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 新增 / 编辑弹窗 -->
    <Teleport to="body">
      <div v-if="drawerMode" class="mask" @click.self="closeDrawer">
        <aside class="drawer">
          <div class="st-card drawer__card">
            <div class="st-card__header">
              <div>
                <h2 class="st-card__title">{{ drawerTitle }}</h2>
                <p class="st-card__hint">
                  {{ drawerHint }}
                </p>
              </div>
            </div>
            <div class="st-card__body drawer__body">
              <!-- 章节字段 -->
              <template v-if="drawerMode === 'chapter'">
                <div class="form-row">
                  <div class="form-item"><label class="form-label">章节编号 chapterCode</label><input v-model="drawerForm.chapterCode" class="form-input" placeholder="如：03" /></div>
                  <div class="form-item form-item--sm">
                    <label class="form-label">层级 level</label>
                    <el-select v-model="drawerForm.level" style="width: 100%;">
                      <el-option :value="1" label="1 · 章" />
                      <el-option :value="2" label="2 · 节" />
                      <el-option :value="3" label="3 · 小节" />
                    </el-select>
                  </div>
                  <div class="form-item form-item--sm"><label class="form-label">排序 sortOrder</label><el-input-number v-model="drawerForm.sortOrder" :min="1" style="width: 100%;" /></div>
                </div>
                <div class="form-item"><label class="form-label">标题 title</label><input v-model="drawerForm.title" class="form-input" placeholder="章节标题" /></div>
                <div class="form-row">
                  <div class="form-item">
                    <label class="form-label">父级章节 parentId</label>
                    <el-select v-model="drawerForm.parentId" style="width: 100%;">
                      <el-option :value="0" label="顶级（parentId = 0）" />
                      <el-option
                        v-for="c in chapters.filter((x) => x.level === 1 && x.id !== editingId)"
                        :key="c.id"
                        :value="c.id"
                        :label="`${c.chapterCode} ${c.title}`"
                      />
                    </el-select>
                  </div>
                  <div class="form-item form-item--sm">
                    <label class="form-label">课程 courseId</label>
                    <input :value="DEFAULT_COURSE_ID" class="form-input" readonly />
                  </div>
                </div>
                <div class="form-item"><label class="form-label">说明 description</label><textarea v-model="drawerForm.description" class="form-textarea" rows="3" /></div>
                <div class="form-item"><label class="form-label">摘要 summary</label><textarea v-model="drawerForm.summary" class="form-textarea" rows="3" /></div>
              </template>

              <!-- 知识点字段 -->
              <template v-else-if="drawerMode === 'point'">
                <div class="form-row">
                  <div class="form-item"><label class="form-label">知识点名称 name</label><input v-model="drawerForm.name" class="form-input" /></div>
                  <div class="form-item form-item--sm">
                    <label class="form-label">难度 difficulty</label>
                    <el-select v-model="drawerForm.difficulty" style="width: 100%;">
                      <el-option v-for="d in 5" :key="d" :value="d" :label="`${d} 级`" />
                    </el-select>
                  </div>
                  <div class="form-item form-item--sm"><label class="form-label">排序 pageOrder</label><el-input-number v-model="drawerForm.pageOrder" :min="1" style="width: 100%;" /></div>
                </div>
                <div class="form-row">
                  <div class="form-item"><label class="form-label">关键词 keyword</label><input v-model="drawerForm.pointKeyword" class="form-input" placeholder="用于检索召回" /></div>
                  <div class="form-item form-item--sm"><label class="form-label">教材页码 pageRef</label><input v-model="drawerForm.pageRef" class="form-input" placeholder="如：P45-P48" /></div>
                </div>
                <div class="form-item"><label class="form-label">描述 description</label><textarea v-model="drawerForm.description" class="form-textarea" rows="4" /></div>
                <div class="form-item km-sub">
                  <label class="form-label">归属章节</label>
                  <p class="form-static">
                    {{ selectedChapter ? `${selectedChapter.chapterCode} ${selectedChapter.title}` : '未选择章节，无法保存' }}
                  </p>
                </div>
              </template>

              <!-- 教材原文字段 -->
              <template v-else>
                <div class="form-row">
                  <div class="form-item form-item--sm">
                    <label class="form-label">原文类型 contentType</label>
                    <el-select v-model="drawerForm.contentType" style="width: 100%;">
                      <el-option v-for="t in CONTENT_TYPES" :key="t.value" :label="`${t.value} · ${t.label}`" :value="t.value" />
                    </el-select>
                  </div>
                  <div class="form-item">
                    <label class="form-label">关联知识点 knowledgePointId</label>
                    <el-select v-model="drawerForm.knowledgePointId" placeholder="可不关联" clearable style="width: 100%;">
                      <el-option v-for="p in points" :key="p.id" :label="p.name" :value="p.id" />
                    </el-select>
                  </div>
                  <div class="form-item form-item--sm"><label class="form-label">页码 page</label><el-input-number v-model="drawerForm.page" :min="1" style="width: 100%;" /></div>
                  <div class="form-item form-item--sm"><label class="form-label">排序 pageOrder</label><el-input-number v-model="drawerForm.pageOrder" :min="1" style="width: 100%;" /></div>
                </div>
                <div class="form-item"><label class="form-label">原文内容 content</label><textarea v-model="drawerForm.content" class="form-textarea" rows="8" placeholder="教材原文片段（将作为答疑与出题依据）"></textarea></div>
                <div class="form-item">
                  <label class="form-label">同步至 Dify 知识库 syncDify</label>
                  <el-switch v-model="drawerForm.syncDify" />
                  <span class="form-static" style="margin-left: 12px;">
                    {{ drawerForm.syncDify ? '保存后由后端切片并向量化写入 Dify' : '仅写业务库，不进 Dify 索引' }}
                  </span>
                </div>
                <div class="form-item km-sub">
                  <label class="form-label">归属章节</label>
                  <p class="form-static">
                    {{ selectedChapter ? `${selectedChapter.chapterCode} ${selectedChapter.title}` : '未选择章节，无法保存' }}
                  </p>
                </div>
              </template>
            </div>
            <div class="drawer__footer">
              <button class="st-btn st-btn--ghost" @click="closeDrawer">取消</button>
              <button class="st-btn st-btn--primary" :disabled="!canSubmit" @click="submitDrawer">
                <Loader2 v-if="submitting" :size="14" class="spin" />
                {{ submitting ? '提交中' : '保存' }}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.km-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.7;
  padding: 10px 14px;
  background: var(--status-info-bg);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}

.km-notice svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--status-info);
}

.toolbar-row {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.toolbar-actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
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
  width: 190px;
}

/* 分区卡片 */
.block {
  margin-top: 20px;
}

.block-ops {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.sync-switch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.table-wrap {
  padding: 0 24px 20px;
  overflow-x: auto;
}

.km-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.km-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.km-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  vertical-align: top;
}

.km-table tr:hover td {
  background: var(--bg-subtle);
}

.content-cell {
  max-width: 420px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.mono {
  font-family: Consolas, monospace;
  font-size: 12px;
}

.muted {
  color: var(--text-tertiary);
}

.km-sub {
  font-size: 11.5px;
  color: var(--text-tertiary);
  margin-top: 4px;
}

/* 分页 */
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}

.pager__total {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.pager__ctrl {
  display: flex;
  gap: 10px;
}

/* 抽屉 */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.35);
  display: flex;
  justify-content: flex-end;
  z-index: 2000;
  padding: 0;
}

.drawer {
  height: 100%;
  width: 560px;
  max-width: 100%;
  display: flex;
}

.drawer__card {
  border-radius: 0;
  border-left: 1px solid var(--border-default);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.10);
  display: flex;
  flex-direction: column;
  width: 100%;
}

.drawer__body {
  flex: 1;
  overflow-y: auto;
}

.drawer__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 24px;
  border-top: 1px solid var(--border-default);
}

.form-item {
  margin-bottom: 14px;
  flex: 1;
  min-width: 0;
}

.form-item--sm {
  flex: 0 0 140px;
}

.form-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.form-label {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.form-static {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-tertiary);
  line-height: 1.6;
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

.form-input[readonly] {
  background: var(--bg-subtle);
  color: var(--text-tertiary);
}

.form-textarea {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.65;
  resize: vertical;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
  box-sizing: border-box;
}

.form-textarea:focus {
  border-color: var(--border-strong);
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
