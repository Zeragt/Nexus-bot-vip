import { logger, scrub } from './logger.js';

/**
 * Minimal DB-coordinated scheduler. Each task row in `scheduler_tasks` is claimed with a
 * conditional UPDATE, so if two bot instances run by mistake a task still runs only once.
 */
export class Scheduler {
  constructor(pool, { tickMs = 5_000, log = logger } = {}) {
    this.pool = pool;
    this.tickMs = tickMs;
    this.log = log;
    this.tasks = new Map();
    this.timer = null;
    this.running = new Set();
    this.stopped = false;
  }

  add(name, everyMs, fn, { leaseMs = Math.max(everyMs, 60_000) } = {}) {
    this.tasks.set(name, { name, everyMs, fn, leaseMs });
    return this;
  }

  async start() {
    for (const t of this.tasks.values()) {
      await this.pool.query('INSERT INTO scheduler_tasks (name, next_run_at) VALUES ($1, now()) ON CONFLICT (name) DO NOTHING', [t.name]);
    }
    this.timer = setInterval(() => this.tick(), this.tickMs);
    this.timer.unref?.();
    this.log.info({ tasks: [...this.tasks.keys()] }, 'Scheduler started');
  }

  async claim(t) {
    const { rowCount } = await this.pool.query(
      `UPDATE scheduler_tasks SET locked_until = now() + make_interval(secs => $2::double precision), next_run_at = now() + make_interval(secs => $3::double precision)
       WHERE name = $1 AND next_run_at <= now() AND (locked_until IS NULL OR locked_until < now())`,
      [t.name, t.leaseMs / 1000, t.everyMs / 1000],
    );
    return rowCount === 1;
  }

  async runTask(t) {
    if (this.running.has(t.name) || this.stopped) return;
    this.running.add(t.name);
    try {
      if (!(await this.claim(t))) return;
      let error = null;
      try {
        await t.fn();
      } catch (err) {
        error = scrub(err?.message ?? String(err)).slice(0, 500);
        this.log.error({ task: t.name, err: error }, 'Scheduled task failed');
      }
      await this.pool.query('UPDATE scheduler_tasks SET locked_until = NULL, last_run_at = now(), last_error = $2 WHERE name = $1', [t.name, error]);
    } catch (err) {
      this.log.debug({ task: t.name, err: err.message }, 'Scheduler claim failed');
    } finally {
      this.running.delete(t.name);
    }
  }

  tick() {
    for (const t of this.tasks.values()) this.runTask(t);
  }

  /** Stops new runs and waits (bounded) for in-flight tasks. */
  async stop(timeoutMs = 10_000) {
    this.stopped = true;
    clearInterval(this.timer);
    const until = Date.now() + timeoutMs;
    while (this.running.size && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
  }
}
