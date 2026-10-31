/**
 * 轻量 Markdown → HTML
 * 备课链路（AI 备课结果 / 备课记录详情 / PPT 模板骨架）与学生端 AI 答疑共用本渲染器。
 *
 * 为什么不用正则一行行硬判：
 * 大模型吐出来的 Markdown 经常「不规范」——标题写成 `##标题`（# 后没有空格）、
 * 列表写成 `-JVM …`（没有空格）、表格用 GFM 竖线语法。严格按 CommonMark 判会整段退化成
 * 纯文本（`##JDK…` 原样显示），所以这里的标记符一律容忍缺少空白字符。
 *
 * 支持：ATX 标题（含无空格写法）/ 有序无序列表（可嵌套不出层级）/ 任务列表 / 引用 /
 * 围栏代码块（``` 与 ~~~，可带语言）/ 缩进代码 / GFM 表格（含对齐）/ 分隔线 /
 * 段落软换行 / 行内代码、粗体、斜体、删除线、链接。
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * 行内渲染：先把行内代码抽成占位符，避免代码里的 `**` / `*` / `[]()` 被当成强调语法；
 * 其余按「转义 → 强调 → 链接」的顺序替换，最后再把代码还原。
 */
function renderInline(text: string): string {
  const codes: string[] = [];
  let s = text.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });

  s = escapeHtml(s)
    .replace(/!\[([^\]\n]*)\]\(([^)\s]+)\)/g, '<a class="md-link" href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, '<a class="md-link" href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => {
    return `<code class="md-code">${escapeHtml(codes[Number(i)] ?? '')}</code>`;
  });
}

/** 统一换行符，并把 NBSP / 零宽字符换成普通空格（它们在源码里肉眼不可见，但会让所有行首正则失配） */
function normalizeSource(src: string): string {
  return src
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200b\ufeff]/g, '')
    .replace(/\u00a0/g, ' ');
}

/**
 * 流式渲染专用：闭合"半开"的代码围栏后再渲染。
 *
 * SSE 是按 token 推 Markdown 源文本的，一个 ``` 代码块常被劈成两半分属不同片段；
 * 直接渲染会让后半屏内容全部被当成代码。这里统计围栏出现次数，奇数说明还开着，
 * 补一个虚拟闭合行，只影响本次渲染输出，不改动累积的原始文本。
 */
export function closeUnclosedFence(src: string): string {
  if (!src) return '';
  const fences = src.match(/^ {0,3}(?:`{3,}|~{3,})/gm);
  if (!fences || fences.length % 2 === 0) return src;
  // 末尾不留裸换行，避免多渲染出一个空行；用反引号收尾对 ~ 围栏同样有效
  return `${src.replace(/\s+$/, '')}\n\`\`\``;
}

/** 拆分表格行：支持 `\|` 转义，首尾的竖线可有可无 */
function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let buf = '';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (ch === '\\' && s[i + 1] === '|') {
      buf += '|';
      i += 1;
      continue;
    }
    if (ch === '|') {
      cells.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  cells.push(buf);
  return cells.map((c) => c.trim());
}

/** 分隔行判定：`|---|---|`、`|:---:|`、`---` 都算 */
function isTableSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{1,}:?$/.test(c));
}

function alignOf(sep: string): string {
  const left = sep.startsWith(':');
  const right = sep.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  return '';
}

function renderTable(head: string[], sep: string[], rows: string[][]): string {
  const aligns = sep.map(alignOf);
  const cell = (tag: 'th' | 'td', text: string, i: number) => {
    const a = aligns[i];
    const style = a ? ` style="text-align: ${a}"` : '';
    return `<${tag}${style}>${renderInline(text ?? '')}</${tag}>`;
  };
  const thead = `<thead><tr>${head.map((c, i) => cell('th', c, i)).join('')}</tr></thead>`;
  const tbody = rows.length
    ? `<tbody>${rows
        .map((r) => `<tr>${head.map((_, i) => cell('td', r[i] ?? '', i)).join('')}</tr>`)
        .join('')}</tbody>`
    : '';
  return `<div class="md-table-wrap"><table class="md-table">${thead}${tbody}</table></div>`;
}

export interface MarkdownRenderOptions {
  /**
   * 标题层级偏移：默认 +3（Markdown 的 h1 渲染成 h4，避免和页面标题抢层级）。
   * PPT 主题 CSS 按 h1/h2/h3 编写，渲染幻灯片时传 0；AI 答疑这类纯正文回答也建议传 0。
   */
  headingOffset?: number;
}

/** Markdown 源文本 → 可直接 v-html 的 HTML 片段 */
export function renderMarkdown(src: string, options: MarkdownRenderOptions = {}): string {
  if (!src) return '';
  const headingOffset = options.headingOffset ?? 3;
  const lines = normalizeSource(src).split('\n');
  const out: string[] = [];

  let inCode = false;
  let listTag: 'ul' | 'ol' | null = null;
  /** 列表最后一项在 out 里的下标，用于把续行并回同一个 <li> */
  let lastLiIndex = -1;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p class="md-p">${para.join('<br />')}</p>`);
      para = [];
    }
  };

  const closeList = () => {
    if (listTag) {
      out.push(`</${listTag}>`);
      listTag = null;
      lastLiIndex = -1;
    }
  };

  /** 块级元素统一入口：先收尾段落与列表 */
  const block = (html: string) => {
    flushPara();
    closeList();
    out.push(html);
  };

  const openList = (tag: 'ul' | 'ol', start?: number) => {
    flushPara();
    if (listTag !== tag) {
      closeList();
      const attr = tag === 'ol' && start && start !== 1 ? ` start="${start}"` : '';
      out.push(`<${tag} class="md-list"${attr}>`);
      listTag = tag;
    }
  };

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();

    // ---------- 围栏代码块 ----------
    const fence = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/.exec(raw);
    if (fence) {
      flushPara();
      closeList();
      if (inCode) {
        out.push('</code></pre>');
        inCode = false;
      } else {
        inCode = true;
        const lang = fence[2] ? ` data-lang="${escapeHtml(fence[2])}"` : '';
        out.push(`<pre class="md-pre"${lang}><code>`);
      }
      continue;
    }
    if (inCode) {
      // 围栏内原样输出，只转义
      out.push(`${escapeHtml(raw)}\n`);
      continue;
    }

    // ---------- 空行 ----------
    if (!line) {
      flushPara();
      if (!listTag) continue;
      // 模型常在列表项之间夹空行，这仍然是一个列表；看下一行是否还是同类标记再决定收尾
      let k = i + 1;
      while (k < lines.length && !lines[k].trim()) k += 1;
      const next = (lines[k] ?? '').trim();
      const stillList =
        listTag === 'ul'
          ? /^[-*+][ \t\u3000]*[^-\s*+]/.test(next)
          : /^\d{1,3}[.)][ \t\u3000]*(?=[^\d\s])/.test(next);
      if (stillList) continue;
      closeList();
      continue;
    }

    // ---------- 标题：容忍 `##` 后没有空格 ----------
    const heading = /^(#{1,6})[ \t\u3000]*(.*)$/.exec(line);
    // `#1. xxx` 这类行首编号不当标题
    if (heading && heading[2] && !/^\d/.test(heading[2])) {
      const level = Math.min(heading[1].length + headingOffset, 6);
      block(`<h${level} class="md-h md-h${level}">${renderInline(heading[2])}</h${level}>`);
      continue;
    }

    // ---------- 分隔线 ----------
    if (/^([-*_])(?:\s*\1){2,}$/.test(line)) {
      block('<hr class="md-hr" />');
      continue;
    }

    // ---------- 表格：本行有竖线且下一行是分隔行 ----------
    // 列数不做严格比对：模型经常把 `|a|b|c|d|` 的分隔行少写一列，严格校验会整表退化成文本。
    // 以表头列数为准，分隔行多退少补；`---` 单列的情况只认单列表，避免把「x | y」+ 分隔线误判成表格。
    if (line.includes('|') && i + 1 < lines.length) {
      const head = splitTableRow(line);
      const sep = splitTableRow(lines[i + 1].trim());
      const sepOk = isTableSeparator(sep) && (sep.length >= 2 || head.length === 1);
      if (head.length >= 1 && sepOk) {
        const rows: string[][] = [];
        let j = i + 2;
        while (j < lines.length && lines[j].trim() && lines[j].includes('|')) {
          rows.push(splitTableRow(lines[j].trim()));
          j += 1;
        }
        block(renderTable(head, sep, rows));
        i = j - 1;
        continue;
      }
    }

    // ---------- 引用 ----------
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      block(`<blockquote class="md-quote">${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    // ---------- 无序列表：容忍 `-` 后没有空格；任务列表单独标 ----------
    const ul = /^[-*+][ \t\u3000]*([^-\s*+].*)$/.exec(line);
    if (ul) {
      const content = ul[1];
      const task = /^\[([ xX])\][ \t\u3000]*(.*)$/.exec(content);
      const html = task
        ? `<span class="md-task${task[1].toLowerCase() === 'x' ? ' md-task--done' : ''}">${task[1].toLowerCase() === 'x' ? '✓' : '○'}</span>${renderInline(task[2])}`
        : renderInline(content);
      openList('ul');
      lastLiIndex = out.length;
      out.push(`<li>${html}</li>`);
      continue;
    }

    // ---------- 有序列表：`1. 内容` / `1)内容`，但 `1.5` 这种小数不算 ----------
    const ol = /^(\d{1,3})[.)][ \t\u3000]*(?=[^\d\s])(.*)$/.exec(line);
    if (ol) {
      openList('ol', Number(ol[1]));
      lastLiIndex = out.length;
      out.push(`<li>${renderInline(ol[2])}</li>`);
      continue;
    }

    // ---------- 列表项续行：非空且不是新块，并回上一个 <li> ----------
    if (listTag && lastLiIndex >= 0) {
      out[lastLiIndex] = out[lastLiIndex].replace(
        /<\/li>$/,
        `<br />${renderInline(line)}</li>`,
      );
      continue;
    }

    // ---------- 段落 ----------
    para.push(renderInline(line));
  }

  if (inCode) out.push('</code></pre>');
  flushPara();
  closeList();
  return out.join('');
}

/**
 * AI 答疑这类「整段回答」的渲染入口：正文标题从 h1 起步，不和页面标题抢层级时也不缩水。
 * 用法：每次 onMessage 只做 `raw += chunk`，把 raw 交给本函数渲染（建议用 rAF 节流）。
 */
export function renderMarkdownStreaming(
  src: string,
  options: MarkdownRenderOptions = { headingOffset: 0 },
): string {
  return renderMarkdown(closeUnclosedFence(src), options);
}

/**
 * PPT Markdown → 一页一页的幻灯片。
 * 备课智能体产出的 PPT 正文用空行 + `---` 分页；`Title\n---` 这种 Setext 下划线不算分页，
 * 所以要求分隔线上一行是空行，否则会把标题拆坏。
 * 代码围栏（``` / ~~~）内部的 `---` 同样不分页。
 */
export function splitMarkdownSlides(src: string): string[] {
  if (!src) return [];
  const lines = src.split('\n');
  const slides: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  let fenceChar = '';
  const flush = () => {
    if (buf.some((l) => l.trim())) slides.push(buf.join('\n').trim());
    buf = [];
  };
  lines.forEach((line, i) => {
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceChar = fence[1][0];
      } else if (fence[1][0] === fenceChar) {
        inFence = false;
      }
      buf.push(line);
      return;
    }
    const isBreak =
      !inFence && /^ {0,3}-{3,}\s*$/.test(line) && (i === 0 || lines[i - 1].trim() === '');
    if (isBreak) flush();
    else buf.push(line);
  });
  flush();
  return slides;
}
