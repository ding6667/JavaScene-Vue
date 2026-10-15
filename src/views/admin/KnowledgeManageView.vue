<script setup lang="ts">
/**
 * 教材知识库维护 —— UI 骨架页（三个分区：章节目录 / 知识点 / 教材原文）
 *
 * 逐条接口预留说明（后端尚未开放知识库维护接口）：
 *  1) 章节目录    GET  /api/knowledge/chapter/tree?courseId=
 *                 POST /api/knowledge/chapter/save {id,courseId,parentId,chapterCode,title,level,sortOrder,description,summary}
 *  2) 知识点      GET  /api/knowledge/point/list?chapterId=
 *                 POST /api/knowledge/point/save {id,chapterId,name,description,difficulty,keyword,pageRef,pageOrder}
 *  3) 教材原文    GET  /api/knowledge/content/list?chapterId&contentType&keyword&pageNum&pageSize
 *                 POST /api/knowledge/content/save {id,chapterId,knowledgePointId,contentType,content,page,pageOrder,syncDify}
 *                 PUT  /api/knowledge/content/delete?id=
 *
 * 唯一保留的真实调用：只读拉取章节列表（GET /api/knowledge/chapter/list，见 @/api/student），
 * 仅用于章节下拉与标题展示，不做任何写操作；树形/知识点/原文仍需上述新接口。
 */
import { computed, onMounted, ref } from 'vue';
import {
  BookOpen,
  FileText,
  Info,
  Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { fetchChapters } from '@/api/student';
import type { Chapter } from '@/types/student';

/** 知识点占位行（对齐 /api/knowledge/point/save 字段） */
interface PointRow {
  id: number;
  chapterId: number;
  name: string;
  description: string;
  /** 难度码值，最终取值需与后端确认 */
  difficulty: number;
  keyword: string;
  pageRef: string;
  pageOrder: number;
}

/** 教材原文占位行（对齐 /api/knowledge/content/save 字段） */
interface ContentRow {
  id: number;
  chapterId: number;
  knowledgePointId: number | null;
  contentType: string;
  content: string;
  page: number;
  pageOrder: number;
  /** 是否同步至 Dify 知识库 */
  syncDify: boolean;
}

// ==================== 真实只读数据：章节标题 ====================
const chapterLoading = ref(false);
const chapters = ref<Chapter[]>([]);
const selectedChapterId = ref<number | null>(null);

const selectedChapter = computed(() => chapters.value.find((c) => c.id === selectedChapterId.value) ?? null);

onMounted(async () => {
  chapterLoading.value = true;
  try {
    chapters.value = await fetchChapters();
    if (chapters.value.length) selectedChapterId.value = chapters.value[0].id;
  } catch {
    // 章节只读接口失败时提示已由 axios 拦截器给出，此处保持空列表骨架
    chapters.value = [];
  } finally {
    chapterLoading.value = false;
  }
});

// ==================== 骨架数据：接口预留，空数组占位 ====================
const points = ref<PointRow[]>([]);
const contents = ref<ContentRow[]>([]);

/** 教材原文类型（筛选下拉，与 content/list 的 contentType 参数对应） */
const CONTENT_TYPES = [
  { value: '', label: '全部类型' },
  { value: 'TEXT', label: '正文' },
  { value: 'EXAMPLE', label: '代码示例' },
  { value: 'DIAGRAM', label: '图表说明' },
];

const contentType = ref('');
const keyword = ref('');

/** 原文分页（骨架状态，接口接通后由后端分页返回） */
const contentPageNum = ref(1);
const contentPageSize = ref(10);
const contentTotal = ref(0);
const contentTotalPages = computed(() => Math.max(1, Math.ceil(contentTotal.value / contentPageSize.value)));

function handleQuery() {
  ElMessage.info('接口预留：章节树 / 知识点列表 / 教材原文列表查询接口均未开放');
}

function handleDelete(row: ContentRow) {
  ElMessage.info(`接口预留：PUT /api/knowledge/content/delete?id=${row.id}`);
}

// ==================== 抽屉（新增 / 编辑入口） ====================
type DrawerMode = 'chapter' | 'point' | 'content';

const drawerMode = ref<DrawerMode | null>(null);
const drawerTitle = ref('');

const drawerForm = ref({
  /** 章节 */
  chapterCode: '',
  title: '',
  level: 1,
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
  contentType: 'TEXT',
  content: '',
  page: 1,
  syncDify: false,
});

const DRAWER_TITLES: Record<DrawerMode, string> = {
  chapter: '章节维护',
  point: '知识点维护',
  content: '教材原文维护',
};

function openDrawer(mode: DrawerMode, action: '新增' | '编辑') {
  drawerMode.value = mode;
  drawerTitle.value = `${action} · ${DRAWER_TITLES[mode]}`;
}

function closeDrawer() {
  drawerMode.value = null;
}

function submitDrawer() {
  // 接口预留：后端未提供 chapter/save、point/save、content/save
  ElMessage.info(`接口预留：${DRAWER_TITLES[drawerMode.value ?? 'chapter']}保存接口未开放`);
}

function fmtLevel(level: number): string {
  return level === 1 ? '章' : level === 2 ? '节' : '小节';
}
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
        本页为维护骨架。章节下拉取自已有只读接口（章节列表），其余三张表所需写接口均未开放：
        GET /api/knowledge/chapter/tree?courseId=、POST /api/knowledge/chapter/save、
        GET /api/knowledge/point/list?chapterId=、POST /api/knowledge/point/save、
        GET /api/knowledge/content/list、POST /api/knowledge/content/save、PUT /api/knowledge/content/delete?id=。
      </span>
    </div>

    <!-- 全局筛选：课程章节 + 原文类型 + 关键词 -->
    <div class="st-card">
      <div class="st-card__body toolbar-row">
        <div class="field">
          <label class="field-label">教材章节</label>
          <el-select v-model="selectedChapterId" placeholder="选择章节" style="width: 260px;" :loading="chapterLoading">
            <el-option v-for="c in chapters" :key="c.id" :label="`${c.chapterCode} ${c.title}`" :value="c.id" />
          </el-select>
        </div>
        <div class="field">
          <label class="field-label">原文类型</label>
          <el-select v-model="contentType" style="width: 150px;">
            <el-option v-for="t in CONTENT_TYPES" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </div>
        <div class="field">
          <label class="field-label">关键词</label>
          <div class="search-box">
            <Search :size="14" />
            <input v-model="keyword" class="search-input" placeholder="搜索标题 / 内容" />
          </div>
        </div>
        <div class="toolbar-actions">
          <button class="st-btn st-btn--secondary" @click="handleQuery">查询</button>
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
            接口预留：GET /api/knowledge/chapter/tree?courseId= · POST /api/knowledge/chapter/save
            {id,courseId,parentId,chapterCode,title,level,sortOrder,description,summary}
          </p>
        </div>
        <button class="st-btn st-btn--primary block-add" @click="openDrawer('chapter', '新增')">
          <Plus :size="14" /> 新增章节
        </button>
      </div>
      <div class="table-wrap">
        <div v-if="chapterLoading" class="st-empty">
          <Loader2 :size="22" class="spin" />
          <div class="st-empty__text">正在加载章节列表…</div>
        </div>
        <table v-else class="km-table">
          <thead>
            <tr>
              <th style="width: 110px;">章节编号</th>
              <th>标题</th>
              <th style="width: 80px;">层级</th>
              <th style="width: 80px;">排序</th>
              <th>说明</th>
              <th style="width: 140px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <!-- 章节标题来自已有只读接口，其余写操作待接口提供 -->
            <tr v-for="c in chapters" :key="c.id">
              <td class="mono">{{ c.chapterCode }}</td>
              <td>{{ c.title }}</td>
              <td class="muted">{{ fmtLevel(c.level) }}</td>
              <td class="muted mono">{{ c.sortOrder }}</td>
              <td class="muted">{{ c.description || '—' }}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="st-text-btn" @click="openDrawer('chapter', '编辑')">
                  <Pencil :size="12" style="vertical-align: -2px;" /> 编辑
                </button>
              </td>
            </tr>
            <tr v-if="chapters.length === 0">
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
            接口预留：GET /api/knowledge/point/list?chapterId= · POST /api/knowledge/point/save
            {id,chapterId,name,description,difficulty,keyword,pageRef,pageOrder}
          </p>
        </div>
        <button class="st-btn st-btn--primary block-add" @click="openDrawer('point', '新增')">
          <Plus :size="14" /> 新增知识点
        </button>
      </div>
      <div class="table-wrap">
        <table class="km-table">
          <thead>
            <tr>
              <th>知识点名称</th>
              <th style="width: 90px;">难度</th>
              <th style="width: 160px;">关键词</th>
              <th style="width: 110px;">教材页码</th>
              <th style="width: 80px;">排序</th>
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
              <td class="muted mono">{{ p.pageOrder }}</td>
              <td class="muted">{{ p.description || '—' }}</td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="st-text-btn" @click="openDrawer('point', '编辑')">
                  <Pencil :size="12" style="vertical-align: -2px;" /> 编辑
                </button>
              </td>
            </tr>
            <template v-if="points.length === 0">
              <tr v-for="n in 3" :key="`point-ph-${n}`">
                <td><span class="skeleton-bar skeleton-bar--sm" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--wide" /></td>
                <td><span class="skeleton-bar skeleton-bar--sm" /></td>
              </tr>
            </template>
          </tbody>
        </table>
        <div v-if="points.length === 0" class="st-empty">
          <Layers :size="36" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">
            暂无知识点 · 接口预留：后端未提供 {{ selectedChapter ? `第 ${selectedChapter.chapterCode} 章` : '当前章节' }} 的知识点列表接口
          </div>
        </div>
      </div>
    </section>

    <!-- 分区三：教材原文 -->
    <section class="st-card block">
      <div class="st-card__header">
        <FileText :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">三、教材原文</h2>
          <p class="st-card__hint">
            接口预留：GET /api/knowledge/content/list?chapterId&contentType&keyword&pageNum&pageSize ·
            POST /api/knowledge/content/save {id,chapterId,knowledgePointId,contentType,content,page,pageOrder,syncDify} ·
            PUT /api/knowledge/content/delete?id=
          </p>
        </div>
        <button class="st-btn st-btn--primary block-add" @click="openDrawer('content', '新增')">
          <Plus :size="14" /> 新增原文
        </button>
      </div>
      <div class="table-wrap">
        <table class="km-table">
          <thead>
            <tr>
              <th style="width: 110px;">类型</th>
              <th>原文内容</th>
              <th style="width: 80px;">页码</th>
              <th style="width: 80px;">排序</th>
              <th style="width: 100px;">同步 Dify</th>
              <th style="width: 170px; text-align: right;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in contents" :key="row.id">
              <td><span class="st-badge st-badge--outline">{{ row.contentType }}</span></td>
              <td class="content-cell">{{ row.content }}</td>
              <td class="muted mono">{{ row.page }}</td>
              <td class="muted mono">{{ row.pageOrder }}</td>
              <td>
                <span class="st-badge" :class="row.syncDify ? 'st-badge--success' : 'st-badge--neutral'">
                  {{ row.syncDify ? '已同步' : '未同步' }}
                </span>
              </td>
              <td style="text-align: right; white-space: nowrap;">
                <button class="st-text-btn" @click="openDrawer('content', '编辑')">
                  <Pencil :size="12" style="vertical-align: -2px;" /> 编辑
                </button>
                <button class="st-text-btn st-text-btn--danger" @click="handleDelete(row)">
                  <Trash2 :size="12" style="vertical-align: -2px;" /> 删除
                </button>
              </td>
            </tr>
            <template v-if="contents.length === 0">
              <tr v-for="n in 3" :key="`content-ph-${n}`">
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--wide" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--xs" /></td>
                <td><span class="skeleton-bar skeleton-bar--sm" /></td>
                <td><span class="skeleton-bar skeleton-bar--sm" /></td>
              </tr>
            </template>
          </tbody>
        </table>
        <div v-if="contents.length === 0" class="st-empty">
          <FileText :size="36" :stroke-width="1.2" class="st-empty__icon" />
          <div class="st-empty__text">暂无教材原文 · 接口预留：后端未提供原文列表 / 保存 / 删除接口</div>
        </div>
        <!-- 分页骨架 -->
        <div class="pager">
          <span class="pager__total">共 {{ contentTotal }} 条 · 第 {{ contentPageNum }} / {{ contentTotalPages }} 页</span>
          <div class="pager__ctrl">
            <button class="st-btn st-btn--secondary" :disabled="contentPageNum <= 1" @click="handleQuery">上一页</button>
            <button class="st-btn st-btn--secondary" :disabled="contentPageNum >= contentTotalPages" @click="handleQuery">下一页</button>
          </div>
        </div>
      </div>
    </section>

    <!-- 新增 / 编辑抽屉 -->
    <Teleport to="body">
      <div v-if="drawerMode" class="mask" @click.self="closeDrawer">
        <aside class="drawer">
          <div class="st-card drawer__card">
            <div class="st-card__header">
              <div>
                <h2 class="st-card__title">{{ drawerTitle }}</h2>
                <p class="st-card__hint">接口预留：后端未提供知识库维护保存接口，以下为字段骨架</p>
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
              </template>

              <!-- 教材原文字段 -->
              <template v-else>
                <div class="form-row">
                  <div class="form-item form-item--sm">
                    <label class="form-label">原文类型 contentType</label>
                    <el-select v-model="drawerForm.contentType" style="width: 100%;">
                      <el-option value="TEXT" label="正文" />
                      <el-option value="EXAMPLE" label="代码示例" />
                      <el-option value="DIAGRAM" label="图表说明" />
                    </el-select>
                  </div>
                  <div class="form-item form-item--sm"><label class="form-label">页码 page</label><el-input-number v-model="drawerForm.page" :min="1" style="width: 100%;" /></div>
                  <div class="form-item form-item--sm"><label class="form-label">排序 pageOrder</label><el-input-number v-model="drawerForm.pageOrder" :min="1" style="width: 100%;" /></div>
                </div>
                <div class="form-item"><label class="form-label">原文内容 content</label><textarea v-model="drawerForm.content" class="form-textarea" rows="8" placeholder="教材原文片段（将作为答疑与出题依据）" /></div>
                <div class="form-item">
                  <label class="form-label">同步至 Dify 知识库 syncDify</label>
                  <el-switch v-model="drawerForm.syncDify" />
                </div>
              </template>
            </div>
            <div class="drawer__footer">
              <button class="st-btn st-btn--ghost" @click="closeDrawer">取消</button>
              <button class="st-btn st-btn--primary" @click="submitDrawer">保存</button>
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

.block-add {
  margin-left: auto;
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

/* 分页骨架 */
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

/* 骨架占位 */
.skeleton-bar {
  display: inline-block;
  height: 10px;
  width: 100%;
  border-radius: var(--radius-sm);
  background: var(--bg-muted);
}

.skeleton-bar--sm {
  width: 70%;
}

.skeleton-bar--xs {
  width: 40%;
}

.skeleton-bar--wide {
  width: 88%;
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
