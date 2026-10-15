<script setup lang="ts">
/**
 * 题库管理 —— 当前为 UI 壳（只保留界面状态，不接 api / pinia）
 *
 * 接口预留：GET    /api/exam/question/admin/list?chapterId&type&page&size   分页查询题目列表（管理端）
 * 接口预留：GET    /api/exam/question/admin/{id}                            查询单题（编辑抽屉回显）
 * 接口预留：POST   /api/exam/question/admin/save                            手动新增题目
 * 接口预留：PUT    /api/exam/question/admin/update                          修改题目
 * 接口预留：DELETE /api/exam/question/admin/delete/{id}                      删除题目（逻辑删除）
 * 接口预留：POST   /api/exam/question/admin/random {chapterId,count,type,difficulty}   按章节随机抽题（不调用智能体）
 * 接口预留：POST   /api/exam/question/generate                              AI 出题，仅返回批次号，生成结果需回读列表接口
 * 章节下拉数据源：GET /api/knowledge/chapter/list（已实现，本视图尚未接入）
 *
 * save / update 请求体字段以本文件 drawerForm 为准：
 * {id,content,type,options,answer,analysis,requirements,codeFramework,hints,
 *  knowledgePointIds,solutionOutline,weight,judgeMode,testCases,chapterId,difficulty,score,cognitiveLevel}
 */
import { reactive, ref } from 'vue';
import {
  ClipboardList,
  Database,
  Layers,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-vue-next';

/** 题型：后端 type 为整数编码 1~7 */
const QUESTION_TYPE_OPTIONS = [
  { value: 0, label: '全部题型' },
  { value: 1, label: '单选题' },
  { value: 2, label: '多选题' },
  { value: 3, label: '判断题' },
  { value: 4, label: '填空题' },
  { value: 5, label: '简答题' },
  { value: 6, label: '编程题' },
  { value: 7, label: '阅读程序题' },
];

/** 难度：对应 difficulty 编码 */
const DIFFICULTY_OPTIONS = [
  { value: 0, label: '全部难度' },
  { value: 1, label: '入门' },
  { value: 2, label: '简单' },
  { value: 3, label: '中等' },
  { value: 4, label: '较难' },
  { value: 5, label: '困难' },
];

/** 认知层级：对应 cognitiveLevel 编码 */
const COGNITIVE_OPTIONS = [
  { value: 1, label: '记忆' },
  { value: 2, label: '理解' },
  { value: 3, label: '应用' },
  { value: 4, label: '分析' },
  { value: 5, label: '综合' },
];

/** 判题方式：对应 judgeMode 编码 */
const JUDGE_MODE_OPTIONS = [
  { value: 1, label: '客观题比对' },
  { value: 2, label: '用例判题' },
  { value: 3, label: 'AI 评分' },
];

const typeLabel = (v: number) => QUESTION_TYPE_OPTIONS.find((t) => t.value === v)?.label ?? '—';
const difficultyLabel = (v: number) => DIFFICULTY_OPTIONS.find((d) => d.value === v)?.label ?? '—';

// ==================== 筛选（仅 UI 状态） ====================
const filters = reactive({ chapterId: 0, type: 0, difficulty: 0, keyword: '' });
const page = ref(1);
const size = ref(10);
/** 骨架总数，接入列表接口后由响应 total 覆盖 */
const total = ref(0);

/** 骨架占位行：仅用于呈现表格结构，接口就绪后由后端数据替换 */
const SHELL_ROWS = [1, 2, 3, 4].map((i) => ({
  id: i,
  content: '题干内容待接口返回',
  type: i <= 2 ? 1 : i === 3 ? 3 : 6,
  difficulty: i,
  chapter: '—',
  score: '—',
  cognitiveLevel: '—',
}));

// ==================== 新增 / 编辑抽屉（UI 骨架，不提交） ====================
const drawerVisible = ref(false);
const drawerMode = ref<'create' | 'edit'>('create');
const drawerForm = reactive({
  id: undefined as number | undefined,
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
  chapterId: 0,
  difficulty: 2,
  score: 5,
  cognitiveLevel: 2,
});

function openDrawer(mode: 'create' | 'edit', row?: (typeof SHELL_ROWS)[number]) {
  drawerMode.value = mode;
  if (mode === 'edit' && row) drawerForm.id = row.id;
  drawerVisible.value = true;
}

function closeDrawer() {
  drawerVisible.value = false;
}

const isProgramming = () => drawerForm.type === 6 || drawerForm.type === 7;
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
            接口预留：GET /api/exam/question/admin/list?chapterId&amp;type&amp;page&amp;size
          </p>
        </div>
        <span class="st-badge st-badge--neutral shell-badge"><Database :size="11" /> UI 骨架</span>
      </div>
      <div class="st-card__body filter-row">
        <div class="filter-item">
          <label class="filter-label">教材章节</label>
          <el-select v-model="filters.chapterId" style="width: 200px;">
            <el-option label="全部章节" :value="0" />
          </el-select>
        </div>
        <div class="filter-item">
          <label class="filter-label">题型</label>
          <el-select v-model="filters.type" style="width: 130px;">
            <el-option v-for="t in QUESTION_TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </div>
        <div class="filter-item">
          <label class="filter-label">难度</label>
          <el-select v-model="filters.difficulty" style="width: 130px;">
            <el-option v-for="d in DIFFICULTY_OPTIONS" :key="d.value" :label="d.label" :value="d.value" />
          </el-select>
        </div>
        <div class="filter-item">
          <label class="filter-label">题干关键词</label>
          <input v-model="filters.keyword" class="form-input" placeholder="本地关键词（列表接口暂无该参数）" />
        </div>
        <!-- 接口预留：题目列表查询接口未提供，按钮保持禁用 -->
        <button class="st-btn st-btn--primary" disabled title="接口预留：GET /api/exam/question/admin/list">
          <Search :size="14" /> 查询
        </button>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="st-card" style="margin-top: 20px;">
      <div class="st-card__body toolbar-row">
        <span class="toolbar-count">共 {{ total }} 题 · 第 {{ page }} / {{ Math.max(1, Math.ceil(total / size)) }} 页</span>
        <div class="toolbar-actions">
          <button class="st-btn st-btn--secondary" disabled title="接口预留：POST /api/exam/question/admin/random">
            <Layers :size="13" /> 随机抽题组卷
          </button>
          <button class="st-btn st-btn--secondary" disabled title="接口预留：POST /api/exam/question/generate（仅返回批次号，需回读列表）">
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
          <p class="st-card__hint">当前为骨架占位行，接口就绪后由分页数据替换</p>
        </div>
      </div>
      <div class="st-card__body">
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
                <th>认知层级</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in SHELL_ROWS" :key="row.id" class="shell-row" aria-hidden="true">
                <td class="cell-secondary">{{ row.id }}</td>
                <td class="cell-content">{{ row.content }}</td>
                <td><span class="st-badge st-badge--outline">{{ typeLabel(row.type) }}</span></td>
                <td class="cell-secondary">{{ difficultyLabel(row.difficulty) }}</td>
                <td class="cell-secondary">{{ row.chapter }}</td>
                <td class="cell-secondary">{{ row.score }}</td>
                <td class="cell-secondary">{{ row.cognitiveLevel }}</td>
                <td>
                  <div class="row-actions">
                    <button class="st-text-btn" @click="openDrawer('edit', row)">
                      <Pencil :size="12" /> 编辑
                    </button>
                    <!-- 接口预留：DELETE /api/exam/question/admin/delete/{id} -->
                    <button class="st-text-btn st-text-btn--danger" disabled title="接口预留：DELETE /api/exam/question/admin/delete/{id}">
                      <Trash2 :size="12" /> 删除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 分页 -->
        <div class="pager">
          <button class="page-btn" :disabled="page <= 1" @click="page--">上一页</button>
          <span class="pager-info">第 {{ page }} 页 · 每页 {{ size }} 条</span>
          <button class="page-btn" :disabled="page * size >= total" @click="page++">下一页</button>
        </div>
      </div>
    </section>

    <!-- 新增 / 编辑抽屉（UI 骨架） -->
    <Teleport to="body">
      <Transition name="drawer">
        <div v-if="drawerVisible" class="drawer-overlay" @click.self="closeDrawer">
          <div class="drawer">
            <div class="drawer-header">
              <h3>{{ drawerMode === 'create' ? '新增题目' : `编辑题目 #${drawerForm.id ?? '—'}` }}</h3>
              <button class="drawer-close" @click="closeDrawer">
                <X :size="14" />
              </button>
            </div>
            <div class="drawer-body">
              <p class="drawer-hint">
                {{ drawerMode === 'create' ? 'POST' : 'PUT' }} /api/exam/question/admin/{{ drawerMode === 'create' ? 'save' : 'update' }}
                —— 接口预留，表单可填写但不会提交。
              </p>

              <div class="form-item">
                <label class="form-label">题干（content）</label>
                <textarea v-model="drawerForm.content" class="form-textarea" rows="3" placeholder="题干正文"></textarea>
              </div>

              <div class="form-row">
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">题型（type）</label>
                  <el-select v-model="drawerForm.type" style="width: 100%;">
                    <el-option v-for="t in QUESTION_TYPE_OPTIONS.slice(1)" :key="t.value" :label="t.label" :value="t.value" />
                  </el-select>
                </div>
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">难度（difficulty）</label>
                  <el-select v-model="drawerForm.difficulty" style="width: 100%;">
                    <el-option v-for="d in DIFFICULTY_OPTIONS.slice(1)" :key="d.value" :label="d.label" :value="d.value" />
                  </el-select>
                </div>
              </div>

              <div class="form-row">
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">章节（chapterId）</label>
                  <el-select v-model="drawerForm.chapterId" placeholder="选择章节" style="width: 100%;">
                    <el-option label="章节数据源：GET /api/knowledge/chapter/list" value="_unavailable" disabled />
                  </el-select>
                </div>
                <div class="form-item" style="width: 110px;">
                  <label class="form-label">分值（score）</label>
                  <el-input-number v-model="drawerForm.score" :min="0" :max="100" style="width: 100%;" />
                </div>
                <div class="form-item" style="width: 110px;">
                  <label class="form-label">权重（weight）</label>
                  <el-input-number v-model="drawerForm.weight" :min="0" :step="0.1" style="width: 100%;" />
                </div>
              </div>

              <div class="form-row">
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">认知层级（cognitiveLevel）</label>
                  <el-select v-model="drawerForm.cognitiveLevel" style="width: 100%;">
                    <el-option v-for="c in COGNITIVE_OPTIONS" :key="c.value" :label="c.label" :value="c.value" />
                  </el-select>
                </div>
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">判题方式（judgeMode）</label>
                  <el-select v-model="drawerForm.judgeMode" style="width: 100%;">
                    <el-option v-for="j in JUDGE_MODE_OPTIONS" :key="j.value" :label="j.label" :value="j.value" />
                  </el-select>
                </div>
              </div>

              <div v-if="!isProgramming()" class="form-item">
                <label class="form-label">选项（options）</label>
                <textarea
                  v-model="drawerForm.options"
                  class="form-textarea"
                  rows="3"
                  placeholder="每行一个选项，接入后按后端结构序列化为数组"
                ></textarea>
              </div>

              <div class="form-item">
                <label class="form-label">参考答案（answer）</label>
                <textarea v-model="drawerForm.answer" class="form-textarea" rows="2" placeholder="标准答案"></textarea>
              </div>

              <div class="form-item">
                <label class="form-label">解析（analysis）</label>
                <textarea v-model="drawerForm.analysis" class="form-textarea" rows="2" placeholder="答案解析，学生端可见"></textarea>
              </div>

              <template v-if="isProgramming()">
                <div class="form-item">
                  <label class="form-label">作答要求（requirements）</label>
                  <textarea v-model="drawerForm.requirements" class="form-textarea" rows="2" placeholder="功能与规范要求"></textarea>
                </div>
                <div class="form-item">
                  <label class="form-label">代码框架（codeFramework）</label>
                  <textarea v-model="drawerForm.codeFramework" class="form-textarea code-textarea" rows="4" placeholder="下发给学生的初始代码骨架"></textarea>
                </div>
                <div class="form-item">
                  <label class="form-label">提示（hints）</label>
                  <textarea v-model="drawerForm.hints" class="form-textarea" rows="2" placeholder="分步提示，一行一条"></textarea>
                </div>
                <div class="form-item">
                  <label class="form-label">解题思路（solutionOutline）</label>
                  <textarea v-model="drawerForm.solutionOutline" class="form-textarea" rows="2" placeholder="参考思路提纲"></textarea>
                </div>
                <div class="form-item">
                  <label class="form-label">测试用例（testCases）</label>
                  <textarea v-model="drawerForm.testCases" class="form-textarea code-textarea" rows="3" placeholder='[{ "input": "...", "expected": "..." }]'></textarea>
                </div>
              </template>

              <div class="form-item">
                <label class="form-label">关联知识点（knowledgePointIds）</label>
                <input v-model="drawerForm.knowledgePointIds" class="form-input" placeholder="知识点 ID 列表，逗号分隔" />
              </div>
            </div>
            <div class="drawer-footer">
              <button class="st-btn st-btn--ghost" @click="closeDrawer">取消</button>
              <button
                class="st-btn st-btn--primary"
                disabled
                :title="drawerMode === 'create' ? '接口预留：POST /api/exam/question/admin/save' : '接口预留：PUT /api/exam/question/admin/update'"
              >
                保存题目
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
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

.shell-row td {
  color: var(--text-tertiary);
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
  width: 520px;
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

.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s;
}

.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
</style>
