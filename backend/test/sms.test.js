import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeMessage, evaluateMessage, extractLinks } from '../src/sms/analyze.js';

test('finds links with and without a scheme', () => {
  const text =
    'Visit https://www.incometax.gov.in/iec/foportal. Also sbi-kyc-update.com/login and www.example.org, thanks.';
  assert.deepEqual(extractLinks(text), [
    'https://www.incometax.gov.in/iec/foportal',
    'https://sbi-kyc-update.com/login',
    'https://www.example.org/',
  ]);
});

test('handles hxxp and [.] disguises, and trailing punctuation', () => {
  assert.deepEqual(extractLinks('Open hxxps://sbi-secure[.]xyz/verify)'), ['https://sbi-secure.xyz/verify']);
});

test('ignores e-mail addresses, numbers and file names', () => {
  assert.deepEqual(extractLinks('Mail help@sbi.co.in, pay 3.5 lakh, see notes.txt'), []);
});

test('keeps at most three distinct links', () => {
  const links = extractLinks('a.com b.com c.com d.com a.com');
  assert.equal(links.length, 3);
});

test('a plain genuine alert raises no warning signs', () => {
  const sms = 'Your OTP for login is 482913. Do not share it with anyone. Visit https://www.onlinesbi.sbi for services.';
  const result = analyzeMessage(sms);
  assert.equal(result.signals.length, 0);
  assert.equal(result.reassuring, true);
  assert.deepEqual(result.links, ['https://www.onlinesbi.sbi/']);
});

test('a scam message trips several signals', () => {
  const sms =
    'Dear customer your SBI account will be blocked today. Update KYC immediately and share your OTP: http://sbi-kyc-update.xyz/login';
  const ids = analyzeMessage(sms).signals.map((s) => s.id);
  for (const id of ['account_threat', 'kyc_update', 'urgency', 'brand_mismatch']) assert.ok(ids.includes(id), id);
});

test('the brand is fine when the link is that brand\'s own site', () => {
  const ids = analyzeMessage('Your SBI statement is ready: https://retail.onlinesbi.sbi/').signals.map((s) => s.id);
  assert.ok(!ids.includes('brand_mismatch'));
});

test('shorteners are flagged', () => {
  const ids = analyzeMessage('Claim here https://bit.ly/3xYz').signals.map((s) => s.id);
  assert.ok(ids.includes('shortened_link'));
});

test('overall: genuine link keeps its score, scam wording pulls it down', () => {
  const good = [{ id: 'a', status: 'done', score: 100, verdict: 'safe' }];
  assert.deepEqual(evaluateMessage({ signals: [], scans: good }).verdict, 'safe');
  const withSignals = evaluateMessage({
    signals: [{ points: -15 }, { points: -15 }, { points: -10 }],
    scans: good,
  });
  assert.equal(withSignals.score, 69); // 100 - 30 cap, then held under 70 because the wording is alarming
  assert.equal(withSignals.verdict, 'careful'); // verified clean link: a warning, not a fake label
});

test('overall: scam wording with a hidden (shortened) destination is Likely Fake even if the short-link site is clean', () => {
  const scans = [{ id: 'a', status: 'done', score: 100, verdict: 'safe' }];
  const signals = [
    { id: 'prize', severity: 'medium', points: -10 },
    { id: 'pay_fee', severity: 'medium', points: -8 },
    { id: 'shortened_link', severity: 'medium', points: -8 },
  ];
  const result = evaluateMessage({ signals, scans });
  assert.equal(result.verdict, 'likely_fake');
  assert.ok(result.score <= 39);
});

test('wording that merely mentions income or a bank does not count as naming the brand', () => {
  const ids = analyzeMessage('Your monthly income report is ready: https://example.org/report').signals.map((s) => s.id);
  assert.ok(!ids.includes('brand_mismatch'));
  const named = analyzeMessage('Income tax refund approved, claim at https://refund-now.xyz').signals.map((s) => s.id);
  assert.ok(named.includes('brand_mismatch'));
});

test('overall: never better than the worst link, and no link means no Safe', () => {
  const scans = [
    { id: 'a', status: 'done', score: 100, verdict: 'safe' },
    { id: 'b', status: 'done', score: 5, verdict: 'likely_fake' },
  ];
  const result = evaluateMessage({ signals: [], scans });
  assert.equal(result.verdict, 'likely_fake');
  assert.equal(result.worstLink, 'b');
  assert.equal(evaluateMessage({ signals: [], scans: [] }).verdict, 'no_link');
  assert.equal(evaluateMessage({ signals: [{ severity: 'high', points: -15 }], scans: [] }).verdict, 'careful');
  assert.equal(evaluateMessage({ signals: [], scans: [{ status: 'running' }] }).status, 'running');
});

test('a warning not to share an OTP is not mistaken for asking for one', () => {
  for (const sms of [
    'Aadhaar: download your e-Aadhaar at https://uidai.gov.in. Do not share your OTP with anyone.',
    'HDFC Bank: statement ready at https://www.hdfcbank.com. Never share your OTP, CVV or PIN with anyone.',
  ]) {
    assert.equal(analyzeMessage(sms).signals.length, 0, sms);
  }
  assert.ok(analyzeMessage('Please share your OTP to continue').signals.some((s) => s.id === 'asks_secret'));
});

test('a link to another government site is not treated as an imitation of the named office', () => {
  const ids = analyzeMessage('Income tax return processed. Details: https://services.example-dept.gov.in/status').signals.map((s) => s.id);
  assert.ok(!ids.includes('brand_mismatch'));
});
