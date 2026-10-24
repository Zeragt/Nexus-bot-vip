import fs from 'node:fs';
import path from 'node:path';
import { AttachmentBuilder } from 'discord.js';
import { ASSET_DIR } from '../render/sceneCache.js';
import { UserError } from '../core/errors.js';

const ART = path.join(ASSET_DIR, 'art');

/** True when the optional art pack (built by scripts/build-assets.js) has this file. */
export function hasArt(rel) {
  return fs.existsSync(path.join(ART, rel));
}

/** A pre-rendered poster as a message: sent as a file, so Discord shows it at full size. */
export async function artMessage(rel, name, caption) {
  const file = path.join(ART, rel);
  if (!rel.endsWith('.webp') || path.relative(ART, file).startsWith('..') || !fs.existsSync(file)) {
    throw new UserError('هذه الصورة غير موجودة على الخادم. شغّل npm run assets لبنائها');
  }
  return { content: caption, files: [new AttachmentBuilder(await fs.promises.readFile(file), { name: `${name}.webp` })] };
}
