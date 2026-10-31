<script setup lang="ts">
/**
 * 教材章节选择器（全站统一）
 *
 * 就是「AI 智能备课」页那个树形章节下拉：按 parentId 组成 章 / 节 / 小节 三级树，
 * 支持搜索、可清空。以前各页面各写一份（平铺 el-select + 自己拼 `${code} ${title}`），
 * 同一个概念三种长相，这里抽成一个组件，后续一律复用它。
 *
 * 用法：
 *   <ChapterSelect v-model="chapterId" />                        // 必选
 *   <ChapterSelect v-model="filters.chapterId" allow-all />      // 筛选，多一个「全部章节」（值为 0）
 *   <ChapterSelect v-model="id" placeholder="关联章节（可选）" clearable />
 *
 * 章节数据由 useChapters 全局共享，页面不需要再自己 fetchChapters。
 */
import { computed, onMounted } from 'vue';
import { useChapters } from '@/composables/useChapters';
import { buildChapterTree } from '@/utils/chapterTree';

type ChapterValue = number | string | null;

const props = withDefaults(
  defineProps<{
    modelValue?: ChapterValue;
    placeholder?: string;
    /** 允许清空（清空后值为 null） */
    clearable?: boolean;
    disabled?: boolean;
    /** 可输入搜索，长章节表建议保持开启 */
    filterable?: boolean;
    /** 追加「全部章节」项，用于筛选场景 */
    allowAll?: boolean;
    allLabel?: string;
    /** 「全部章节」对应的值，默认 0（与各页筛选参数的约定一致） */
    allValue?: number | string;
    /** 只保留这些层级的节点（1=章 2=节 3=小节），如「上级章节」只能选章 */
    levels?: number[];
    /** 排除这些章节（编辑时不能选自己作为上级） */
    excludeIds?: Array<number | string>;
  }>(),
  {
    modelValue: null,
    placeholder: '选择章节',
    clearable: false,
    disabled: false,
    filterable: true,
    allowAll: false,
    allLabel: '全部章节',
    allValue: 0,
    levels: undefined,
    excludeIds: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: ChapterValue];
  change: [value: ChapterValue];
}>();

const { chapters, tree, loading, error, load } = useChapters();

onMounted(() => void load());

/** 需要按层级过滤 / 排除自身时重建树（构树逻辑仍是 utils/chapterTree 那一份） */
const nodes = computed(() => {
  const hasLevels = !!props.levels?.length;
  const excluded = new Set((props.excludeIds ?? []).map(String));
  if (!hasLevels && !excluded.size) return tree.value;
  const list = chapters.value.filter(
    (c) => (!hasLevels || props.levels!.includes(c.level)) && !excluded.has(String(c.id)),
  );
  return buildChapterTree(list);
});

/** 「全部章节」作为一级节点插在章节树最前面 */
const data = computed(() =>
  props.allowAll ? [{ id: props.allValue, label: props.allLabel }, ...nodes.value] : nodes.value,
);

/** el-tree-select 清空时给的是 ''/undefined，页面统一收 null */
const value = computed<ChapterValue | undefined>({
  get: () => (props.modelValue === null || props.modelValue === '' ? undefined : props.modelValue),
  set: (v) => {
    const next: ChapterValue = v === '' || v === undefined ? null : v;
    emit('update:modelValue', next);
    emit('change', next);
  },
});
</script>

<template>
  <el-tree-select
    v-model="value"
    :data="data"
    node-key="id"
    :props="{ label: 'label' }"
    :placeholder="placeholder"
    :clearable="clearable"
    :disabled="disabled"
    :filterable="filterable"
    :loading="loading"
    :no-data-text="error ? '章节数据加载失败' : '暂无章节'"
    check-strictly
    :expand-on-click-node="false"
    popper-class="chapter-tree-popper"
    class="chapter-select"
  />
</template>
