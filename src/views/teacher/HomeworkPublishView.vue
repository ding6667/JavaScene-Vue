<script setup lang="ts">
/**
 * 作业发布（接真实接口）
 * - POST /api/teach/homework/publish 请求体仅 { title, content, chapterId, deadline }
 * - GET  /api/teach/homework/list   返回   { id, title, content, chapterId, deadline, status, createTime }
 * 后端未提供"布置班级"和"题量组卷"字段，对应控件保留 UI 但不参与提交。
 */
import { computed, onMounted, ref } from 'vue';
import { CalendarClock, FileEdit, Loader2, Send } from 'lucide-vue-next';
import { ElMessage } from 'element-plus';
import { fetchChapters } from '@/api/student';
import { fetchPublishedHomeworks, fetchTeacherClasses, publishHomework } from '@/api/teacher';
import type { Chapter } from '@/types/student';
import type { PublishedHomework } from '@/types/teacher';

const chapters = ref<Chapter[]>([]);
/** 班级列表接口真实可用（GET /api/class/records），但作业发布接口不含班级字段，仅用于展示 */
const classes = ref<{ id: number; className: string }[]>([]);
const published = ref<PublishedHomework[]>([]);
const loading = ref(true);
const publishing = ref(false);

// 表单
const title = ref('');
const formChapterId = ref<number | null>(null);
const deadline = ref('');
const content = ref('');

// 后端未提供该字段的 UI 占位（不参与提交）
const selectedClasses = ref<number[]>([]);
const questionCount = ref(8);

const chapterTitle = (id: number) => chapters.value.find((c) => c.id === id)?.title ?? `章节 ${id}`;

function fmt(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 后端 status 为数字且未公开枚举含义，列表只按 deadline 判断是否已截止 */
const isExpired = (hw: PublishedHomework) => {
  const t = new Date(hw.deadline).getTime();
  return Number.isNaN(t) ? false : t < Date.now();
};

async function load() {
  loading.value = true;
  try {
    [chapters.value, classes.value, published.value] = await Promise.all([
      fetchChapters(),
      fetchTeacherClasses(),
      fetchPublishedHomeworks(),
    ]);
  } catch {
    // 错误由响应拦截器统一提示
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const canPublish = computed(
  () => !!title.value.trim() && !!formChapterId.value && !!deadline.value && !!content.value.trim(),
);

async function handlePublish() {
  if (!canPublish.value || publishing.value) return;
  publishing.value = true;
  try {
    const id = await publishHomework({
      title: title.value.trim(),
      content: content.value.trim(),
      chapterId: formChapterId.value!,
      // el-date-picker 已按 value-format 输出 'YYYY-MM-DD HH:mm:ss' 字符串
      deadline: deadline.value,
    });
    ElMessage.success(`作业发布成功${id ? `（ID ${id}）` : ''}，学生端可见`);
    published.value = await fetchPublishedHomeworks();
    // 重置表单
    title.value = '';
    formChapterId.value = null;
    deadline.value = '';
    content.value = '';
    selectedClasses.value = [];
  } catch {
    // 错误由响应拦截器统一提示
  } finally {
    publishing.value = false;
  }
}
</script>

<template>
  <div class="st-view">
    <header class="st-page-header">
      <h1 class="st-page-title">作业发布</h1>
      <p class="st-page-subtitle">基于教材章节布置作业 · 填写标题、作答要求与截止时间后发布到学生端</p>
    </header>

    <div class="publish-grid">
      <!-- 发布表单 -->
      <section class="st-card">
        <div class="st-card__header">
          <FileEdit :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">发布新作业</h2>
            <p class="st-card__hint">POST /api/teach/homework/publish · 提交标题、正文要求、章节与截止时间</p>
          </div>
        </div>
        <div class="st-card__body">
          <div class="form-item">
            <label class="form-label">作业标题</label>
            <input v-model="title" class="form-input" placeholder="如：面向对象基础 · 课后作业" />
          </div>
          <div class="form-item">
            <label class="form-label">教材章节</label>
            <el-select v-model="formChapterId" placeholder="选择章节" filterable style="width: 100%;">
              <el-option v-for="c in chapters" :key="c.id" :label="c.title" :value="c.id" />
            </el-select>
          </div>
          <div class="form-item">
            <label class="form-label">截止时间</label>
            <el-date-picker
              v-model="deadline"
              type="datetime"
              placeholder="选择截止时间"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DD HH:mm:ss"
              style="width: 100%;"
            />
          </div>
          <div class="form-item">
            <label class="form-label">作答要求（对应接口 content）</label>
            <textarea
              v-model="content"
              class="form-textarea"
              rows="5"
              placeholder="如：完成全部题目；编程题须在代码实操环境运行通过后提交。"
            ></textarea>
          </div>

          <!-- 后端未提供对应字段，仅保留 UI -->
          <div class="form-row">
            <div class="form-item" style="flex: 1;">
              <label class="form-label">
                布置班级
                <span class="st-badge st-badge--neutral field-note">后端未提供该字段</span>
              </label>
              <el-select
                v-model="selectedClasses"
                multiple
                placeholder="选择班级（可多选）"
                style="width: 100%;"
                disabled
              >
                <el-option v-for="c in classes" :key="c.id" :label="c.className" :value="c.id" />
              </el-select>
            </div>
            <div class="form-item" style="width: 140px;">
              <label class="form-label">
                题量
                <span class="st-badge st-badge--neutral field-note">后端未提供该字段</span>
              </label>
              <el-input-number v-model="questionCount" :min="3" :max="20" :disabled="true" style="width: 100%;" />
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
            <button class="st-btn st-btn--primary" :disabled="!canPublish || publishing" @click="handlePublish">
              <Loader2 v-if="publishing" :size="14" class="spin" />
              <Send v-else :size="14" />
              {{ publishing ? '发布中…' : '发布作业' }}
            </button>
          </div>
        </div>
      </section>

      <!-- 已发布列表 -->
      <section class="st-card">
        <div class="st-card__header">
          <CalendarClock :size="16" class="card-icon" />
          <div>
            <h2 class="st-card__title">已发布作业</h2>
            <p class="st-card__hint">共 {{ published.length }} 份 · GET /api/teach/homework/list</p>
          </div>
        </div>
        <div class="st-card__body hw-list">
          <div v-if="loading" class="st-empty" style="padding: 60px;">
            <Loader2 :size="22" class="spin" />
            <div class="st-empty__text">正在加载作业列表…</div>
          </div>
          <div v-else-if="published.length === 0" class="st-empty" style="padding: 40px;">
            <div class="st-empty__text">暂无已发布作业</div>
          </div>
          <div v-for="hw in published" :key="hw.id" class="hw-item">
            <div class="hw-item__top">
              <span class="hw-item__title">{{ hw.title }}</span>
              <span class="st-badge" :class="isExpired(hw) ? 'st-badge--neutral' : 'st-badge--success'">
                {{ isExpired(hw) ? '已截止' : '进行中' }}
              </span>
            </div>
            <div class="hw-item__meta">
              <span class="st-badge st-badge--outline">{{ chapterTitle(hw.chapterId) }}</span>
              <span class="hw-item__id">ID {{ hw.id }} · 状态码 {{ hw.status }}</span>
            </div>
            <div class="hw-item__info">截止 {{ fmt(hw.deadline) }} · 发布于 {{ fmt(hw.createTime) }}</div>
            <div class="hw-item__req">{{ hw.content }}</div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.card-icon {
  color: var(--text-secondary);
  flex-shrink: 0;
}

.publish-grid {
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 960px) {
  .publish-grid {
    grid-template-columns: 1fr;
  }
}

.form-item {
  margin-bottom: 14px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.field-note {
  font-size: 11px;
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
  transition: border-color var(--transition);
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
  transition: border-color var(--transition);
}

.form-textarea:focus {
  border-color: var(--border-strong);
}

/* 已发布列表 */
.hw-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-height: 640px;
  overflow-y: auto;
}

.hw-item {
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  padding: 14px 16px;
}

.hw-item__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.hw-item__title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.hw-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.hw-item__id {
  font-size: 11.5px;
  color: var(--text-tertiary);
}

.hw-item__info {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 6px;
}

.hw-item__req {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 6px;
  line-height: 1.6;
  white-space: pre-wrap;
  max-height: 88px;
  overflow-y: auto;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
