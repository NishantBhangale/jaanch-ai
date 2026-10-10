// PDF reports. Built on the server with pdfkit (no browser needed), so it works the same on every machine.
// It carries everything the report page shows: the gauge, domain and certificate facts, the plain-words
// explanation, how the score was built, every finding, the Health Report (scores, speed details, security
// headers, broken links, accessibility issues) and the page screenshot.
// The built-in PDF fonts cannot draw Devanagari, so the PDF is always in English.
import PDFDocument from 'pdfkit';
import { ruleBasedSummary } from '../llm/index.js';

const NAVY = '#0b1f3a';
const MUTED = '#5b6b82';
const ORANGE = '#e8890c';
const LINE = '#d5deea';
const BAND = { bad: '#d94141', warn: '#e9a21a', good: '#17a35d' };
const COLORS = {
  safe: { fg: '#14794a', bg: '#def5e8', label: 'Safe' },
  careful: { fg: '#8a5a00', bg: '#fdf0cf', label: 'Be Careful' },
  likely_fake: { fg: '#b3261e', bg: '#fde4e4', label: 'Likely Fake' },
};
const STATUS = { bad: '#b3261e', warn: '#b7791f', good: '#14794a', info: '#2b5fa8', unknown: MUTED, skipped: MUTED };
const STATUS_LABEL = { bad: 'ALERT', warn: 'WARNING', good: 'OK', info: 'NOTE', unknown: 'UNKNOWN', skipped: 'SKIPPED' };
const IMPACT = { critical: '#b3261e', serious: '#c2410c', moderate: '#b7791f', minor: MUTED };
const SMS_SIGNAL = { high: '#b3261e', medium: '#b7791f', low: MUTED };
const SMS_TEXT = {
  safe: 'The link looks genuine and the message wording is normal.',
  careful: 'Some warning signs. Do not tap the link until you confirm with the sender through official channels.',
  likely_fake: 'This message looks like a scam. Do not tap the link or share any code or detail.',
};
const METRIC_NAMES = {
  firstContentfulPaint: 'First content shown',
  largestContentfulPaint: 'Main content shown',
  totalBlockingTime: 'Time page is unresponsive',
  cumulativeLayoutShift: 'Layout jumping',
  speedIndex: 'Speed index',
};

const MARGIN = 48;
const clean = (text) => String(text ?? '').replace(/[^\x09\x0a\x0d\x20-\x7e -ÿ–—‘’“”•→✓✗]/g, '');
const contentWidth = (doc) => doc.page.width - MARGIN * 2;
const ringTone = (v) => (v >= 90 ? BAND.good : v >= 50 ? BAND.warn : BAND.bad);

function fmtDate(value) {
  if (!value) return 'not available';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'not available' : d.toISOString().slice(0, 10);
}

function newDoc(title) {
  return new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: title, Author: 'Jaanch.ai', Subject: 'Website trust and health report' }, bufferPages: true });
}

function header(doc, subtitle) {
  const w = doc.page.width;
  doc.rect(0, 0, w, 74).fill(NAVY);
  doc.rect(0, 74, w, 3).fill(ORANGE);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22).text('Jaanch', MARGIN, 22, { continued: true });
  doc.fillColor(ORANGE).text('.ai');
  doc.fillColor('#b9c8e0').font('Helvetica').fontSize(9).text(subtitle, MARGIN, 50);
  doc.fillColor(NAVY);
  doc.y = 94;
  doc.x = MARGIN;
}

function ensure(doc, height) {
  if (doc.y + height > doc.page.height - 66) {
    doc.addPage();
    doc.y = MARGIN;
    doc.x = MARGIN;
  }
}

function section(doc, title, note) {
  ensure(doc, 50);
  doc.moveDown(0.7);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(12.5).text(title, MARGIN, doc.y);
  const y = doc.y + 2;
  doc.moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y).lineWidth(0.7).strokeColor(LINE).stroke();
  doc.y = y + 7;
  doc.x = MARGIN;
  if (note) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(note, MARGIN, doc.y, { width: contentWidth(doc) });
    doc.moveDown(0.4);
  }
}

// ---- drawings ----
const polar = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];

/** Half-circle gauge with the red / amber / green bands and a needle at the score. */
function gauge(doc, cx, cy, r, score) {
  const bands = [[0, 39, BAND.bad], [40, 69, BAND.warn], [70, 100, BAND.green || BAND.good]];
  doc.lineCap('butt');
  for (const [from, to, color] of bands) {
    const [x1, y1] = polar(cx, cy, r, 180 - (from / 100) * 180);
    const [x2, y2] = polar(cx, cy, r, 180 - ((to + (to === 100 ? 0 : 1)) / 100) * 180);
    doc.path(`M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`).lineWidth(11).strokeColor(color).stroke();
  }
  if (typeof score === 'number') {
    const [nx, ny] = polar(cx, cy, r - 16, 180 - (score / 100) * 180);
    doc.moveTo(cx, cy).lineTo(nx, ny).lineWidth(3).lineCap('round').strokeColor(NAVY).stroke();
  }
  doc.circle(cx, cy, 5).fill(NAVY);
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5);
  doc.text('0', cx - r - 4, cy + 6, { width: 20, lineBreak: false });
  doc.text('100', cx + r - 14, cy + 6, { width: 28, lineBreak: false });
}

/** Round score ring with the number inside and a label below. */
function ring(doc, cx, cy, r, value, label) {
  doc.circle(cx, cy, r).lineWidth(6).strokeColor('#e6ecf4').stroke();
  if (typeof value === 'number' && value > 0) {
    if (value >= 100) {
      doc.circle(cx, cy, r).lineWidth(6).strokeColor(ringTone(value)).stroke();
    } else {
      const [ex, ey] = polar(cx, cy, r, 90 - (value / 100) * 360);
      doc.path(`M ${cx} ${cy - r} A ${r} ${r} 0 ${value > 50 ? 1 : 0} 1 ${ex} ${ey}`).lineWidth(6).lineCap('round').strokeColor(ringTone(value)).stroke();
    }
  }
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text(typeof value === 'number' ? String(value) : '-', cx - 24, cy - 7, { width: 48, align: 'center', lineBreak: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(label, cx - 32, cy + r + 6, { width: 64, align: 'center' });
}

function pill(doc, x, y, w, text, color) {
  doc.roundedRect(x, y, w, 13, 3).fill(color);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text(text, x, y + 3.6, { width: w, align: 'center', lineBreak: false });
}

// ---- blocks ----
function verdictBlock(doc, { title, verdict, score, confidence, sentence, name }) {
  const c = COLORS[verdict] || { fg: MUTED, bg: '#eef1f6', label: 'Checking' };
  ensure(doc, 150);
  const top = doc.y;
  const w = contentWidth(doc);
  doc.roundedRect(MARGIN, top, w, 140, 10).fill(c.bg);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(title, MARGIN + 16, top + 12);
  gauge(doc, MARGIN + 120, top + 92, 62, score);
  doc.fillColor(c.fg).font('Helvetica-Bold').fontSize(24).text(typeof score === 'number' ? String(score) : '-', MARGIN + 200, top + 30, { continued: true });
  doc.fontSize(10).font('Helvetica').text('  out of 100');
  pill(doc, MARGIN + 200, top + 66, 92, c.label.toUpperCase(), c.fg);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9);
  if (confidence) doc.text(`Confidence: ${confidence}`, MARGIN + 200, top + 86);
  if (sentence) doc.fillColor(c.fg).font('Helvetica-Bold').fontSize(9.5).text(clean(sentence), MARGIN + 200, top + 102, { width: w - 215, height: 34, ellipsis: true });
  else if (name) doc.fillColor(c.fg).font('Helvetica').fontSize(9.5).text(clean(name), MARGIN + 200, top + 102, { width: w - 215, height: 34, ellipsis: true });
  doc.y = top + 152;
  doc.x = MARGIN;
}

function factBox(doc, x, y, w, label, value, tone) {
  const colors = tone === 'bad' ? ['#fbe0e0', '#b3261e'] : tone === 'good' ? ['#e2f5ea', '#14794a'] : ['#eef3fb', NAVY];
  doc.roundedRect(x, y, w, 40, 7).fill(colors[0]);
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(7).text(label.toUpperCase(), x + 10, y + 7, { width: w - 20, characterSpacing: 0.5 });
  doc.fillColor(colors[1]).font('Helvetica-Bold').fontSize(10).text(clean(value), x + 10, y + 19, { width: w - 20, height: 18, ellipsis: true });
}

function facts(doc, scan) {
  const trust = scan.trust;
  ensure(doc, 100);
  const y = doc.y;
  const w = contentWidth(doc);
  const half = (w - 10) / 2;
  const d = trust?.domain;
  const dText = d ? (d.available ? `${fmtDate(d.registeredAt)}  (${d.ageDays} days old)` : `not available (${d.reason || 'unknown'})`) : 'not applicable';
  const dTone = d?.available ? (d.ageDays < 60 ? 'bad' : d.ageDays > 365 ? 'good' : '') : '';
  factBox(doc, MARGIN, y, half, 'Domain registered', dText, dTone);
  const cert = trust?.certificate;
  factBox(doc, MARGIN + half + 10, y, half, 'Security certificate', cert ? `${cert.issuer || 'issuer unknown'}  (${cert.daysLeft} days left)` : 'No valid certificate found', cert ? 'good' : 'bad');
  let next = y + 48;
  if (trust?.aiReview?.status === 'done') {
    const ai = trust.aiReview;
    factBox(doc, MARGIN, next, w, 'AI second opinion', `${ai.risk} risk (${ai.provider}${ai.model ? ', ' + ai.model : ''})${ai.reasons?.length ? ': ' + ai.reasons.join(' ') : ''}`, ai.risk === 'high' ? 'bad' : '');
    next += 48;
  }
  doc.y = next;
  doc.x = MARGIN;
}

function simpleWords(doc, scan) {
  section(doc, 'In simple words');
  const en = scan.explanations?.en;
  const text = en?.text || (scan.trust ? ruleBasedSummary(scan, 'en') : '');
  doc.fillColor(NAVY).font('Helvetica').fontSize(10).text(clean(text), MARGIN, doc.y, { width: contentWidth(doc), lineGap: 1.5 });
  doc.moveDown(0.3);
  doc.fillColor(MUTED).fontSize(8);
  if (en && !en.fallback && en.provider && en.provider !== 'rules') {
    doc.text(`Written by AI (${en.provider}${en.model ? ', ' + en.model : ''}). The verdict itself comes from fixed rules.`, MARGIN, doc.y);
  } else {
    doc.text('AI explanation was not available. This is a rule-based summary.', MARGIN, doc.y);
  }
}

function breakdown(doc, trust) {
  const rows = (trust?.findings || []).filter((f) => typeof f.points === 'number' && f.points !== 0);
  if (!rows.length) return;
  section(doc, 'How the score was built', 'Every score starts at 50. Good signs add points, warning signs take them away.');
  const max = Math.max(...rows.map((f) => Math.abs(f.points)), 10);
  const labelW = 235;
  const trackX = MARGIN + labelW + 8;
  const trackW = 190;
  for (const f of rows) {
    const label = clean(f.title);
    doc.font('Helvetica').fontSize(9);
    const h = Math.max(14, doc.heightOfString(label, { width: labelW }) + 3);
    ensure(doc, h + 2);
    const y = doc.y;
    doc.fillColor(NAVY).text(label, MARGIN, y, { width: labelW });
    doc.roundedRect(trackX, y + 3, trackW, 8, 4).fill('#e6ecf4');
    const half = trackW / 2;
    const len = (Math.abs(f.points) / max) * half;
    doc.rect(f.points > 0 ? trackX + half : trackX + half - len, y + 3, len, 8).fill(f.points > 0 ? BAND.good : BAND.bad);
    doc.moveTo(trackX + half, y + 1).lineTo(trackX + half, y + 13).lineWidth(0.8).strokeColor(MUTED).stroke();
    doc.fillColor(f.points > 0 ? '#14794a' : '#b3261e').font('Helvetica-Bold').text(`${f.points > 0 ? '+' : ''}${f.points}`, trackX + trackW + 8, y, { width: 40, lineBreak: false });
    doc.y = y + h;
    doc.x = MARGIN;
  }
  ensure(doc, 20);
  doc.moveDown(0.3);
  doc.fillColor(NAVY).font('Helvetica').fontSize(10).text('Starting score: ', MARGIN, doc.y, { continued: true });
  doc.font('Helvetica-Bold').text('50', { continued: true });
  doc.font('Helvetica').text('   ->   Trust Score: ', { continued: true });
  doc.font('Helvetica-Bold').text(String(trust.score));
}

function findingsBlock(doc, findings) {
  section(doc, 'What we checked');
  for (const f of findings || []) {
    if (f.status === 'skipped') continue;
    const detail = clean(f.detail);
    const textW = contentWidth(doc) - 62;
    doc.font('Helvetica-Bold').fontSize(10);
    const h = doc.heightOfString(clean(f.title), { width: textW }) + (detail ? doc.font('Helvetica').fontSize(9).heightOfString(detail, { width: textW }) + 2 : 0);
    ensure(doc, h + 10);
    const y = doc.y;
    pill(doc, MARGIN, y + 1, 52, STATUS_LABEL[f.status] || '', STATUS[f.status] || MUTED);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(clean(f.title), MARGIN + 62, y, { width: textW });
    if (detail) doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(detail, MARGIN + 62, doc.y + 1, { width: textW });
    doc.y = y + h + 8;
    doc.x = MARGIN;
  }
}

function healthBlock(doc, health, screenshot) {
  section(doc, 'Health Report');
  if (!health) {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text('The health report is not available for this site.', MARGIN, doc.y);
    return;
  }
  const lh = health.lighthouse;
  const rings = [
    ['Overall health', health.healthScore], ['Speed on mobile', lh?.performance], ['Accessibility', lh?.accessibility],
    ['Best practices', lh?.bestPractices], ['SEO', lh?.seo], ['Security headers', health.headers?.score], ['Working links', health.linksScore],
  ].filter(([, v]) => typeof v === 'number');
  for (const message of Object.values(health.errors || {})) {
    doc.fillColor('#8a5a00').font('Helvetica').fontSize(9).text(clean(message), MARGIN, doc.y, { width: contentWidth(doc) });
    doc.moveDown(0.3);
  }
  if (rings.length) {
    ensure(doc, 90);
    const top = doc.y;
    const step = contentWidth(doc) / 7;
    rings.forEach(([label, value], i) => ring(doc, MARGIN + step * i + step / 2, top + 24, 20, value, label));
    doc.y = top + 78;
    doc.x = MARGIN;
  }

  // Left: speed details and security headers. Right: the page screenshot.
  const top = doc.y;
  const shotW = screenshot ? 140 : 0;
  const leftW = contentWidth(doc) - (shotW ? shotW + 18 : 0);
  let leftEnd = top;
  const metrics = Object.entries(lh?.metrics || {}).filter(([, v]) => v);
  if (metrics.length) {
    ensure(doc, 70);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text('Page speed details', MARGIN, doc.y);
    let y = doc.y + 4;
    const cell = (leftW - 8) / 2;
    metrics.forEach(([key, value], i) => {
      const x = MARGIN + (i % 2) * (cell + 8);
      const yy = y + Math.floor(i / 2) * 36;
      doc.roundedRect(x, yy, cell, 31, 6).fill('#eef3fb');
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(METRIC_NAMES[key] || key, x + 8, yy + 5, { width: cell - 16, lineBreak: false });
      doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(11).text(String(value), x + 8, yy + 16, { width: cell - 16, lineBreak: false });
    });
    leftEnd = y + Math.ceil(metrics.length / 2) * 36;
    doc.y = leftEnd;
  }
  if (health.headers?.items?.length) {
    doc.moveDown(0.4);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text('Security headers', MARGIN, doc.y);
    let y = doc.y + 4;
    for (const item of health.headers.items) {
      doc.fillColor(item.present ? '#14794a' : '#b3261e').font('Helvetica-Bold').fontSize(9).text(item.present ? '[ok]' : '[missing]', MARGIN, y, { width: 46, lineBreak: false });
      doc.fillColor(NAVY).font('Helvetica').text(clean(item.name), MARGIN + 50, y, { width: leftW - 50, lineBreak: false });
      y += 14;
    }
    doc.y = y;
    leftEnd = y;
  }
  if (screenshot) {
    try {
      const x = doc.page.width - MARGIN - shotW;
      doc.roundedRect(x - 4, top - 4, shotW + 8, 8, 4).fill('#ffffff');
      doc.image(screenshot, x, top, { fit: [shotW, 270], align: 'center' });
      doc.roundRect?.(0, 0, 0, 0);
      doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text('How it looks on a phone', x, top + 276, { width: shotW, align: 'center' });
      leftEnd = Math.max(leftEnd, top + 292);
    } catch {
      // an unreadable image is skipped
    }
  }
  doc.y = leftEnd + 6;
  doc.x = MARGIN;

  if (health.links) {
    ensure(doc, 40);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(`Broken links: ${health.links.broken.length} of ${health.links.checked} checked`, MARGIN, doc.y);
    doc.moveDown(0.3);
    if (!health.links.broken.length) doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('No broken links found.', MARGIN, doc.y);
    for (const b of health.links.broken) {
      ensure(doc, 16);
      const y = doc.y;
      pill(doc, MARGIN, y, 34, String(b.status ?? b.error ?? 'ERR').slice(0, 8), '#b3261e');
      doc.fillColor(NAVY).font('Helvetica').fontSize(8.5).text(clean(b.url), MARGIN + 42, y + 1, { width: contentWidth(doc) - 42 });
      doc.y = Math.max(doc.y, y + 16);
      doc.x = MARGIN;
    }
  }
  if (health.axe) {
    ensure(doc, 40);
    doc.moveDown(0.5);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(`Accessibility issues: ${health.axe.issues?.length ?? health.axe.violationCount}`, MARGIN, doc.y);
    doc.moveDown(0.3);
    if (!health.axe.issues?.length) doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('The scan found no issues.', MARGIN, doc.y);
    for (const issue of health.axe.issues || []) {
      ensure(doc, 18);
      const y = doc.y;
      pill(doc, MARGIN, y, 46, String(issue.impact || 'minor').toUpperCase(), IMPACT[issue.impact] || MUTED);
      doc.fillColor(NAVY).font('Helvetica').fontSize(9).text(`${clean(issue.help)}${issue.nodes ? `  (${issue.nodes} element${issue.nodes === 1 ? '' : 's'})` : ''}`, MARGIN + 54, y + 1, { width: contentWidth(doc) - 54 });
      doc.y = Math.max(doc.y, y + 16);
      doc.x = MARGIN;
    }
  }
}

function footer(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // writing in the footer must not start a new page
    const y = doc.page.height - 44;
    doc.moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y).lineWidth(0.5).strokeColor(LINE).stroke();
    doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(
      'Jaanch.ai gives guidance, not a guarantee. Before entering an OTP or payment details, confirm through official channels.',
      MARGIN, y + 6, { width: doc.page.width - MARGIN * 2 - 60, height: 22 },
    );
    doc.text(`Page ${i + 1} of ${range.count}`, doc.page.width - MARGIN - 60, y + 6, { width: 60, align: 'right', lineBreak: false });
  }
}

function addressLine(doc, scan) {
  const trust = scan.trust;
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text('Address checked', MARGIN, doc.y);
  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(13).text(clean(scan.url), MARGIN, doc.y + 1, { width: contentWidth(doc) });
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5);
  const bits = [`Checked on ${fmtDate(trust?.checkedAt || scan.finishedAt)}`];
  if (trust?.finalUrl && trust.finalUrl !== scan.url) bits.push(`ends up at ${trust.finalUrl}`);
  doc.text(clean(bits.join('   |   ')), MARGIN, doc.y + 2, { width: contentWidth(doc) });
  doc.moveDown(0.7);
}

/** The whole link report, in the same order as the screen. */
function scanBody(doc, scan, screenshot) {
  const trust = scan.trust;
  addressLine(doc, scan);
  verdictBlock(doc, { title: 'Trust Check', verdict: scan.verdict, score: scan.score, confidence: trust?.confidence, name: scan.hostname });
  facts(doc, scan);
  simpleWords(doc, scan);
  breakdown(doc, trust);
  findingsBlock(doc, trust?.findings);
  healthBlock(doc, scan.health, screenshot);
}

/** Returns a pdfkit document (a readable stream), already ended. */
export function buildScanPdf(scan, { screenshot = null } = {}) {
  const doc = newDoc(`Jaanch.ai report: ${scan.hostname}`);
  header(doc, 'Trust Check and Health Report');
  scanBody(doc, scan, screenshot);
  footer(doc);
  doc.end();
  return doc;
}

/** SMS report: message verdict and wording first, then each link in full. `screenshots` maps scan id to image bytes. */
export function buildSmsPdf({ overall, signals = [], reassuring = false, scans, screenshots = {} }) {
  const doc = newDoc('Jaanch.ai SMS report');
  header(doc, 'SMS check: message verdict and link reports');
  verdictBlock(doc, { title: 'Message verdict', verdict: overall?.verdict, score: overall?.score, sentence: SMS_TEXT[overall?.verdict] });

  section(doc, 'What we noticed in the message');
  if (!signals.length) doc.fillColor(MUTED).font('Helvetica').fontSize(9.5).text('Nothing unusual in the wording.', MARGIN, doc.y);
  for (const s of signals) {
    const detail = clean(s.detail?.en ?? s.detail);
    const textW = contentWidth(doc) - 62;
    ensure(doc, 40);
    const y = doc.y;
    pill(doc, MARGIN, y + 1, 52, String(s.severity || '').toUpperCase(), SMS_SIGNAL[s.severity] || MUTED);
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(clean(s.title?.en ?? s.title), MARGIN + 62, y, { width: textW });
    if (detail) doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(detail, MARGIN + 62, doc.y + 1, { width: textW });
    doc.y += 8;
    doc.x = MARGIN;
  }
  if (reassuring) {
    doc.moveDown(0.2);
    doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text('The message warns you not to share codes, which genuine alerts usually do.', MARGIN, doc.y);
  }

  section(doc, 'Links in the message');
  for (const scan of scans) {
    ensure(doc, 20);
    const y = doc.y;
    const c = COLORS[scan.verdict];
    doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(10).text(clean(scan.hostname), MARGIN, y, { width: contentWidth(doc) - 130 });
    doc.fillColor(c?.fg || MUTED).font('Helvetica-Bold').text(c ? `${c.label}  ${scan.score}` : 'not checked', doc.page.width - MARGIN - 120, y, { width: 120, align: 'right' });
    doc.y = Math.max(doc.y, y + 15) + 3;
    doc.x = MARGIN;
  }

  scans.forEach((scan, i) => {
    doc.addPage();
    doc.y = MARGIN;
    doc.x = MARGIN;
    doc.fillColor(ORANGE).font('Helvetica-Bold').fontSize(9).text(`LINK ${i + 1} OF ${scans.length}`, MARGIN, doc.y);
    doc.moveDown(0.4);
    if (scan.status === 'done') scanBody(doc, scan, screenshots[scan.id]);
    else doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('This link could not be checked.', MARGIN, doc.y);
  });
  footer(doc);
  doc.end();
  return doc;
}
