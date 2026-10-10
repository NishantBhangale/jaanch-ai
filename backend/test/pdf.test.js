import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScanPdf } from '../src/report/pdf.js';

const collect = (doc) => new Promise((resolve) => {
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
});

const base = {
  id: 'x', url: 'https://example.org/', hostname: 'example.org', status: 'done', verdict: 'careful', score: 55,
  trust: { score: 55, verdict: 'careful', confidence: 'medium', findings: [{ id: 'a', status: 'warn', title: 'Something odd', detail: 'Detail text', points: -10 }] },
};
const health = {
  healthScore: 70,
  lighthouse: { performance: 80, accessibility: 90, bestPractices: 85, seo: 75, metrics: { firstContentfulPaint: '1 s' } },
  axe: { violationCount: 1, issues: [{ id: 'label', impact: 'critical', help: 'Form elements must have labels', nodes: 2 }] },
  links: { checked: 4, broken: [{ url: 'https://example.org/gone', status: 404 }] },
  headers: { score: 50, items: [{ id: 'h', name: 'HSTS', present: false }] },
  errors: {},
};

test('the PDF carries the health report, not only the verdict', async () => {
  const small = await collect(buildScanPdf(base));
  const full = await collect(buildScanPdf({ ...base, health }));
  assert.equal(full.subarray(0, 5).toString(), '%PDF-');
  assert.ok(full.length > small.length + 1000);
});
