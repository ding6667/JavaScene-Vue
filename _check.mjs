import fs from 'fs';
import path from 'path';

const DOC = 'C:/Users/dingy/Desktop/doc';
const files = fs
  .readdirSync(DOC)
  .filter((f) => /^openapi-.*\.json$/.test(f))
  .sort();

function norm(p) {
  return p.replace(/\{[^}]*\}/g, '{}').replace(/\/+$/, '');
}

// 1) 读所有模块文档
const docEp = new Map(); // "METHOD path" -> {file, summary}
for (const f of files) {
  const o = JSON.parse(fs.readFileSync(path.join(DOC, f), 'utf8'));
  const paths = Object.keys(o.paths || {});
  console.log(`\n##### ${f}  (paths=${paths.length})`);
  for (const p of paths.sort()) {
    for (const m of Object.keys(o.paths[p])) {
      if (!['get', 'post', 'put', 'delete', 'patch'].includes(m)) continue;
      const key = m.toUpperCase() + ' ' + p;
      docEp.set(key, { file: f, summary: o.paths[p][m].summary || '' });
      console.log('  ' + key.padEnd(56) + (o.paths[p][m].summary || '').slice(0, 50));
    }
  }
}
console.log('\n文档接口总数:', docEp.size);

// 2) 扫描前端 src 出现过的 /api 路径（真实调用 + 桩的 TODO 注释都算）
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|vue)$/.test(e.name)) out.push(p);
  }
  return out;
}
const seen = new Map();
for (const f of walk('src')) {
  fs.readFileSync(f, 'utf8')
    .split(/\r?\n/)
    .forEach((ln, i) => {
      const m = /["'`]\/api\/[^"'`\n]*|\/api\/[A-Za-z0-9_/{}\-]+/g.exec(ln);
      if (!m) return;
      const raw = m[0].replace(/^["'`]|["'`]$/g, '');
      const k = norm(raw.split('?')[0]);
      if (!seen.has(k)) seen.set(k, []);
      seen.get(k).push(f.replace(/\\/g, '/') + ':' + (i + 1));
    });
}

// 3) 对账
console.log('\n===== 文档里有、前端完全没提到的接口 =====');
let miss = 0;
const missList = [];
for (const [key, v] of [...docEp.entries()].sort((a, b) => a[1].file.localeCompare(b[1].file))) {
  const p = key.split(' ')[1];
  if (!seen.has(norm(p))) {
    miss++;
    missList.push({ key, ...v });
    console.log(`  [${v.file}] ${key.padEnd(58)} ${(v.summary || '').slice(0, 44)}`);
  }
}
console.log('缺失合计:', miss, '/', docEp.size);

console.log('\n===== 按文档文件统计 =====');
const byFile = {};
for (const [key, v] of docEp) {
  const p = key.split(' ')[1];
  byFile[v.file] ||= { total: 0, hit: 0 };
  byFile[v.file].total++;
  if (seen.has(norm(p))) byFile[v.file].hit++;
}
for (const [f, c] of Object.entries(byFile).sort())
  console.log('  ' + f.padEnd(28) + '已覆盖 ' + c.hit + ' / ' + c.total);

console.log('\n===== 前端提到但 7 份文档都没有的路径（可能是旧模块/写错） =====');
const docPaths = new Set([...docEp.keys()].map((k) => norm(k.split(' ')[1])));
for (const [k, v] of [...seen.entries()].sort()) {
  if (!docPaths.has(k)) console.log('  ' + k.padEnd(50) + '<- ' + v[0]);
}
