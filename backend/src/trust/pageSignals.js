import * as cheerio from 'cheerio';
import { getRegistrableDomain } from './domainAge.js';

const SENSITIVE_KINDS = [
  ['password', /passw/i],
  ['OTP', /\botp\b|one[-_ ]?time/i],
  ['card number / CVV', /cvv|cvc|card[-_ ]?(no|num)|cardnumber/i],
  ['Aadhaar', /aadhaar|aadhar/i],
  ['UPI / PIN', /\bupi\b|\bpin\b/i],
  ['bank account', /ifsc|account[-_ ]?(no|num)/i],
  ['PAN', /\bpan\b/i],
];
const CONTACT_RE = /contact|support|helpline|grievance|संपर्क/i;
const PRIVACY_RE = /privacy|terms|disclaimer|गोपनीयता/i;

const domainOf = (url) => {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return getRegistrableDomain(host) || host;
  } catch {
    return null;
  }
};

function resolve(href, base) {
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
}

/** Looks at the static HTML of the page for warning signs. */
export function analyzePage({ html, finalUrl }) {
  const $ = cheerio.load(html);
  const pageDomain = domainOf(finalUrl);

  const sensitiveFields = new Set();
  const formsToOtherDomains = new Set();
  let hasSensitiveForm = false;

  $('form').each((_, form) => {
    const kinds = new Set();
    $(form)
      .find('input, textarea, select')
      .each((__, el) => {
        const attrs = ['name', 'id', 'placeholder', 'autocomplete', 'aria-label']
          .map((a) => $(el).attr(a) || '')
          .join(' ');
        if (($(el).attr('type') || '').toLowerCase() === 'password') kinds.add('password');
        for (const [label, re] of SENSITIVE_KINDS) if (re.test(attrs)) kinds.add(label);
      });
    if (!kinds.size) return;
    hasSensitiveForm = true;
    kinds.forEach((k) => sensitiveFields.add(k));

    const action = $(form).attr('action');
    const target = action ? resolve(action, finalUrl) : null;
    if (target && /^https?:/i.test(target)) {
      const targetDomain = domainOf(target);
      if (targetDomain && pageDomain && targetDomain !== pageDomain) {
        formsToOtherDomains.add(new URL(target).hostname);
      }
    }
  });

  let metaRefresh = null;
  const refresh = $('meta[http-equiv="refresh" i]').attr('content');
  const refreshUrl = refresh && /url\s*=\s*['"]?([^'"]+)/i.exec(refresh)?.[1];
  if (refreshUrl) {
    const target = resolve(refreshUrl.trim(), finalUrl);
    if (target) {
      const targetDomain = domainOf(target);
      metaRefresh = { url: target, crossDomain: Boolean(targetDomain && pageDomain && targetDomain !== pageDomain) };
    }
  }

  let hiddenIframes = 0;
  $('iframe').each((_, el) => {
    const style = ($(el).attr('style') || '').replace(/\s/g, '').toLowerCase();
    const hidden =
      $(el).attr('hidden') !== undefined ||
      /display:none|visibility:hidden/.test(style) ||
      $(el).attr('width') === '0' ||
      $(el).attr('height') === '0';
    if (hidden) hiddenIframes += 1;
  });

  let hasContact = false;
  let hasPrivacy = false;
  let linkCount = 0;
  $('a[href]').each((_, el) => {
    linkCount += 1;
    const text = `${$(el).text()} ${$(el).attr('href') || ''}`;
    if (CONTACT_RE.test(text)) hasContact = true;
    if (PRIVACY_RE.test(text)) hasPrivacy = true;
  });

  return {
    title: $('title').first().text().trim().slice(0, 200),
    sensitiveFields: [...sensitiveFields],
    hasSensitiveForm,
    insecureSensitive: hasSensitiveForm && /^http:/i.test(finalUrl),
    formsToOtherDomains: [...formsToOtherDomains],
    metaRefresh,
    hiddenIframes,
    hasContact,
    hasPrivacy,
    linkCount,
  };
}
