// In-memory store with the same interface as PgStore. Handy for trying the app without
// a database. Everything is lost when the server stops.
export class MemoryStore {
  constructor() {
    this.kind = 'memory';
    this.scans = new Map();
    this.users = new Map();
  }

  async init() {}

  async ping() {}

  async close() {}

  async create({ id, url, hostname, lang, flags = {}, userId = null }) {
    const scan = {
      id,
      url,
      hostname,
      lang,
      status: 'pending',
      stage: 'queued',
      error: null,
      verdict: null,
      score: null,
      trust: null,
      health: null,
      explanations: {},
      screenshot: null,
      flags,
      userId,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
    };
    this.scans.set(id, scan);
    return structuredClone(scan);
  }

  async get(id) {
    const scan = this.scans.get(id);
    return scan ? structuredClone(scan) : null;
  }

  async update(id, patch) {
    const scan = this.scans.get(id);
    if (!scan) return null;
    Object.assign(scan, patch);
    return structuredClone(scan);
  }

  async setExplanation(id, lang, value) {
    const scan = this.scans.get(id);
    if (scan) scan.explanations = { ...scan.explanations, [lang]: value };
  }

  async claimNext() {
    const pending = [...this.scans.values()]
      .filter((s) => s.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!pending) return null;
    pending.status = 'running';
    pending.stage = 'trust';
    pending.startedAt = new Date();
    return structuredClone(pending);
  }

  async failStale(olderThanMs) {
    const cutoff = Date.now() - olderThanMs;
    for (const scan of this.scans.values()) {
      if (scan.status === 'running' && scan.startedAt && scan.startedAt.getTime() < cutoff) {
        scan.status = 'failed';
        scan.error = 'The scan was interrupted. Please try again.';
        scan.finishedAt = new Date();
      }
    }
  }

  async findRecentByUrl(url, minutes) {
    const cutoff = Date.now() - minutes * 60_000;
    const match = [...this.scans.values()]
      .filter((s) => s.url === url && ['pending', 'running', 'done'].includes(s.status) && s.createdAt.getTime() > cutoff)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    return match ? structuredClone(match) : null;
  }

  async findBySmsGroup(group) {
    return [...this.scans.values()]
      .filter((s) => s.flags?.smsGroup === group)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s) => structuredClone(s));
  }

  async createUser({ id, email, name, passwordHash }) {
    for (const u of this.users.values()) if (u.email === email) return null;
    const user = { id, email, name: name || '', passwordHash, createdAt: new Date() };
    this.users.set(id, user);
    return { ...user };
  }

  async findUserByEmail(email) {
    return [...this.users.values()].find((u) => u.email === email) || null;
  }

  async findUserById(id) {
    return this.users.get(id) || null;
  }

  /** The user's own scans, newest first. */
  async listByUser(userId, limit = 100) {
    return [...this.scans.values()]
      .filter((s) => s.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
      .map((s) => structuredClone(s));
  }

  async queueStats() {
    let pending = 0;
    let running = 0;
    for (const s of this.scans.values()) {
      if (s.status === 'pending') pending += 1;
      if (s.status === 'running') running += 1;
    }
    return { pending, running };
  }

  async stats() {
    const byVerdict = { safe: 0, careful: 0, likely_fake: 0 };
    let total = 0;
    for (const scan of this.scans.values()) {
      if (scan.status !== 'done') continue;
      total += 1;
      if (scan.verdict in byVerdict) byVerdict[scan.verdict] += 1;
    }
    return { total, byVerdict };
  }

  async recentLikelyFake(limit = 10) {
    const seen = new Set();
    return [...this.scans.values()]
      .filter((s) => s.status === 'done' && s.verdict === 'likely_fake')
      .sort((a, b) => b.finishedAt - a.finishedAt)
      .filter((s) => (seen.has(s.hostname) ? false : seen.add(s.hostname)))
      .slice(0, limit)
      .map((s) => ({ hostname: s.hostname, score: s.score, finishedAt: s.finishedAt }));
  }
}
