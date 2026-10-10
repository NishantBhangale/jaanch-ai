const CHECKS = [
  { id: 'hsts', header: 'strict-transport-security', name: 'HSTS (always use HTTPS)', httpsOnly: true },
  { id: 'csp', header: 'content-security-policy', name: 'Content-Security-Policy' },
  { id: 'frame', header: 'x-frame-options', name: 'Clickjacking protection' },
  { id: 'nosniff', header: 'x-content-type-options', name: 'X-Content-Type-Options', mustInclude: 'nosniff' },
  { id: 'referrer', header: 'referrer-policy', name: 'Referrer-Policy' },
  { id: 'permissions', header: 'permissions-policy', name: 'Permissions-Policy' },
];

/** Looks for common security headers in the page response. Score = share present. */
export function analyzeHeaders(headers, protocol = 'https:') {
  const read = (name) => headers?.get?.(name) || '';
  const csp = read('content-security-policy');

  const items = CHECKS.map((check) => {
    const value = read(check.header);
    let present = Boolean(value);
    if (check.mustInclude) present = value.toLowerCase().includes(check.mustInclude);
    if (check.id === 'frame' && /frame-ancestors/i.test(csp)) present = true;
    if (check.httpsOnly && protocol !== 'https:') present = false;
    return { id: check.id, name: check.name, present };
  });

  const score = Math.round((100 * items.filter((i) => i.present).length) / items.length);
  return { score, items };
}
