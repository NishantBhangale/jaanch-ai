import { config } from '../config.js';

// OpenPhish community feed: a public list of live phishing URLs, downloaded and cached
// in memory. PhishTank can be added the same way (another loader that fills the sets).
const FEED_URL = 'https://openphish.com/feed.txt';

let cache = { at: 0, ok: false, urls: new Set(), hosts: new Set() };
let lastFailure = 0;
let inflight = null;

function normalize(raw) {
  try {
    const url = new URL(raw);
    url.hash = '';
    return url.href.replace(/\/$/, '').toLowerCase();
  } catch {
    return null;
  }
}

async function refresh() {
  const res = await fetch(FEED_URL, {
    headers: { 'user-agent': 'JaanchBot/0.1' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`feed_http_${res.status}`);
  const text = await res.text();
  const urls = new Set();
  const hosts = new Set();
  for (const line of text.split(/\r?\n/)) {
    const normalized = normalize(line.trim());
    if (!normalized) continue;
    urls.add(normalized);
    hosts.add(new URL(normalized).hostname);
  }
  cache = { at: Date.now(), ok: true, urls, hosts };
}

/** Returns status: skipped | clean | flagged | error, and matchType url | host when flagged. */
export async function checkPhishingFeed(url, hostname) {
  if (!config.openPhishEnabled) return { status: 'skipped' };

  const stale = Date.now() - cache.at > config.openPhishRefreshHours * 3600_000;
  if ((stale || !cache.ok) && Date.now() - lastFailure > 5 * 60_000) {
    try {
      inflight ||= refresh().finally(() => {
        inflight = null;
      });
      await inflight;
    } catch (err) {
      lastFailure = Date.now();
      if (!cache.ok) return { status: 'error', reason: err.message };
    }
  }
  if (!cache.ok) return { status: 'error', reason: 'feed_unavailable' };

  const normalized = normalize(url);
  if (normalized && cache.urls.has(normalized)) return { status: 'flagged', matchType: 'url' };
  if (cache.hosts.has(String(hostname).toLowerCase())) return { status: 'flagged', matchType: 'host' };
  return { status: 'clean' };
}
