import dns from 'node:dns/promises';
import net from 'node:net';
import ipaddr from 'ipaddr.js';
import { config } from '../config.js';

// SSRF protection: the scanner must never be tricked into opening internal addresses
// (localhost, private networks, cloud metadata at 169.254.169.254, and so on).

export class InvalidUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidUrlError';
  }
}

/** The name is well formed but does not exist (often a scam site that was taken down). */
export class UnresolvedHostError extends InvalidUrlError {
  constructor(message) {
    super(message);
    this.name = 'UnresolvedHostError';
  }
}

export class UnsafeTargetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UnsafeTargetError';
  }
}

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

export function stripBrackets(host) {
  return String(host).replace(/^\[|\]$/g, '');
}

function cleanHost(host) {
  return stripBrackets(host).toLowerCase().replace(/\.$/, '');
}

/** True only for ordinary public internet addresses. */
export function isPublicIp(ip) {
  if (!net.isIP(ip)) return false;
  let addr;
  try {
    addr = ipaddr.parse(ip);
  } catch {
    return false;
  }
  if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) addr = addr.toIPv4Address();
  return addr.range() === 'unicast';
}

export function isBlockedHostname(host) {
  const h = cleanHost(host);
  return h === 'localhost' || BLOCKED_SUFFIXES.some((suffix) => h.endsWith(suffix));
}

/** Throws if any resolved address is not a public one. */
export function checkAddresses(addresses) {
  if (config.allowPrivateTargets) return;
  for (const { address } of addresses) {
    if (!isPublicIp(address)) {
      throw new UnsafeTargetError('This address points to a private or internal network and cannot be scanned');
    }
  }
}

export async function resolvePublicHost(hostname) {
  const host = cleanHost(hostname);
  if (!host) throw new InvalidUrlError('Missing website name');
  if (!config.allowPrivateTargets && isBlockedHostname(host)) {
    throw new UnsafeTargetError('This address points to a private or internal network and cannot be scanned');
  }
  if (net.isIP(host)) {
    checkAddresses([{ address: host }]);
    return { ip: host, family: net.isIP(host), isIpLiteral: true, all: [host] };
  }
  let addresses;
  try {
    addresses = await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new UnresolvedHostError('Could not find that website (the domain name does not resolve)');
  }
  if (!addresses.length) throw new UnresolvedHostError('Could not find that website (the domain name does not resolve)');
  checkAddresses(addresses);
  return {
    ip: addresses[0].address,
    family: addresses[0].family,
    isIpLiteral: false,
    all: addresses.map((a) => a.address),
  };
}

/**
 * Turns whatever the user typed into a clean http(s) URL.
 * Credentials ("user@" tricks) are removed and reported, not silently trusted.
 */
export function parseTargetUrl(input) {
  if (typeof input !== 'string') throw new InvalidUrlError('Please enter a website address');
  let raw = input.trim();
  if (!raw || raw.length > 2048 || /\s/.test(raw)) {
    throw new InvalidUrlError('Please enter a valid website address');
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) raw = `https://${raw}`;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new InvalidUrlError('Please enter a valid website address');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new InvalidUrlError('Only http and https addresses can be checked');
  }

  const hadCredentials = Boolean(url.username || url.password);
  url.username = '';
  url.password = '';
  url.hash = '';

  if (!config.allowPrivateTargets && url.port && !['80', '443'].includes(url.port)) {
    throw new UnsafeTargetError('Only standard web ports (80 and 443) can be checked');
  }

  const bare = stripBrackets(url.hostname);
  const isIpHost = net.isIP(bare) > 0;
  if (!config.allowPrivateTargets && !isIpHost && !url.hostname.includes('.')) {
    throw new InvalidUrlError('Enter a full website name, for example example.gov.in');
  }

  return {
    url: url.href,
    hostname: url.hostname.toLowerCase(),
    protocol: url.protocol,
    hadCredentials,
    isIpHost,
  };
}

/**
 * With allowUnresolved, a name that does not exist is not an error: the name itself can still be
 * judged (look-alike of a bank, no HTTPS). Private and internal targets are always refused.
 */
export async function assertSafeUrl(input, { allowUnresolved = false } = {}) {
  const parsed = parseTargetUrl(input);
  try {
    const resolved = await resolvePublicHost(parsed.hostname);
    return { parsed, resolved, unresolved: false };
  } catch (err) {
    if (allowUnresolved && err.name === 'UnresolvedHostError') return { parsed, resolved: null, unresolved: true };
    throw err;
  }
}
