import type { Chapter } from '@/types/knowledge';

/** el-tree-select 用的章节树节点（children 为空时不给展开箭头） */
export interface ChapterNode {
  id: number;
  /** el-tree-select 默认的标签字段名 */
  label: string;
  children?: ChapterNode[];
}

/**
 * 章标题（level=1）本身已带「第 N 章」，再拼一次编号会变成「1 第 1 章 …」，
 * 所以只对没有编号前缀的标题（节 / 小节）拼 chapterCode。
 */
export function chapterLabel(c: Chapter): string {
  const hasNumber = /^第\s*\d+\s*[章节]/.test(c.title) || c.title.startsWith(c.chapterCode);
  return hasNumber ? c.title : `${c.chapterCode} ${c.title}`;
}

/** 扁平章节列表（靠 parentId 组织）→ 树；父节点缺失的数据挂到根上，避免整棵子树消失 */
export function buildChapterTree(list: Chapter[]): ChapterNode[] {
  const byParent = new Map<number, Chapter[]>();
  const ids = new Set(list.map((c) => c.id));
  for (const c of list) {
    const parentKey = ids.has(c.parentId) ? c.parentId : 0;
    const bucket = byParent.get(parentKey);
    if (bucket) bucket.push(c);
    else byParent.set(parentKey, [c]);
  }
  const toNode = (c: Chapter): ChapterNode => {
    const kids = (byParent.get(c.id) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
    return { id: c.id, label: chapterLabel(c), ...(kids.length ? { children: kids.map(toNode) } : {}) };
  };
  return (byParent.get(0) ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map(toNode);
}
