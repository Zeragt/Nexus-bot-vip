import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv, decodeEnvFile, loadDotenv } from '../../src/config/dotenv.js';

const RLM = String.fromCharCode(0x200f);
const BOM = String.fromCharCode(0xfeff);

describe('.env loading', () => {
  it('parses comments, quotes, spaces, export and inline comments', () => {
    const env = parseEnv('# c\nA=1\n B = two words \nexport C="x # y"\nD=\'q\'\nE=val # note\n\nnot a line\n');
    expect(env).toEqual({ A: '1', B: 'two words', C: 'x # y', D: 'q', E: 'val' });
  });
  it('tolerates BOM, CRLF and invisible direction marks from phone keyboards', () => {
    const env = parseEnv(`${BOM}${RLM}DISCORD_TOKEN=abc${RLM}\r\nCLIENT_ID = 123\r\n`);
    expect(env).toEqual({ DISCORD_TOKEN: 'abc', CLIENT_ID: '123' });
  });
  it('decodes UTF-16 files saved by Windows editors', () => {
    const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('KEY=v\n', 'utf16le')]);
    expect(parseEnv(decodeEnvFile(buf))).toEqual({ KEY: 'v' });
  });
  it('finds the file by directory, not the working directory, and keeps panel values', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-env-'));
    fs.writeFileSync(path.join(dir, '.env'), 'X1=file\nX2=file\nX3=file\n');
    const env = { X1: 'panel', X2: '' };
    const res = loadDotenv({ dirs: [dir], env });
    expect(res.file).toBe(path.join(dir, '.env'));
    expect(env).toEqual({ X1: 'panel', X2: 'file', X3: 'file' });
  });
  it('reports when no file exists', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nx-env-'));
    expect(loadDotenv({ dirs: [dir], env: {} }).file).toBeNull();
  });
});
