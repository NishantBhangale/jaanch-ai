const VERDICT_TEXT = { safe: 'Safe', careful: 'Be Careful', likely_fake: 'Likely Fake' };

const LANGUAGE_RULE = {
  en: 'Write in simple, clear English that anyone can understand.',
  hi: 'Write in simple Hindi using Devanagari script. Keep technical words such as HTTPS, URL, OTP, domain and Google in English letters.',
};
const ACTION_LABEL = { en: 'What you can do:', hi: 'आप क्या कर सकते हैं:' };

function healthLines(health) {
  if (!health) return 'Health report not available.';
  const lines = [];
  const lh = health.lighthouse;
  if (lh) {
    lines.push(
      `Lighthouse (mobile): performance ${lh.performance}/100, accessibility ${lh.accessibility}/100, best practices ${lh.bestPractices}/100, SEO ${lh.seo}/100`,
    );
  }
  if (health.axe) {
    lines.push(
      `Accessibility scan: ${health.axe.violationCount} issue type(s), ${health.axe.counts.critical} critical, ${health.axe.counts.serious} serious`,
    );
  }
  if (health.links) lines.push(`Links: ${health.links.broken.length} broken out of ${health.links.checked} checked`);
  if (health.headers) {
    const missing = health.headers.items.filter((i) => !i.present).map((i) => i.name);
    lines.push(`Security headers: ${missing.length ? `missing ${missing.join(', ')}` : 'all common ones present'}`);
  }
  return lines.length ? lines.join('\n') : 'Health report not available.';
}

/** The LLM only explains. The verdict and score below were already decided by fixed rules. */
export function buildPrompt(scan, lang) {
  const language = lang === 'hi' ? 'hi' : 'en';
  const { trust } = scan;
  const findings = (trust.findings || [])
    .filter((f) => f.status !== 'skipped')
    .slice(0, 12)
    .map((f) => `- [${f.status}] ${f.title}${f.detail ? `: ${f.detail}` : ''}`)
    .join('\n');

  const system = [
    'You explain website safety check results to ordinary people in India, including people who are not technical.',
    'Rules:',
    '1. The verdict and Trust Score were decided by fixed rules. Never change, question or contradict them.',
    '2. Use only the facts given in the findings. Do not invent facts.',
    '3. Never say a site is definitely fake or definitely safe. This is guidance, not a guarantee.',
    `4. ${LANGUAGE_RULE[language]}`,
    `5. Format: first one sentence stating the verdict in plain words. Then 2 to 4 short sentences about the main reasons. Then a line "${ACTION_LABEL[language]}" followed by up to 3 short lines that each start with "- ". No other formatting, no headings, no markdown.`,
    '6. Keep the whole answer under 120 words.',
  ].join('\n');

  const user = [
    `Website: ${scan.hostname}`,
    `Verdict: ${VERDICT_TEXT[trust.verdict]} (Trust Score ${trust.score}/100, confidence ${trust.confidence})`,
    '',
    'Trust findings:',
    findings || '- none',
    '',
    'Health report:',
    healthLines(scan.health),
  ].join('\n');

  return { system, user };
}
