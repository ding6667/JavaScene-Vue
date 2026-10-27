<script setup lang="ts">
/**
 * 学生名册（教师 / 管理员共用）
 * - GET  /api/user/student/list            { classId, keyword, pageNum, pageSize } → 学生分页（权限 TEACHER 或 ADMIN）
 * - GET  /api/user/student/export          CSV 文件流，筛选参数与 list 一致，导出的就是屏上看到的范围
 * - GET  /api/user/student/import-template 导入模板（ADMIN）
 * - POST /api/user/student/batch-add       multipart 批量加学生（ADMIN）
 * - GET  /api/class/list                   班级下拉（后端已按登录者数据权限裁剪）
 *
 * 批量导入与模板下载只有管理员可见：后端对 TEACHER 返回 403，而 403 会被拦截器当成越权事件强制下线。
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  AlertCircle,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Upload,
  Users,
} from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import {
  batchAddStudents,
  downloadStudentTemplate,
  exportStudents,
  fetchStudents,
} from '@/api/user';
import { fetchClasses } from '@/api/class';
import type { ClassResponse } from '@/types/class';
import type { BatchImportResult, StudentListItem } from '@/types/user';
import { saveBlob } from '@/utils/download';
import { useAuthStore } from '@/stores/auth';

const authStore = useAuthStore();

const loading = ref(false);
const loadError = ref('');
const students = ref<StudentListItem[]>([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(20);

const classId = ref<number | null>(null);
const keyword = ref('');

const classes = ref<ClassResponse[]>([]);
const classError = ref('');

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)));
const hasActiveFilter = computed(() => keyword.value.trim() !== '' || classId.value != null);

/** list 与 export 共用同一份筛选参数，导出结果与列表可见范围一致 */
const currentFilters = computed(() => ({
  classId: classId.value ?? undefined,
  keyword: keyword.value.trim() || undefined,
}));

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    const page = await fetchStudents({
      ...currentFilters.value,
      pageNum: pageNum.value,
      pageSize: pageSize.value,
    });
    students.value = page.records ?? [];
    total.value = page.total ?? 0;
  } catch (e: unknown) {
    students.value = [];
    total.value = 0;
    loadError.value = (e instanceof Error ? e.message : String(e ?? '')) || '学生名单加载失败';
  } finally {
    loading.value = false;
  }
}

async function loadClasses() {
  classError.value = '';
  try {
    classes.value = await fetchClasses();
  } catch (e: unknown) {
    classes.value = [];
    classError.value = (e instanceof Error ? e.message : String(e ?? '')) || '班级选项加载失败';
  }
}

function reloadFirstPage() {
  if (pageNum.value === 1) {
    void load();
    return;
  }
  pageNum.value = 1; // 由 watch(pageNum) 触发 load
}

function goPage(page: number) {
  const target = Math.min(Math.max(1, page), totalPages.value);
  if (target === pageNum.value) return;
  pageNum.value = target; // 由 watch(pageNum) 触发 load
}

// keyword 走后端模糊查（学号/姓名），输入防抖 400ms 后回第一页
let searchTimer: number | undefined;
watch(keyword, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(reloadFirstPage, 400);
});

watch(classId, reloadFirstPage);
watch(pageSize, reloadFirstPage);
watch(pageNum, () => void load());

onUnmounted(() => window.clearTimeout(searchTimer));

onMounted(() => {
  void load();
  void loadClasses();
});

// ==================== 导出 CSV ====================

const exporting = ref(false);

const exportFileName = computed(() => {
  const c = classes.value.find((x) => x.classId === classId.value);
  return `学生名单${c ? `_${c.className}` : ''}.csv`;
});

async function handleExport() {
  if (exporting.value) return;
  exporting.value = true;
  try {
    saveBlob(await exportStudents(currentFilters.value), exportFileName.value);
    ElMessage.success('名单已导出');
  } catch {
    // 提示由响应拦截器统一给出（blob 里的 JSON 错误也会被识别成失败）
  } finally {
    exporting.value = false;
  }
}

// ==================== 批量导入（仅 ADMIN） ====================

const importVisible = ref(false);
const importClassId = ref<number | null>(null);
const importFile = ref<File | null>(null);
const importing = ref(false);
const importError = ref('');
const importResult = ref<BatchImportResult | null>(null);
const templateDownloading = ref(false);

const canImport = computed(() => importClassId.value != null && importFile.value != null && !importing.value);

function openImport() {
  importVisible.value = true;
  importError.value = '';
  importResult.value = null;
  importFile.value = null;
  importClassId.value = classId.value; // 正看着某个班级时默认导进这个班
  if (!classes.value.length && !classError.value) void loadClasses();
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement;
  importFile.value = input.files?.[0] ?? null;
  input.value = ''; // 否则再次选同一个文件不会触发 change
}

async function handleImport() {
  if (!canImport.value || importClassId.value == null || !importFile.value) return;
  importing.value = true;
  importError.value = '';
  importResult.value = null;
  try {
    importResult.value = await batchAddStudents(importClassId.value, importFile.value);
    importFile.value = null;
    await Promise.all([load(), loadClasses()]);
  } catch (e: unknown) {
    importError.value = (e instanceof Error ? e.message : String(e ?? '')) || '批量导入失败';
  } finally {
    importing.value = false;
  }
}

async function handleTemplate() {
  if (templateDownloading.value) return;
  templateDownloading.value = true;
  try {
    saveBlob(await downloadStudentTemplate(), '学生导入模板.txt');
  } catch {
    // 提示由响应拦截器统一给出
  } finally {
    templateDownloading.value = false;
  }
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">学生名册</h1>
      <p class="st-page-subtitle">按班级查看学生名单 · 可导出当前筛选结果为 CSV{{ authStore.isAdmin ? '，管理员还可批量导入' : '' }}</p>
    </header>

    <!-- 筛选 / 操作栏 -->
    <div class="st-card">
      <div class="st-card__body toolbar-row">
        <div class="class-filter">
          <el-select v-model="classId" placeholder="全部班级" clearable filterable style="width: 200px;">
            <el-option v-for="c in classes" :key="c.classId" :label="c.className" :value="c.classId" />
          </el-select>
          <p v-if="classError" class="field-hint field-hint--error">
            {{ classError }}
            <button class="st-text-btn" @click="loadClasses">重试</button>
          </p>
        </div>
        <div class="search-box">
          <Search :size="14" />
          <input
            v-model="keyword"
            class="search-input"
            placeholder="搜索学号 / 姓名"
            @keyup.enter="reloadFirstPage"
          />
        </div>
        <div class="toolbar-actions">
          <button class="st-btn st-btn--secondary" :disabled="loading" @click="load">
            <Loader2 v-if="loading" :size="13" class="spin" />
            <RefreshCw v-else :size="13" />
            刷新
          </button>
          <button
            class="st-btn st-btn--secondary"
            :disabled="exporting || total === 0"
            @click="handleExport"
          >
            <Loader2 v-if="exporting" :size="13" class="spin" />
            <Download v-else :size="13" />
            导出 CSV
          </button>
          <template v-if="authStore.isAdmin">
            <button
              class="st-btn st-btn--secondary"
              :disabled="templateDownloading"
              @click="handleTemplate"
            >
              <Loader2 v-if="templateDownloading" :size="13" class="spin" />
              <Download v-else :size="13" />
              下载模板
            </button>
            <button class="st-btn st-btn--primary" @click="openImport">
              <Upload :size="13" /> 批量导入
            </button>
          </template>
        </div>
      </div>
    </div>

    <!-- 名单表格 -->
    <div class="st-card" style="margin-top: 20px;">
      <div v-if="loading" class="st-card__body st-empty" style="padding: 70px;">
        <Loader2 :size="24" class="spin" />
        <div class="st-empty__text">正在加载学生名单…</div>
      </div>
      <div v-else-if="loadError" class="st-card__body st-empty" style="padding: 60px;">
        <AlertCircle :size="30" :stroke-width="1.4" class="st-empty__icon" />
        <div class="st-empty__text">{{ loadError }}</div>
        <button class="st-btn st-btn--secondary" @click="load">
          <RefreshCw :size="13" /> 重新加载
        </button>
      </div>
      <div v-else class="table-wrap">
        <p class="table-note">
          输入姓名或学号即可筛选，选定班级后只看本班学生；名单按页展示，可翻页或调整每页条数。
        </p>
        <table class="roster-table">
          <thead>
            <tr>
              <th>学号</th>
              <th>姓名</th>
              <th>班级</th>
              <th>年级</th>
              <th style="text-align: right;">状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in students" :key="row.userId">
              <td class="mono">{{ row.studentNo || '—' }}</td>
              <td class="cell-name">{{ row.realName || '—' }}</td>
              <td class="muted">{{ row.className || '—' }}</td>
              <td class="muted">{{ row.grade || '—' }}</td>
              <td style="text-align: right;">
                <span :class="['st-badge', row.enabled === 1 ? 'st-badge--success' : 'st-badge--neutral']">
                  {{ row.enabled === 1 ? '启用' : '停用' }}
                </span>
              </td>
            </tr>
            <tr v-if="students.length === 0">
              <td colspan="5" class="muted cell-empty">
                <template v-if="hasActiveFilter">当前筛选条件下没有学生，可清空筛选或换班级重查</template>
                <template v-else>名册里还没有学生{{ authStore.isAdmin ? '，可用「批量导入」按班级建名单' : '' }}</template>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="pager">
          <span class="pager__total">共 {{ total }} 名学生 · 第 {{ pageNum }} / {{ totalPages }} 页</span>
          <div class="pager__ctrl">
            <button class="st-btn st-btn--secondary" :disabled="pageNum <= 1" @click="goPage(1)">首页</button>
            <button class="st-btn st-btn--secondary" :disabled="pageNum <= 1" @click="goPage(pageNum - 1)">上一页</button>
            <button class="st-btn st-btn--secondary" :disabled="pageNum >= totalPages" @click="goPage(pageNum + 1)">下一页</button>
            <button class="st-btn st-btn--secondary" :disabled="pageNum >= totalPages" @click="goPage(totalPages)">末页</button>
            <span class="pager__label">跳至</span>
            <el-input-number
              v-model="pageNum"
              :min="1"
              :max="totalPages"
              :controls="false"
              size="small"
              style="width: 68px;"
            />
            <span class="pager__label">页</span>
            <el-select v-model="pageSize" style="width: 96px;">
              <el-option :value="20" label="20 条/页" />
              <el-option :value="50" label="50 条/页" />
              <el-option :value="100" label="100 条/页" />
            </el-select>
          </div>
        </div>
      </div>
    </div>

    <!-- 批量导入（仅 ADMIN） -->
    <Teleport v-if="authStore.isAdmin" to="body">
      <div v-if="importVisible" class="mask" @click.self="importVisible = false">
        <div class="st-card panel">
          <div class="st-card__header">
            <Users :size="16" class="card-icon" />
            <div>
              <h2 class="st-card__title">批量导入学生名单</h2>
              <p class="st-card__hint">
                名单文件一行一名学生，格式「学号,姓名[,初始密码]」，
                个别行填写有误不影响其他行
              </p>
            </div>
          </div>
          <div class="st-card__body">
            <div class="form-item">
              <label class="form-label">目标班级</label>
              <el-select v-model="importClassId" placeholder="选择班级" filterable style="width: 100%;">
                <el-option v-for="c in classes" :key="c.classId" :label="c.className" :value="c.classId" />
              </el-select>
              <p v-if="classError" class="field-hint field-hint--error">
                {{ classError }}
                <button class="st-text-btn" @click="loadClasses">重试</button>
              </p>
              <p v-else-if="!classes.length" class="field-hint">当前账号下还没有可选择的班级</p>
            </div>

            <label class="import-drop">
              <Upload :size="22" style="color: var(--text-tertiary);" />
              <span v-if="!importFile">点击选择名单文件（.txt / .md）</span>
              <span v-else class="import-file">{{ importFile.name }}（{{ (importFile.size / 1024).toFixed(1) }} KB）</span>
              <input type="file" accept=".txt,.md" style="display: none;" @change="onFileChange" />
            </label>

            <div v-if="importing" class="st-empty" style="padding: 26px 0 6px;">
              <Loader2 :size="20" class="spin" />
              <div class="st-empty__text">正在导入名单…</div>
            </div>
            <p v-else-if="importError" class="field-hint field-hint--error">
              {{ importError }}
              <button v-if="canImport" class="st-text-btn" @click="handleImport">重试</button>
            </p>

            <div v-if="importResult" class="import-result">
              <div class="result-stats">
                <div>
                  <span class="st-stat-value">{{ importResult.total }}</span>
                  <p class="st-stat-label">总行数</p>
                </div>
                <div>
                  <span class="st-stat-value">{{ importResult.successNum }}</span>
                  <p class="st-stat-label">成功</p>
                </div>
                <div>
                  <span class="st-stat-value">{{ importResult.failNum }}</span>
                  <p class="st-stat-label">失败</p>
                </div>
              </div>
              <table v-if="importResult.failList.length" class="roster-table fail-table">
                <thead>
                  <tr>
                    <th class="col-line">行号</th>
                    <th>学号</th>
                    <th>姓名</th>
                    <th>失败原因</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in importResult.failList" :key="f.line">
                    <td class="col-line mono">{{ f.line }}</td>
                    <td class="mono">{{ f.studentNo || '—' }}</td>
                    <td class="cell-name">{{ f.realName || '—' }}</td>
                    <td class="muted">{{ f.reason || '未说明原因' }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="field-hint">全部行导入成功，没有失败记录。</p>
            </div>

            <div class="panel-actions">
              <button class="st-btn st-btn--ghost" @click="importVisible = false">关闭</button>
              <button
                class="st-btn st-btn--secondary"
                :disabled="templateDownloading"
                @click="handleTemplate"
              >
                <Loader2 v-if="templateDownloading" :size="13" class="spin" />
                <Download v-else :size="13" /> 下载模板
              </button>
              <button
                class="st-btn st-btn--primary"
                :disabled="!canImport"
                :title="importClassId == null ? '请先选择目标班级' : (importFile ? '开始导入' : '请先选择名单文件')"
                @click="handleImport"
              >
                <Loader2 v-if="importing" :size="13" class="spin" />
                开始导入
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

.toolbar-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 16px;
  padding-bottom: 16px;
}

.toolbar-actions {
  margin-left: auto;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.class-filter {
  display: flex;
  flex-direction: column;
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
  width: 200px;
}

/* 表格 */
.table-wrap {
  padding: 8px 24px 18px;
  overflow-x: auto;
}

.table-note {
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
  padding: 8px 12px;
  margin: 0 0 6px;
  background: var(--bg-subtle);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
}

.roster-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.roster-table th {
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.roster-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  white-space: nowrap;
}

.roster-table tr:last-child td {
  border-bottom: none;
}

.roster-table tr:hover td {
  background: var(--bg-subtle);
}

.cell-name {
  font-weight: 500;
  color: var(--text-primary);
}

.muted {
  color: var(--text-tertiary);
  font-size: 12.5px;
}

.mono {
  font-family: Consolas, monospace;
  font-size: 12.5px;
}

.cell-empty {
  text-align: center;
  padding: 40px 0;
}

/* 分页 */
.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  padding-top: 16px;
  margin-top: 4px;
  border-top: 1px solid var(--border-subtle);
}

.pager__total {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

.pager__ctrl {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pager__label {
  font-size: 12.5px;
  color: var(--text-tertiary);
}

/* 导入弹窗 */
.mask {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 24px;
}

.panel {
  width: 620px;
  max-width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
}

.form-item {
  margin-bottom: 14px;
}

.form-label {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.field-hint {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--text-tertiary);
}

.field-hint--error {
  color: var(--status-warning);
}

.import-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  padding: 26px 16px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--text-secondary);
  transition: all var(--transition);
}

.import-drop:hover {
  border-color: var(--text-primary);
  background: var(--bg-subtle);
}

.import-file {
  color: var(--text-primary);
  font-weight: 500;
}

.import-result {
  margin-top: 16px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 14px;
}

.result-stats {
  display: flex;
  gap: 32px;
  margin-bottom: 12px;
}

.fail-table {
  font-size: 12.5px;
}

.col-line {
  width: 64px;
}

.panel-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}

.spin {
  animation: sr-spin 0.9s linear infinite;
}

@keyframes sr-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
