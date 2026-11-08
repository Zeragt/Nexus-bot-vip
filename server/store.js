/**
 * تخزين اللاعبين. على الإنتاج: PostgreSQL (Neon). بدون DATABASE_URL: ذاكرة + ملف JSON
 * محلي (للتجربة فقط). كل لاعب صف واحد بعمود JSONB، مع أعمدة للمتصدرين.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS players (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  class_key   text NOT NULL,
  level       integer NOT NULL DEFAULT 1,
  xp          integer NOT NULL DEFAULT 0,
  rating      integer NOT NULL DEFAULT 1000,
  data        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS players_level_idx ON players (level DESC, xp DESC);
CREATE INDEX IF NOT EXISTS players_rating_idx ON players (rating DESC);
`;

const summary = (p) => ({ id: p.id, name: p.name, classKey: p.classKey, level: p.level, xp: p.xp, rating: p.rating, avatar: p.avatar });

export class PgStore {
  constructor(url) {
    this.pool = new pg.Pool({
      connectionString: url,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
      max: 5,
    });
  }
  async init() {
    await this.pool.query(SCHEMA);
  }
  async get(id) {
    const { rows } = await this.pool.query('SELECT data FROM players WHERE id = $1', [id]);
    return rows[0]?.data || null;
  }
  async save(p) {
    await this.pool.query(
      `INSERT INTO players (id, name, class_key, level, xp, rating, data, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (id) DO UPDATE SET name=$2, class_key=$3, level=$4, xp=$5, rating=$6, data=$7, updated_at=now()`,
      [p.id, p.name, p.classKey, p.level, p.xp, p.rating, p],
    );
  }
  async delete(id) {
    await this.pool.query('DELETE FROM players WHERE id = $1', [id]);
  }
  async top(by = 'level', limit = 20) {
    const order = by === 'rating' ? 'rating DESC, level DESC' : 'level DESC, xp DESC';
    const { rows } = await this.pool.query(
      `SELECT id, name, class_key AS "classKey", level, xp, rating, data->>'avatar' AS avatar FROM players ORDER BY ${order} LIMIT $1`,
      [limit],
    );
    return rows;
  }
  async close() {
    await this.pool.end();
  }
}

export class MemoryStore {
  constructor(file) {
    this.file = file;
    this.map = new Map();
    this.timer = null;
  }
  async init() {
    if (this.file && fs.existsSync(this.file)) {
      for (const p of JSON.parse(fs.readFileSync(this.file, 'utf8'))) this.map.set(p.id, p);
    }
  }
  async get(id) {
    const p = this.map.get(id);
    return p ? structuredClone(p) : null;
  }
  async save(p) {
    this.map.set(p.id, structuredClone(p));
    this.flush();
  }
  async delete(id) {
    this.map.delete(id);
    this.flush();
  }
  async top(by = 'level', limit = 20) {
    const all = [...this.map.values()].map(summary);
    all.sort((a, b) => (by === 'rating' ? b.rating - a.rating || b.level - a.level : b.level - a.level || b.xp - a.xp));
    return all.slice(0, limit);
  }
  flush() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify([...this.map.values()]));
    }, 300);
  }
  async close() {}
}

export function createStore(config) {
  return config.databaseUrl ? new PgStore(config.databaseUrl) : new MemoryStore(config.devDataFile);
}
