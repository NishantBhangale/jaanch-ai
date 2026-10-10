import { config } from '../config.js';

const ENDPOINT = 'https://safebrowsing.googleapis.com/v4/threatMatches:find';

/** Google Safe Browsing lookup. Returns status: skipped | clean | flagged | error. */
export async function checkSafeBrowsing(url) {
  if (!config.safeBrowsingKey) return { status: 'skipped' };
  try {
    const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(config.safeBrowsingKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        client: { clientId: 'jaanch-ai', clientVersion: '0.1.0' },
        threatInfo: {
          threatTypes: ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE', 'POTENTIALLY_HARMFUL_APPLICATION'],
          platformTypes: ['ANY_PLATFORM'],
          threatEntryTypes: ['URL'],
          threatEntries: [{ url }],
        },
      }),
    });
    if (!res.ok) return { status: 'error', reason: `http_${res.status}` };
    const data = await res.json();
    const threats = [...new Set((data.matches || []).map((m) => m.threatType))];
    return threats.length ? { status: 'flagged', threats } : { status: 'clean' };
  } catch (err) {
    return { status: 'error', reason: err?.name === 'TimeoutError' ? 'timeout' : 'request_failed' };
  }
}
