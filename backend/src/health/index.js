import { ChromeNotFoundError } from './browser.js';
import { analyzeHeaders } from './headers.js';
import { runLighthouse } from './lighthouse.js';
import { runPageChecks } from './pageChecks.js';

function friendly(err) {
  if (err instanceof ChromeNotFoundError) return err.message;
  const message = String(err?.message || err || 'Unknown error');
  if (/executable doesn't exist|ENOENT|Could not find Chrome/i.test(message)) {
    return 'Chrome was not found. Install Google Chrome, or set CHROME_PATH in backend/.env.';
  }
  if (/net::ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|NO_FCP|FAILED_DOCUMENT_REQUEST/i.test(message)) {
    return 'The browser could not load this page.';
  }
  return message.split('\n')[0].slice(0, 200);
}

/** Health Report: Lighthouse, accessibility scan, broken links, security headers. */
export async function runHealthChecks({ finalUrl, fetched, signal }) {
  const result = { lighthouse: null, axe: null, links: null, headers: null, healthScore: null, errors: {} };
  let screenshot = null;

  if (fetched?.headers) result.headers = analyzeHeaders(fetched.headers, new URL(finalUrl).protocol);

  try {
    result.lighthouse = await runLighthouse(finalUrl, { signal });
  } catch (err) {
    result.errors.lighthouse = friendly(err);
  }

  if (signal?.aborted) {
    result.errors.timeout = 'The health checks took too long and were stopped.';
  } else {
    try {
      const checks = await runPageChecks(finalUrl, { signal });
      result.axe = checks.axe;
      result.links = checks.links;
      screenshot = checks.screenshot;
      for (const [key, value] of Object.entries(checks.errors)) result.errors[key] = friendly(value);
    } catch (err) {
      result.errors.pageChecks = signal?.aborted
        ? 'The health checks took too long and were stopped.'
        : friendly(err);
    }
  }

  const linksScore =
    result.links && result.links.checked > 0
      ? Math.round(100 * (1 - result.links.broken.length / result.links.checked))
      : null;
  const parts = [
    result.lighthouse?.performance,
    result.lighthouse?.accessibility,
    result.lighthouse?.bestPractices,
    result.headers?.score,
    linksScore,
  ].filter((n) => typeof n === 'number');
  result.healthScore = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : null;
  result.linksScore = linksScore;

  return { health: result, screenshot };
}
