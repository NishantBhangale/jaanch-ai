import { resolvePublicHost } from '../security/ssrf.js';
import { getRegistrableDomain, lookupDomainAge } from './domainAge.js';
import { checkPhishingFeed } from './feeds.js';
import { checkGovDomain } from './govDomain.js';
import { detectLookalike } from './lookalike.js';
import { analyzePage } from './pageSignals.js';
import { checkSafeBrowsing } from './safeBrowsing.js';
import { evaluateTrust } from './scoring.js';
import { checkTls } from './tls.js';

const settled = (result) => (result.status === 'fulfilled' ? result.value : null);

function mergeMatches(...lists) {
  const seen = new Set();
  return lists.flat().filter((m) => {
    const key = `${m.type}:${m.brand}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Runs every Trust Check in parallel and turns the signals into a verdict.
 * `fetched` is the result of safeFetch for the page (or null if the page could not be opened).
 */
export async function runTrustChecks({ parsed, fetched, fetchError }) {
  const finalUrl = fetched?.url || parsed.url;
  const finalHost = new URL(finalUrl).hostname.toLowerCase();

  let resolved = null;
  try {
    resolved = await resolvePublicHost(finalHost);
  } catch {
    resolved = null;
  }

  const [tlsResult, ageResult, sbResult, feedResult] = await Promise.allSettled([
    resolved ? checkTls({ hostname: finalHost, ip: resolved.ip }) : Promise.resolve(null),
    parsed.isIpHost ? Promise.resolve(null) : lookupDomainAge(finalHost),
    checkSafeBrowsing(finalUrl),
    checkPhishingFeed(finalUrl, finalHost),
  ]);

  const gov = {
    isGov: checkGovDomain(parsed.hostname).isGov && checkGovDomain(finalHost).isGov,
  };

  // A .gov.in / .nic.in name cannot be bought by outsiders, so lookalike matching is skipped for it.
  const lookInput = detectLookalike(parsed.hostname);
  const lookFinal = detectLookalike(finalHost);
  const lookalike = {
    isOfficial: lookFinal.isOfficial,
    brand: lookFinal.brand,
    matches: gov.isGov ? [] : mergeMatches(lookInput.matches, lookFinal.matches),
  };

  const inputDomain = getRegistrableDomain(parsed.hostname) || parsed.hostname;
  const finalDomain = getRegistrableDomain(finalHost) || finalHost;

  let page = null;
  if (fetched?.body && /html/i.test(fetched.contentType)) {
    try {
      page = analyzePage({ html: fetched.body, finalUrl });
    } catch {
      page = null;
    }
  }

  const evaluation = evaluateTrust({
    input: { hostname: parsed.hostname, hadCredentials: parsed.hadCredentials, isIpHost: parsed.isIpHost },
    final: {
      url: finalUrl,
      hostname: finalHost,
      protocol: new URL(finalUrl).protocol,
      redirectedToOtherDomain: inputDomain !== finalDomain,
      fetchError: fetchError || null,
    },
    tls: settled(tlsResult),
    age: settled(ageResult),
    gov,
    lookalike,
    safeBrowsing: settled(sbResult),
    feed: settled(feedResult),
    page,
  });

  const tls = settled(tlsResult);
  const age = settled(ageResult);
  return {
    ...evaluation,
    checkedAt: new Date().toISOString(),
    finalUrl,
    redirects: fetched?.redirects || [],
    pageTitle: page?.title || null,
    certificate: tls?.reachable
      ? { issuer: tls.issuer, validTo: tls.validTo, daysLeft: tls.daysLeft }
      : null,
    // Always present (when the address has a domain name) so the page can show the date,
    // or say why it is not available.
    domain: age?.domain
      ? age.available
        ? { name: age.domain, registeredAt: age.registeredAt, ageDays: age.ageDays, available: true }
        : { name: age.domain, available: false, reason: age.reason }
      : null,
  };
}
