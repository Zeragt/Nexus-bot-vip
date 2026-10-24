// Startup checks that run before any native module loads.
// A truncated file (full disk, interrupted upload) makes the native canvas library crash with
// "Bus error" and no JavaScript stack, so the checks below name the damaged file first.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN_FREE_MB = 80;
// Sizes of the bundled fonts as shipped; any other size means the copy is damaged.
const FONTS = {
  'Tajawal-Regular.ttf': 60364,
  'Tajawal-Medium.ttf': 62280,
  'Tajawal-Bold.ttf': 59988,
  'Tajawal-ExtraBold.ttf': 59648,
  'Orbitron-Variable.ttf': 38576,
};
// The Skia binary is 30+ MB; anything far smaller was cut off while installing.
const MIN_NATIVE_BYTES = 20 * 1024 * 1024;

const say = (msg) => console.log(`[preflight] ${msg}`);

function freeMb(dir) {
  try {
    const s = fs.statfsSync(dir);
    return Math.floor((s.bavail * s.bsize) / 1024 / 1024);
  } catch {
    return null;
  }
}

/** Returns a list of problems in Arabic; empty when the install looks healthy. */
export function preflight() {
  const problems = [];
  const free = freeMb(ROOT);
  if (free != null) say(`free disk: ${free} MB`);
  if (free != null && free < MIN_FREE_MB) {
    problems.push(`المساحة المتبقية على القرص ${free} MB فقط. احذف مجلد assets/art أو node_modules لتوفير مساحة.`);
  }

  for (const [name, size] of Object.entries(FONTS)) {
    const file = path.join(ROOT, 'assets', 'fonts', name);
    const actual = fs.existsSync(file) ? fs.statSync(file).size : -1;
    if (actual !== size) problems.push(`ملف الخط assets/fonts/${name} ناقص أو تالف (${actual} بايت بدل ${size}). ارفعه من جديد.`);
  }

  const scope = path.join(ROOT, 'node_modules', '@napi-rs');
  const natives = fs.existsSync(scope)
    ? fs
        .readdirSync(scope)
        .filter((d) => d.startsWith('canvas-'))
        .flatMap((d) =>
          fs
            .readdirSync(path.join(scope, d))
            .filter((f) => f.endsWith('.node'))
            .map((f) => path.join(scope, d, f)),
        )
    : [];
  if (!natives.length) problems.push('مكتبة الرسم @napi-rs/canvas غير مثبتة. احذف node_modules وأعد التشغيل.');
  for (const file of natives) {
    const size = fs.statSync(file).size;
    say(`${path.relative(ROOT, file)}: ${(size / 1e6).toFixed(1)} MB`);
    if (size < MIN_NATIVE_BYTES) problems.push(`ملف ${path.relative(ROOT, file)} ناقص. احذف مجلد node_modules وملف package-lock.json ثم أعد التشغيل.`);
  }
  return problems;
}
