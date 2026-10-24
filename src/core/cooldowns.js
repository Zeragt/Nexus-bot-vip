/**
 * Central cooldown manager. Short anti-spam cooldowns live in memory; anything that
 * matters across restarts (jobs, daily, travel, combat rewards) is persisted in the
 * `cooldowns` table and cached in memory for fast reads.
 */
export class CooldownManager {
  constructor({ store = null, now = () => Date.now() } = {}) {
    this.store = store;
    this.now = now;
    this.cache = new Map();
  }

  #k(subject, key) {
    return `${subject}\u0000${key}`;
  }

  /** Remaining milliseconds, or 0 if ready. */
  async remaining(subject, key) {
    const k = this.#k(subject, key);
    let exp = this.cache.get(k);
    if (exp === undefined && this.store) {
      exp = (await this.store.get(subject, key)) ?? 0;
      this.cache.set(k, exp);
    }
    const left = (exp ?? 0) - this.now();
    if (left <= 0) {
      this.cache.delete(k);
      return 0;
    }
    return left;
  }

  async set(subject, key, ms, { persist = true } = {}) {
    const exp = this.now() + ms;
    this.cache.set(this.#k(subject, key), exp);
    if (persist && this.store) await this.store.set(subject, key, exp);
    return exp;
  }

  async clear(subject, key) {
    this.cache.delete(this.#k(subject, key));
    if (this.store) await this.store.delete(subject, key);
  }

  /** Atomically "use" a cooldown: returns remaining ms if blocked, otherwise sets it and returns 0. */
  async consume(subject, key, ms, opts) {
    const left = await this.remaining(subject, key);
    if (left > 0) return left;
    await this.set(subject, key, ms, opts);
    return 0;
  }

  sweep() {
    const t = this.now();
    for (const [k, exp] of this.cache) if (exp <= t) this.cache.delete(k);
  }
}

/** Postgres-backed store for the cooldown manager. */
export function pgCooldownStore(pool) {
  return {
    async get(subject, key) {
      const { rows } = await pool.query('SELECT expires_at FROM cooldowns WHERE subject = $1 AND key = $2', [subject, key]);
      return rows[0] ? new Date(rows[0].expires_at).getTime() : null;
    },
    async set(subject, key, expMs) {
      await pool.query(
        `INSERT INTO cooldowns (subject, key, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0))
         ON CONFLICT (subject, key) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
        [subject, key, expMs],
      );
    },
    async delete(subject, key) {
      await pool.query('DELETE FROM cooldowns WHERE subject = $1 AND key = $2', [subject, key]);
    },
  };
}

/** Sliding-window rate limiter for command and button spam (memory only, by design). */
export class RateLimiter {
  constructor({ limit, windowMs, now = () => Date.now() }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.hits = new Map();
  }

  /** Returns true if the action is allowed. */
  hit(id) {
    const t = this.now();
    const arr = (this.hits.get(id) ?? []).filter((x) => t - x < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(id, arr);
      return false;
    }
    arr.push(t);
    this.hits.set(id, arr);
    return true;
  }

  sweep() {
    const t = this.now();
    for (const [id, arr] of this.hits) {
      const kept = arr.filter((x) => t - x < this.windowMs);
      if (kept.length) this.hits.set(id, kept);
      else this.hits.delete(id);
    }
  }
}

/** Per-key async mutex so one user's rapid button presses are processed one at a time. */
export class KeyedMutex {
  constructor() {
    this.tails = new Map();
  }
  async run(key, fn) {
    const prev = this.tails.get(key) ?? Promise.resolve();
    let release;
    const gate = new Promise((r) => (release = r));
    const tail = prev.then(() => gate);
    this.tails.set(key, tail);
    await prev;
    try {
      return await fn();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
