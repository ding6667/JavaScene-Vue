/**
 * 极简 Java 语法高亮（黑白灰基调，低饱和蓝灰强调）
 * 供代码实操 / 章节案例展示使用，避免引入重型编辑器依赖。
 */

const KEYWORDS = [
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'void', 'volatile', 'while', 'var', 'true', 'false', 'null',
];

const TYPE_WORDS = ['String', 'Integer', 'Double', 'Boolean', 'Long', 'Character', 'System', 'Math', 'Object', 'Thread', 'Exception', 'RuntimeException', 'ArithmeticException', 'ArrayIndexOutOfBoundsException', 'NullPointerException', 'Throwable', 'List', 'ArrayList', 'Map', 'HashMap', 'Set', 'HashSet', 'Arrays', 'Collections', 'Iterator', 'File', 'InputStream', 'OutputStream', 'Reader', 'Writer', 'IOException', 'ByteArrayInputStream', 'ByteArrayOutputStream', 'USB', 'Storage', 'Animal', 'Dog', 'Cat', 'UDisk', 'Student', 'AnimalPoly', 'ThreadDemo', 'CollectionDemo'];

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function highlightJava(code: string): string {
  // 分段处理：先按注释/字符串切开，普通段再做关键字着色
  const parts: { type: 'code' | 'comment' | 'string'; text: string }[] = [];
  const pattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*")/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(code)) !== null) {
    if (m.index > last) parts.push({ type: 'code', text: code.slice(last, m.index) });
    if (m[1]) parts.push({ type: 'comment', text: m[1] });
    else parts.push({ type: 'string', text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < code.length) parts.push({ type: 'code', text: code.slice(last) });

  return parts
    .map((p) => {
      if (p.type === 'comment') return `<span class="tok-comment">${escapeHtml(p.text)}</span>`;
      if (p.type === 'string') return `<span class="tok-string">${escapeHtml(p.text)}</span>`;
      // 普通代码段：token 化
      const tokens = p.text.split(/(\b\w+\b|\s+|.)/).filter(Boolean);
      return tokens
        .map((t: string) => {
          if (KEYWORDS.includes(t)) return `<span class="tok-keyword">${escapeHtml(t)}</span>`;
          if (TYPE_WORDS.includes(t)) return `<span class="tok-type">${escapeHtml(t)}</span>`;
          if (/^\d+(\.\d+)?[fLd]?$/.test(t)) return `<span class="tok-number">${escapeHtml(t)}</span>`;
          return `<span class="tok-default">${escapeHtml(t)}</span>`;
        })
        .join('');
    })
    .join('');
}
