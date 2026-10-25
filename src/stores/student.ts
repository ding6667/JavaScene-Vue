import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchProgress, saveProgress } from '@/api/study';
import type { StudyProgress } from '@/types/study';

/**
 * 学生端状态管理
 *
 * 数据源：
 * - POST /api/study/progress/save  写入章节进度
 * - GET  /api/study/progress/get   读取当前课程的全部章节进度
 *
 * 进度只存一份：服务端 progress/get 结果缓存在 progressMap，
 * 本会话内 save 上报的完成度作为覆盖层放在 savedChapters（会话内回显，优先于服务端值），
 * 页面统一通过 progressOf() 读取合并结果，不要再各自维护第二份进度状态。
 * 错题本（GET /api/exam/wrong-question/list）不在本 store 缓存，由错题本页直接取数。
 */

/** progressMap（服务端）与 savedChapters（本会话）合并后的读取口径 */
export interface ChapterProgressView {
  chapterId: number;
  /** 章节名，由 progress/get 下发；服务端无记录时为 null */
  chapterName: string | null;
  /** 完成度 0-100 */
  progressRate: number;
  /** 累计学习时长（秒），后端无值时为 null，页面显示占位符 */
  studyDuration: number | null;
  /** 1=已完成 0=未完成 */
  isCompleted: number;
  lastStudyTime: string | null;
  /** 数据来源：server=progress/get；session=本会话上报后覆盖 */
  source: 'server' | 'session';
}

export const useStudentStore = defineStore('student', () => {
  /** 章节进度缓存（GET /api/study/progress/get，失败保持为空，不兜底假数据） */
  const progressMap = ref<Record<number, StudyProgress>>({});
  /** 已成功加载的课程 ID；null 表示尚未取到数据 */
  const loadedCourseId = ref<number | null>(null);
  const progressLoading = ref(false);
  /** 最近一次读取失败的原因，供页面直接展示 */
  const progressError = ref<string | null>(null);

  /** 本次会话内已上报进度的章节，用于按钮态回显 + 覆盖服务端旧值 */
  const savedChapters = ref<Record<number, number>>({});

  const progressList = computed<StudyProgress[]>(() => Object.values(progressMap.value));

  /**
   * 读取当前课程章节进度（GET /api/study/progress/get）
   * 同一课程默认只请求一次，force=true 强制重取。
   * 失败时清空缓存并向上抛出，由调用方展示空态与错误原因。
   */
  async function loadProgress(courseId: number, force = false): Promise<StudyProgress[]> {
    if (!force && loadedCourseId.value === courseId) return progressList.value;
    progressLoading.value = true;
    try {
      const list = await fetchProgress(courseId);
      const map: Record<number, StudyProgress> = {};
      for (const item of Array.isArray(list) ? list : []) {
        if (item && typeof item.chapterId === 'number') map[item.chapterId] = item;
      }
      progressMap.value = map;
      loadedCourseId.value = courseId;
      progressError.value = null;
      return progressList.value;
    } catch (e) {
      progressMap.value = {};
      loadedCourseId.value = null;
      progressError.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      progressLoading.value = false;
    }
  }

  /**
   * 上报章节学习进度（POST /api/study/progress/save，真实写入）
   * 成功后把完成度写入会话覆盖层，失败由响应拦截器统一提示并向上抛出。
   */
  async function markProgress(chapterId: number, progressRate: number, studyDuration = 0) {
    const isCompleted = progressRate >= 100 ? 1 : 0;
    await saveProgress({ chapterId, progressRate, studyDuration, isCompleted });
    savedChapters.value[chapterId] = progressRate;
    // 服务端缓存若已有该章节记录，同步刷新，避免页面读到旧值
    const cached = progressMap.value[chapterId];
    if (cached) {
      progressMap.value[chapterId] = {
        ...cached,
        progressRate,
        studyDuration,
        isCompleted,
      };
    }
    return progressRate;
  }

  /** 合并服务端进度与本会话上报值；两处都没有则返回 null（页面显示「未同步」） */
  function progressOf(chapterId: number): ChapterProgressView | null {
    const server = progressMap.value[chapterId];
    const sessionRate = (savedChapters.value as Record<number, number | undefined>)[chapterId];
    if (!server && sessionRate === undefined) return null;
    const rate = sessionRate ?? server?.progressRate ?? 0;
    return {
      chapterId,
      chapterName: server?.chapterName ?? null,
      progressRate: rate,
      studyDuration: server?.studyDuration ?? null,
      isCompleted: sessionRate !== undefined ? (rate >= 100 ? 1 : 0) : server?.isCompleted ?? 0,
      lastStudyTime: server?.lastStudyTime ?? null,
      source: sessionRate !== undefined ? 'session' : 'server',
    };
  }

  function clear() {
    savedChapters.value = {};
    progressMap.value = {};
    loadedCourseId.value = null;
    progressError.value = null;
  }

  return {
    savedChapters,
    progressMap,
    progressList,
    progressLoading,
    progressError,
    loadedCourseId,
    loadProgress,
    markProgress,
    progressOf,
    clear,
  };
});
