<script setup lang="ts">
/**
 * PPT 模板与主题（接真实接口）
 * - GET  /api/teach/ppt/themes              后端可管理的主题列表（code / name / version，不含 CSS）
 * - GET  /api/teach/ppt/themes/{code}       单个主题完整 CSS（按 version 缓存，见 usePptTheme）
 * - GET  /api/teach/ppt/template/list       系统模板 + 本人自定义模板，按 sortOrder 升序
 * - GET  /api/teach/ppt/template/detail/{id} 模板详情（含 structure_md 骨架全文）
 * - POST /api/teach/ppt/template/save       id 为空新增，非空改本人模板，系统模板一律拒绝
 *
 * 前端不硬编码任何主题内容：新增/修改主题都由后端插数据，页面按 themeCode 动态加载 CSS 并注入 Shadow DOM。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Presentation,
  Save,
  Sparkles,
} from 'lucide-vue-next';
import { ElMessage, ElMessageBox } from 'element-plus';
import { fetchPptTemplateDetail, fetchPptTemplates, fetchPptThemes, savePptTemplate } from '@/api/teacher';
import type { PptTemplate, PptTemplateDetail, PptTheme } from '@/types/teacher';
import PptRenderer from '@/components/ppt/PptRenderer.vue';
import { PPT_THEME_DEMO_MARKDOWN } from '@/composables/usePptTheme';

const themes = ref<PptTheme[]>([]);
const templates = ref<PptTemplate[]>([]);
const loadingThemes = ref(false);
const loadingList = ref(false);
/** 主题卡片收起/展开（收起时卸载预览，节省多个 Shadow DOM 的开销） */
const themesCollapsed = ref(false);

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

/** 主题版本号：传给渲染器，用于本地缓存失效 */
function themeVersion(code: string): number | undefined {
  return themes.value.find((t) => t.code === code)?.version;
}

/** 当前表单选中的主题版本 */
const selectedThemeVersion = computed(() => themeVersion(form.themeCode));

/** 骨架为空时用固定示例页预览外观，避免右侧一片空白 */
const previewMarkdown = computed(() => form.structureMd.trim() || PPT_THEME_DEMO_MARKDOWN);

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
        维护课堂 PPT 的外观主题和页面内容结构 · 系统模板只能查看，可以另存为自己的模板
      </p>
    </header>

    <!-- 外观主题 -->
    <section class="st-card">
      <div class="st-card__header">
        <Sparkles :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">预置外观主题</h2>
          <p class="st-card__hint">
            系统内置 {{ themes.length }} 套主题 · 每张卡片使用同一页示例幻灯片展示实际外观
          </p>
        </div>
        <div class="header-actions">
          <Loader2 v-if="loadingThemes" :size="15" class="spin" />
          <button
            class="st-text-btn theme-collapse"
            type="button"
            :aria-expanded="themesCollapsed ? 'false' : 'true'"
            @click="themesCollapsed = !themesCollapsed"
          >
            <ChevronDown v-if="themesCollapsed" :size="14" />
            <ChevronUp v-else :size="14" />
            {{ themesCollapsed ? '展开' : '收起' }}
          </button>
        </div>
      </div>
      <div v-if="!themesCollapsed" class="st-card__body">
        <div v-if="!loadingThemes && themes.length === 0" class="st-empty">
          <Presentation :size="22" class="st-empty__icon" />
          <p class="st-empty__text">暂无主题数据</p>
        </div>
        <div v-else class="theme-grid">
          <article v-for="t in themes" :key="t.code" class="theme-item">
            <div class="theme-item__preview">
              <PptRenderer
                :structure-md="PPT_THEME_DEMO_MARKDOWN"
                :theme-code="t.code"
                :theme-version="t.version"
              />
            </div>
            <header class="theme-item__top">
              <span class="theme-item__name">{{ t.name }}</span>
            </header>
            <p v-if="t.description" class="theme-item__desc">{{ t.description }}</p>
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
            系统模板 {{ systemCount }} 个 / 自定义模板 {{ customCount }} 个，按排好的顺序显示
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
              <th class="col-id">编号</th>
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
                  :title="t.isSystem === 1 ? '系统模板只能查看，不能修改' : '编辑自己的模板'"
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
              模板编号 {{ detail?.id ?? '—' }}
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
            <div class="detail-render">
              <PptRenderer
                :structure-md="detail.structureMd"
                :theme-code="detail.themeCode"
                :theme-version="themeVersion(detail.themeCode)"
              />
            </div>
            <p class="detail-foot">
              预览按模板绑定的外观主题与骨架内容实时渲染，主题更新后自动生效。
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
            <p class="dialog__sub">保存后即可在模板列表里使用这个自定义模板</p>
          </div>
          <button class="st-btn st-btn--ghost" @click="confirmCloseForm">关闭</button>
        </header>
        <div class="dialog__body">
          <div class="form-layout">
            <div class="form-main">
              <div class="form-item">
                <label class="form-label">模板名称（必填）</label>
                <input v-model="form.name" class="form-input" maxlength="100" placeholder="如：面向对象专题骨架" />
              </div>
              <div class="form-row">
                <div class="form-item" style="flex: 1;">
                  <label class="form-label">外观主题</label>
                  <el-select v-model="form.themeCode" placeholder="选择主题" style="width: 100%;">
                    <el-option v-for="t in themes" :key="t.code" :label="`${t.name}（${t.code}）`" :value="t.code" />
                  </el-select>
                </div>
                <div class="form-item" style="width: 160px;">
                  <label class="form-label">模板编号</label>
                  <input :value="editingId ?? '新增时自动生成'" class="form-input" readonly />
                </div>
              </div>
              <div class="form-item">
                <label class="form-label">模板说明（可选）</label>
                <input v-model="form.description" class="form-input" maxlength="200" placeholder="一句话说明适用场景" />
              </div>
              <div class="form-item">
                <label class="form-label">内容结构骨架（必填）</label>
                <textarea
                  v-model="form.structureMd"
                  class="form-textarea"
                  rows="12"
                  placeholder="逐页写清标题和要点：每页一行标题（前面加 #），要点前面加 - 。例如：&#10;# 封面&#10;- 课程名 / 章节号&#10;# 本节目标&#10;# 案例代码"
                ></textarea>
              </div>
            </div>

            <!-- 外观 + 骨架实时联排预览：改动主题或骨架都会立刻重绘 -->
            <aside class="form-preview">
              <div class="form-preview__head">
                <span class="form-preview__title">实时预览</span>
                <span class="form-preview__hint">
                  {{ form.structureMd.trim() ? '当前骨架' : '示例内容' }}
                </span>
              </div>
              <div class="form-preview__scroll">
                <PptRenderer
                  v-if="form.themeCode"
                  :structure-md="previewMarkdown"
                  :theme-code="form.themeCode"
                  :theme-version="selectedThemeVersion"
                />
                <p v-else class="form-preview__empty">请选择外观主题</p>
              </div>
            </aside>
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

.theme-collapse {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  white-space: nowrap;
}

/* 主题卡片 */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
}

.theme-item {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 14px 16px 16px;
  background: var(--bg-surface);
  transition: border-color var(--transition), background var(--transition);
}

.theme-item:hover {
  border-color: var(--border-strong);
  background: var(--bg-subtle);
}

.theme-item__preview {
  margin-bottom: 12px;
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

.theme-item__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
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

.theme-item__ver {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
  color: var(--text-tertiary);
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
  width: min(1180px, 100%);
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

.detail-render {
  margin-top: 6px;
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

/* 新增 / 编辑：左侧表单 + 右侧实时预览 */
.form-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 22px;
  align-items: start;
}

.form-main {
  min-width: 0;
}

.form-preview {
  position: sticky;
  top: 0;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.form-preview__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.form-preview__title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-preview__hint {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.form-preview__scroll {
  max-height: 58vh;
  padding-right: 2px;
  overflow-y: auto;
}

.form-preview__empty {
  margin: 42px 0;
  font-size: 12px;
  text-align: center;
  color: var(--text-tertiary);
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 960px) {
  .form-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .form-preview {
    position: static;
  }

  .form-preview__scroll {
    max-height: 46vh;
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
