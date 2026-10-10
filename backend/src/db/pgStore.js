import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from '../config.js';

const SCHEMA = readFileSync(fileURLToPath(new URL('./schema.sql', import.meta.url)), 'utf8');

const COLUMNS = {
  lang: 'lang',
  status: 'status',
  stage: 'stage',
  error: 'error',
  verdict: 'verdict',
  score: 'score',
  trust: 'trust',
  health: 'health',
  explanations: 'explanations',
  screenshot: 'screenshot',
  startedAt: 'started_at',
  finishedAt: 'finished_at',
};
const JSON_FIELDS = new Set(['trust', 'health', 'explanations', 'screenshot']);

function poolConfig() {
  let connectionString = config.databaseUrl;
  let ssl;
  if (config.pgSsl) {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    connectionString = url.toString();
    // For production, replace this with the RDS CA bundle and rejectUnauthorized: true.
    ssl = { rejectUnauthorized: false };
  }
  return { connectionString, ssl, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 };
}

function toScan(row) {
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    hostname: row.hostname,
    lang: row.lang,
    status: row.status,
    stage: row.stage,
    error: row.error,
    verdict: row.verdict,
    score: row.score,
    trust: row.trust,
    health: row.health,
    explanations: row.explanations || {},
    screenshot: row.screenshot,
    flags: row.flags || {},
    userId: row.user_id || null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function toUser(row) {
  return { id: row.id, email: row.email, name: row.name, passwordHash: row.password_hash, createdAt: row.created_at };
}

export class PgStore {
  constructor() {
    this.kind = 'postgres';
    this.pool = new pg.Pool(poolConfig());
    this.pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  }

  async init() {
    await this.pool.query(SCHEMA);
  }

  async ping() {
    await this.pool.query('SELECT 1');
  }

  async close() {
    await this.pool.end();
  }

  async create({ id, url, hostname, lang, flags = {}, userId = null }) {
    const { rows } = await this.pool.query(
      `INSERT INTO scans (id, url, hostname, lang, status, stage, flags, user_id)
       VALUES ($1, $2, $3, $4, 'pending', 'queued', $5::jsonb, $6) RETURNING *`,
      [id, url, hostname, lang, JSON.stringify(flags), userId],
    );
    return toScan(rows[0]);
  }

  async get(id) {
    const { rows } = await this.pool.query('SELECT * FROM scans WHERE id = $1', [id]);
    return toScan(rows[0]);
  }

  async update(id, patch) {
    const sets = [];
    const values = [id];
    for (const [key, value] of Object.entries(patch)) {
      const column = COLUMNS[key];
      if (!column) continue;
      const isJson = JSON_FIELDS.has(key);
      values.push(isJson ? (value == null ? null : JSON.stringify(value)) : value);
      sets.push(`${column} = $${values.length}${isJson ? '::jsonb' : ''}`);
    }
    if (!sets.length) return this.get(id);
    const { rows } = await this.pool.query(
      `UPDATE scans SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      values,
    );
    return toScan(rows[0]);
  }

  /** Adds one language to the explanations object without touching the others. */
  async setExplanation(id, lang, value) {
    await this.pool.query(
      `UPDATE scans SET explanations = explanations || jsonb_build_object($2::text, $3::jsonb) WHERE id = $1`,
      [id, lang, JSON.stringify(value)],
    );
  }

  /** Atomically takes the oldest pending scan. Safe with several app instances. */
  async claimNext() {
    const { rows } = await this.pool.query(
      `UPDATE scans SET status = 'running', stage = 'trust', started_at = now()
       WHERE id = (
         SELECT id FROM scans WHERE status = 'pending'
         ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
       ) RETURNING *`,
    );
    return toScan(rows[0]);
  }

  /** Scans stuck in "running" (for example after a crash) are marked failed. */
  async failStale(olderThanMs) {
    await this.pool.query(
      `UPDATE scans SET status = 'failed', error = 'The scan was interrupted. Please try again.', finished_at = now()
       WHERE status = 'running' AND started_at < now() - ($1::bigint * interval '1 millisecond')`,
      [olderThanMs],
    );
  }

  async findRecentByUrl(url, minutes) {
    const { rows } = await this.pool.query(
      `SELECT * FROM scans
       WHERE url = $1 AND status IN ('pending', 'running', 'done')
         AND created_at > now() - ($2::int * interval '1 minute')
       ORDER BY created_at DESC LIMIT 1`,
      [url, minutes],
    );
    return toScan(rows[0]);
  }

  /** All scans created from one SMS check, oldest first. */
  async findBySmsGroup(group) {
    const { rows } = await this.pool.query(
      `SELECT * FROM scans WHERE flags->>'smsGroup' = $1 ORDER BY created_at, id`,
      [group],
    );
    return rows.map(toScan);
  }

  async createUser({ id, email, name, passwordHash }) {
    const { rows } = await this.pool.query(
      `INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING RETURNING *`,
      [id, email, name || '', passwordHash],
    );
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findUserByEmail(email) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  async findUserById(id) {
    const { rows } = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  /** The user's own scans, newest first. */
  async listByUser(userId, limit = 100) {
    const { rows } = await this.pool.query(
      'SELECT * FROM scans WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit],
    );
    return rows.map(toScan);
  }

  async queueStats() {
    const { rows } = await this.pool.query(
      `SELECT status, count(*)::int AS n FROM scans WHERE status IN ('pending', 'running') GROUP BY status`,
    );
    const out = { pending: 0, running: 0 };
    for (const r of rows) out[r.status] = r.n;
    return out;
  }

  async stats() {
    const { rows } = await this.pool.query(
      `SELECT verdict, count(*)::int AS n FROM scans WHERE status = 'done' GROUP BY verdict`,
    );
    const byVerdict = { safe: 0, careful: 0, likely_fake: 0 };
    let total = 0;
    for (const row of rows) {
      if (row.verdict in byVerdict) byVerdict[row.verdict] = row.n;
      total += row.n;
    }
    return { total, byVerdict };
  }

  async recentLikelyFake(limit = 10) {
    const { rows } = await this.pool.query(
      `SELECT hostname, score, finished_at FROM (
         SELECT DISTINCT ON (hostname) hostname, score, finished_at
         FROM scans WHERE status = 'done' AND verdict = 'likely_fake'
         ORDER BY hostname, finished_at DESC
       ) t ORDER BY finished_at DESC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({ hostname: r.hostname, score: r.score, finishedAt: r.finished_at }));
  }
}
