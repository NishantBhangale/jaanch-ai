// Deterministic Trust Score. The same signals always give the same verdict, so the rules
// can be unit-tested. The LLM never changes the verdict; it only explains these findings.
//
// Score = 50 + sum of points from the findings below, limited to 0..100.
//   70 and above  -> safe        ("Safe")
//   40 to 69      -> careful     ("Be Careful")
//   below 40      -> likely_fake ("Likely Fake")
// Extra rules: a Safe Browsing match or an exact OpenPhish URL match is always likely_fake,
// and a result with any "bad" finding can never be "safe".

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const STATUS_ORDER = { bad: 0, warn: 1, unknown: 2, skipped: 3, info: 4, good: 5 };

export const VERDICTS = ['safe', 'careful', 'likely_fake'];

function humanAge(days) {
  if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 730) return `${Math.floor(days / 30)} months`;
  return `${Math.floor(days / 365)} years`;
}

const AGE_REASONS = {
  not_found: 'The registry has no public record for this domain.',
  timeout: 'The registration lookup timed out.',
  no_registration_date: 'The registry does not publish the registration date.',
  lookup_failed: 'The registration lookup failed.',
  rate_limited: 'The registry is limiting lookups right now. Try again in a few minutes.',
  no_rdap_server: 'This domain ending does not offer a public registration lookup.',
};

/**
 * signals = {
 *   input:  { hostname, hadCredentials, isIpHost },
 *   final:  { url, hostname, protocol, redirectedToOtherDomain, fetchError },
 *   tls, age, gov: { isGov }, lookalike: { isOfficial, brand, matches },
 *   safeBrowsing, feed, page
 * }
 */
export function evaluateTrust(signals) {
  const { input, final, tls, age, gov, lookalike, safeBrowsing, feed, page } = signals;
  const findings = [];
  const add = (id, status, title, detail = '', points = 0) => findings.push({ id, status, title, detail, points });

  // 1. HTTPS and certificate
  if (tls) {
    if (!tls.reachable) {
      add('https_missing', 'bad', 'No secure HTTPS connection', 'Anything typed on this site can be read by others on the network.', -25);
    } else if (tls.daysLeft !== null && tls.daysLeft < 0) {
      add('cert_expired', 'bad', 'Security certificate has expired', `It expired ${Math.abs(tls.daysLeft)} days ago.`, -30);
    } else if (!tls.hostnameMatches) {
      add('cert_mismatch', 'bad', 'Certificate belongs to a different website', `The certificate is issued for "${tls.subject || 'another name'}", not this site.`, -30);
    } else if (!tls.authorized) {
      add('cert_untrusted', 'bad', 'Certificate is not trusted', `Reason: ${tls.authorizationError || 'unknown'}.`, -30);
    } else {
      add('https_valid', 'good', 'HTTPS with a valid certificate', `Issued by ${tls.issuer || 'a trusted authority'}; expires in ${tls.daysLeft} days.`, 15);
      if (tls.daysLeft !== null && tls.daysLeft < 7) {
        add('cert_expiring', 'warn', 'Certificate expires very soon', `Only ${tls.daysLeft} days left.`, -5);
      }
      if (final.protocol === 'http:') {
        add('http_served', 'warn', 'The page was opened over plain HTTP', 'HTTPS exists, but this address does not use it.', -10);
      }
    }
  } else {
    add('https_check', 'unknown', 'HTTPS could not be checked', 'The connection test could not run.', 0);
  }

  // 2. Domain age
  if (input.isIpHost) {
    add('ip_host', 'bad', 'Website uses a number instead of a name', 'Real services almost always use a proper domain name.', -20);
  } else if (age?.available) {
    const d = age.ageDays;
    let status = 'good';
    let points = 15;
    if (d < 7) [status, points] = ['bad', -30];
    else if (d < 30) [status, points] = ['bad', -20];
    else if (d < 90) [status, points] = ['warn', -10];
    else if (d < 365) [status, points] = ['info', 0];
    else if (d < 1095) [status, points] = ['good', 5];
    else if (d < 2920) [status, points] = ['good', 10];
    add('domain_age', status, `Domain registered ${humanAge(d)} ago`, `Registered on ${age.registeredAt.slice(0, 10)}. Scam sites are often only days or weeks old.`, points);
  } else {
    add('domain_age', 'unknown', 'Domain age could not be checked', AGE_REASONS[age?.reason] || 'The registration date is not available.', 0);
  }

  // 3. Government and official domains
  if (gov?.isGov) {
    add('gov_domain', 'good', 'Indian government domain (.gov.in / .nic.in)', 'Only government bodies can register these names.', 25);
  }

  // 4. Lookalike and URL tricks
  const impersonation = (lookalike?.matches || []).filter((m) => m.type !== 'idn');
  if (impersonation.length) {
    const m = impersonation[0];
    add('lookalike', 'bad', `Looks like ${m.brand}, but is not an official ${m.brand} site`, `${m.detail}. The official site is ${m.official}.`, -45);
  } else if (lookalike?.isOfficial) {
    add('official_domain', 'good', `Official ${lookalike.brand} domain`, 'This domain is on our list of known official sites.', 20);
  }
  if ((lookalike?.matches || []).some((m) => m.type === 'idn')) {
    add('idn_domain', 'warn', 'Domain uses look-alike characters', 'Letters from other alphabets can imitate English letters.', -15);
  }
  if (input.hadCredentials) {
    add('url_credentials', 'bad', 'Address contains a hidden "name@" part', 'Scammers put a trusted name before the @ sign to hide the real website.', -25);
  }

  // 5. Reputation lists
  if (safeBrowsing?.status === 'flagged') {
    add('safe_browsing', 'bad', 'Listed as dangerous by Google Safe Browsing', `Threat type: ${(safeBrowsing.threats || []).join(', ')}.`, -60);
  } else if (safeBrowsing?.status === 'clean') {
    add('safe_browsing', 'good', 'Not on the Google Safe Browsing warning list', '', 5);
  } else if (safeBrowsing?.status === 'skipped') {
    add('safe_browsing', 'skipped', 'Google Safe Browsing was not checked', 'No API key is set on this server.', 0);
  } else {
    add('safe_browsing', 'unknown', 'Google Safe Browsing check failed', '', 0);
  }

  if (feed?.status === 'flagged' && feed.matchType === 'url') {
    add('phishing_feed', 'bad', 'This exact address is in a phishing feed', 'It appears in the OpenPhish list of live phishing pages.', -60);
  } else if (feed?.status === 'flagged') {
    add('phishing_feed', 'warn', 'This domain appears in a phishing feed', 'Another page on this domain is listed in OpenPhish.', -30);
  } else if (feed?.status === 'clean') {
    add('phishing_feed', 'good', 'Not found in the OpenPhish feed', '', 3);
  } else if (feed?.status === 'skipped') {
    add('phishing_feed', 'skipped', 'Phishing feed was not checked', 'The feed is turned off on this server.', 0);
  } else {
    add('phishing_feed', 'unknown', 'Phishing feed check failed', '', 0);
  }

  // 6. What the page itself does
  if (final.fetchError) {
    add('page_unreachable', 'unknown', 'The page could not be opened', final.fetchError, 0);
  } else if (page) {
    if (final.redirectedToOtherDomain) {
      add('redirect_other_domain', 'warn', 'The address sends you to a different website', `You end up on ${final.hostname}.`, -10);
    }
    if (page.hasSensitiveForm) {
      add('asks_sensitive', 'info', 'The page asks for sensitive details', `Fields found: ${page.sensitiveFields.join(', ')}. Only enter these on a site you are sure is official.`, 0);
    }
    if (page.insecureSensitive) {
      add('insecure_form', 'bad', 'Asks for sensitive details without HTTPS', 'Passwords, OTPs or card details would be sent unprotected.', -30);
    }
    if (page.hasSensitiveForm && age?.available && age.ageDays < 30) {
      add('new_site_sensitive', 'bad', 'A brand-new site is asking for sensitive details', 'This combination is typical of phishing pages.', -20);
    }
    if (page.formsToOtherDomains.length) {
      add('form_other_domain', 'bad', 'The form sends your details to another website', `Data goes to: ${page.formsToOtherDomains.join(', ')}.`, -15);
    }
    if (page.metaRefresh?.crossDomain) {
      add('meta_refresh', 'warn', 'The page automatically redirects elsewhere', `Target: ${page.metaRefresh.url}`, -10);
    }
    if (page.hiddenIframes > 0) {
      add('hidden_iframe', 'warn', 'The page contains hidden frames', `${page.hiddenIframes} hidden frame(s) found.`, -10);
    }
    if (page.linkCount >= 3) {
      if (page.hasContact && page.hasPrivacy) {
        add('contact_info', 'good', 'Contact and privacy pages are linked', '', 5);
      } else if (!page.hasContact && !page.hasPrivacy) {
        add('contact_info', 'warn', 'No contact or privacy page found', 'Genuine organisations normally publish both.', -5);
      } else {
        add('contact_info', 'info', 'Only one of contact or privacy page found', '', 0);
      }
    } else {
      add('contact_info', 'info', 'Page loads its content with JavaScript', 'Contact and privacy links could not be checked.', 0);
    }
  }

  const sum = findings.reduce((total, f) => total + f.points, 0);
  const hardFlag =
    safeBrowsing?.status === 'flagged' || (feed?.status === 'flagged' && feed.matchType === 'url');

  let score = clamp(Math.round(50 + sum), 0, 100);
  if (hardFlag) score = Math.min(score, 15);

  let verdict = score >= 70 ? 'safe' : score >= 40 ? 'careful' : 'likely_fake';
  if (hardFlag) verdict = 'likely_fake';
  if (verdict === 'safe' && findings.some((f) => f.status === 'bad')) verdict = 'careful';

  const unsure = findings.filter((f) => f.status === 'unknown' || f.status === 'skipped').length;
  const confidence = unsure === 0 ? 'high' : unsure <= 2 ? 'medium' : 'low';

  findings.sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || Math.abs(b.points) - Math.abs(a.points),
  );

  return { score, verdict, confidence, hardFlag, findings };
}
