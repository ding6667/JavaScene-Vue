import { defineStore } from 'pinia';
import { ref } from 'vue';
import { saveProgress } from '@/api/student';

/**
 * 学生端状态管理
 * 只保留真实写入：POST /api/study/progress/save。
 * 进度的读取（GET /api/study/progress/get）、错题本（/api/exam/wrong-question/list）、
 * 答疑历史（/api/qa/history）等后端接口尚未在前端接入，不再用 localStorage 伪造数据源。
 */
export const useStudentStore = defineStore('student', () => {
  /** 本次会话内已上报进度的章节，用于按钮态回显 */
  const savedChapters = ref<Record<number, number>>({});

  /** 上报章节学习进度（失败由响应拦截器统一提示） */
  async function markProgress(chapterId: number, progressRate: number, studyDuration = 0) {
    const isCompleted = progressRate >= 100 ? 1 : 0;
    await saveProgress({ chapterId, progressRate, studyDuration, isCompleted });
    savedChapters.value[chapterId] = progressRate;
    return progressRate;
  }

  function clear() {
    savedChapters.value = {};
  }

  return { savedChapters, markProgress, clear };
});
