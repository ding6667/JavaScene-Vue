/**
 * PPT 主题加载器
 * 前端只保留“怎么取 CSS”，不保留“CSS 是什么”：
 *   内存缓存 → localStorage（按 version 失效）→ GET /api/teach/ppt/themes/{code}
 * 后端新增/修改主题只需插数据，前端无需发版。
 */
import { fetchPptThemeDetail } from '@/api/teacher';
import type { PptThemeDetail } from '@/types/teacher';

const STORAGE_PREFIX = 'ppt-theme:';
/** key = `${code}@${version}` */
const memory = new Map<string, { version: number; css: string }>();
/** 同一主题并发请求只发一次 */
const pending = new Map<string, Promise<PptThemeDetail>>();

function memoryKey(code: string, version: number): string {
  return `${code}@${version}`;
}

function readStored(code: string): { version: number; css: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + code);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { version?: unknown; css?: unknown };
    if (typeof parsed.version !== 'number' || typeof parsed.css !== 'string') return null;
    return { version: parsed.version, css: parsed.css };
  } catch {
    return null;
  }
}

/**
 * 同步读取缓存，供渲染组件首帧使用，避免主题异步到达前的无样式闪烁。
 * 传入 version 时只认该版本；不传则使用本地最新的那份。
 */
export function readCachedPptThemeCss(code: string, version?: number): string | null {
  if (!code) return null;
  if (version != null) {
    const hit = memory.get(memoryKey(code, version));
    if (hit) return hit.css;
  }
  const stored = readStored(code);
  if (!stored) return null;
  if (version != null && stored.version !== version) return null;
  memory.set(memoryKey(code, stored.version), stored);
  return stored.css;
}

function requestTheme(code: string): Promise<PptThemeDetail> {
  const existing = pending.get(code);
  if (existing) return existing;
  const task = fetchPptThemeDetail(code).finally(() => pending.delete(code));
  pending.set(code, task);
  return task;
}

/**
 * 加载主题 CSS。
 * @param code 主题编码
 * @param version 模板/列表给出的版本号；不传时使用本地缓存或直接拉取
 */
export async function loadPptThemeCss(code: string, version?: number): Promise<string> {
  const cached = readCachedPptThemeCss(code, version);
  if (cached) return cached;

  const detail = await requestTheme(code);
  const css = detail.cssText ?? '';
  // 以服务端返回的版本为准，避免模板缓存了旧 version
  const finalVersion = typeof detail.version === 'number' ? detail.version : version ?? 0;
  memory.set(memoryKey(code, finalVersion), { version: finalVersion, css });
  try {
    localStorage.setItem(STORAGE_PREFIX + code, JSON.stringify({ version: finalVersion, css }));
  } catch {
    // 隐私模式 / 配额满时忽略：内存缓存仍然生效
  }
  return css;
}

/**
 * 主题外观演示页：前端固定预设，包含标题、正文、代码块。
 * 内容刻意精简，保证在 1280×720 画板内不因不同主题的内边距而溢出。
 */
export const PPT_THEME_DEMO_MARKDOWN = `# Java 面向对象基础
## 核心概念
类描述对象的模板，对象是类创建出来的实例。

\`\`\`java
public class Student {
    private String name;
}
\`\`\``;
