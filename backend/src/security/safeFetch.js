import dns from 'node:dns';
import { Agent, fetch as undiciFetch } from 'undici';
import { assertSafeUrl, checkAddresses } from './ssrf.js';

const USER_AGENT = 'Mozilla/5.0 (compatible; JaanchBot/0.1; website trust and health checker)';

// The DNS lookup used for the actual connection is checked again, so a site cannot pass
// the first check and then switch its DNS answer to an internal address (DNS rebinding).
function lookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    try {
      checkAddresses(addresses);
    } catch (e) {
      return callback(e);
    }
    if (options && options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

const agent = new Agent({ connect: { timeout: 8000, lookup } });
// Used only to still read a page whose certificate is broken (the Trust Check reports the problem).
const insecureAgent = new Agent({ connect: { timeout: 8000, lookup, rejectUnauthorized: false } });

async function readLimited(res, maxBytes) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    total += value.length;
    if (total >= maxBytes) {
      await reader.cancel().catch(() => {});
      break;
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Fetches a public web page. Every redirect hop is validated against the SSRF rules,
 * the body is size-limited, and the request is time-limited.
 */
export async function safeFetch(
  startUrl,
  {
    method = 'GET',
    timeoutMs = 12000,
    maxBytes = 1_500_000,
    maxRedirects = 5,
    headers = {},
    readBody = true,
    allowInvalidCert = false,
    signal,
  } = {},
) {
  let current = startUrl;
  const redirects = [];

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const { parsed } = await assertSafeUrl(current);
    current = parsed.url;

    const timeout = AbortSignal.timeout(timeoutMs);
    const res = await undiciFetch(current, {
      method,
      redirect: 'manual',
      dispatcher: allowInvalidCert ? insecureAgent : agent,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
        'accept-language': 'en-IN,en;q=0.9,hi;q=0.8',
        ...headers,
      },
    });

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel().catch(() => {});
      redirects.push(current);
      current = new URL(location, current).href;
      continue;
    }

    let body = null;
    if (readBody && method !== 'HEAD') body = await readLimited(res, maxBytes);
    else await res.body?.cancel().catch(() => {});

    return {
      url: current,
      status: res.status,
      headers: res.headers,
      contentType: res.headers.get('content-type') || '',
      body,
      redirects,
    };
  }
  throw new Error('Too many redirects');
}

/** Light check used for the broken-link report: HEAD first, then GET if HEAD is refused. */
export async function probeUrl(url, { timeoutMs = 6000, signal } = {}) {
  try {
    let res = await safeFetch(url, { method: 'HEAD', timeoutMs, readBody: false, signal });
    if (res.status >= 400) {
      res = await safeFetch(url, { method: 'GET', timeoutMs, readBody: false, signal });
    }
    return { url, status: res.status };
  } catch (err) {
    return { url, error: err?.cause?.code || err?.code || err?.name || 'ERROR' };
  }
}
