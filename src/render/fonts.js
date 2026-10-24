import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GlobalFonts } from '@napi-rs/canvas';

const FONT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/fonts');
let registered = false;

/** Registers bundled fonts once. Tajawal covers Arabic + Latin, Orbitron is the sci-fi display face. */
export function registerFonts() {
  if (registered) return;
  for (const w of ['Regular', 'Medium', 'Bold', 'ExtraBold']) {
    GlobalFonts.registerFromPath(path.join(FONT_DIR, `Tajawal-${w}.ttf`));
  }
  GlobalFonts.registerFromPath(path.join(FONT_DIR, 'Orbitron-Variable.ttf'));
  registered = true;
}

/** Font shorthand. family "ar" → Tajawal (Arabic UI), "num" → Orbitron (numbers, Latin titles). */
export function font(size, weight = 700, family = 'ar') {
  const fam = family === 'num' ? 'Orbitron, Tajawal' : 'Tajawal';
  return `${weight} ${Math.round(size)}px ${fam}`;
}
