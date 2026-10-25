<script setup lang="ts">
/**
 * PPT 模板与主题（接真实接口）
 * - GET  /api/teach/ppt/template            4 套预置外观主题（后端常量，不查库）
 * - GET  /api/teach/ppt/template/list       系统模板 + 本人自定义模板，按 sortOrder 升序
 * - GET  /api/teach/ppt/template/detail/{id} 模板详情（含 structure_md 骨架全文）
 * - POST /api/teach/ppt/template/save       id 为空新增，非空改本人模板，系统模板一律拒绝
 *
 * 注意：备课生成接口 POST /api/agent/teach/prepare 目前不接收模板 ID，
 * 后端 prepare/record/detail 的 templateId 也标注为"待加列后落库，当前返回 null"，
 * 因此本页维护的模板暂未闭环作用于生成结果，只做维护与预览。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { Eye, Loader2, Pencil, Plus, Presentation, Save, Sparkles } from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchPptTemplateDetail, fetchPptTemplates, fetchPptThemes, savePptTemplate } from '@/api/teacher';
import type { PptTemplate, PptTemplateDetail, PptTheme } from '@/types/teacher';
import { renderMarkdown } from '@/utils/markdown';

const themes = ref<PptTheme[]>([]);
const templates = ref<PptTemplate[]>([]);
const loadingThemes = ref(false);
const loadingList = ref(false);

const detailVisible = ref(false);
const detail = ref<PptTemplateDetail | null>(null);
const loadingDetail = ref(false);

const formVisible = ref(false);
const saving = ref(false);
const editingId = ref<number | null>(null);
const form = reactive({
  name: '',
  description: '',
  themeCode: '',
  structureMd: '',
});

const systemCount = computed(() => templates.value.filter((t) => t.isSystem === 1).length);
const customCount = computed(() => templates.value.length - systemCount.value);

function themeName(code: string): string {
  return themes.value.find((t) => t.code === code)?.name ?? code;
}

async function loadThemes() {
  loadingThemes.value = true;
  try {
    themes.value = await fetchPptThemes();
    if (!form.themeCode && themes.value.length) form.themeCode = themes.value[0].code;
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    loadingThemes.value = false;
  }
}

async function loadTemplates() {
  loadingList.value = true;
  try {
    templates.value = await fetchPptTemplates();
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    loadingList.value = false;
  }
}

async function openPreview(tpl: PptTemplate) {
  detailVisible.value = true;
  loadingDetail.value = true;
  detail.value = null;
  try {
    detail.value = await fetchPptTemplateDetail(tpl.id);
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    loadingDetail.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  form.name = '';
  form.description = '';
  form.structureMd = '';
  if (!form.themeCode && themes.value.length) form.themeCode = themes.value[0].code;
  formVisible.value = true;
}

async function openEdit(tpl: PptTemplate) {
  if (tpl.isSystem === 1) return;
  try {
    const full = await fetchPptTemplateDetail(tpl.id);
    editingId.value = full.id;
    form.name = full.name;
    form.description = full.description ?? '';
    form.themeCode = full.themeCode;
    form.structureMd = full.structureMd ?? '';
    formVisible.value = true;
  } catch {
    // 错误已由响应拦截器统一提示
  }
}

const canSave = computed(
  () => !!form.name.trim() && !!form.themeCode && !!form.structureMd.trim() && !saving.value,
);

async function handleSave() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    await savePptTemplate({
      id: editingId.value ?? undefined,
      name: form.name.trim(),
      description: form.description.trim(),
      themeCode: form.themeCode,
      structureMd: form.structureMd,
    });
    ElMessage.success(editingId.value ? '模板已更新' : '自定义模板已创建');
    formVisible.value = false;
    await loadTemplates();
  } catch {
    // 错误已由响应拦截器统一提示
  } finally {
    saving.value = false;
  }
}

/** 未保存表单关闭前确认，避免误关丢失骨架内容 */
async function confirmCloseForm() {
  const dirty = !!form.name.trim() || !!form.structureMd.trim();
  if (!dirty) {
    formVisible.value = false;
    return;
  }
  try {
    await ElMessageBox.confirm('模板内容尚未保存，确认关闭？', '提示', {
      confirmButtonText: '关闭',
      cancelButtonText: '继续编辑',
      type: 'warning',
    });
    formVisible.value = false;
  } catch {
    // 用户选择继续编辑
  }
}

onMounted(() => {
  loadThemes();
  loadTemplates();
});
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">PPT 模板与主题</h1>
      <p class="st-page-subtitle">
        课堂 PPT 的外观主题与内容骨架维护 · 系统模板只读，可另存为自己的自定义模板
      </p>
    </header>

    <!-- 外观主题 -->
    <section class="st-card">
      <div class="st-card__header">
        <Sparkles :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">预置外观主题</h2>
          <p class="st-card__hint">GET /api/teach/ppt/template · 后端常量返回，共 {{ themes.length }} 套</p>
        </div>
        <Loader2 v-if="loadingThemes" :size="15" class="spin" />
      </div>
      <div class="st-card__body">
        <div v-if="!loadingThemes && themes.length === 0" class="st-empty">
          <Presentation :size="22" class="st-empty__icon" />
          <p class="st-empty__text">暂无主题数据</p>
        </div>
        <div v-else class="theme-grid">
          <article v-for="t in themes" :key="t.code" class="theme-item">
            <header class="theme-item__top">
              <span class="theme-item__name">{{ t.name }}</span>
              <code class="theme-item__code">{{ t.code }}</code>
            </header>
            <p class="theme-item__desc">{{ t.description }}</p>
          </article>
        </div>
      </div>
    </section>

    <!-- 模板列表 -->
    <section class="st-card tpl-card">
      <div class="st-card__header">
        <Presentation :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">模板列表</h2>
          <p class="st-card__hint">
            GET /api/teach/ppt/template/list · 系统 {{ systemCount }} 个 / 自定义 {{ customCount }} 个，按排序值升序
          </p>
        </div>
        <div class="header-actions">
          <Loader2 v-if="loadingList" :size="15" class="spin" />
          <button class="st-btn st-btn--primary" @click="openCreate">
            <Plus :size="14" /> 新增自定义模板
          </button>
        </div>
      </div>
      <div class="st-card__body">
        <div v-if="!loadingList && templates.length === 0" class="st-empty">
          <Presentation :size="22" class="st-empty__icon" />
          <p class="st-empty__text">暂无模板</p>
        </div>
        <table v-else class="tpl-table">
          <thead>
            <tr>
              <th class="col-id">ID</th>
              <th>模板名称</th>
              <th class="col-desc">说明</th>
              <th class="col-theme">主题</th>
              <th class="col-owner">归属</th>
              <th class="col-sort">排序</th>
              <th class="col-ops">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="t in templates" :key="t.id">
              <td class="cell-mono">{{ t.id }}</td>
              <td class="cell-name">{{ t.name }}</td>
              <td class="cell-secondary cell-desc">{{ t.description || '—' }}</td>
              <td>{{ themeName(t.themeCode) }}</td>
              <td>
                <span :class="['st-badge', t.isSystem === 1 ? 'st-badge--dark' : 'st-badge--outline']">
                  {{ t.isSystem === 1 ? '系统' : '自定义' }}
                </span>
              </td>
              <td class="cell-mono">{{ t.sortOrder }}</td>
              <td class="cell-ops">
                <button class="st-text-btn" @click="openPreview(t)">
                  <Eye :size="13" /> 预览
                </button>
                <button
                  class="st-text-btn"
                  :disabled="t.isSystem === 1"
                  :title="t.isSystem === 1 ? '系统模板只读，保存接口一律拒绝修改' : '编辑本人模板'"
                  @click="openEdit(t)"
                >
                  <Pencil :size="13" /> 编辑
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 模板详情 / 骨架预览 -->
    <div v-if="detailVisible" class="overlay" @click.self="detailVisible = false">
      <div class="dialog">
        <header class="dialog__head">
          <div>
            <h3 class="dialog__title">{{ detail?.name ?? '模板详情' }}</h3>
            <p class="dialog__sub">
              GET /api/teach/ppt/template/detail/{{ detail?.id }}
              <span v-if="detail" class="st-badge st-badge--neutral">{{ themeName(detail.themeCode) }}</span>
            </p>
          </div>
          <button class="st-btn st-btn--ghost" @click="detailVisible = false">关闭</button>
        </header>
        <div class="dialog__body">
          <Loader2 v-if="loadingDetail" :size="18" class="spin" />
          <template v-else-if="detail">
            <p v-if="detail.description" class="detail-desc">{{ detail.description }}</p>
            <img
              v-if="detail.previewImage"
              :src="detail.previewImage"
              alt="模板预览图"
              class="detail-preview"
            />
            <div class="md" v-html="renderMarkdown(detail.structureMd)" />
            <p class="detail-foot">
              后端 prepare/record/detail 的 templateId 目前恒为 null（列未就绪），
              备课生成接口也未接收模板 ID，模板与生成结果尚未闭环。
            </p>
          </template>
        </div>
      </div>
    </div>

    <!-- 新增 / 编辑模板 -->
    <div v-if="formVisible" class="overlay" @click.self="confirmCloseForm">
      <div class="dialog">
        <header class="dialog__head">
          <div>
            <h3 class="dialog__title">{{ editingId ? '编辑自定义模板' : '新增自定义模板' }}</h3>
            <p class="dialog__sub">POST /api/teach/ppt/template/save</p>
          </div>
          <button class="st-btn st-btn--ghost" @click="confirmCloseForm">关闭</button>
        </header>
        <div class="dialog__body">
          <div class="form-item">
            <label class="form-label">模板名称（name，必填）</label>
            <input v-model="form.name" class="form-input" maxlength="100" placeholder="如：面向对象专题骨架" />
          </div>
          <div class="form-row">
            <div class="form-item" style="flex: 1;">
              <label class="form-label">视觉主题（themeCode，限定 4 套预置）</label>
              <el-select v-model="form.themeCode" placeholder="选择主题" style="width: 100%;">
                <el-option v-for="t in themes" :key="t.code" :label="`${t.name}（${t.code}）`" :value="t.code" />
              </el-select>
            </div>
            <div class="form-item" style="width: 160px;">
              <label class="form-label">模板 ID</label>
              <input :value="editingId ?? '留空即新增'" class="form-input" readonly />
            </div>
          </div>
          <div class="form-item">
            <label class="form-label">模板说明（description，可选）</label>
            <input v-model="form.description" class="form-input" maxlength="200" placeholder="一句话说明适用场景" />
          </div>
          <div class="form-item">
            <label class="form-label">内容结构骨架（structureMd，必填）</label>
            <textarea
              v-model="form.structureMd"
              class="form-textarea"
              rows="12"
              placeholder="用 Markdown 编写每页骨架，例如：&#10;# 封面&#10;- 课程名 / 章节号&#10;# 本节目标&#10;# 案例代码"
            ></textarea>
          </div>
          <div class="dialog__actions">
            <button class="st-btn st-btn--secondary" @click="confirmCloseForm">取消</button>
            <button class="st-btn st-btn--primary" :disabled="!canSave" @click="handleSave">
              <Loader2 v-if="saving" :size="14" class="spin" />
              <Save v-else :size="14" />
              {{ saving ? '保存中' : '保存模板' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.st-view {
  max-width: 1280px;
  margin: 0 auto;
  padding: 40px 32px;
}

.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 主题卡片 */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}

.theme-item {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  background: var(--bg-surface);
  transition: border-color var(--transition), background var(--transition);
}

.theme-item:hover {
  border-color: var(--border-strong);
  background: var(--bg-subtle);
}

.theme-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.theme-item__name {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.theme-item__code {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11.5px;
  color: var(--text-secondary);
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  padding: 1px 6px;
}

.theme-item__desc {
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-secondary);
}

/* 模板表 */
.tpl-card {
  margin-top: 20px;
}

.tpl-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.tpl-table th {
  text-align: left;
  font-weight: 600;
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 0 10px 8px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.tpl-table td {
  padding: 11px 10px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  vertical-align: middle;
}

.tpl-table tr:last-child td {
  border-bottom: none;
}

.col-id,
.col-sort {
  width: 56px;
}

.col-theme {
  width: 120px;
}

.col-owner {
  width: 78px;
}

.col-desc {
  width: 30%;
}

.col-ops {
  width: 130px;
}

.cell-mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.cell-name {
  font-weight: 500;
}

.cell-secondary {
  color: var(--text-secondary);
  font-size: 12.5px;
}

.cell-desc {
  line-height: 1.55;
}

.cell-ops {
  white-space: nowrap;
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
  width: min(880px, 100%);
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.dialog__body {
  padding: 20px 22px;
  overflow-y: auto;
}

.dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.detail-desc {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-secondary);
}

.detail-preview {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  margin-bottom: 14px;
}

.detail-foot {
  margin: 18px 0 0;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-secondary);
  background: var(--bg-subtle);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
}

/* 表单 */
.form-row {
  display: flex;
  gap: 14px;
}

.form-item {
  margin-bottom: 14px;
}

.form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.form-input,
.form-textarea {
  width: 100%;
  font-family: inherit;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  transition: border-color var(--transition), box-shadow var(--transition);
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--border-strong);
  box-shadow: 0 0 0 3px rgba(87, 83, 78, 0.1);
}

.form-input[readonly] {
  background: var(--bg-subtle);
  color: var(--text-tertiary);
}

.form-textarea {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.65;
  resize: vertical;
}

/* Markdown 渲染 */
.md {
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-primary);
  word-break: break-word;
}

.md :deep(.md-h) {
  margin: 14px 0 6px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.2px;
}

.md :deep(.md-p) {
  margin: 4px 0;
}

.md :deep(.md-list) {
  margin: 4px 0 8px 20px;
  padding: 0;
}

.md :deep(.md-list li) {
  margin: 2px 0;
}

.md :deep(.md-quote) {
  margin: 8px 0;
  padding: 6px 12px;
  border-left: 2px solid var(--border-strong);
  background: var(--bg-subtle);
  color: var(--text-secondary);
}

.md :deep(.md-pre) {
  margin: 8px 0;
  padding: 12px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  overflow-x: auto;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12.5px;
}

.md :deep(.md-code) {
  padding: 1px 5px;
  background: var(--bg-subtle);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
}

.md :deep(.md-hr) {
  margin: 12px 0;
  border: none;
  border-top: 1px solid var(--border-default);
}

.md :deep(.md-link) {
  color: var(--text-primary);
  text-decoration: underline;
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
  .st-view {
    padding: 24px 16px;
  }

  .theme-grid {
    grid-template-columns: 1fr;
  }

  .form-row {
    flex-direction: column;
    gap: 0;
  }
}
</style>
