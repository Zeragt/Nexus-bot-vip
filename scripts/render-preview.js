// Renders every card with sample data into ./preview so the design can be checked without Discord.
import fs from 'node:fs/promises';
import path from 'node:path';
import * as render from '../src/render/index.js';
import { IMAGE_EXT } from '../src/render/draw.js';
import { samples } from './samples.js';

const out = path.resolve(process.argv[2] ?? 'preview');
await fs.mkdir(out, { recursive: true });
for (const [name, [fn, data]] of Object.entries(samples)) {
  const t = performance.now();
  const png = await render[fn](data);
  await fs.writeFile(path.join(out, `${name}.${IMAGE_EXT}`), png);
  console.log(`${name.padEnd(14)} ${String(Math.round(performance.now() - t)).padStart(4)} ms  ${(png.length / 1024).toFixed(0)} KB`);
}
console.log(`\nWrote ${Object.keys(samples).length} cards to ${out}`);
