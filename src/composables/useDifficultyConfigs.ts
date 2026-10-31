/**
 * 难度配置数据源（teach/exam 共用）
 *
 * 后端把难度从 1/2/3 枚举码改成指向 exam_question_difficulty_config 的逻辑外键：
 * 筛选与保存用 difficultyConfigId，展示用 difficultyName。走 VO 的接口会带名称，
 * 走实体的接口（题目详情 / 随机抽题）只有 ID，所以这里提供一份 ID→名称的映射。
 * 列表加载后模块级缓存，同一会话内不重复请求；force 参数用于配置变更后强制刷新。
 */
import { computed, ref } from 'vue';
import { fetchDifficultyConfigs } from '@/api/exam';
import type { DifficultyConfig } from '@/types/exam';

const cache = ref<DifficultyConfig[] | null>(null);
let inflight: Promise<DifficultyConfig[]> | null = null;

export function useDifficultyConfigs() {
  const configs = ref<DifficultyConfig[]>(cache.value ?? []);
  const loading = ref(false);
  const error = ref('');

  async function load(force = false) {
    if (!force && cache.value) {
      configs.value = cache.value;
      return configs.value;
    }
    if (!force && inflight) return inflight;
    loading.value = true;
    error.value = '';
    const request = (async () => {
      const list = await fetchDifficultyConfigs();
      cache.value = list;
      return list;
    })();
    inflight = request;
    try {
      configs.value = await request;
      return configs.value;
    } catch (e: unknown) {
      error.value = (e as Error)?.message ?? '难度配置加载失败';
      configs.value = [];
      return [];
    } finally {
      inflight = null;
      loading.value = false;
    }
  }

  const options = computed(() =>
    configs.value
      .slice()
      .sort((a, b) => (a.levelOrder ?? 0) - (b.levelOrder ?? 0))
      .map((c) => ({ value: Number(c.id), label: c.name })),
  );

  /** 实体接口只给 difficultyConfigId 时，用它换名称；换不到就显示「难度 N」 */
  function nameOf(id: number | string | null | undefined): string {
    const text = String(id ?? '').trim();
    if (!text) return '—';
    return configs.value.find((c) => String(c.id) === text)?.name ?? `难度 ${text}`;
  }

  /** 统一取难度文案：VO 的 difficultyName 优先，其次按 ID 映射 */
  function difficultyText(item: { difficultyName?: string; difficultyConfigId?: number }): string {
    const named = item.difficultyName?.trim();
    if (named) return named;
    return item.difficultyConfigId ? nameOf(item.difficultyConfigId) : '—';
  }

  return { configs, options, loading, error, load, nameOf, difficultyText };
}
