<script setup lang="ts">
/**
 * 个性化教学干预 —— 已接桩页（数据来自 exam 错题本 + study 章节进度）
 *
 * 后端未提供 /api/teach/intervention/*，本页按现有接口能覆盖的范围实现：
 * - 已对接：@/api/exam.fetchWrongQuestions      GET  /api/exam/wrong-question/list
 * - 已接桩：@/api/study.fetchProgress           GET  /api/study/progress/get?courseId=
 * - 已对接：@/api/teacher.fetchTeacherClasses    GET  /api/class/records
 *
 * 明确的后端缺口（不用假数据填）：
 * 1) 错题与进度接口都只返回「当前登录用户」的数据，教师取不到全班学生个体记录，
 *    因此下表呈现的是「错题热点排行」而非「薄弱学生名单」；名单需后端补 per-student 接口。
 * 2) 无站内通知/推送接口（答疑服务只有流式问答与历史两个接口，不能用来下发），
 *    所以推送按钮保持禁用，推送记录表恒为空态。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import type { Component } from 'vue';
import {
  BookOpen,
  Code2,
  Filter,
  ListChecks,
  RefreshCw,
  Send,
  Target,
  UserRoundSearch,
} from 'lucide-vue-next';
import { fetchWrongQuestions } from '@/api/exam';
import { fetchProgress } from '@/api/study';
import { fetchTeacherClasses } from '@/api/teacher';
import type { TeacherClass } from '@/api/teacher';
import { DEFAULT_COURSE_ID } from '@/api/knowledge';
import type { WrongQuestionItem } from '@/types/exam';
import type { StudyProgress } from '@/types/study';

/** 干预内容类型（与推送弹窗、名单表操作列共用） */
const PUSH_TYPES: { key: string; label: string; icon: Component; placeholder: string }[] = [
  { key: 'practice', label: '专项练习', icon: ListChecks, placeholder: '如：第 7 章「继承与多态」专项基础题 10 道' },
  { key: 'knowledge', label: '知识点讲解', icon: BookOpen, placeholder: '如：第 7 章方法重写四要点讲解 + 教材原文' },
  { key: 'case', label: '实操案例', icon: Code2, placeholder: '如：AnimalPoly.java 案例改写任务' },
];

/** 筛选条件：只保留接口真正支持的维度 */
const filters = reactive({
  classId: '',
  /** 错误次数达到该值才计入薄弱热点 */
  minWrong: 2,
  /** 只看未掌握的题 */
  onlyUnmastered: true,
});

const loading = ref(false);
const wrongList = ref<WrongQuestionItem[]>([]);
const progressList = ref<StudyProgress[]>([]);
const classes = ref<TeacherClass[]>([]);
/** 各自的错误信息：桩未实现时这里是「未实现：GET /api/...」，界面据此提示待接入 */
const wrongError = ref('');
const progressError = ref('');

/** 题型码值 → 标签（与后端 QuestionTypeEnum 一致） */
const TYPE_LABELS: Record<number, string> = {
  1: '选择题',
  2: '填空题',
  3: '判断题',
  4: '程序阅读题',
  5: '编程题',
  6: '简答题',
};

function typeLabel(type: number): string {
  return type == null ? '—' : TYPE_LABELS[Number(type)] ?? `题型 ${type}`;
}

function fmtTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 依据错题数据能确定推出的干预建议（不臆造正确率等缺失指标） */
function suggestionOf(w: WrongQuestionItem): string {
  if (w.mastered === 1) return '已标记掌握，建议做一次同类题复核';
  if ((w.wrongCount ?? 0) >= 5) return '反复出错，建议回看本章教材原文并重做基础题';
  if ((w.wrongCount ?? 0) >= 3) return '建议推送本章知识点讲解 + 专项练习';
  return '建议重做该题并对照解析订正';
}

/** 薄弱热点：按错误次数降序 */
const weakRows = computed(() =>
  wrongList.value
    .filter((w) => (filters.onlyUnmastered ? w.mastered !== 1 : true))
    .filter((w) => (w.wrongCount ?? 0) >= filters.minWrong)
    .slice()
    .sort((a, b) => (b.wrongCount ?? 0) - (a.wrongCount ?? 0))
    .map((w) => ({
      key: w.id,
      questionId: w.questionId,
      stem: w.content && w.content.trim() ? w.content.trim().slice(0, 60) : `题目 #${w.questionId}`,
      typeLabel: typeLabel(w.type),
      wrongCount: w.wrongCount ?? 0,
      lastAnswer: w.lastAnswer && w.lastAnswer.trim() ? w.lastAnswer.trim().slice(0, 40) : '—',
      mastered: w.mastered === 1,
      lastWrongTime: fmtTime(w.lastWrongTime),
      suggestion: suggestionOf(w),
    })),
);

/** 章节完成度概览（来自 study 进度接口） */
const progressSummary = computed(() => {
  const list = progressList.value;
  if (!list.length) return null;
  const done = list.filter((p) => p.isCompleted === 1).length;
  const avg = Math.round(list.reduce((s, p) => s + (p.progressRate ?? 0), 0) / list.length);
  return { chapters: list.length, done, avg };
});

/** 分别拉取，一个接口失败不影响另一个展示 */
async function load() {
  loading.value = true;
  wrongError.value = '';
  progressError.value = '';
  const [w, p] = await Promise.allSettled([
    fetchWrongQuestions(),
    fetchProgress(DEFAULT_COURSE_ID),
  ]);
  if (w.status === 'fulfilled') wrongList.value = w.value ?? [];
  else {
    wrongList.value = [];
    wrongError.value = (w.reason as Error).message || '错题接口调用失败';
  }
  if (p.status === 'fulfilled') progressList.value = p.value ?? [];
  else {
    progressList.value = [];
    progressError.value = (p.reason as Error).message || '进度接口调用失败';
  }
  loading.value = false;
}

/** 推送弹窗（骨架，可正常打开与填写，但不提交） */
const dialogVisible = ref(false);
const pushType = ref('practice');
const pushContent = ref('');
const pushTarget = ref('');

function openPush(studentName = '') {
  pushTarget.value = studentName;
  dialogVisible.value = true;
}

onMounted(async () => {
  try {
    classes.value = await fetchTeacherClasses();
  } catch {
    // 班级列表是已对接接口，失败提示由响应拦截器统一处理
  }
  load();
});
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
            已对接 @/api/exam.fetchWrongQuestions（GET /api/exam/wrong-question/list）+
            @/api/study.fetchProgress（GET /api/study/progress/get）；两接口只返回当前登录用户数据，
            故本页为错题热点排行而非全班名单
          </p>
        </div>
        <span class="st-badge st-badge--neutral shell-badge">部分待接入</span>
      </div>
      <div class="st-card__body filter-row">
        <div class="filter-item">
          <label class="filter-label">班级</label>
          <el-select
            v-model="filters.classId"
            placeholder="选择班级"
            style="width: 200px;"
            disabled
            title="后端错题/进度接口不接受 classId，班级维度名单待补接口"
          >
            <el-option v-for="c in classes" :key="c.id" :label="c.className" :value="String(c.id)" />
          </el-select>
        </div>
        <div class="filter-item">
          <label class="filter-label">错误次数 ≥</label>
          <el-input-number v-model="filters.minWrong" :min="1" :max="20" style="width: 130px;" />
        </div>
        <div class="filter-item">
          <label class="filter-label">只看未掌握</label>
          <el-switch v-model="filters.onlyUnmastered" />
        </div>
        <button class="st-btn st-btn--primary" :disabled="loading" @click="load">
          <RefreshCw v-if="loading" :size="14" class="spin" />
          <UserRoundSearch v-else :size="14" />
          {{ loading ? '加载中' : '重新加载' }}
        </button>
      </div>
    </div>

    <div class="iv-grid">
      <!-- 薄弱学生名单 -->
      <section class="st-card">
        <div class="st-card__header">
          <UserRoundSearch :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">薄弱热点（按错题聚合）</h2>
            <p class="st-card__hint">
              共 {{ weakRows.length }} 条 · 按错误次数降序 ·
              {{ wrongError ? '错题接口调用失败' : '数据源 /api/exam/wrong-question/list' }}
            </p>
          </div>
        </div>
        <div class="st-card__body">
          <div class="table-wrapper">
            <table class="data-table">
              <thead>
                <tr>
                  <th>题目</th>
                  <th>题型</th>
                  <th>错误次数</th>
                  <th>最近误答</th>
                  <th>最近出错时间</th>
                  <th>干预建议</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in weakRows" :key="row.key">
                  <td class="cell-name" :title="`题目 #${row.questionId}`">{{ row.stem }}</td>
                  <td class="cell-secondary">{{ row.typeLabel }}</td>
                  <td>
                    <div class="rate-cell">
                      <div class="st-progress" style="flex: 1;">
                        <div
                          class="st-progress__bar"
                          :style="{ width: Math.min(100, row.wrongCount * 20) + '%' }"
                        ></div>
                      </div>
                      <span class="rate-value">{{ row.wrongCount }}</span>
                    </div>
                  </td>
                  <td class="cell-secondary">{{ row.lastAnswer }}</td>
                  <td class="cell-secondary">{{ row.lastWrongTime }}</td>
                  <td class="cell-secondary">{{ row.suggestion }}</td>
                  <td>
                    <div class="row-actions">
                      <button
                        v-for="t in PUSH_TYPES"
                        :key="t.key"
                        class="st-text-btn"
                        disabled
                        :title="`后端未提供推送接口，${t.label} 无法下发`"
                      >
                        推{{ t.label.slice(0, 2) }}
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="weakRows.length === 0">
                  <td colspan="7">
                    <div class="st-empty" style="padding: 32px 16px;">
                      <UserRoundSearch :size="28" :stroke-width="1.2" class="st-empty__icon" />
                      <div class="st-empty__text">
                        {{ wrongError || '暂无符合条件的错题记录（也可能是筛选项过严）' }}
                      </div>
                      <div v-if="wrongError" class="st-empty__hint">
                        接口：@/api/exam.fetchWrongQuestions
                      </div>
                      <button class="st-btn st-btn--secondary" :disabled="loading" @click="load">
                        <RefreshCw v-if="loading" :size="13" class="spin" />
                        <RefreshCw v-else :size="13" />
                        重新加载
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="list-foot">
            <button class="st-btn st-btn--secondary" @click="openPush()">
              <Send :size="13" /> 推送干预内容
            </button>
            <span class="foot-hint">后端未提供站内通知接口，弹窗可填写但不会提交</span>
          </div>
        </div>
      </section>

      <!-- 章节完成度概览（来自 study 进度接口） -->
      <section class="st-card">
        <div class="st-card__header">
          <Target :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">章节完成度</h2>
            <p class="st-card__hint">
              {{ progressError ? '进度接口待实现' : '已接桩：@/api/study.fetchProgress · GET /api/study/progress/get' }}
            </p>
          </div>
        </div>
        <div class="st-card__body">
          <div v-if="progressSummary" class="overview-grid">
            <div class="overview-cell">
              <div class="st-stat-value">{{ progressSummary.done }} / {{ progressSummary.chapters }}</div>
              <div class="st-stat-label">已完成章节</div>
            </div>
            <div class="overview-cell">
              <div class="st-stat-value">{{ progressSummary.avg }}%</div>
              <div class="st-stat-label">平均进度</div>
            </div>
          </div>
          <div v-else class="st-empty" style="padding: 24px 16px;">
            <Target :size="26" :stroke-width="1.2" class="st-empty__icon" />
            <div class="st-empty__text">{{ progressError || '暂无进度数据' }}</div>
            <div v-if="progressError" class="st-empty__hint">
              该接口只返回当前登录学生自己的进度，全班维度需后端补接口
            </div>
          </div>
        </div>
      </section>

      <!-- 推送记录 -->
      <section class="st-card">
        <div class="st-card__header">
          <Send :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">干预推送记录</h2>
            <p class="st-card__hint">共 0 条 · 后端未提供推送与推送记录接口，本表保持空态</p>
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

/* 列表底部操作条 */
.list-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}

.foot-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 概览指标 */
.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.overview-cell {
  padding: 12px 14px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  background: var(--bg-subtle);
}

.st-empty__hint {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-tertiary);
  max-width: 420px;
}

.spin {
  animation: iv-spin 0.9s linear infinite;
}

@keyframes iv-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
