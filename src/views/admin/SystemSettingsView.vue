<script setup lang="ts">
/**
 * 系统参数配置 —— UI 骨架页
 *
 * 已确认可复用：GET/PUT /api/settings/getCommonSettings | updateCommonSettings(configKey, configValue) | defaultSettings
 *   （这是教师端「常规设置」已在用的真实接口，见 @/stores/settings 与 @/api/settings；
 *     注意其口径为「按登录用户 + 整数 configKey + 字符串 configValue」的键值对，
 *     并非全局系统参数；运维端若要复用需学生自行接入并做键值映射。）
 * 接口预留：评分权重可用 POST /api/knowledge/weight/batch（数组体，详见「权重配置」页）。
 *
 * 本页不接 api / pinia，表单为本地初值，仅保留输入与校验交互。
 */
import { computed, ref } from 'vue';
import { Save, ServerCog } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';

/** 系统参数表单（字段名与后端最终约定对齐后再行调整） */
interface SettingsForm {
  systemName: string;
  textbookVersion: string;
  /** 编程题四维评分权重（合计需为 100） */
  weightFunction: number;
  weightSyntax: number;
  weightLogic: number;
  weightStyle: number;
  dailyPracticeLimit: number;
  wrongRedoPassCount: number;
  allowLateSubmit: boolean;
  aiGradingEnabled: boolean;
  backupPeriodDays: number;
}

const form = ref<SettingsForm>({
  systemName: 'Java 程序设计教学平台',
  textbookVersion: '《Java程序设计基础》刘平山主编 · 西电出版社',
  weightFunction: 40,
  weightSyntax: 25,
  weightLogic: 20,
  weightStyle: 15,
  dailyPracticeLimit: 100,
  wrongRedoPassCount: 2,
  allowLateSubmit: true,
  aiGradingEnabled: true,
  backupPeriodDays: 1,
});

const weightTotal = computed(
  () => form.value.weightFunction + form.value.weightSyntax + form.value.weightLogic + form.value.weightStyle,
);

const canSave = computed(() => weightTotal.value === 100);

function handleSave() {
  if (!canSave.value) {
    ElMessage.warning('四维评分权重合计必须等于 100%');
    return;
  }
  // 接口预留：全局系统参数无独立后端接口；如按用户键值复用，见文件头 GET/PUT /api/settings/* 说明
  ElMessage.info('接口预留：后端未提供全局系统参数接口，可评估复用 /api/settings 用户级键值配置');
}

function handleReset() {
  // 已确认可复用：defaultSettings 语义为「恢复默认」，此处仅重置本地初值
  form.value = {
    systemName: 'Java 程序设计教学平台',
    textbookVersion: '《Java程序设计基础》刘平山主编 · 西电出版社',
    weightFunction: 40,
    weightSyntax: 25,
    weightLogic: 20,
    weightStyle: 15,
    dailyPracticeLimit: 100,
    wrongRedoPassCount: 2,
    allowLateSubmit: true,
    aiGradingEnabled: true,
    backupPeriodDays: 1,
  };
  ElMessage.info('已重置为界面默认值（未提交后端）');
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">系统参数配置</h1>
      <p class="st-page-subtitle">系统名称、评分标准、刷题规则、作业权限等全局参数 · 修改后实时生效</p>
    </header>

    <div class="settings-notice">
      <ServerCog :size="14" />
      <span>
        本页为参数骨架。已确认可复用：GET/PUT /api/settings/getCommonSettings | updateCommonSettings(configKey, configValue) | defaultSettings
        （教师端常规设置在用的真实接口，按登录用户存储，运维端复用需自行接入）；
        接口预留：评分权重可用 POST /api/knowledge/weight/batch。
      </span>
    </div>

    <!-- 基本设置 -->
    <section class="st-card">
      <div class="st-card__header">
        <ServerCog :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">基本设置</h2>
          <p class="st-card__hint">已确认可复用：/api/settings/getCommonSettings 键值配置（configKey 整数 / configValue 字符串）</p>
        </div>
      </div>
      <div class="st-card__body">
        <div class="form-item">
          <label class="form-label">系统名称</label>
          <input v-model="form.systemName" class="form-input" placeholder="如：Java 程序设计教学平台" />
        </div>
        <div class="form-item">
          <label class="form-label">教材版本（知识库绑定）</label>
          <input v-model="form.textbookVersion" class="form-input" placeholder="如：《Java程序设计基础》刘平山主编" />
          <p class="form-hint">所有智能体答疑、出题、批改以该版本教材为唯一依据</p>
        </div>
      </div>
    </section>

    <!-- 评分标准 -->
    <section class="st-card" style="margin-top: 20px;">
      <div class="st-card__header">
        <div>
          <h2 class="st-card__title">编程题评分标准（四维权重）</h2>
          <p class="st-card__hint">接口预留：评分权重可用 POST /api/knowledge/weight/batch</p>
        </div>
      </div>
      <div class="st-card__body">
        <div class="weight-grid">
          <div class="weight-item">
            <label class="form-label">功能完整性</label>
            <el-slider v-model="form.weightFunction" :max="100" show-input />
          </div>
          <div class="weight-item">
            <label class="form-label">语法正确性</label>
            <el-slider v-model="form.weightSyntax" :max="100" show-input />
          </div>
          <div class="weight-item">
            <label class="form-label">逻辑合理性</label>
            <el-slider v-model="form.weightLogic" :max="100" show-input />
          </div>
          <div class="weight-item">
            <label class="form-label">代码规范性</label>
            <el-slider v-model="form.weightStyle" :max="100" show-input />
          </div>
        </div>
        <div class="weight-total">
          <span>权重合计：</span>
          <b :class="{ 'weight-total--bad': !canSave }">{{ weightTotal }}%</b>
          <span v-if="!canSave" class="weight-total__hint">（必须等于 100% 才能保存）</span>
        </div>
      </div>
    </section>

    <div class="settings-grid">
      <!-- 刷题规则 -->
      <section class="st-card">
        <div class="st-card__header">
          <div>
            <h2 class="st-card__title">刷题规则</h2>
            <p class="st-card__hint">接口预留：后端未提供全局刷题规则参数接口</p>
          </div>
        </div>
        <div class="st-card__body">
          <div class="form-item">
            <label class="form-label">每日刷题上限（题）</label>
            <el-input-number v-model="form.dailyPracticeLimit" :min="20" :max="500" :step="10" style="width: 100%;" />
            <p class="form-hint">超出上限后当日不再计入练习统计，防止无效刷题</p>
          </div>
          <div class="form-item">
            <label class="form-label">错题重做通过次数</label>
            <el-input-number v-model="form.wrongRedoPassCount" :min="1" :max="5" style="width: 100%;" />
            <p class="form-hint">连续答对指定次数后，错题标记为已巩固</p>
          </div>
        </div>
      </section>

      <!-- 作业权限与备份 -->
      <section class="st-card">
        <div class="st-card__header">
          <div>
            <h2 class="st-card__title">作业权限与备份</h2>
            <p class="st-card__hint">接口预留：备份周期与「数据备份」页同源，后端未提供接口</p>
          </div>
        </div>
        <div class="st-card__body">
          <div class="switch-item">
            <div>
              <div class="switch-label">允许截止后补交</div>
              <div class="switch-desc">截止后 48 小时内可补交，成绩标记「迟交」</div>
            </div>
            <el-switch v-model="form.allowLateSubmit" />
          </div>
          <div class="switch-item">
            <div>
              <div class="switch-label">AI 自动批改</div>
              <div class="switch-desc">关闭后作业全部由教师手动批阅</div>
            </div>
            <el-switch v-model="form.aiGradingEnabled" />
          </div>
          <div class="form-item" style="margin-top: 14px;">
            <label class="form-label">定时备份周期（天）</label>
            <el-input-number v-model="form.backupPeriodDays" :min="1" :max="7" style="width: 100%;" />
          </div>
        </div>
      </section>
    </div>

    <div class="save-bar">
      <button class="st-btn st-btn--ghost" @click="handleReset">重置默认</button>
      <button class="st-btn st-btn--primary" :disabled="!canSave" @click="handleSave">
        <Save :size="14" /> 保存全部参数
      </button>
    </div>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.settings-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.65;
  padding: 10px 14px;
  background: var(--status-info-bg);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  margin-bottom: 20px;
}

.settings-notice svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--status-info);
}

.form-item {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.form-hint {
  font-size: 11.5px;
  color: var(--text-tertiary);
  margin-top: 4px;
  line-height: 1.5;
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

/* 权重 */
.weight-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 32px;
}

@media (max-width: 768px) {
  .weight-grid {
    grid-template-columns: 1fr;
  }
}

.weight-total {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--border-default);
}

.weight-total b {
  font-size: 15px;
  color: var(--status-success);
}

.weight-total--bad {
  color: var(--status-danger);
}

.weight-total__hint {
  font-size: 12px;
  color: var(--status-danger);
}

.settings-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 20px;
  align-items: start;
}

@media (max-width: 960px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
}

/* 开关行 */
.switch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-subtle);
}

.switch-item:last-of-type {
  border-bottom: none;
}

.switch-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.switch-desc {
  font-size: 11.5px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.save-bar {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}
</style>
