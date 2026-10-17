<script setup lang="ts">
/**
 * 教学资源管理 —— UI 骨架页（后端无 teach/resource 模块，本文件不接 @/api、不接 pinia）
 *
 * 接口预留：POST /api/knowledge/dataset/upload/file?chapterId=、GET /api/knowledge/dataset/upload/list、
 * PUT /api/knowledge/content/delete?id=（upload 模块已下线，知识库文档删除后端暂无专用接口）
 *
 * 后续接入方式：上传区改为调用 dataset/upload/file 并带 chapterId；
 * 资源表数据源换成 dataset/upload/list；删除按钮接 upload/delete/{id}；
 * 章节下拉可直接复用 @/api/student 的 fetchChapters()。
 */
import { computed, reactive, ref } from 'vue';
import type { Component } from 'vue';
import {
  Code2,
  FileText,
  FolderOpen,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-vue-next';

/** 资源类型（与筛选下拉、上传表单共用） */
const TYPE_OPTIONS: { value: string; label: string; icon: Component }[] = [
  { value: 'courseware', label: '课件', icon: FileText },
  { value: 'code', label: '代码案例', icon: Code2 },
  { value: 'material', label: '拓展资料', icon: FolderOpen },
];

const typeLabel = (value: string) => TYPE_OPTIONS.find((t) => t.value === value)?.label ?? value;
const typeIcon = (value: string) => TYPE_OPTIONS.find((t) => t.value === value)?.icon ?? FileText;

/** 筛选条件（仅本地 UI 状态） */
const filters = reactive({ type: 'all', keyword: '', chapterId: '' });

/** 骨架占位行：仅用于呈现资源表结构，接口就绪后由后端数据替换 */
const SHELL_ROWS = [1, 2, 3].map((i) => ({
  key: i,
  name: '—',
  type: 'courseware',
  chapter: '—',
  size: '—',
  uploadTime: '—',
  description: '待接口返回资源说明',
}));

const resources = ref<typeof SHELL_ROWS>([]);
const displayRows = computed(() => (resources.value.length ? resources.value : SHELL_ROWS));

/** 上传弹窗（骨架，可填写但不提交） */
const dialogVisible = ref(false);
const form = reactive({ name: '', type: 'courseware', chapterId: '', description: '' });
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">教学资源管理</h1>
      <p class="st-page-subtitle">上传自定义课件、代码案例、拓展资料，绑定教材章节供学生自主查阅</p>
    </header>

    <!-- 上传区（骨架） -->
    <div class="st-card">
      <div class="st-card__body">
        <div class="dropzone" role="button" tabindex="0">
          <div class="dropzone__icon">
            <Upload :size="22" />
          </div>
          <div class="dropzone__text">点击或拖拽文件到此区域上传</div>
          <div class="dropzone__hint">
            接口预留：POST /api/knowledge/dataset/upload/file?chapterId=、GET /api/knowledge/dataset/upload/list、
            PUT /api/knowledge/content/delete?id=（upload 模块已下线）
          </div>
        </div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="st-card" style="margin-top: 20px;">
      <div class="st-card__body toolbar-row">
        <el-select v-model="filters.type" style="width: 150px;">
          <el-option label="全部类型" value="all" />
          <el-option v-for="t in TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
        <el-input
          v-model="filters.keyword"
          placeholder="搜索资源名称"
          style="width: 220px;"
          :prefix-icon="Search"
          clearable
        />
        <el-select v-model="filters.chapterId" placeholder="绑定章节" clearable style="width: 180px;">
          <el-option label="后端未提供资源列表接口" value="_unavailable" disabled />
        </el-select>
        <span class="toolbar-count">共 {{ displayRows.length }} 个资源（骨架占位）</span>
        <button class="st-btn st-btn--primary" style="margin-left: auto;" @click="dialogVisible = true">
          <Plus :size="14" /> 上传资源
        </button>
      </div>
    </div>

    <!-- 资源表 -->
    <section class="st-card" style="margin-top: 20px;">
      <div class="st-card__header">
        <FolderOpen :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">资源列表</h2>
          <p class="st-card__hint">GET /api/knowledge/dataset/upload/list 接入后填充本表</p>
        </div>
        <span class="st-badge st-badge--neutral shell-badge">UI 骨架</span>
      </div>
      <div class="st-card__body">
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>资源名称</th>
                <th>类型</th>
                <th>绑定章节</th>
                <th>大小</th>
                <th>上传时间</th>
                <th>说明</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in displayRows" :key="r.key" class="shell-row" aria-hidden="true">
                <td>
                  <div class="name-cell">
                    <component :is="typeIcon(r.type)" :size="14" class="name-icon" />
                    <span class="cell-name">{{ r.name }}</span>
                  </div>
                </td>
                <td class="cell-secondary">{{ typeLabel(r.type) }}</td>
                <td class="cell-secondary">{{ r.chapter }}</td>
                <td class="cell-secondary">{{ r.size }}</td>
                <td class="cell-secondary">{{ r.uploadTime }}</td>
                <td class="cell-desc">{{ r.description }}</td>
                <td>
                  <button class="st-text-btn st-text-btn--danger" disabled title="接口预留：教材原文可走 PUT /api/knowledge/content/delete，知识库文档删除暂无接口">
                    <Trash2 :size="13" /> 删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <!-- 上传弹窗（骨架） -->
    <Teleport to="body">
      <div v-if="dialogVisible" class="upload-mask" @click.self="dialogVisible = false">
        <div class="st-card upload-panel">
          <div class="st-card__header">
            <h2 class="st-card__title">上传教学资源</h2>
            <span class="st-badge st-badge--neutral shell-badge">UI 骨架</span>
          </div>
          <div class="st-card__body">
            <div class="form-item">
              <label class="form-label">资源名称</label>
              <input v-model="form.name" class="form-input" placeholder="如：第 8 章 接口 课件.pptx" />
            </div>
            <div class="form-row">
              <div class="form-item" style="flex: 1;">
                <label class="form-label">资源类型</label>
                <el-select v-model="form.type" style="width: 100%;">
                  <el-option v-for="t in TYPE_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
                </el-select>
              </div>
              <div class="form-item" style="flex: 1;">
                <label class="form-label">绑定章节</label>
                <el-select v-model="form.chapterId" clearable placeholder="可选，对应 chapterId" style="width: 100%;">
                  <el-option label="章节列表来自 GET /api/knowledge/chapter/list" value="" disabled />
                </el-select>
              </div>
            </div>
            <div class="form-item">
              <label class="form-label">资源说明</label>
              <textarea
                v-model="form.description"
                class="form-textarea"
                rows="3"
                placeholder="简述资源内容与用途，学生端将展示该说明"
              ></textarea>
            </div>
            <div class="form-item">
              <label class="form-label">文件</label>
              <div class="file-pick">
                <Upload :size="14" />
                <span>选择文件（尚未接入 POST /api/knowledge/dataset/upload/file）</span>
              </div>
            </div>
            <div class="upload-actions">
              <button class="st-btn st-btn--ghost" @click="dialogVisible = false">取消</button>
              <button class="st-btn st-btn--primary" disabled title="接口预留：后端无 teach/resource 模块">
                <Upload :size="13" /> 确认上传
              </button>
            </div>
          </div>
        </div>
      </div>
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

/* 上传区 */
.dropzone {
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius-lg);
  padding: 32px 24px;
  text-align: center;
  background: var(--bg-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: border-color var(--transition), background var(--transition);
}

.dropzone:hover {
  border-color: var(--text-secondary);
  background: var(--bg-muted);
}

.dropzone__icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.dropzone__text {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text-primary);
}

.dropzone__hint {
  font-size: 11.5px;
  color: var(--text-tertiary);
  line-height: 1.7;
  max-width: 640px;
}

/* 工具栏 */
.toolbar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.toolbar-count {
  font-size: 12.5px;
  color: var(--text-tertiary);
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
  white-space: nowrap;
}

.data-table th {
  background: var(--bg-subtle);
  font-weight: 500;
  color: var(--text-secondary);
  font-size: 12px;
  letter-spacing: 0.3px;
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.shell-row td {
  color: var(--text-tertiary);
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-icon {
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.cell-name {
  font-weight: 500;
  color: var(--text-primary);
}

.cell-secondary {
  color: var(--text-secondary);
}

.cell-desc {
  color: var(--text-secondary);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 弹窗 */
.upload-mask {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 24px;
}

.upload-panel {
  width: 520px;
  max-width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
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
}

.form-textarea:focus {
  border-color: var(--border-strong);
}

.file-pick {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 12.5px;
  color: var(--text-tertiary);
  background: var(--bg-subtle);
}

.upload-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
</style>
