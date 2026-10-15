<script setup lang="ts">
/**
 * 个性化教学干预 —— UI 骨架页（后端无对应模块，本文件不接 @/api、不接 pinia）
 *
 * 接口预留：后端未提供 /api/teach/intervention/* ；
 * 可组合 GET /api/study/progress/get + /api/exam/wrong-question/list 实现薄弱学生筛选，
 * 推送通道可复用 POST /api/qa/ask 或新增教师→学生站内通知接口。
 *
 * 后续接入方式：把下方 SHELL_ROWS 换成名单接口的返回值，并给"推送干预内容"按钮补上提交逻辑。
 */
import { reactive, ref } from 'vue';
import type { Component } from 'vue';
import {
  BookOpen,
  Code2,
  Filter,
  ListChecks,
  Send,
  Target,
  UserRoundSearch,
} from 'lucide-vue-next';

/** 干预内容类型（与推送弹窗、名单表操作列共用） */
const PUSH_TYPES: { key: string; label: string; icon: Component; placeholder: string }[] = [
  { key: 'practice', label: '专项练习', icon: ListChecks, placeholder: '如：第 7 章「继承与多态」专项基础题 10 道' },
  { key: 'knowledge', label: '知识点讲解', icon: BookOpen, placeholder: '如：第 7 章方法重写四要点讲解 + 教材原文' },
  { key: 'case', label: '实操案例', icon: Code2, placeholder: '如：AnimalPoly.java 案例改写任务' },
];

/** 筛选条件（仅本地 UI 状态，不参与请求） */
const filters = reactive({
  classId: '',
  timeRange: 'week',
  /** 掌握率低于该阈值判定为薄弱 */
  threshold: 70,
});

const TIME_OPTIONS = [
  { value: 'week', label: '最近一周' },
  { value: 'month', label: '最近一月' },
  { value: 'all', label: '全部时间' },
];

/** 骨架占位行：仅用于呈现名单表结构，接口就绪后由后端数据替换 */
const SHELL_ROWS = [1, 2, 3, 4].map((i) => ({
  key: i,
  name: '—',
  studentNo: '—',
  className: '—',
  accuracy: '—',
  weakPoint: '—',
  suggestion: '待接口返回干预建议',
}));

/** 推送弹窗（骨架，可正常打开与填写，但不提交） */
const dialogVisible = ref(false);
const pushType = ref('practice');
const pushContent = ref('');
const pushTarget = ref('');

function openPush(studentName = '') {
  pushTarget.value = studentName;
  dialogVisible.value = true;
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">个性化教学干预</h1>
      <p class="st-page-subtitle">筛选薄弱学生名单 · 推送专项练习、知识点讲解与实操案例，实现分层教学</p>
    </header>

    <!-- 筛选 -->
    <div class="st-card">
      <div class="st-card__header">
        <Filter :size="16" class="card-icon" />
        <div>
          <h2 class="st-card__title">筛选条件</h2>
          <p class="st-card__hint">
            接口预留：后端未提供 /api/teach/intervention/* ；可组合 GET /api/study/progress/get +
            /api/exam/wrong-question/list 实现
          </p>
        </div>
        <span class="st-badge st-badge--neutral shell-badge">UI 骨架</span>
      </div>
      <div class="st-card__body filter-row">
        <div class="filter-item">
          <label class="filter-label">班级</label>
          <el-select v-model="filters.classId" placeholder="选择班级" style="width: 200px;">
            <el-option label="后端未提供班级学情明细接口" value="_unavailable" disabled />
          </el-select>
        </div>
        <div class="filter-item">
          <label class="filter-label">时间范围</label>
          <el-select v-model="filters.timeRange" style="width: 140px;">
            <el-option v-for="t in TIME_OPTIONS" :key="t.value" :label="t.label" :value="t.value" />
          </el-select>
        </div>
        <div class="filter-item">
          <label class="filter-label">掌握率阈值（%）</label>
          <el-input-number v-model="filters.threshold" :min="0" :max="100" style="width: 130px;" />
        </div>
        <!-- 接口预留：名单查询接口未提供，按钮保持禁用 -->
        <button class="st-btn st-btn--primary" disabled title="接口预留：后端未提供薄弱学生名单查询接口">
          <UserRoundSearch :size="14" /> 筛选名单
        </button>
      </div>
    </div>

    <div class="iv-grid">
      <!-- 薄弱学生名单 -->
      <section class="st-card">
        <div class="st-card__header">
          <UserRoundSearch :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">薄弱学生名单</h2>
            <p class="st-card__hint">按正确率升序排列 · 当前为骨架占位行</p>
          </div>
        </div>
        <div class="st-card__body">
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>学生</th>
                  <th>学号</th>
                  <th>正确率</th>
                  <th>薄弱知识点</th>
                  <th>干预建议</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in SHELL_ROWS" :key="row.key" class="shell-row" aria-hidden="true">
                  <td class="cell-name">{{ row.name }}</td>
                  <td class="cell-secondary">{{ row.studentNo }}</td>
                  <td>
                    <div class="rate-cell">
                      <div class="st-progress" style="flex: 1;">
                        <div class="st-progress__bar" style="width: 0%;"></div>
                      </div>
                      <span class="rate-value">{{ row.accuracy }}</span>
                    </div>
                  </td>
                  <td class="cell-secondary">{{ row.weakPoint }}</td>
                  <td class="cell-secondary">{{ row.suggestion }}</td>
                  <td>
                    <div class="row-actions">
                      <button
                        v-for="t in PUSH_TYPES"
                        :key="t.key"
                        class="st-text-btn"
                        disabled
                        :title="`接口预留：推送需 ${t.label} 通道`"
                      >
                        推{{ t.label.slice(0, 2) }}
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="st-empty" style="padding: 24px 16px;">
            <div class="st-empty__text">
              名单为空：等待后端提供薄弱学生查询接口后填充上表
            </div>
            <button class="st-btn st-btn--secondary" @click="openPush()">
              <Send :size="13" /> 推送干预内容
            </button>
          </div>
        </div>
      </section>

      <!-- 推送记录 -->
      <section class="st-card">
        <div class="st-card__header">
          <Send :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">干预推送记录</h2>
            <p class="st-card__hint">共 0 条 · 接口预留：后端未提供推送记录查询接口</p>
          </div>
        </div>
        <div class="st-card__body">
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>学生</th>
                  <th>干预类型</th>
                  <th>推送内容</th>
                  <th>推送时间</th>
                  <th>完成状态</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colspan="5">
                    <div class="st-empty" style="padding: 48px 16px;">
                      <Send :size="32" :stroke-width="1.2" class="st-empty__icon" />
                      <div class="st-empty__text">暂无推送记录</div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>

    <!-- 推送弹窗（骨架） -->
    <Teleport to="body">
      <div v-if="dialogVisible" class="push-mask" @click.self="dialogVisible = false">
        <div class="st-card push-panel">
          <div class="st-card__header">
            <h2 class="st-card__title">推送干预内容</h2>
            <span class="st-badge st-badge--neutral shell-badge">UI 骨架</span>
          </div>
          <div class="st-card__body">
            <div class="push-target">
              推送给：<b>{{ pushTarget || '全部筛选结果（待接口）' }}</b>
              <span class="st-badge st-badge--neutral" style="margin-left: 6px;">班级待选</span>
            </div>
            <div class="push-types">
              <button
                v-for="t in PUSH_TYPES"
                :key="t.key"
                class="push-type"
                :class="{ 'push-type--active': pushType === t.key }"
                @click="pushType = t.key"
              >
                {{ t.label }}
              </button>
            </div>
            <textarea
              v-model="pushContent"
              class="push-textarea"
              rows="4"
              :placeholder="PUSH_TYPES.find((t) => t.key === pushType)?.placeholder"
            ></textarea>
            <div class="push-note">
              <Target :size="12" />
              <span>接口预留：确认推送需要后端推送接口，当前按钮保持禁用，填写内容不会提交。</span>
            </div>
            <div class="push-actions">
              <button class="st-btn st-btn--ghost" @click="dialogVisible = false">取消</button>
              <button class="st-btn st-btn--primary" disabled title="接口预留：后端未提供干预推送接口">
                <Send :size="13" /> 确认推送
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

.filter-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
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

.iv-grid {
  display: grid;
  grid-template-columns: 1.35fr 1fr;
  gap: 20px;
  margin-top: 20px;
  align-items: start;
}

@media (max-width: 960px) {
  .iv-grid {
    grid-template-columns: 1fr;
  }
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

.cell-name {
  font-weight: 500;
  color: var(--text-primary);
}

.cell-secondary {
  color: var(--text-secondary);
}

.rate-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 140px;
}

.rate-value {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-tertiary);
  width: 34px;
  text-align: right;
}

.row-actions {
  display: flex;
  gap: 2px;
}

/* 弹窗 */
.push-mask {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 24px;
}

.push-panel {
  width: 460px;
  max-width: 100%;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
}

.push-target {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 14px;
}

.push-target b {
  color: var(--text-primary);
}

.push-types {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.push-type {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: 999px;
  font-size: 12.5px;
  font-family: inherit;
  color: var(--text-secondary);
  padding: 5px 14px;
  cursor: pointer;
  transition: all var(--transition);
}

.push-type:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
}

.push-type--active {
  background: var(--text-primary);
  border-color: var(--text-primary);
  color: var(--bg-surface);
  font-weight: 600;
}

.push-textarea {
  width: 100%;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  background: var(--bg-surface);
  color: var(--text-primary);
}

.push-textarea:focus {
  border-color: var(--border-strong);
}

.push-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 10px;
  background: var(--bg-subtle);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-tertiary);
  line-height: 1.6;
}

.push-note svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.push-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
</style>
