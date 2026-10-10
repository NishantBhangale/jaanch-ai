import AxeBuilder from '@axe-core/playwright';
import { chromium } from 'playwright-core';
import { config } from '../config.js';
import { probeUrl } from '../security/safeFetch.js';
import { resolvePublicHost } from '../security/ssrf.js';
import { ChromeNotFoundError, resolveChromePath } from './browser.js';

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function summarizeAxe(results) {
  const counts = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const issues = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact || 'minor',
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.length,
  }));
  for (const issue of issues) counts[issue.impact] = (counts[issue.impact] || 0) + 1;
  issues.sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] || b.nodes - a.nodes);
  return { violationCount: issues.length, counts, passes: results.passes.length, issues: issues.slice(0, 8) };
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function checkLinks(hrefs, pageUrl, { maxLinks, signal }) {
  const origin = new URL(pageUrl).origin;
  const unique = [...new Set(hrefs.filter((h) => /^https?:/i.test(h)).map((h) => h.split('#')[0]))].filter(
    (h) => h !== pageUrl,
  );
  const sameOrigin = unique.filter((h) => new URL(h).origin === origin);
  const others = unique.filter((h) => new URL(h).origin !== origin);
  const picked = [...sameOrigin, ...others].slice(0, maxLinks);

  const results = await mapLimit(picked, 5, (link) => probeUrl(link, { signal }));
  const restricted = new Set([401, 403, 429, 999]);
  const broken = results
    .filter((r) => r.error || (r.status >= 400 && !restricted.has(r.status)))
    .map((r) => ({ url: r.url, status: r.status ?? null, error: r.error ?? null }));
  const blocked = results.filter((r) => restricted.has(r.status)).length;
  return { found: unique.length, checked: picked.length, broken, blocked };
}

/**
 * One Playwright session: mobile screenshot, axe-core accessibility scan, broken-link check.
 * Every request the page makes is checked against the SSRF rules before it is sent.
 */
export async function runPageChecks(url, { signal } = {}) {
  const executablePath = await resolveChromePath();
  if (!executablePath) throw new ChromeNotFoundError();

  const args = ['--disable-dev-shm-usage'];
  if (config.chromeNoSandbox) args.push('--no-sandbox');
  const browser = await chromium.launch({ executablePath, headless: true, args });
  const close = () => browser.close().catch(() => {});
  signal?.addEventListener('abort', close, { once: true });

  const out = { axe: null, links: null, screenshot: null, errors: {} };
  const hostCache = new Map();
  const hostAllowed = async (host) => {
    if (!hostCache.has(host)) {
      hostCache.set(
        host,
        resolvePublicHost(host).then(
          () => true,
          () => false,
        ),
      );
    }
    return hostCache.get(host);
  };

  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      ignoreHTTPSErrors: true,
      userAgent: MOBILE_UA,
      locale: 'en-IN',
    });
    await context.route('**/*', async (route) => {
      const requestUrl = route.request().url();
      if (!/^https?:/i.test(requestUrl)) return route.continue();
      return (await hostAllowed(new URL(requestUrl).hostname)) ? route.continue() : route.abort('blockedbyclient');
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(1500);

    try {
      out.screenshot = await page.screenshot({ type: 'jpeg', quality: 60 });
    } catch (err) {
      out.errors.screenshot = err.message;
    }
    try {
      out.axe = summarizeAxe(await new AxeBuilder({ page }).analyze());
    } catch (err) {
      out.errors.axe = err.message;
    }
    try {
      const hrefs = await page.$$eval('a[href]', (anchors) => anchors.map((a) => a.href));
      out.links = await checkLinks(hrefs, page.url(), { maxLinks: config.maxLinksToCheck, signal });
    } catch (err) {
      out.errors.links = err.message;
    }
  } finally {
    signal?.removeEventListener('abort', close);
    await close();
  }
  return out;
}
