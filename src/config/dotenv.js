import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Loads the .env file without relying on the working directory or on `npm start`:
 * hosts like Wispbyte run `node /home/container/index.js` directly.
 * Files edited on phones or in Windows editors often carry a BOM, UTF-16 encoding,
 * invisible direction marks (from Arabic keyboards) or CRLF line endings; all are tolerated.
 */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANDIDATES = ['.env', 'env', '.env.txt', 'env.txt', '.env.env'];
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u00AD]/g;

export function decodeEnvFile(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(2)).swap16().toString('utf16le');
  // UTF-16 without BOM: every other byte is zero for ASCII text.
  if (buf.length > 4 && buf[1] === 0 && buf[3] === 0) return buf.toString('utf16le');
  return buf.toString('utf8');
}

export function parseEnv(text) {
  const out = {};
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine
      .replace(INVISIBLE, '')
      .replace(/\u00A0/g, ' ')
      .trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*[=:]\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    const q = value[0];
    if ((q === '"' || q === "'" || q === '`') && value.lastIndexOf(q) > 0) {
      value = value.slice(1, value.lastIndexOf(q));
      if (q === '"') value = value.replace(/\\n/g, '\n');
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    out[m[1].toUpperCase()] = value;
  }
  return out;
}

/** Reads the first env file found (project root first, then the working directory). */
export function loadDotenv({ dirs = [PROJECT_ROOT, process.cwd()], env = process.env } = {}) {
  for (const dir of [...new Set(dirs)]) {
    for (const name of CANDIDATES) {
      const file = path.join(dir, name);
      let buf;
      try {
        if (!fs.statSync(file).isFile()) continue;
        buf = fs.readFileSync(file);
      } catch {
        continue;
      }
      const parsed = parseEnv(decodeEnvFile(buf));
      // Panel variables win, but empty ones don't block values from the file.
      for (const [k, v] of Object.entries(parsed)) if (env[k] === undefined || env[k] === '') env[k] = v;
      return { file, keys: Object.keys(parsed) };
    }
  }
  return { file: null, keys: [] };
}

export const dotenvResult = loadDotenv();
