import { parse } from 'tldts';
import { config } from '../config.js';

const DAY = 86_400_000;
const cache = new Map();

// Registry RDAP servers for the most common endings. Used when the official IANA list
// (https://data.iana.org/rdap/dns.json) cannot be downloaded, so lookups still work.
const BUILTIN_SERVERS = {
  in: 'https://rdap.nixiregistry.in/rdap/',
  com: 'https://rdap.verisign.com/com/v1/',
  net: 'https://rdap.verisign.com/net/v1/',
  org: 'https://rdap.publicinterestregistry.org/rdap/',
};

let bootstrap = { at: 0, map: null };

/** "login.sbi-online.co.in" -> "sbi-online.co.in" (null for IP addresses). */
export function getRegistrableDomain(hostname) {
  const parsed = parse(hostname);
  if (parsed.isIp) return null;
  return parsed.domain || null;
}

/** "sbi-online.co.in" -> "sbi-online" */
export function getDomainLabel(hostname) {
  return parse(hostname).domainWithoutSuffix || null;
}

async function getJson(url, timeoutMs = 8000) {
  const res = await fetch(url, {
    headers: { accept: 'application/rdap+json, application/json', 'user-agent': 'JaanchBot/0.1' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: res.status, ok: res.ok, data: res.ok ? await res.json() : null };
}

/** Maps an ending ("in", "com", ...) to its registry RDAP server, from the IANA list (cached a day). */
async function loadBootstrap() {
  if (bootstrap.map && Date.now() - bootstrap.at < 24 * 3600_000) return bootstrap.map;
  try {
    const { ok, data } = await getJson(config.rdapBootstrapUrl, 6000);
    if (ok && Array.isArray(data?.services)) {
      const map = new Map();
      for (const [tlds, urls] of data.services) {
        const server = urls.find((u) => u.startsWith('https://')) || urls[0];
        for (const tld of tlds) map.set(tld.toLowerCase(), server);
      }
      bootstrap = { at: Date.now(), map };
      return map;
    }
  } catch {
    // fall through to the built-in list
  }
  if (!bootstrap.map) bootstrap = { at: Date.now() - 23 * 3600_000, map: new Map() }; // retry in an hour
  return bootstrap.map;
}

function serverFor(map, domain) {
  const tld = domain.split('.').pop().toLowerCase();
  const server = map.get(tld) || BUILTIN_SERVERS[tld] || null;
  return server ? (server.endsWith('/') ? server : `${server}/`) : null;
}

function readRegistration(data) {
  const event = (data?.events || []).find((e) => String(e.eventAction).toLowerCase() === 'registration');
  const date = event?.eventDate ? new Date(event.eventDate) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** Tries each RDAP address in order and returns the first answer that has a registration date. */
async function queryRdap(domain) {
  const urls = [];
  const server = serverFor(await loadBootstrap(), domain);
  if (server) urls.push(`${server}domain/${encodeURIComponent(domain)}`);
  if (config.rdapBase) urls.push(`${config.rdapBase}${encodeURIComponent(domain)}`); // rdap.org as a fallback
  if (urls.length === 0) return { reason: 'no_rdap_server' };

  let reason = 'lookup_failed';
  for (const url of urls) {
    try {
      const { status, ok, data } = await getJson(url);
      if (ok) {
        const registeredAt = readRegistration(data);
        if (registeredAt) return { registeredAt };
        reason = 'no_registration_date';
      } else if (status === 404) {
        reason = 'not_found';
        break; // the registry itself says there is no such domain
      } else if (status === 429) {
        reason = 'rate_limited';
      } else {
        reason = `http_${status}`;
      }
    } catch (err) {
      reason = err?.name === 'TimeoutError' ? 'timeout' : 'lookup_failed';
    }
  }
  return { reason };
}

/**
 * Looks up the registration date through RDAP (the modern WHOIS), straight from the registry
 * of the domain's ending. Some registries do not publish it, so "unavailable" is a normal
 * outcome and is reported as "unknown", not as bad.
 */
export async function lookupDomainAge(hostname) {
  const domain = getRegistrableDomain(hostname);
  if (!domain) return { available: false, reason: 'not_a_domain' };

  const hit = cache.get(domain);
  if (hit && Date.now() < hit.expires) return hit.value;

  const result = await queryRdap(domain);
  const value = result.registeredAt
    ? {
        available: true,
        domain,
        registeredAt: result.registeredAt.toISOString(),
        ageDays: Math.max(0, Math.floor((Date.now() - result.registeredAt.getTime()) / DAY)),
      }
    : { available: false, domain, reason: result.reason };

  cache.set(domain, { value, expires: Date.now() + (value.available ? 6 * 3600_000 : 5 * 60_000) });
  return value;
}

/** For tests: forget cached answers. */
export function resetDomainAgeCache() {
  cache.clear();
  bootstrap = { at: 0, map: null };
}
