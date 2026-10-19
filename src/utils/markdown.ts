/**
 * 轻量 Markdown → HTML
 * 备课链路（AI 备课结果 / 备课记录详情 / PPT 模板骨架）后端一律返回 Markdown 文本，
 * 三处共用本渲染器，避免各自复制一份。
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)\)/g,
      '<a class="md-link" href="$2" target="_blank" rel="noopener">$1</a>',
    );
}

/**
 * 流式渲染专用：闭合"半开"的代码围栏后再渲染。
 *
 * SSE 是按 token 推 Markdown 源文本的，一个 ``` 代码块常被劈成两半分属不同片段；
 * 直接渲染会让后半屏内容全部被当成代码。这里统计 ``` 出现的行数，奇数说明还开着，
 * 补一个虚拟闭合行，只影响本次渲染输出，不改动累积的原始文本。
 */
export function closeUnclosedFence(src: string): string {
  if (!src) return '';
  const fences = src.match(/^```/gm);
  if (!fences || fences.length % 2 === 0) return src;
  // 末尾不留裸换行，避免多渲染出一个空行
  return `${src.replace(/\s+$/, '')}\n\`\`\``;
}

/**
 * 流式 Markdown 实时渲染入口：累积的原始文本 → 可直接 v-html 的 HTML。
 * 用法：每次 onMessage 只做 `raw += chunk`，把 raw 交给本函数渲染（建议用 rAF 节流）。
 */
export function renderMarkdownStreaming(src: string): string {
  return renderMarkdown(closeUnclosedFence(src));
}

/** 支持：标题 / 有序无序列表 / 引用 / 代码块 / 分隔线 / 段落 / 行内强调 */
export function renderMarkdown(src: string): string {
  if (!src) return '';
  const out: string[] = [];
  let inCode = false;
  let listTag: 'ul' | 'ol' | null = null;
  const closeList = () => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };
  const openList = (tag: 'ul' | 'ol') => {
    if (listTag !== tag) {
      closeList();
      out.push(`<${tag} class="md-list">`);
      listTag = tag;
    }
  };

  for (const raw of src.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line.startsWith('```')) {
      closeList();
      if (inCode) {
        out.push('</code></pre>');
        inCode = false;
      } else {
        out.push('<pre class="md-pre"><code>');
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(`${escapeHtml(raw)}\n`);
      continue;
    }
    if (!line) {
      closeList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length + 3, 6);
      out.push(`<h${level} class="md-h">${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      closeList();
      out.push('<hr class="md-hr" />');
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      closeList();
      out.push(`<blockquote class="md-quote">${renderInline(quote[1])}</blockquote>`);
      continue;
    }
    const ul = /^[-*+]\s+(.*)$/.exec(line);
    if (ul) {
      openList('ul');
      out.push(`<li>${renderInline(ul[1])}</li>`);
      continue;
    }
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      openList('ol');
      out.push(`<li>${renderInline(ol[1])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p class="md-p">${renderInline(line)}</p>`);
  }
  if (inCode) out.push('</code></pre>');
  closeList();
  return out.join('');
}
