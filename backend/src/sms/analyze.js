import { readFileSync } from 'node:fs';
import { parse } from 'tldts';
import { checkGovDomain } from '../trust/govDomain.js';
import { detectLookalike } from '../trust/lookalike.js';

const brands = JSON.parse(readFileSync(new URL('../trust/data/brands.json', import.meta.url), 'utf8'));

export const MAX_SMS_LENGTH = 1000;
export const MAX_SMS_LINKS = 3;

// Link shorteners hide where a message really leads.
const SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'cutt.ly', 'rb.gy', 'is.gd', 'ow.ly', 'shorturl.at',
  'tiny.cc', 'rebrand.ly', 'buff.ly', 'bit.do', 'lnkd.in', 'wa.me',
]);

// ---------------------------------------------------------------- finding links

const SCHEME = /\b(?:https?|hxxps?|h\*\*ps?):\/\/[^\s<>"'`]+/gi;
const WWW = /\bwww\.[^\s<>"'`]+/gi;
// A bare address such as sbi-kyc-update.com/login (no http, no www)
const BARE = /\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+(?:\/[^\s<>"'`]*)?/gi;

function tidy(raw) {
  let value = raw
    .replace(/^h(?:xx|\*\*)p/i, 'http')
    .replace(/\[\.\]|\(\.\)|\{\.\}|\s?\[dot\]\s?|\(dot\)/gi, '.')
    .replace(/[)\]}>.,;:!?'"]+$/g, ''); // punctuation that ends a sentence, not an address
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value) === false) value = `https://${value}`;
  return value;
}

function isRealHost(host) {
  const parsed = parse(host);
  // The ending must be a real public suffix (so "3.5" or "file.txt" are not treated as sites).
  return Boolean(parsed.isIp || (parsed.domain && parsed.isIcann));
}

/** Returns up to `limit` distinct web addresses found in the message, in order. */
export function extractLinks(text, limit = MAX_SMS_LINKS) {
  const source = String(text || '').slice(0, MAX_SMS_LENGTH);
  const found = [];
  const seen = new Set();
  const add = (raw, index) => {
    const url = tidy(raw);
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return;
    }
    if (!isRealHost(parsed.hostname)) return;
    const key = `${parsed.hostname}${parsed.pathname}${parsed.search}`.toLowerCase().replace(/\/$/, '');
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ url: parsed.href, index });
  };

  // Addresses with a scheme first, then www., then bare names. Text already matched is blanked out
  // so the same address is not found twice.
  let rest = source.replace(/\[\.\]|\(\.\)|\{\.\}|\s?\[dot\]\s?|\(dot\)/gi, '.');
  for (const pattern of [SCHEME, WWW]) {
    rest = rest.replace(pattern, (match, offset) => {
      add(match, offset);
      return ' '.repeat(match.length);
    });
  }
  // Skip e-mail addresses when looking for bare names.
  rest = rest.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, (m) => ' '.repeat(m.length));
  for (const match of rest.matchAll(BARE)) {
    if (/^[\d.]+(?:\/|$)/.test(match[0])) continue; // numbers like 3.5, not addresses
    add(match[0], match.index);
  }

  return found.sort((a, b) => a.index - b.index).slice(0, limit).map((f) => f.url);
}

export function isShortener(url) {
  try {
    return SHORTENERS.has(parse(new URL(url).hostname).domain || '');
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- reading the message

// Each rule: id, how serious it is, points taken off the score, patterns, and plain text in both languages.
const RULES = [
  {
    id: 'asks_secret',
    severity: 'high',
    points: -15,
    pattern: /\b(?:share|send|enter|tell|provide|confirm|verify)\b[^.\n]{0,40}\b(?:otp|pin|cvv|password|passcode|card number|card details|aadhaar number)\b/i,
    en: ['Asks for an OTP, PIN or card detail', 'Real banks never ask you to send these in reply to a message or to type them on a link.'],
    hi: ['OTP, PIN या कार्ड की जानकारी माँगता है', 'असली बैंक संदेश के जवाब में या किसी लिंक पर ये जानकारी कभी नहीं माँगते।'],
  },
  {
    id: 'account_threat',
    severity: 'high',
    points: -15,
    pattern: /\b(?:account|a\/c|card|sim|number|upi|wallet|service)\b[^.\n]{0,50}\b(?:block(?:ed)?|suspend(?:ed)?|clos(?:e|ed|ing)|deactivat(?:e|ed)|freez(?:e|ing)|frozen|disconnect(?:ed)?|expire[sd]?)\b|खाता[^.\n]{0,20}(?:बंद|ब्लॉक)|\b(?:legal action|arrest|FIR|penalty)\b/i,
    en: ['Threatens to block or close something', 'Scam messages create fear so you act before you think.'],
    hi: ['कुछ बंद या ब्लॉक करने की धमकी देता है', 'ठगी के संदेश डर पैदा करते हैं ताकि आप सोचे बिना कदम उठा लें।'],
  },
  {
    id: 'kyc_update',
    severity: 'medium',
    points: -10,
    pattern: /\b(?:kyc|re-?kyc|pan\s*(?:card)?\s*(?:update|link|verification)|aadhaar\s*(?:update|link|verification)|update\s*(?:your\s*)?(?:pan|aadhaar|kyc|details))\b|केवाईसी/i,
    en: ['Asks you to update KYC or ID details', 'KYC and PAN scams are among the most common. Banks do this in a branch or inside their own app.'],
    hi: ['KYC या पहचान की जानकारी अपडेट करने को कहता है', 'KYC और PAN की ठगी बहुत आम है। बैंक यह शाखा में या अपने ऐप में करते हैं।'],
  },
  {
    id: 'urgency',
    severity: 'medium',
    points: -8,
    pattern: /\b(?:urgent(?:ly)?|immediately|right now|within\s+\d+\s*(?:hours?|hrs?|minutes?|mins?|days?)|last\s+(?:chance|day|warning)|expires?\s+(?:today|tonight|soon)|today\s+only|act\s+now|final\s+notice)\b|तुरंत|अभी\s+क्लिक/i,
    en: ['Pushes you to act fast', 'Pressure and deadlines are a classic trick.'],
    hi: ['जल्दी करने का दबाव डालता है', 'दबाव और समय-सीमा ठगों की पुरानी चाल है।'],
  },
  {
    id: 'prize',
    severity: 'medium',
    points: -10,
    pattern: /\b(?:you(?:'ve| have)?\s+(?:won|been selected)|congratulations|lottery|lucky\s+(?:draw|winner)|free\s+(?:gift|recharge|iphone)|claim\s+(?:your\s+)?(?:prize|reward|gift|refund|cashback)|reward\s+points?\s+(?:expire|worth))\b|इनाम|लॉटरी/i,
    en: ['Promises a prize, gift or refund', 'Unexpected rewards that ask you to click are almost always bait.'],
    hi: ['इनाम, उपहार या रिफ़ंड का वादा करता है', 'बिना माँगे मिले इनाम जिनके लिए क्लिक करना पड़े, लगभग हमेशा जाल होते हैं।'],
  },
  {
    id: 'pay_fee',
    severity: 'medium',
    points: -8,
    pattern: /\b(?:pay|deposit|transfer)\b[^.\n]{0,30}(?:rs\.?|₹|inr)\s*\d+|\b(?:processing|registration|clearance|customs)\s+(?:fee|charge)s?\b/i,
    en: ['Asks for a small payment or fee', 'A small "fee" to release money or a parcel is a common trap.'],
    hi: ['छोटा भुगतान या शुल्क माँगता है', 'पैसे या पार्सल छुड़ाने के लिए छोटा "शुल्क" एक आम जाल है।'],
  },
  {
    id: 'click_here',
    severity: 'medium',
    points: -5,
    pattern: /\b(?:click|tap|open|visit|login|log in)\b[^.\n]{0,25}\b(?:link|here|below|now)\b/i,
    en: ['Tells you to click a link', 'Be extra careful with links that arrive unasked.'],
    hi: ['लिंक पर क्लिक करने को कहता है', 'बिना माँगे आए लिंक पर खास सावधानी रखें।'],
  },
];

const REASSURING = /\b(?:never|do not|don'?t)\s+share\b/i;

// Words that show a message is talking about a bank or office: its names and official site labels.
// Single generic words ("bank", "india", "income") are never used on their own.
const brandIndex = brands.map((b) => {
  const phrases = new Set();
  const lower = b.name.toLowerCase().replace(/\(.*?\)/g, '').trim();
  phrases.add(lower);
  phrases.add(lower.replace(/\s+(department|portal|limited|ltd)$/, ''));
  for (const word of [...(b.tokens || []), ...(b.contains || [])]) phrases.add(word.toLowerCase());
  for (const d of b.domains) {
    const label = parse(d).domainWithoutSuffix;
    if (label && label.length >= 4) phrases.add(label);
  }
  const pattern = [...phrases]
    .filter((w) => w.length >= 3)
    .map((w) => w.replace(/[^a-z0-9 ]/gi, '').replace(/\s+/g, '\\s+'))
    .join('|');
  return { name: b.name, domains: b.domains, regex: new RegExp(`\\b(?:${pattern})\\b`, 'i') };
});

/** Brands the message names (for example SBI, HDFC Bank, Income Tax). */
function mentionedBrands(text) {
  return brandIndex.filter((b) => b.regex.test(text));
}

/**
 * Reads the message text for scam wording. Returns { links, signals[] }.
 * Each signal: { id, severity, points, title, detail } in English and Hindi.
 * The text itself is never stored.
 */
export function analyzeMessage(text) {
  const message = String(text || '').slice(0, MAX_SMS_LENGTH);
  const links = extractLinks(message);
  const signals = [];

  // Genuine alerts warn you ("Do not share your OTP with anyone"). That is advice, not a request,
  // so those sentences are set aside before the scam wording is looked for.
  const reading = message.replace(/\b(?:never|do not|don'?t|please do not|kindly do not)\s+(?:share|disclose|give|reveal|send|tell)\b[^.\n!]*[.!]?/gi, ' ');

  for (const rule of RULES) {
    if (rule.pattern.test(reading)) {
      signals.push({
        id: rule.id,
        severity: rule.severity,
        points: rule.points,
        title: { en: rule.en[0], hi: rule.hi[0] },
        detail: { en: rule.en[1], hi: rule.hi[1] },
      });
    }
  }

  // The message names a bank or office, but the link goes somewhere else.
  const named = mentionedBrands(message);
  if (named.length && links.length) {
    const hosts = links.map((u) => new URL(u).hostname);
    const officialFor = (brand) => hosts.some((h) => brand.domains.some((d) => h === d || h.endsWith(`.${d}`)));
    // .gov.in / .nic.in names cannot be bought by outsiders, so a link to one is never an imitation.
    const mismatch = named.find(
      (b) => !officialFor(b) && hosts.every((h) => !detectLookalike(h).isOfficial && !checkGovDomain(h).isGov),
    );
    if (mismatch) {
      signals.push({
        id: 'brand_mismatch',
        severity: 'high',
        points: -20,
        title: {
          en: `Mentions ${mismatch.name}, but the link is not an official ${mismatch.name} site`,
          hi: `${mismatch.name} का नाम लेता है, पर लिंक ${mismatch.name} की आधिकारिक साइट का नहीं है`,
        },
        detail: {
          en: `The official site is ${mismatch.domains[0]}.`,
          hi: `आधिकारिक साइट ${mismatch.domains[0]} है।`,
        },
      });
    }
  }

  if (links.some(isShortener)) {
    signals.push({
      id: 'shortened_link',
      severity: 'medium',
      points: -8,
      title: { en: 'Uses a shortened link', hi: 'छोटा किया हुआ लिंक इस्तेमाल करता है' },
      detail: {
        en: 'A short link hides the real website. We follow it and judge where it ends up.',
        hi: 'छोटा लिंक असली वेबसाइट छिपा देता है। हम उसे खोलकर देखते हैं कि वह कहाँ पहुँचता है।',
      },
    });
  }

  return {
    links,
    signals,
    reassuring: REASSURING.test(message),
    mentionedBrands: named.map((b) => b.name),
  };
}

// ---------------------------------------------------------------- the overall result

const RANK = { safe: 0, careful: 1, likely_fake: 2 };
const NAMES = ['safe', 'careful', 'likely_fake'];
const verdictFor = (score) => (score >= 70 ? 'safe' : score >= 40 ? 'careful' : 'likely_fake');
const worse = (a, b) => (RANK[b] > RANK[a] ? b : a);

/**
 * Combines the link results with the wording signals.
 *   score   = lowest link score minus the wording points (at most 30 off)
 *   verdict = the worst of: the score's verdict, the worst link's verdict, and a floor from the wording
 *     wording points >= 25 -> at least Likely Fake, >= 10 -> at least Be Careful
 *     (when every link is verified clean and not shortened, the floor stops at Be Careful:
 *      a genuine site with alarming wording deserves a warning, not a fake label)
 * With no link there is nothing to check, so no Safe verdict is given.
 */
export function evaluateMessage({ signals = [], scans = [] }) {
  const risk = signals.reduce((sum, s) => sum + Math.abs(s.points), 0);
  const penalty = Math.min(30, risk);
  const finished = scans.filter((s) => s.status === 'done' && typeof s.score === 'number');
  const waiting = scans.some((s) => s.status === 'pending' || s.status === 'running');

  if (scans.length === 0) {
    const high = signals.some((s) => s.severity === 'high');
    return {
      status: 'done',
      verdict: signals.length === 0 ? 'no_link' : high ? 'careful' : 'no_link',
      score: null,
      penalty,
      worstLink: null,
    };
  }
  if (waiting || finished.length === 0) {
    return { status: waiting ? 'running' : 'failed', verdict: null, score: null, penalty, worstLink: null };
  }

  const lowest = finished.reduce((a, b) => (a.score <= b.score ? a : b));
  const worst = finished.reduce((a, b) => (RANK[b.verdict] > RANK[a.verdict] ? b : a));
  let score = Math.max(0, lowest.score - penalty);

  let floor = risk >= 25 ? 'likely_fake' : risk >= 10 ? 'careful' : 'safe';
  const allClean = finished.every((s) => s.verdict === 'safe') && !signals.some((s) => s.id === 'shortened_link');
  if (allClean && floor === 'likely_fake') floor = 'careful';

  const verdict = worse(worse(verdictFor(score), worst.verdict), floor);
  // Keep the number consistent with the label.
  if (verdict === 'likely_fake') score = Math.min(score, 39);
  else if (verdict === 'careful') score = Math.min(score, 69);
  return { status: 'done', verdict, score, penalty, worstLink: worst.id };
}
