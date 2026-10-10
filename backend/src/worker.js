import { config } from './config.js';
import { runHealthChecks } from './health/index.js';
import { explainScan } from './llm/index.js';
import { safeFetch } from './security/safeFetch.js';
import { assertSafeUrl } from './security/ssrf.js';
import { saveReportJson, saveScreenshot } from './storage/index.js';
import { reviewTrust } from './trust/aiReview.js';
import { runTrustChecks } from './trust/index.js';

const CERT_ERRORS = new Set([
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_NOT_YET_VALID',
]);

function describeFetchError(err) {
  const code = err?.cause?.code || err?.code;
  if (err?.name === 'UnsafeTargetError') return 'The address redirects to a private or internal network, so it was not opened.';
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'The site took too long to respond.';
  if (code === 'ENOTFOUND' || err?.name === 'UnresolvedHostError') return 'The domain name does not exist.';
  if (code === 'ECONNREFUSED') return 'The site refused the connection.';
  if (CERT_ERRORS.has(code)) return 'The security certificate could not be verified.';
  return 'The page could not be opened.';
}

function friendlyError(err) {
  if (err?.name === 'InvalidUrlError' || err?.name === 'UnsafeTargetError') return err.message;
  return 'Something went wrong while checking this site. Please try again.';
}

async function fetchPage(url) {
  try {
    return { fetched: await safeFetch(url), fetchError: null };
  } catch (err) {
    const code = err?.cause?.code || err?.code;
    if (CERT_ERRORS.has(code)) {
      // The certificate problem is reported by the Trust Check; still look at the page itself.
      try {
        return { fetched: await safeFetch(url, { allowInvalidCert: true }), fetchError: null };
      } catch (retryErr) {
        return { fetched: null, fetchError: describeFetchError(retryErr) };
      }
    }
    return { fetched: null, fetchError: describeFetchError(err) };
  }
}

async function processScan(store, scan) {
  const log = (message) => console.log(`[scan ${scan.id}] ${message}`);
  try {
    const { parsed } = await assertSafeUrl(scan.url, { allowUnresolved: true });
    parsed.hadCredentials = Boolean(scan.flags?.hadCredentials);

    log(`checking ${parsed.hostname}`);
    const { fetched, fetchError } = await fetchPage(parsed.url);

    const rulesTrust = await runTrustChecks({ parsed, fetched, fetchError });
    // The rules decide first and are saved at once. The AI can only add caution afterwards.
    await store.update(scan.id, { trust: rulesTrust, verdict: rulesTrust.verdict, score: rulesTrust.score, stage: 'ai' });
    const trust = await reviewTrust(rulesTrust, { fetched, parsed });
    await store.update(scan.id, { trust, verdict: trust.verdict, score: trust.score, stage: 'health' });
    log(`trust: ${trust.verdict} (${trust.score}), ai review: ${trust.aiReview?.status}`);

    let health;
    let screenshot = null;
    if (!fetched) {
      health = {
        lighthouse: null, axe: null, links: null, headers: null, healthScore: null, linksScore: null,
        errors: { page: 'The page could not be opened, so the health checks were skipped.' },
      };
    } else {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.scanTimeoutMs);
      try {
        const out = await runHealthChecks({ finalUrl: trust.finalUrl, fetched, signal: controller.signal });
        health = out.health;
        if (out.screenshot) {
          try {
            screenshot = await saveScreenshot(scan.id, out.screenshot);
          } catch (err) {
            log(`could not save screenshot: ${err.message}`);
          }
        }
      } finally {
        clearTimeout(timer);
      }
    }
    await store.update(scan.id, { health, screenshot, stage: 'explain' });
    log(`health score: ${health.healthScore ?? 'n/a'}`);

    const lang = scan.lang === 'hi' ? 'hi' : 'en';
    const current = await store.get(scan.id);
    await store.setExplanation(scan.id, lang, await explainScan(current, lang));

    const finished = await store.update(scan.id, { status: 'done', stage: null, finishedAt: new Date() });
    saveReportJson(scan.id, finished).catch((err) => log(`could not save report JSON: ${err.message}`));
    log('done');
  } catch (err) {
    console.error(`[scan ${scan.id}] failed:`, err);
    await store
      .update(scan.id, { status: 'failed', stage: null, error: friendlyError(err), finishedAt: new Date() })
      .catch(() => {});
  }
}

/** Polls the store for pending scans. Runs inside the API process. */
export function startWorker(store) {
  let active = 0;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      while (active < config.maxConcurrentScans) {
        const scan = await store.claimNext();
        if (!scan) break;
        active += 1;
        processScan(store, scan).finally(() => {
          active -= 1;
        });
      }
    } catch (err) {
      console.error('[worker] could not read the queue:', err.message);
    }
  };

  // A scan stuck in "running" (for example after a crash) is marked failed after this long.
  const staleAfterMs = config.scanTimeoutMs + config.llmTimeoutMs + 120_000;
  const sweep = () => store.failStale(staleAfterMs).catch(() => {});
  sweep();

  const pollTimer = setInterval(tick, config.workerPollMs);
  const sweepTimer = setInterval(sweep, 5 * 60_000);
  tick();

  return {
    kick: tick,
    async stop() {
      stopped = true;
      clearInterval(pollTimer);
      clearInterval(sweepTimer);
    },
  };
}
