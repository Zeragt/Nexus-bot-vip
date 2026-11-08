/**
 * ينسخ أيقونات game-icons.net (CC BY 3.0) المستخدمة فعلاً في اللعبة إلى client/public/art
 * كملفات SVG صغيرة. يجمع الأسماء من محتوى اللعبة ومن استدعاءات ico('...') في الواجهة.
 *   npm run art            ينسخ الأيقونات
 *   npm run art -- --check يتحقق فقط أن كل الأيقونات موجودة
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from '../server/config.js';
import * as content from '../server/game/content.js';

const require = createRequire(import.meta.url);
const set = require('@iconify-json/game-icons/icons.json');
const check = process.argv.includes('--check');
const names = new Set();

(function walk(v) {
  if (Array.isArray(v)) return v.forEach(walk);
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k === 'icon' && typeof x === 'string') names.add(x);
      else walk(x);
    }
  }
})(content);
for (const icon of Object.values(content.SPEAKERS)) names.add(icon);

function scan(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) scan(p);
    else if (/\.(js|html)$/.test(f.name)) {
      const src = fs.readFileSync(p, 'utf8');
      // ico('x') أو icon: 'x' يجب أن تكون موجودة، وأي نص آخر يطابق اسم أيقونة يُنسخ أيضاً (للحالات الشرطية)
      for (const m of src.matchAll(/(?:ico\(\s*|icon:\s*)['"]([a-z0-9-]+)['"]/g)) names.add(m[1]);
      for (const m of src.matchAll(/['"]([a-z][a-z0-9-]*)['"]/g)) if (set.icons[m[1]]) names.add(m[1]);
    }
  }
}
scan(path.join(ROOT, 'client', 'src'));

const missing = [...names].filter((n) => !set.icons[n]);
if (missing.length) {
  console.error(`❌ أيقونات غير موجودة: ${missing.join(', ')}`);
  process.exit(1);
}
if (check) {
  console.log(`✅ ${names.size} أيقونة كلها موجودة`);
  process.exit(0);
}
const out = path.join(ROOT, 'client', 'public', 'art');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const W = set.width || 512;
const H = set.height || 512;
for (const n of names) {
  const ic = set.icons[n];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ic.width || W} ${ic.height || H}">${ic.body.replace(/currentColor/g, "#fff")}</svg>`;
  fs.writeFileSync(path.join(out, `${n}.svg`), svg);
}
fs.writeFileSync(
  path.join(out, 'LICENSE.txt'),
  `Icons by Lorc, Delapouite and contributors — https://game-icons.net\nLicensed under CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/\nConverted to standalone SVG (colour changed to white for CSS masking).\n`,
);
console.log(`✅ تم نسخ ${names.size} أيقونة إلى client/public/art`);
