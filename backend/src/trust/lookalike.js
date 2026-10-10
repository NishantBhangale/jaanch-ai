import { readFileSync } from 'node:fs';
import { domainToUnicode } from 'node:url';
import { parse } from 'tldts';

// Lookalike detection compares a domain with a starter list of well-known Indian bank,
// government and shopping brands (data/brands.json). It is a heuristic: extend the list.
const brands = JSON.parse(readFileSync(new URL('./data/brands.json', import.meta.url), 'utf8'));

const CONFUSABLES = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', і: 'i', ѕ: 's', ј: 'j', ԁ: 'd', ӏ: 'l',
  ο: 'o', ν: 'v', ι: 'i', α: 'a',
};

const index = brands.map((brand) => {
  const officialDomains = brand.domains.map((d) => d.toLowerCase());
  const labels = [...new Set(officialDomains.map((d) => parse(d).domainWithoutSuffix).filter(Boolean))];
  const tokens = new Set(brand.tokens || []);
  const contains = new Set(brand.contains || []);
  for (const label of labels) (label.length >= 7 ? contains : tokens).add(label);
  return { name: brand.name, officialDomains, labels, tokens: [...tokens], contains: [...contains] };
});

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const curr = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

const transliterate = (s) => [...s].map((c) => CONFUSABLES[c] ?? c).join('');
const squash = (s) => s.replace(/[^a-z0-9]/g, '');
const words = (s) => s.split(/[^a-z0-9]+/).filter(Boolean);

/** Spellings an attacker might use to look like the real name (0 for o, 1 for l or i, rn for m). */
function variants(label) {
  const base = label.toLowerCase();
  const swapped = [base, base.replace(/1/g, 'l'), base.replace(/1/g, 'i')];
  return [
    ...new Set(
      swapped.map((v) => v.replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/0/g, 'o').replace(/5/g, 's').replace(/\$/g, 's')),
    ),
    base,
  ];
}

const isOfficialHost = (host, brand) => brand.officialDomains.some((d) => host === d || host.endsWith(`.${d}`));

/**
 * Returns { isOfficial, brand, matches[] }. A match has { type, brand, official, detail }:
 *  - brand_name: the domain uses a brand's name but is not the brand's domain
 *  - typo:       a one or two letter change from a brand's real name
 *  - idn:        the domain uses look-alike characters from other alphabets
 */
export function detectLookalike(hostname) {
  const host = String(hostname).toLowerCase().replace(/\.$/, '');
  const parsed = parse(host);
  if (parsed.isIp || !parsed.domain) return { isOfficial: false, brand: null, matches: [] };

  for (const brand of index) {
    if (isOfficialHost(host, brand)) return { isOfficial: true, brand: brand.name, matches: [] };
  }

  const matches = [];
  const isIdn = host.includes('xn--') || /[^\x00-\x7f]/.test(host);
  const unicodeHost = host.includes('xn--') ? domainToUnicode(host) : host;
  const label = transliterate((parse(unicodeHost).domainWithoutSuffix || '').toLowerCase());

  if (isIdn) {
    matches.push({
      type: 'idn',
      brand: null,
      official: null,
      detail: 'The domain contains characters from other alphabets that can look like English letters',
    });
  }
  if (!label) return { isOfficial: false, brand: null, matches };

  const spellings = variants(label);
  // Text in front of the real domain: in "sbi.login.com" the brand sits in the sub-domain
  // while the site itself is login.com.
  const subdomain = transliterate((parse(unicodeHost).subdomain || '').toLowerCase());
  const subSpellings = subdomain ? variants(subdomain) : [];

  for (const brand of index) {
    let found = null;

    for (const spelling of spellings) {
      const token = brand.tokens.find((t) => words(spelling).includes(t));
      if (token) {
        found = { type: 'brand_name', detail: `The name uses "${token}"` };
        break;
      }
      const part = brand.contains.find((c) => squash(spelling).includes(c));
      if (part) {
        found = { type: 'brand_name', detail: `The name contains "${part}"` };
        break;
      }
    }

    if (!found) {
      for (const spelling of subSpellings) {
        const token = brand.tokens.find((t) => words(spelling).includes(t));
        const part = token ? null : brand.contains.find((c) => squash(spelling).includes(c));
        if (token || part) {
          found = {
            type: 'brand_name',
            detail: `The name "${token || part}" appears in front of a different website (${parse(host).domain})`,
          };
          break;
        }
      }
    }

    if (!found) {
      for (const spelling of spellings) {
        const flat = squash(spelling);
        for (const real of brand.labels) {
          if (real.length < 5) continue;
          const limit = real.length <= 7 ? 1 : 2;
          const distance = levenshtein(flat, real);
          if (distance > 0 && distance <= limit) {
            found = { type: 'typo', detail: `The name "${flat}" is almost the same as "${real}"` };
            break;
          }
        }
        if (found) break;
      }
    }

    if (found) matches.push({ ...found, brand: brand.name, official: brand.officialDomains[0] });
  }

  return { isOfficial: false, brand: null, matches };
}
