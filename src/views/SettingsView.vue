<template>
  <div class="settings-view">
    <!-- 页面标题 -->
    <header class="page-header">
      <h1 class="page-title">个人设置</h1>
    </header>

    <!-- 二级菜单栏 -->
    <nav class="sub-nav">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        :class="['sub-nav-item', { 'sub-nav-item--active': activeTab === tab.key }]"
        @click="handleTabClick(tab.key)"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- 内容区域 -->
    <div class="settings-content">
      <!-- 常规设置 -->
      <section v-if="activeTab === 'general'" class="tab-panel">
        <div v-loading="settingsStore.loading" class="general-panel">
          <!-- 页头：标题 + 说明 + [保存 | 恢复默认] 单按钮组合（批量保存） -->
          <div class="general-header">
            <div class="header-text">
              <h2 class="section-title">常规设置</h2>
              <p class="section-desc">
                管理批阅相关的常规偏好配置。修改完成后请点击顶部"保存"一次性提交所有改动。
                <span v-if="dirtyCount > 0" class="dirty-badge">
                  <span class="dirty-dot"></span>
                  {{ dirtyCount }} 项未保存
                </span>
              </p>
            </div>
            <div class="header-actions">
              <button
                v-if="settingsStore.settings.length > 0"
                class="btn btn-primary header-btn-save"
                :disabled="savingBatch || dirtyCount === 0"
                @click="() => handleBatchSave()"
              >
                <Check :size="15" />
                <span>{{ savingBatch ? '保存中...' : `保存（${dirtyCount}）` }}</span>
              </button>
              <button
                v-if="settingsStore.settings.length > 0"
                class="btn btn-danger-ghost"
                :disabled="resetting || savingBatch"
                @click="handleResetDefault"
              >
                <RotateCcw :size="15" />
                <span>{{ resetting ? '恢复中' : '恢复默认' }}</span>
              </button>
            </div>
          </div>

          <!-- 四大分区渲染：导出 / 文件 / API / 通知 -->
          <template v-if="settingsStore.settings.length > 0">
            <div
              v-for="(group, gIdx) in groupedSections"
              :key="group.key"
              class="setting-section"
            >
              <!-- 浅灰横线分隔（第一个分区上方不加） -->
              <div v-if="gIdx > 0" class="section-divider" role="separator" />
              <!-- 分区标题 -->
              <div class="section-heading">
                <h3 class="section-heading-title">
                  {{ SECTION_META[group.key].title }}
                </h3>
                <p v-if="SECTION_META[group.key].hint" class="section-heading-hint">
                  {{ SECTION_META[group.key].hint }}
                </p>
              </div>
              <!-- 本分区内的设置行 -->
              <div class="section-body">
                <div
                  v-for="item in group.items"
                  :key="item.configKey"
                  class="setting-row-v2"
                >
                  <!-- 左侧：标签 + 说明 + 脏标记 -->
                  <div class="row-label-col">
                    <div class="row-label-row">
                      <h3 class="row-label">{{ item.configKeyName }}</h3>
                      <span v-if="isDirty(item)" class="dirty-indicator" title="已修改未保存">·</span>
                    </div>
                    <p v-if="getDescription(item)" class="row-desc">
                      {{ getDescription(item) }}
                    </p>
                  </div>

                  <!-- 中间：控件 -->
                  <div class="row-control-col">
                    <!-- 1) 导出路径 / 文件名：仅文本输入（无浏览功能） -->
                    <el-input
                      v-if="getKind(item) === 'exportPath'"
                      v-model="item.configValue"
                      :placeholder="'请输入' + item.configKeyName"
                      class="control-input"
                    />

                    <!-- 2) 启用开关：美化后的 checkbox -->
                    <el-checkbox
                      v-else-if="getKind(item) === 'enableToggle'"
                      :model-value="strToBool(item.configValue)"
                      :size="''"
                      class="custom-checkbox"
                      @update:model-value="(v: boolean) => setToggle(item, v)"
                    >
                      <span class="toggle-label">
                        {{ strToBool(item.configValue) ? '已启用' : '未启用' }}
                      </span>
                    </el-checkbox>

                    <!-- 3) 重试策略下拉 -->
                    <el-select
                      v-else-if="getKind(item) === 'retryPolicy'"
                      v-model="item.configValue"
                      class="control-select"
                      placeholder="请选择重试次数"
                      popper-class="settings-select-popper"
                    >
                      <el-option
                        v-for="opt in RETRY_OPTIONS"
                        :key="opt.value"
                        :label="opt.label"
                        :value="opt.value"
                      />
                    </el-select>

                    <!-- 4) 清理周期下拉 -->
                    <el-select
                      v-else-if="getKind(item) === 'cleanupPeriod'"
                      v-model="item.configValue"
                      class="control-select"
                      placeholder="请选择保留周期"
                      popper-class="settings-select-popper"
                    >
                      <el-option
                        v-for="opt in CLEANUP_OPTIONS"
                        :key="opt.value"
                        :label="opt.label"
                        :value="opt.value"
                      />
                    </el-select>

                    <!-- 5) 过期提醒数字（滚轮增减） -->
                    <div v-else-if="getKind(item) === 'expiryRemind'" class="control-number">
                      <el-input-number
                        :model-value="strToNum(item.configValue, EXPIRY_MIN)"
                        :min="EXPIRY_MIN"
                        :max="EXPIRY_MAX"
                        :step="1"
                        :controls="true"
                        class="custom-input-number"
                        size="default"
                        @update:model-value="(n: number) => setNumber(item, n)"
                        @wheel.prevent="(e: WheelEvent) => onNumberWheel(item, e)"
                      />
                      <span class="number-unit">天前提醒</span>
                    </div>

                    <!-- 6) API 密钥：有值时默认显示灰色"已设置"，聚焦后可编辑 -->
                    <div v-else-if="getKind(item) === 'apiKey'" class="control-apikey">
                      <el-input
                        v-if="isApiKeyFocused(item) || !item.configValue"
                        v-model="item.configValue"
                        :placeholder="item.configValue ? '' : '请输入' + item.configKeyName"
                        :type="getApiKeyInputType(item)"
                        class="control-input"
                        @focus="focusApiKey(item)"
                        @blur="onApiKeyBlur(item)"
                      />
                      <div
                        v-else
                        class="apikey-masked"
                      >
                        已设置 apikey
                      </div>
                      <button
                        v-if="item.configValue"
                        class="apikey-reset-btn"
                        title="重置 apikey"
                        @click="resetApiKey(item)"
                      >
                        <RotateCcw :size="14" />
                      </button>
                    </div>

                    <!-- Fallback：普通文本输入（placeholder 跟 label 走，不显示"请输入配置值"） -->
                    <el-input
                      v-else
                      v-model="item.configValue"
                      :placeholder="'请输入' + item.configKeyName"
                      class="control-input"
                    />
                  </div>
                </div>
              </div>
            </div>
          </template>

          <!-- 加载失败：保留空态 + 错误文案 + 重试 -->
          <div v-if="generalError && settingsStore.settings.length === 0" class="general-empty">
            <Inbox :size="40" class="empty-icon" />
            <p class="empty-title">常规设置加载失败</p>
            <p class="empty-sub">{{ generalError }}</p>
            <button class="btn btn-ghost" @click="loadGeneralSettings">
              <RotateCcw :size="15" />
              <span>重新加载</span>
            </button>
          </div>

          <!-- 空状态 -->
          <div v-else-if="!settingsStore.loading && settingsStore.settings.length === 0" class="general-empty">
            <Inbox :size="40" class="empty-icon" />
            <p class="empty-title">暂无可配置项</p>
            <p class="empty-sub">尚未初始化常规设置，请稍后再试</p>
          </div>
        </div>
      </section>

      <!-- 评分模板设置 -->
      <section v-else-if="activeTab === 'template'" class="tab-panel">
        <!-- 模板选择栏 -->
        <div class="template-toolbar">
          <div class="toolbar-left">
            <label class="toolbar-label">评分模板</label>
            <el-select
              v-model="selectedId"
              placeholder="请选择模板"
              :loading="store.loading"
              class="template-select"
              @change="handleSelectChange"
            >
              <el-option
                v-for="item in store.standards"
                :key="item.id"
                :label="item.standardName"
                :value="item.id!"
              />
            </el-select>
            <span v-if="store.currentStandard?.isCurrent === 1" class="current-badge">当前使用</span>
          </div>

          <div class="toolbar-right">
            <button class="btn btn-ghost" @click="openCreate">
              <Plus :size="16" />
              <span>新增模板</span>
            </button>
            <button
              class="btn btn-ghost"
              :disabled="!store.currentStandard"
              @click="openEdit"
            >
              <Pencil :size="16" />
              <span>编辑</span>
            </button>
            <button
              class="btn btn-danger-ghost"
              :disabled="!store.currentStandard"
              @click="handleDelete"
            >
              <Trash2 :size="16" />
              <span>删除</span>
            </button>
          </div>
        </div>

        <!-- 模板内容 - 可滚动卡片区域 -->
        <div v-loading="store.loading" class="cards-scroll-wrapper">
          <div v-if="store.currentStandard && store.currentStandard.standardContent.length > 0" class="cards-grid">
            <div
              v-for="(item, index) in store.currentStandard.standardContent"
              :key="index"
              class="rubric-card"
              @click="openModuleEdit(index)"
            >
              <div class="card-top">
                <span class="card-index">{{ index + 1 }}</span>
                <h3 class="card-module-name">{{ item.moduleName }}</h3>
                <span class="card-score">{{ item.score }} 分</span>
                <Pencil :size="14" class="card-edit-icon" />
              </div>
              <div class="card-detail" v-html="renderDetail(item.detail)" />
            </div>
          </div>

          <div v-else-if="!store.loading" class="empty-state">
            <div class="empty-box">
              <p class="empty-text">
                {{ store.error ? `评分模板加载失败：${store.error}` : '暂无评分标准内容' }}
              </p>
              <button class="btn btn-ghost" @click="reloadStandards">
                <RotateCcw :size="15" />
                <span>重新加载</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- ==================== 新增/编辑弹窗 ==================== -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新增评分模板' : '编辑评分模板'"
      width="720px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form ref="formRef" :model="dialogForm" :rules="formRules" label-width="100px">
        <el-form-item label="模板名称" prop="standardName">
          <el-input v-model="dialogForm.standardName" placeholder="请输入模板名称" maxlength="50" />
        </el-form-item>

        <el-form-item label="设为当前">
          <el-switch
            v-model="dialogForm.isCurrent"
            :active-value="1"
            :inactive-value="0"
          />
          <span class="form-hint">开启后此模板将作为当前使用的评分标准</span>
        </el-form-item>

        <el-form-item label="评分项">
          <div class="rubric-editor">
            <div
              v-for="(item, index) in dialogForm.standardContent"
              :key="index"
              class="rubric-edit-item"
            >
              <div class="rubric-edit-top">
                <el-input
                  v-model="item.moduleName"
                  placeholder="模块名称"
                  class="input-module"
                />
                <el-input
                  v-model="item.score"
                  placeholder="分值"
                  class="input-score"
                />
                <button
                  v-if="dialogForm.standardContent.length > 1"
                  type="button"
                  class="btn-remove-item"
                  @click="removeRubricItem(index)"
                >
                  <Trash2 :size="16" />
                </button>
              </div>
              <el-input
                v-model="item.detail"
                type="textarea"
                :rows="3"
                placeholder="详细说明（支持 Markdown：**加粗**、换行）"
              />
            </div>
            <button type="button" class="btn-add-item" @click="addRubricItem">
              <Plus :size="16" />
              <span>添加评分项</span>
            </button>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="btn btn-ghost" @click="dialogVisible = false">取消</button>
        <button class="btn btn-primary" :disabled="submitting" @click="handleSubmit">
          {{ submitting ? '保存中...' : '确定' }}
        </button>
      </template>
    </el-dialog>

    <!-- ==================== 单个模块编辑弹窗 ==================== -->
    <el-dialog
      v-model="moduleDialogVisible"
      title="编辑评分项"
      width="520px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-form label-width="80px">
        <el-form-item label="模块名称">
          <el-input v-model="moduleEditForm.moduleName" placeholder="请输入模块名称" />
        </el-form-item>
        <el-form-item label="分值">
          <el-input v-model="moduleEditForm.score" placeholder="请输入分值" />
        </el-form-item>
        <el-form-item label="详细说明">
          <el-input
            v-model="moduleEditForm.detail"
            type="textarea"
            :rows="14"
            placeholder="详细说明（支持 Markdown：**加粗**、换行）"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <button class="btn btn-ghost" @click="moduleDialogVisible = false">取消</button>
        <button class="btn btn-primary" :disabled="moduleSubmitting" @click="handleModuleSubmit">
          {{ moduleSubmitting ? '保存中...' : '保存' }}
        </button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import { Plus, Pencil, Trash2, RotateCcw, Check, Inbox } from 'lucide-vue-next';
import {
  detectControl,
  detectGroup,
  RETRY_OPTIONS,
  CLEANUP_OPTIONS,
  EXPIRY_MIN,
  EXPIRY_MAX,
  SECTION_META,
  strToBool,
  boolToStr,
  strToNum,
  numToStr,
  type ControlKind,
  type SectionGroup,
} from '@/utils/settingsControl';
import { useStandardStore } from '@/stores/standard';
import { useAuthStore } from '@/stores/auth';
import { useSettingsStore } from '@/stores/settings';
import type { SettingsTab, RubricItem } from '@/types/standard';
import type { CommonSetting } from '@/types/settings';

/** 统一错误文案：后端函数仍是桩（抛「未实现：…」）时转为「接口待实现：@/api/settings.<fn>」 */
function apiHint(e: unknown, fn: string): string {
  const message = e instanceof Error ? e.message : String(e ?? '');
  return message.includes('未实现') ? `接口待实现：@/api/settings.${fn}` : message || `${fn} 调用失败`;
}

// ==================== 控件识别 & 值转换 ====================
function getKind(item: CommonSetting): ControlKind {
  return detectControl(item).kind;
}
function getDescription(item: CommonSetting): string {
  return detectControl(item).description;
}

function setToggle(item: CommonSetting, v: boolean) {
  item.configValue = boolToStr(v);
}
function setNumber(item: CommonSetting, n: number) {
  const clamped = Math.min(EXPIRY_MAX, Math.max(EXPIRY_MIN, Number.isFinite(n) ? n : EXPIRY_MIN));
  item.configValue = numToStr(clamped);
}
function onNumberWheel(item: CommonSetting, e: WheelEvent) {
  const cur = strToNum(item.configValue, EXPIRY_MIN);
  const next = Math.min(EXPIRY_MAX, Math.max(EXPIRY_MIN, e.deltaY < 0 ? cur + 1 : cur - 1));
  setNumber(item, next);
  if (Number(item.configValue) !== next) {
    item.configValue = numToStr(next);
  }
}

const store = useStandardStore();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();

const apiKeyFocused = reactive<Record<number, boolean>>({});

function isApiKeyFocused(item: CommonSetting): boolean {
  return !!apiKeyFocused[item.configKey];
}

function focusApiKey(item: CommonSetting) {
  apiKeyFocused[item.configKey] = true;
}

function onApiKeyBlur(item: CommonSetting) {
  apiKeyFocused[item.configKey] = false;
}

function getApiKeyInputType(item: CommonSetting): string {
  return apiKeyFocused[item.configKey] ? 'text' : 'password';
}

function resetApiKey(item: CommonSetting) {
  item.configValue = '';
  apiKeyFocused[item.configKey] = false;
}

// ==================== original 值快照 & 脏跟踪 ====================
// 每次加载设置后，记录每个 key 的初始值；用户改动后与快照比较判断 dirty
const originalValues = reactive<Record<number, string>>({});

function takeOriginalSnapshot() {
  for (const s of settingsStore.settings) {
    originalValues[s.configKey] = s.configValue;
  }
}

function isDirty(item: CommonSetting): boolean {
  return originalValues[item.configKey] !== item.configValue;
}

/** 计算有多少项改动未保存 */
const dirtyCount = computed(() => {
  let n = 0;
  for (const s of settingsStore.settings) {
    if (isDirty(s)) n++;
  }
  return n;
});

/** 按分组归类，固定顺序 export → file → api → notify（空分组不显示） */
type GroupedSection = { key: SectionGroup; items: CommonSetting[] };
const GROUP_ORDER: SectionGroup[] = ['export', 'file', 'api', 'notify'];
const groupedSections = computed<GroupedSection[]>(() => {
  const buckets = new Map<SectionGroup, CommonSetting[]>();
  for (const s of settingsStore.settings) {
    const g = detectGroup(s, getKind(s));
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g)!.push(s);
  }
  const result: GroupedSection[] = [];
  for (const k of GROUP_ORDER) {
    const arr = buckets.get(k);
    if (arr && arr.length > 0) result.push({ key: k, items: arr });
  }
  // 兜底：任何没归类到 4 分区的，塞到 notify
  buckets.forEach((arr, k) => {
    if (!GROUP_ORDER.includes(k) && arr.length > 0) {
      const notify = result.find((r) => r.key === 'notify');
      if (notify) notify.items.push(...arr);
    }
  });
  return result;
});

// 常规设置：批量保存中、恢复默认中
const savingBatch = ref(false);
const resetting = ref(false);

// 注意：不能 watch settingsStore.settings（deep）— 用户每次改值会立刻被写回快照，导致 dirty 永远 0。
// 快照仅在显式时机建立：fetch 成功后、reset 成功后、handleBatchSave 末尾。

const tabs: { key: SettingsTab; label: string }[] = [
  { key: 'general', label: '常规设置' },
  { key: 'template', label: '评分模板设置' },
];

const activeTab = ref<SettingsTab>('template');
const selectedId = ref<number | undefined>(undefined);
// prevGeneralTab：用于 tab 切换到 general 时如果用户选择“不保存”，需要把改动还原
const confirmDialogOpen = ref(false);

// ==================== 弹窗状态 ====================
const dialogVisible = ref(false);
const dialogMode = ref<'create' | 'edit'>('create');
const submitting = ref(false);
const formRef = ref<FormInstance>();

interface DialogForm {
  standardName: string;
  isCurrent: number;
  standardContent: RubricItem[];
}

const dialogForm = reactive<DialogForm>({
  standardName: '',
  isCurrent: 0,
  standardContent: [],
});

const formRules = {
  standardName: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
};

// ==================== 单模块编辑状态 ====================
const moduleDialogVisible = ref(false);
const moduleSubmitting = ref(false);
const moduleEditIndex = ref(-1);
const moduleEditForm = reactive({
  moduleName: '',
  score: '',
  detail: '',
});

// ==================== 生命周期 / 守卫 ====================

/** 常规设置加载失败提示（已对接接口异常 / 后端仍是桩时保留空态 + 重试） */
const generalError = ref<string | null>(null);

async function loadGeneralSettings() {
  generalError.value = null;
  try {
    await settingsStore.fetch();
  } catch (e: unknown) {
    generalError.value = apiHint(e, 'getCommonSettings');
    return;
  }
  // 仅在成功后建立快照（避免把失败时的脏值当基线）
  takeOriginalSnapshot();
}

/** 评分模板加载：store 内部已 catch 并写入 store.error，此处只提供重试入口 */
async function reloadStandards() {
  await store.fetchStandards();
}

onMounted(async () => {
  await reloadStandards();
  if (store.standards.length > 0) {
    selectedId.value = store.standards[0].id;
  }
  await loadGeneralSettings();
});

watch(
  () => store.currentStandard,
  (val) => {
    if (val?.id) {
      selectedId.value = val.id;
    }
  }
);

/** 把 current 还原为 original 快照（用户选"不保存"后调用） */
function revertToOriginal() {
  for (const s of settingsStore.settings) {
    if (originalValues[s.configKey] !== undefined) {
      s.configValue = originalValues[s.configKey];
    }
  }
}

/**
 * 包装 ElMessageBox：把"取消/关闭"的 reject 转成 resolve 的字符串结果，
 * 避免 await 在 try 里直接抛异常跳过后续分支，导致"点不保存却一直留在原地"。
 * 返回：'confirm' | 'cancel' | 'close'
 */
async function askUnsaved(title: string, message: string): Promise<'confirm' | 'cancel' | 'close'> {
  try {
    const action = await ElMessageBox({
      title,
      message,
      confirmButtonText: '保存并离开',
      cancelButtonText: '不保存',
      distinguishCancelAndClose: true,
      showCancelButton: true,
      type: 'warning',
    });
    return (action === 'confirm' ? 'confirm' : 'cancel');
  } catch (e: any) {
    // Element Plus：点 cancel → reject('cancel')；点右上角关闭 → reject('close')
    if (e === 'cancel' || e === 'close') return e;
    return 'cancel';
  }
}

// ==================== tab 切换守卫（离开常规设置 → 若有脏项则提示） ====================
async function handleTabClick(key: SettingsTab) {
  if (key === activeTab.value) return;
  // 从 general 切走：若有未保存则提示
  if (activeTab.value === 'general' && dirtyCount.value > 0 && !confirmDialogOpen.value) {
    confirmDialogOpen.value = true;
    let action: 'confirm' | 'cancel' | 'close' = 'cancel';
    try {
      action = await askUnsaved('设置未保存', '你在常规设置中的改动尚未保存，是否保存？');
    } finally {
      confirmDialogOpen.value = false;
    }
    if (action === 'confirm') {
      // 保存（串行），成功后再切走；保存失败（仍有 dirty）则停留在 general
      const ok = await handleBatchSave(true);
      if (ok && dirtyCount.value === 0) activeTab.value = key;
    } else {
      // 'cancel' 或 'close' → 不保存。先切 tab，再回滚内存值并重拉后端最新（避免 UI 卡在原地）
      activeTab.value = key;
      revertToOriginal();
      await loadGeneralSettings();
    }
    return;
  }
  // 切回 general：如之前选了"不保存"，数据会是后端最新（因为上面已重拉）
  activeTab.value = key;
}

// ==================== 路由守卫：离开页面时若常规设置有脏项则提示 ====================
onBeforeRouteLeave(async (_to, _from, next) => {
  // 仅当用户停留在 general 且 general 中有脏项时才提示
  if (activeTab.value !== 'general' || dirtyCount.value === 0 || confirmDialogOpen.value) {
    next();
    return;
  }
  confirmDialogOpen.value = true;
  let action: 'confirm' | 'cancel' | 'close' = 'cancel';
  try {
    action = await askUnsaved('设置未保存', '你在常规设置中的改动尚未保存，是否保存后再离开？');
  } finally {
    confirmDialogOpen.value = false;
  }
  if (action === 'confirm') {
    const ok = await handleBatchSave(true);
    if (ok && dirtyCount.value === 0) next();
    else next(false); // 保存失败 → 停留在本页，让用户处理
  } else {
    // 不保存：同步回滚内存值后放行，并异步重拉后端最新，
    // 让用户下次再进设置页直接拿到后端值，不必等 fetch 的空窗
    revertToOriginal();
    next();
    try {
      await settingsStore.fetch();
      takeOriginalSnapshot();
    } catch {
      /* 静默：组件已卸载，错误由拦截器提示 */
    }
  }
});

// ==================== 批量保存：串行调用 updateCommonSettings（接口一次一个） ====================
async function handleBatchSave(silent = false): Promise<boolean> {
  if (savingBatch.value) return false;
  const dirtyItems = settingsStore.settings.filter(isDirty);
  if (dirtyItems.length === 0) {
    if (!silent) ElMessage.info('没有需要保存的改动');
    return true;
  }
  savingBatch.value = true;
  let success = 0;
  let failed = 0;
  let firstError = '';
  try {
    for (const item of dirtyItems) {
      try {
        // 接口一次只改一个属性：PUT { configKey, configValue }（整对象提交后端不接受）
        await settingsStore.update(item.configKey, item.configValue);
        // 单项成功后立即写入 snapshot，避免整体失败时已成功的还标记 dirty
        originalValues[item.configKey] = item.configValue;
        success++;
      } catch (e: unknown) {
        failed++;
        if (!firstError) firstError = apiHint(e, 'updateCommonSettings');
        // 其余项继续尝试，最后统一提示
      }
    }
    // settingsStore.update 可能用返回的 settings 替换本地数据，所以需要重新建立快照
    takeOriginalSnapshot();
    if (!silent) {
      if (failed === 0) {
        ElMessage.success(`已保存 ${success} 项设置`);
      } else {
        ElMessage.warning(`保存完成：成功 ${success} 项，失败 ${failed} 项（${firstError}）`);
      }
    }
    return failed === 0;
  } finally {
    savingBatch.value = false;
  }
}

// ==================== 恢复默认 ====================
async function handleResetDefault() {
  try {
    await ElMessageBox.confirm(
      '确定恢复默认设置吗？当前所有修改将被重置。',
      '确认',
      { type: 'warning' }
    );
  } catch {
    return;
  }
  resetting.value = true;
  try {
    await settingsStore.reset();
    // reset 已刷新 settingsStore.settings；重建 snapshot
    takeOriginalSnapshot();
    ElMessage.success('已恢复默认设置');
  } catch (e: unknown) {
    ElMessage.error(apiHint(e, 'defaultSettings'));
  } finally {
    resetting.value = false;
  }
}

// ==================== 模板选择 ====================
function handleSelectChange(id: number) {
  store.selectStandard(id);
}

// ==================== 新增 ====================
function openCreate() {
  dialogMode.value = 'create';
  dialogForm.standardName = '';
  dialogForm.isCurrent = 0;
  dialogForm.standardContent = [{ moduleName: '', detail: '', score: '' }];
  dialogVisible.value = true;
}

// ==================== 编辑 ====================
function openEdit() {
  if (!store.currentStandard) return;
  dialogMode.value = 'edit';
  dialogForm.standardName = store.currentStandard.standardName;
  dialogForm.isCurrent = store.currentStandard.isCurrent;
  dialogForm.standardContent = store.currentStandard.standardContent.map((item) => ({
    moduleName: item.moduleName,
    detail: item.detail,
    score: item.score,
  }));
  if (dialogForm.standardContent.length === 0) {
    dialogForm.standardContent = [{ moduleName: '', detail: '', score: '' }];
  }
  dialogVisible.value = true;
}

// ==================== 评分项编辑 ====================
function addRubricItem() {
  dialogForm.standardContent.push({ moduleName: '', detail: '', score: '' });
}

function removeRubricItem(index: number) {
  dialogForm.standardContent.splice(index, 1);
}

// ==================== 提交 ====================
async function handleSubmit() {
  if (!formRef.value) return;
  try {
    await formRef.value.validate();
  } catch {
    return;
  }

  // 校验评分项
  const hasEmpty = dialogForm.standardContent.some(
    (item) => !item.moduleName.trim() || !item.score.trim()
  );
  if (hasEmpty) {
    ElMessage.warning('请填写完整的模块名称和分值');
    return;
  }

  submitting.value = true;

  if (dialogMode.value === 'create') {
    // StandardCreateRequest.userId 是字符串（与 StandardConfig.userId: number 口径不一致，见 @/types/standard）；
    // 数值用户 ID 需 /api/user/info 才能取到（已接桩：待实现 @/api/user.fetchUserInfo），拿不到时降级用登录名
    const operatorId = authStore.userId ? String(authStore.userId) : (authStore.username ?? '');
    const ok = await store.create({
      standardName: dialogForm.standardName,
      standardContent: dialogForm.standardContent,
      isCurrent: dialogForm.isCurrent,
      userId: operatorId,
    });
    if (ok) {
      ElMessage.success('创建成功');
      dialogVisible.value = false;
    }
  } else {
    if (!store.currentStandard?.id) return;
    const ok = await store.update(store.currentStandard.id, {
      standardName: dialogForm.standardName,
      standardContent: dialogForm.standardContent,
      isCurrent: dialogForm.isCurrent,
    });
    if (ok) {
      ElMessage.success('更新成功');
      dialogVisible.value = false;
    }
  }

  submitting.value = false;
}

// ==================== 单模块编辑 ====================
function openModuleEdit(index: number) {
  if (!store.currentStandard) return;
  const item = store.currentStandard.standardContent[index];
  if (!item) return;

  moduleEditIndex.value = index;
  moduleEditForm.moduleName = item.moduleName;
  moduleEditForm.score = item.score;
  moduleEditForm.detail = item.detail;
  moduleDialogVisible.value = true;
}

async function handleModuleSubmit() {
  if (!store.currentStandard?.id) return;
  if (!moduleEditForm.moduleName.trim() || !moduleEditForm.score.trim()) {
    ElMessage.warning('请填写完整的模块名称和分值');
    return;
  }

  moduleSubmitting.value = true;

  // 替换目标模块，保留其他模块不变
  const newContent = store.currentStandard.standardContent.map((item, i) =>
    i === moduleEditIndex.value
      ? {
          moduleName: moduleEditForm.moduleName,
          score: moduleEditForm.score,
          detail: moduleEditForm.detail,
        }
      : { ...item }
  );

  const ok = await store.update(store.currentStandard.id, {
    standardName: store.currentStandard.standardName,
    standardContent: newContent,
    isCurrent: store.currentStandard.isCurrent,
  });

  if (ok) {
    ElMessage.success('保存成功');
    moduleDialogVisible.value = false;
  }

  moduleSubmitting.value = false;
}

// ==================== 删除 ====================
async function handleDelete() {
  if (!store.currentStandard) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除模板 "${store.currentStandard.standardName}" 吗？`,
      '确认删除',
      { type: 'warning' }
    );
  } catch {
    return;
  }

  const ok = await store.remove(store.currentStandard.id!);
  if (ok) {
    ElMessage.success('删除成功');
  }
}

// ==================== 工具函数 ====================
/** 简单的 Markdown 渲染：换行转换为 <br>，加粗 **text** 转为 <strong> */
function renderDetail(detail: string): string {
  if (!detail) return '<span class="detail-empty">无详细说明</span>';
  return detail
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}
</script>

<style scoped>
.settings-view {
  max-width: 1280px;
  margin: 0 auto;
  padding: 40px 32px;
}

/* ==================== 二级菜单栏 ==================== */
.sub-nav {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 32px;
}

.sub-nav-item {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-tertiary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
  margin-bottom: -1px;
}

.sub-nav-item:hover {
  color: var(--text-secondary);
}

.sub-nav-item--active {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}

/* ==================== 通用 ==================== */
.tab-panel {
  min-height: 300px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}

.empty-text {
  font-size: 14px;
  color: var(--text-tertiary);
}

/* ==================== 常规设置 ==================== */
.general-panel {
  max-width: 1024px;
}

.general-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 28px;
  border-bottom: 1px solid var(--border-strong);
  margin-bottom: 12px;
}

.header-text {
  flex: 1;
  min-width: 0;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px;
}

.section-desc {
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-tertiary);
  margin: 0;
  max-width: 60ch;
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.header-btn-save {
  min-width: 140px;
  justify-content: center;
}

/* 未保存计数徽章 */
.dirty-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--status-warning);
  background: var(--status-warning-bg);
  border-radius: 999px;
}
.dirty-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-warning);
  box-shadow: 0 0 0 2px var(--status-warning);
  opacity: 0.7;
}

/* ---- 分区容器 ---- */
.setting-section + .setting-section {
  margin-top: 4px;
}

/* 浅灰色横线分区分隔（比行分隔更淡、更粗，视觉划分四个区） */
.section-divider {
  height: 2px;
  background: var(--border-default);
  border: none;
  margin: 28px 0 24px;
  border-radius: 2px;
  opacity: 0.75;
}

/* 分区标题 */
.section-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 16px 0 18px;
}
.section-heading-title {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-primary);
  margin: 0;
  padding-left: 10px;
  position: relative;
}
.section-heading-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 3px;
  height: 14px;
  border-radius: 2px;
  background: var(--accent);
  transform: translateY(-50%);
}
.section-heading-hint {
  font-size: 12px;
  color: var(--text-tertiary);
  margin: 0;
}

.section-body {
  display: flex;
  flex-direction: column;
}

/* ---- 设置行：左 label / 中控件（两列布局） ---- */
.setting-row-v2 {
  display: grid;
  grid-template-columns: 1fr 1.6fr;
  align-items: flex-start;
  column-gap: 24px;
  row-gap: 8px;
  padding: 16px 0;
  border-bottom: 1px solid var(--border);
}

.setting-row-v2:last-child {
  border-bottom: none;
}

.row-label-col {
  min-width: 0;
  padding-top: 6px;
}
.row-label-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.row-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px;
}
/* 单项脏标记：标签旁侧的小橙点 + "·" */
.dirty-indicator {
  color: var(--status-warning);
  font-weight: 700;
  font-size: 18px;
  line-height: 1;
  transform: translateY(-1px);
}
.row-desc {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-tertiary);
  margin: 0;
  max-width: 38ch;
}

.row-control-col {
  min-width: 0;
  padding-top: 2px;
}

/* ---- 控件公共样式（清晰可见，不模糊） ---- */
.control-input {
  width: 100%;
}
.control-input :deep(.el-input__wrapper) {
  background: var(--bg-surface);
  border-radius: 8px;
  box-shadow:
    0 0 0 1px var(--border-strong) inset,
    0 1px 2px var(--shadow-color);
  transition:
    box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    background 0.2s;
  padding: 2px 8px;
}
.control-input:hover :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1.5px var(--border-hover) inset;
}
.control-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px var(--accent) inset !important;
  background: var(--surface);
}
.control-input :deep(.el-input__inner) {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 28px;
}
.control-input :deep(.el-input__inner::placeholder) {
  color: var(--text-tertiary);
  opacity: 0.8;
}

/* ---- Select：统一外观、加深边框、聚焦清晰 ---- */
.control-select {
  width: 100%;
  max-width: 320px;
}
.control-select :deep(.el-select__wrapper) {
  background: var(--bg-surface);
  border-radius: 8px;
  box-shadow: 0 0 0 1px var(--border-strong) inset, 0 1px 2px var(--shadow-color);
  transition:
    box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    background 0.2s;
  min-height: 36px;
}
.control-select:hover :deep(.el-select__wrapper) {
  box-shadow: 0 0 0 1.5px var(--border-hover) inset;
}
.control-select :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 2px var(--accent) inset !important;
  background: var(--surface);
}
/* 下拉选中后文字强制黑色（不要被 disabled 态的灰色覆盖） */
.control-select :deep(.el-select__wrapper) {
  color: var(--text-primary) !important;
}
.control-select :deep(.el-select__selected-item) {
  font-size: 14px;
  color: var(--text-primary) !important;
}
.control-select :deep(.el-input__inner) {
  color: var(--text-primary) !important;
}
.control-select :deep(.el-select__placeholder) {
  font-size: 13px;
  color: var(--text-tertiary);
}
/* 自定义下拉弹层（popper） */
.settings-select-popper {
  border-radius: 8px !important;
  box-shadow:
    0 8px 24px var(--shadow-color),
    0 0 0 1px var(--border);
  border: none !important;
  padding: 4px !important;
}
.settings-select-popper .el-select-dropdown__item {
  border-radius: 6px;
  margin: 2px 0;
  font-size: 13px;
  color: var(--text-primary);
}
.settings-select-popper .el-select-dropdown__item.hover,
.settings-select-popper .el-select-dropdown__item:hover {
  background: var(--bg-muted);
}
.settings-select-popper .el-select-dropdown__item.is-selected {
  background: var(--accent);
  color: #fff;
  font-weight: 500;
}

/* ---- 自定义 Checkbox：清晰、对号严格居中、与项目风格一致 ---- */
.custom-checkbox :deep(.el-checkbox__inner) {
  position: relative;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 1.5px solid var(--border-hover);
  background: var(--bg-surface);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  /* 清空 Element Plus 内链 top/left 偏移，保证我们的 ::after 能以盒子中心为基准 */
  top: 0 !important;
  left: 0 !important;
}
.custom-checkbox:hover :deep(.el-checkbox__inner) {
  border-color: var(--accent);
}
.custom-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner) {
  background: var(--accent);
  border-color: var(--accent);
}
/* 对号居中：绝对定位到盒子中心 → translate(-50%,-50%) 中心锚点 → 再 rotate */
.custom-checkbox :deep(.el-checkbox__inner::after) {
  box-sizing: content-box;
  content: '';
  position: absolute;
  left: 50% !important;
  top: 50% !important;
  width: 4.5px;
  height: 9px;
  border: 2px solid transparent;
  border-left: 0;
  border-top: 0;
  border-radius: 1px;
  /* 先居中，再按 Element Plus 期望旋转，消除原版 left/top 造成的偏右下 */
  transform-origin: center;
  transform: translate(-50%, -70%) rotate(45deg);
  transition: transform 0.15s ease-in, border-color 0.15s ease-in;
}
.custom-checkbox :deep(.el-checkbox__input.is-checked .el-checkbox__inner::after) {
  border-color: #fff;
}
/* 半选态（横杠）也居中 */
.custom-checkbox :deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner) {
  background: var(--accent);
  border-color: var(--accent);
}
.custom-checkbox :deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner::before) {
  content: '';
  position: absolute;
  left: 50%;
  top: 50%;
  width: 10px;
  height: 2px;
  background: #fff;
  border-radius: 1px;
  transform: translate(-50%, -50%);
}
.custom-checkbox :deep(.el-checkbox__input.is-indeterminate .el-checkbox__inner::after) {
  display: none;
}
.custom-checkbox :deep(.el-checkbox__input.is-focus .el-checkbox__inner) {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-bg);
}
.toggle-label {
  font-size: 13px;
  color: var(--text-secondary);
  user-select: none;
  margin-left: 6px;
}

/* ---- 自定义 Input-Number：统一 8px 圆角 + 清晰按钮 ---- */
.custom-input-number :deep(.el-input-number) {
  --el-input-number-border-radius: 8px;
}
.custom-input-number :deep(.el-input__wrapper) {
  background: var(--bg-surface);
  border-radius: 8px;
  box-shadow: 0 0 0 1px var(--border-strong) inset, 0 1px 2px var(--shadow-color);
  transition:
    box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    background 0.2s;
}
.custom-input-number :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 2px var(--accent) inset !important;
  background: var(--surface);
}
.custom-input-number :deep(.el-input__inner) {
  font-size: 14px;
  color: var(--text-primary);
  text-align: center;
}
.custom-input-number :deep(.el-input-number__decrease),
.custom-input-number :deep(.el-input-number__increase) {
  background: var(--bg);
  color: var(--text-secondary);
  border: none;
  transition: color 0.2s, background 0.2s;
}
.custom-input-number :deep(.el-input-number__decrease:hover),
.custom-input-number :deep(.el-input-number__increase:hover) {
  color: var(--accent);
  background: var(--bg-muted);
}
.custom-input-number :deep(.el-input-number__decrease:hover:not(.is-disabled) ~ .el-input .el-input__wrapper) {
  box-shadow: 0 0 0 1.5px var(--accent) inset !important;
}
.control-number {
  display: flex;
  align-items: center;
  gap: 12px;
}
.number-unit {
  font-size: 13px;
  color: var(--text-secondary);
}

.control-apikey {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  max-width: 360px;
}

.control-apikey .control-input {
  flex: 1;
}

.apikey-masked {
  flex: 1;
  padding: 8px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-default);
  background: var(--bg-subtle);
  color: var(--text-tertiary);
  font-size: 13px;
  transition: border-color var(--transition), background var(--transition);
  user-select: none;
  cursor: default;
}

.apikey-masked:hover {
  border-color: var(--border-strong);
  background: var(--bg-muted);
}

.apikey-reset-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-surface);
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: color var(--transition), border-color var(--transition), background var(--transition);
}

.apikey-reset-btn:hover {
  color: var(--status-danger);
  border-color: var(--status-danger);
  background: var(--status-danger-bg);
}

/* 空状态 */
.general-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
}
.empty-icon {
  color: var(--border-hover);
  margin-bottom: 16px;
}
.empty-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  margin: 0 0 4px;
}
.empty-sub {
  font-size: 13px;
  color: var(--text-tertiary);
  margin: 0;
}

/* ---- 响应式 ---- */
@media (max-width: 860px) {
  .general-header {
    flex-direction: column;
    align-items: stretch;
  }
  .header-actions {
    justify-content: flex-start;
  }
  .setting-row-v2 {
    grid-template-columns: 1fr;
    column-gap: 0;
    padding: 14px 0;
  }
  .section-divider {
    margin: 20px 0;
  }
}

/* ==================== 模板工具栏 ==================== */
.template-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  white-space: nowrap;
}

.template-select {
  width: 280px;
}

.current-badge {
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 500;
  color: var(--status-success);
  background: var(--status-success-bg);
  border-radius: 4px;
}

/* ==================== 按钮 ==================== */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  font-size: 13px;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s, color 0.2s;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-ghost {
  background: var(--surface);
  color: var(--text-secondary);
  border-color: var(--border);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--bg);
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.btn-primary {
  background: var(--accent);
  color: #ffffff;
  border-color: var(--accent);
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-danger-ghost {
  background: var(--surface);
  color: var(--status-error);
  border-color: var(--border);
}

.btn-danger-ghost:hover:not(:disabled) {
  background: var(--status-error-bg);
  border-color: var(--status-error);
}

/* ==================== 卡片滚动区域 ==================== */
.cards-scroll-wrapper {
  max-height: calc(100vh - 340px);
  overflow-y: auto;
  padding: 4px;
}

.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
}

/* ==================== 评分项卡片 ==================== */
.rubric-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.rubric-card:hover {
  border-color: var(--border-hover);
  box-shadow: 0 2px 8px var(--shadow-color);
}

.card-edit-icon {
  flex-shrink: 0;
  color: var(--text-tertiary);
  opacity: 0;
  transition: opacity 0.2s, color 0.2s;
}

.rubric-card:hover .card-edit-icon {
  opacity: 1;
  color: var(--text-secondary);
}

.card-top {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.card-index {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg);
  border-radius: 4px;
  flex-shrink: 0;
}

.card-module-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-score {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent);
  white-space: nowrap;
  flex-shrink: 0;
}

.card-detail {
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
  max-height: 180px;
  overflow-y: auto;
  padding-right: 4px;
}

.card-detail :deep(strong) {
  color: var(--text-primary);
  font-weight: 600;
}

.detail-empty {
  color: var(--text-tertiary);
  font-style: italic;
}

/* ==================== 弹窗内评分项编辑器 ==================== */
.form-hint {
  margin-left: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.rubric-editor {
  width: 100%;
}

.rubric-edit-item {
  padding: 16px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 12px;
}

.rubric-edit-top {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.input-module {
  flex: 1;
}

.input-score {
  width: 100px;
  flex-shrink: 0;
}

.btn-remove-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  color: var(--status-error);
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.btn-remove-item:hover {
  background: var(--status-error-bg);
  border-color: var(--status-error);
}

.btn-add-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--surface);
  border: 1px dashed var(--border-hover);
  border-radius: 6px;
  cursor: pointer;
  transition: color 0.2s, border-color 0.2s;
}

.btn-add-item:hover {
  color: var(--text-primary);
  border-color: var(--accent);
}

/* ==================== 滚动条 ==================== */
.cards-scroll-wrapper::-webkit-scrollbar,
.card-detail::-webkit-scrollbar {
  width: 6px;
}

.cards-scroll-wrapper::-webkit-scrollbar-thumb,
.card-detail::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

.cards-scroll-wrapper::-webkit-scrollbar-thumb:hover,
.card-detail::-webkit-scrollbar-thumb:hover {
  background: var(--border-hover);
}
</style>