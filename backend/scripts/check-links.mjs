// Runs the sample links and SMS messages in test-data/links.json through a running backend and
// prints a pass/fail table. Needs internet access (domain dates, certificates, the pages themselves).
//
//   1. Start the backend with a higher rate limit:   RATE_LIMIT_MAX=300 npm start
//   2. In another terminal:                           node scripts/check-links.mjs [http://localhost:3000] [group]
//
// group is optional: genuineSites | brokenPages | fakeSites | genuineSms | fakeSms
import fs from 'node:fs';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const only = process.argv[3];
const data = JSON.parse(fs.readFileSync(new URL('../test-data/links.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s, n = 58) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

async function api(path, body) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 429) throw new Error('Rate limited. Restart the backend with RATE_LIMIT_MAX=300.');
  return { status: res.status, json };
}

async function until(path, isDone, tries = 90) {
  for (let i = 0; i < tries; i += 1) {
    const { json } = await api(path);
    if (isDone(json)) return json;
    await sleep(2000);
  }
  throw new Error('Timed out waiting for the result');
}

const finished = (scan) => scan.status === 'done' || scan.status === 'failed';

function judge(item, verdict, score, kind) {
  if (kind === 'genuine') return verdict === 'safe' && score >= (item.minScore ?? 80);
  if (kind === 'fake') return (item.expectAnyOf || ['likely_fake']).includes(verdict);
  return true;
}

async function checkLink(item, kind) {
  const created = await api('/api/scans', { url: item.url, lang: 'en' });
  if (!created.json.id) return { label: item.url, error: created.json.error || `HTTP ${created.status}` };
  const scan = await until(`/api/scans/${created.json.id}`, finished);
  const bad = (scan.trust?.findings || []).filter((f) => f.status === 'bad').map((f) => f.title);
  return {
    label: item.url,
    verdict: scan.verdict,
    score: scan.score,
    registered: scan.trust?.domain?.registeredAt?.slice(0, 10) || (scan.trust?.domain ? `n/a (${scan.trust.domain.reason})` : '-'),
    brokenLinks: scan.health?.links ? `${scan.health.links.broken.length}/${scan.health.links.checked}` : '-',
    pass: scan.status === 'done' && judge(item, scan.verdict, scan.score, kind),
    note: scan.status === 'failed' ? scan.error : bad[0] || '',
  };
}

async function checkSms(item, kind) {
  const created = await api('/api/sms', { text: item.text, lang: 'en' });
  if (created.status >= 400) return { label: item.text, error: created.json.error };
  let overall = created.json.overall;
  let links = [];
  if (created.json.group) {
    const result = await until(`/api/sms/${created.json.group}`, (r) => r.overall?.status !== 'running');
    overall = result.overall;
    links = result.links;
  }
  return {
    label: item.text,
    verdict: overall.verdict,
    score: overall.score,
    registered: links.map((l) => l.trust?.domain?.registeredAt?.slice(0, 10) || '?').join(','),
    brokenLinks: `${created.json.links.length} link(s)`,
    pass: judge(item, overall.verdict, overall.score ?? 0, kind),
    note: created.json.signals.map((s) => s.id).join(' '),
  };
}

const groups = [
  ['genuineSites', 'genuine', checkLink],
  ['brokenPages', 'info', checkLink],
  ['fakeSites', 'fake', checkLink],
  ['genuineSms', 'genuine', checkSms],
  ['fakeSms', 'fake', checkSms],
];

const results = {};
let failures = 0;
for (const [name, kind, run] of groups) {
  if (only && only !== name) continue;
  console.log(`\n== ${name} (${kind === 'genuine' ? 'expect Safe, 80+' : kind === 'fake' ? 'expect Likely Fake' : 'informational'}) ==`);
  results[name] = [];
  for (const item of data[name]) {
    let row;
    try {
      row = await run(item, kind);
    } catch (err) {
      row = { label: item.url || item.text, error: err.message };
    }
    results[name].push(row);
    if (row.error) {
      failures += 1;
      console.log(`  ERROR  ${short(row.label)}  ${row.error}`);
      continue;
    }
    if (kind !== 'info' && !row.pass) failures += 1;
    const mark = kind === 'info' ? ' info' : row.pass ? '  PASS' : '  FAIL';
    console.log(
      `${mark}  ${String(row.verdict).padEnd(11)} ${String(row.score ?? '-').padStart(3)}  reg ${String(row.registered).padEnd(10)}  broken ${String(row.brokenLinks).padEnd(8)} ${short(row.label)}${row.note ? `  [${short(row.note, 50)}]` : ''}`,
    );
  }
}
fs.writeFileSync(new URL('../test-data/last-results.json', import.meta.url), JSON.stringify(results, null, 2));
console.log(`\n${failures === 0 ? 'All checks matched expectations.' : `${failures} item(s) did not match.`} Details: test-data/last-results.json`);
process.exit(failures === 0 ? 0 : 1);
