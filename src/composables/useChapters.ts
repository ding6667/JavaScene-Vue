import { computed, ref } from 'vue';
import { fetchChapters } from '@/api/knowledge';
import type { Chapter } from '@/types/knowledge';
import { buildChapterTree, chapterLabel, type ChapterNode } from '@/utils/chapterTree';

/**
 * 教材章节数据源（全局单例）
 *
 * 章节列表是只读、低频变化的数据，但页面里到处都要用（筛选下拉、标题回显、树形展示）。
 * 以前每个页面各自 `fetchChapters()` + 自己 `buildChapterTree()`，于是出现了
 * 平铺下拉 / 树形下拉 / 各种拼接格式的多种写法。这里统一成一份响应式数据：
 * - `chapters`：扁平列表，给需要按 id 反查标题、或自己做表格的页面用；
 * - `tree`：树形节点，给 `<ChapterSelect>` 用；
 * - `labelOf(id)`：统一的「第 N 章 xxx」文案。
 *
 * 底层 `fetchChapters()` 自身带请求缓存，这里再加一层单例避免多组件重复持有状态。
 */
const chapters = ref<Chapter[]>([]);
const loading = ref(false);
const error = ref('');
let inflight: Promise<Chapter[]> | null = null;

export function useChapters() {
  /** 首次调用才真正请求；force 用于管理端增删章节后刷新 */
  function load(force = false): Promise<Chapter[]> {
    if (inflight) return inflight;
    if (chapters.value.length && !force) return Promise.resolve(chapters.value);

    loading.value = true;
    error.value = '';
    inflight = fetchChapters(force)
      .then((list) => {
        chapters.value = list ?? [];
        return chapters.value;
      })
      .catch((e: unknown) => {
        // 响应拦截器已统一弹错，这里保证下拉拿到空列表而不是抛异常中断页面
        error.value = (e as Error)?.message || '章节数据加载失败';
        if (!chapters.value.length) chapters.value = [];
        return chapters.value;
      })
      .finally(() => {
        loading.value = false;
        inflight = null;
      });
    return inflight;
  }

  /** 树形节点（下拉用） */
  const tree = computed<ChapterNode[]>(() => buildChapterTree(chapters.value));

  function findById(id?: number | string | null): Chapter | null {
    if (id === null || id === undefined || id === '') return null;
    return chapters.value.find((c) => String(c.id) === String(id)) ?? null;
  }

  /** 章节显示名；找不到时退回「章节 {id}」，方便排查脏数据 */
  function labelOf(id?: number | string | null): string {
    if (id === null || id === undefined || id === '') return '';
    const c = findById(id);
    return c ? chapterLabel(c) : `章节 ${id}`;
  }

  return { chapters, loading, error, tree, load, findById, labelOf };
}
