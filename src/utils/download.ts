/**
 * 文件流落盘：后端以 Blob 返回的下载（导出 CSV / Word / PPT / 导入模板）统一走这里。
 */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // 立即 revoke 会让部分浏览器在下载真正开始前就失效，等到下载任务创建后再释放
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}

/**
 * 判断导出的 docx 是否为空白文档。
 *
 * 后端返回的 Word 可能是一份合法但没有任何正文的 .docx，直接保存会让用户拿到空白文件；
 * 这里解析 ZIP 中央目录，读取 word/document.xml 的原始大小：只含空骨架的文档远小于真实教案。
 * 非 ZIP、空响应或目录损坏一律视为不可用。解析失败但确实是 ZIP 时按可用处理，避免误伤正常文件。
 */
export async function isBlankDocx(blob: Blob): Promise<boolean> {
  if (blob.size < 22) return true;
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x50 || head[1] !== 0x4b) return true; // 不是 ZIP（多为 JSON/HTML 错误页）

  const documentSize = await readZipEntrySize(blob, 'word/document.xml');
  if (documentSize == null) return false;
  return documentSize < 1600;
}

/**
 * 判断下载到的课件是不是不可用的 .pptx。
 *
 * 下载接口在有 pptx_md、文件还没转出来时会现场生成，慢的时候后端可能回一坨 JSON / HTML；
 * 这些内容被当成 Blob 存成 .pptx 用户打不开，所以落盘前先认一下 ZIP 魔数与 ppt/presentation.xml。
 * 是 ZIP 但读不到条目时按可用处理，避免误伤正常文件。
 */
export async function isBlankPptx(blob: Blob): Promise<boolean> {
  if (blob.size < 1024) return true;
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x50 || head[1] !== 0x4b) return true; // 不是 ZIP（多为 JSON/HTML 错误页）
  return (await readZipEntrySize(blob, 'ppt/presentation.xml')) == null;
}

/** 读取 ZIP 中央目录中指定条目的解压后大小（字节） */
async function readZipEntrySize(blob: Blob, entryName: string): Promise<number | null> {
  try {
    const tailStart = Math.max(0, blob.size - 66000);
    const tail = new Uint8Array(await blob.slice(tailStart).arrayBuffer());
    const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);

    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return null;

    const count = tailView.getUint16(eocd + 10, true);
    const cdSize = tailView.getUint32(eocd + 12, true);
    const cdOffset = tailView.getUint32(eocd + 16, true);
    if (!count || cdSize === 0xffffffff || cdOffset === 0xffffffff) return null;
    if (cdOffset + cdSize > blob.size) return null;

    const cd = new Uint8Array(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
    const cdView = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
    const decoder = new TextDecoder();
    let offset = 0;
    for (let i = 0; i < count; i += 1) {
      if (cdView.getUint32(offset, true) !== 0x02014b50) return null;
      const uncompressed = cdView.getUint32(offset + 24, true);
      const nameLen = cdView.getUint16(offset + 28, true);
      const extraLen = cdView.getUint16(offset + 30, true);
      const commentLen = cdView.getUint16(offset + 32, true);
      const name = decoder.decode(cd.subarray(offset + 46, offset + 46 + nameLen));
      // 个别打包工具会用反斜杠作为分隔符
      if (name === entryName || name === entryName.replace(/\//g, '\\')) {
        return uncompressed === 0xffffffff ? null : uncompressed;
      }
      offset += 46 + nameLen + extraLen + commentLen;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 兜底导出：后端返回空白 Word 时，把已渲染的 Markdown HTML 写成 Word 可打开的 .doc。
 * 内容来自页面已加载的教案全文，保证用户拿到的文件不为空。
 */
export function saveHtmlAsWord(bodyHtml: string, title: string, filename: string) {
  const safeTitle = title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${safeTitle}</title>
<style>
@page { size: A4; margin: 2.2cm 2cm; }
body { font-family: "Microsoft YaHei", "PingFang SC", SimSun, serif; font-size: 11pt; line-height: 1.9; color: #1c1917; }
h1, h2, h3, h4, h5, h6 { margin: 14pt 0 6pt; font-size: 14pt; font-weight: 700; }
p { margin: 4pt 0; }
ul, ol { margin: 4pt 0 8pt 20pt; padding: 0; }
li { margin: 2pt 0; }
blockquote { margin: 8pt 0; padding: 4pt 10pt; border-left: 2pt solid #a8a29e; color: #57534e; }
pre { margin: 6pt 0; padding: 8pt; border: 1pt solid #e7e5e4; background: #f5f5f4; font-family: Consolas, monospace; font-size: 9.5pt; white-space: pre-wrap; }
code { font-family: Consolas, monospace; font-size: 9.5pt; }
hr { margin: 10pt 0; border: none; border-top: 1pt solid #d6d3d1; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;
  saveBlob(new Blob(['\ufeff', html], { type: 'application/msword' }), filename);
}
