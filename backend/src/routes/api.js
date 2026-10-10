import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { clearSessionCookie, hashPassword, publicUser, setSessionCookie, validateSignup, verifyPassword } from '../auth/auth.js';
import { explainScan } from '../llm/index.js';
import { aiStatus } from '../llm/status.js';
import { buildScanPdf, buildSmsPdf } from '../report/pdf.js';
import { analyzeMessage, evaluateMessage, MAX_SMS_LENGTH } from '../sms/analyze.js';
import { assertSafeUrl } from '../security/ssrf.js';
import { screenshotBuffer, screenshotUrl } from '../storage/index.js';

const LANGS = new Set(['en', 'hi']);
const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

async function presentScan(scan) {
  return {
    id: scan.id,
    url: scan.url,
    hostname: scan.hostname,
    status: scan.status,
    stage: scan.stage,
    error: scan.error,
    verdict: scan.verdict,
    score: scan.score,
    trust: scan.trust,
    health: scan.health,
    explanations: scan.explanations || {},
    screenshotUrl: await screenshotUrl(scan.screenshot).catch(() => null),
    createdAt: scan.createdAt,
    finishedAt: scan.finishedAt,
  };
}

export function createApiRouter({ store, worker }) {
  const router = Router();
  const generating = new Set();

  const createLimiter = rateLimit({
    windowMs: config.rateLimitWindowMin * 60_000,
    limit: config.rateLimitMax,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many checks from your network. Please wait a few minutes and try again.' },
  });

  // Start a scan
  router.post('/scans', createLimiter, async (req, res, next) => {
    try {
      const lang = LANGS.has(req.body?.lang) ? req.body.lang : 'en';
      let parsed;
      try {
        ({ parsed } = await assertSafeUrl(req.body?.url, { allowUnresolved: true }));
      } catch (err) {
        if (err.name === 'InvalidUrlError' || err.name === 'UnsafeTargetError') {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }

      if (!parsed.hadCredentials) {
        const existing = await store.findRecentByUrl(parsed.url, config.scanCacheMinutes);
        // A logged-in person only reuses a recent result if it is already in their own history.
        if (existing && (!req.user || existing.userId === req.user.id)) {
          return res.json({ id: existing.id, status: existing.status, cached: true });
        }
      }

      const id = crypto.randomBytes(8).toString('base64url');
      await store.create({
        id,
        url: parsed.url,
        hostname: parsed.hostname,
        lang,
        flags: parsed.hadCredentials ? { hadCredentials: true } : {},
        userId: req.user?.id || null,
      });
      worker?.kick();
      return res.status(202).json({ id, status: 'pending' });
    } catch (err) {
      return next(err);
    }
  });

  // Check an SMS: find the links in it, read the wording, and scan every link like a normal check.
  router.post('/sms', createLimiter, async (req, res, next) => {
    try {
      const lang = LANGS.has(req.body?.lang) ? req.body.lang : 'en';
      const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
      if (!text) return res.status(400).json({ error: 'Please paste the message you received' });
      if (text.length > MAX_SMS_LENGTH) {
        return res.status(400).json({ error: `Please paste a shorter message (up to ${MAX_SMS_LENGTH} characters)` });
      }

      const { links, signals, reassuring, mentionedBrands } = analyzeMessage(text);
      const group = crypto.randomBytes(8).toString('base64url');
      const created = [];
      const skipped = [];

      for (const link of links) {
        try {
          const { parsed } = await assertSafeUrl(link, { allowUnresolved: true });
          const id = crypto.randomBytes(8).toString('base64url');
          // A fresh scan per link (no cache), so every scan belongs to this message.
          await store.create({
            id,
            url: parsed.url,
            hostname: parsed.hostname,
            lang,
            userId: req.user?.id || null,
            flags: {
              smsGroup: group,
              sms: { signals, reassuring, mentionedBrands },
              ...(parsed.hadCredentials ? { hadCredentials: true } : {}),
            },
          });
          created.push({ id, url: parsed.url });
        } catch (err) {
          if (err.name === 'InvalidUrlError' || err.name === 'UnsafeTargetError') {
            skipped.push({ url: link, reason: err.message });
          } else {
            throw err;
          }
        }
      }
      if (created.length) worker?.kick();

      const overall = evaluateMessage({ signals, scans: [] });
      return res.status(created.length ? 202 : 200).json({
        group: created.length ? group : null,
        links: created,
        skipped,
        signals,
        reassuring,
        mentionedBrands,
        // Only meaningful when there are no links to wait for.
        overall: created.length ? { status: 'running', verdict: null, score: null } : overall,
      });
    } catch (err) {
      return next(err);
    }
  });

  // Read an SMS result (the page polls this while its links are being scanned)
  router.get('/sms/:group', async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.group)) return res.status(404).json({ error: 'Report not found' });
      const scans = await store.findBySmsGroup(req.params.group);
      if (scans.length === 0) return res.status(404).json({ error: 'Report not found' });
      const { signals = [], reassuring = false, mentionedBrands = [] } = scans[0].flags?.sms || {};
      res.set('Cache-Control', 'no-store');
      return res.json({
        group: req.params.group,
        signals,
        reassuring,
        mentionedBrands,
        overall: evaluateMessage({ signals, scans }),
        links: await Promise.all(scans.map(presentScan)),
      });
    } catch (err) {
      return next(err);
    }
  });

  // Read a scan (the page polls this while the scan runs)
  router.get('/scans/:id', async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'Report not found' });
      const scan = await store.get(req.params.id);
      if (!scan) return res.status(404).json({ error: 'Report not found' });
      res.set('Cache-Control', 'no-store');
      return res.json(await presentScan(scan));
    } catch (err) {
      return next(err);
    }
  });

  // Ask for the explanation in another language (generated once, then kept)
  router.post('/scans/:id/explain', async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'Report not found' });
      const scan = await store.get(req.params.id);
      if (!scan) return res.status(404).json({ error: 'Report not found' });
      if (scan.status !== 'done') return res.status(409).json({ error: 'The check is not finished yet' });

      const lang = LANGS.has(req.body?.lang) ? req.body.lang : 'en';
      if (scan.explanations?.[lang]) return res.json({ status: 'ready' });

      const key = `${scan.id}:${lang}`;
      if (!generating.has(key)) {
        generating.add(key);
        explainScan(scan, lang)
          .then((explanation) => store.setExplanation(scan.id, lang, explanation))
          .catch((err) => console.error('[explain] failed:', err.message))
          .finally(() => generating.delete(key));
      }
      return res.status(202).json({ status: 'pending' });
    } catch (err) {
      return next(err);
    }
  });

  // ---- Optional accounts ----
  const authLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  });

  router.get('/auth/me', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: publicUser(req.user) });
  });

  router.post('/auth/signup', authLimiter, async (req, res, next) => {
    try {
      const input = validateSignup(req.body || {});
      if (input.error) return res.status(400).json({ error: input.error });
      const user = await store.createUser({
        id: crypto.randomBytes(9).toString('base64url'),
        email: input.email,
        name: input.name,
        passwordHash: hashPassword(input.password),
      });
      if (!user) return res.status(409).json({ error: 'An account with this e-mail already exists. Please log in.' });
      setSessionCookie(res, user.id);
      return res.status(201).json({ user: publicUser(user) });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/auth/login', authLimiter, async (req, res, next) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const user = email ? await store.findUserByEmail(email) : null;
      // Same message and similar work for "no such user" and "wrong password".
      const ok = user ? verifyPassword(req.body?.password, user.passwordHash) : (verifyPassword('x', 'scrypt$00$00'), false);
      if (!ok) return res.status(401).json({ error: 'E-mail or password is not correct' });
      setSessionCookie(res, user.id);
      return res.json({ user: publicUser(user) });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/auth/logout', (req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // The logged-in person's own checks. An SMS with several links shows as one entry.
  router.get('/me/history', async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Please log in to see your history' });
      const scans = await store.listByUser(req.user.id, 200);
      const items = [];
      const seenGroups = new Map();
      for (const scan of scans) {
        const group = scan.flags?.smsGroup;
        if (group) {
          let entry = seenGroups.get(group);
          if (!entry) {
            entry = { type: 'sms', group, createdAt: scan.createdAt, links: [] };
            seenGroups.set(group, entry);
            items.push(entry);
          }
          entry.links.push({ hostname: scan.hostname, verdict: scan.verdict, score: scan.score, status: scan.status });
          continue;
        }
        items.push({
          type: 'link',
          id: scan.id,
          url: scan.url,
          hostname: scan.hostname,
          status: scan.status,
          verdict: scan.verdict,
          score: scan.score,
          createdAt: scan.createdAt,
        });
      }
      for (const entry of items) {
        if (entry.type !== 'sms') continue;
        const done = entry.links.filter((l) => l.status === 'done' && typeof l.score === 'number');
        const worst = done.sort((a, b) => a.score - b.score)[0];
        entry.verdict = worst?.verdict || null;
        entry.score = worst?.score ?? null;
        entry.hostname = entry.links.map((l) => l.hostname).join(', ');
      }
      res.set('Cache-Control', 'no-store');
      return res.json({ items });
    } catch (err) {
      return next(err);
    }
  });

  // ---- AI service status for the little indicator on the page ----
  router.get('/ai/status', async (req, res, next) => {
    try {
      const queue = await store.queueStats();
      res.set('Cache-Control', 'no-store');
      return res.json(await aiStatus(queue));
    } catch (err) {
      return next(err);
    }
  });

  // ---- PDF downloads ----
  const sendPdf = (res, doc, name) => {
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    });
    doc.pipe(res);
  };
  const safeName = (text) => String(text || 'report').replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';

  router.get('/scans/:id/pdf', async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.id)) return res.status(404).json({ error: 'Report not found' });
      const scan = await store.get(req.params.id);
      if (!scan) return res.status(404).json({ error: 'Report not found' });
      if (scan.status !== 'done') return res.status(409).json({ error: 'The check is not finished yet' });
      return sendPdf(res, buildScanPdf(scan, { screenshot: await screenshotBuffer(scan.screenshot) }), `jaanch-${safeName(scan.hostname)}.pdf`);
    } catch (err) {
      return next(err);
    }
  });

  router.get('/sms/:group/pdf', async (req, res, next) => {
    try {
      if (!ID_RE.test(req.params.group)) return res.status(404).json({ error: 'Report not found' });
      const scans = await store.findBySmsGroup(req.params.group);
      if (scans.length === 0) return res.status(404).json({ error: 'Report not found' });
      if (scans.some((s) => s.status === 'pending' || s.status === 'running')) {
        return res.status(409).json({ error: 'The check is not finished yet' });
      }
      const { signals = [], reassuring = false } = scans[0].flags?.sms || {};
      const screenshots = {};
      await Promise.all(scans.map(async (sc) => { screenshots[sc.id] = await screenshotBuffer(sc.screenshot); }));
      return sendPdf(res, buildSmsPdf({ overall: evaluateMessage({ signals, scans }), signals, reassuring, scans, screenshots }), `jaanch-sms-${safeName(req.params.group)}.pdf`);
    } catch (err) {
      return next(err);
    }
  });

  // Public dashboard numbers
  router.get('/dashboard', async (req, res, next) => {
    try {
      const [stats, recentLikelyFake] = await Promise.all([store.stats(), store.recentLikelyFake(10)]);
      res.set('Cache-Control', 'public, max-age=30');
      return res.json({ stats, recentLikelyFake });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
