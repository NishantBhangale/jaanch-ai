import { launch } from 'chrome-launcher';
import { ChromeNotFoundError, chromeFlags, resolveChromePath } from './browser.js';

const pct = (value) => (typeof value === 'number' ? Math.round(value * 100) : null);

/** Runs Lighthouse with its default mobile profile (small phone screen, slower network). */
export async function runLighthouse(url, { signal } = {}) {
  const chromePath = await resolveChromePath();
  if (!chromePath) throw new ChromeNotFoundError();

  const { default: lighthouse } = await import('lighthouse');
  const chrome = await launch({ chromePath, chromeFlags: chromeFlags(), logLevel: 'silent' });
  const kill = () => Promise.resolve(chrome.kill()).catch(() => {});
  signal?.addEventListener('abort', kill, { once: true });

  try {
    const result = await lighthouse(url, {
      port: chrome.port,
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
      maxWaitForLoad: 45000,
    });
    const lhr = result?.lhr;
    if (!lhr) throw new Error('Lighthouse returned no result');
    if (lhr.runtimeError) throw new Error(lhr.runtimeError.message || lhr.runtimeError.code);

    const display = (id) => lhr.audits[id]?.displayValue || null;
    return {
      performance: pct(lhr.categories.performance?.score),
      accessibility: pct(lhr.categories.accessibility?.score),
      bestPractices: pct(lhr.categories['best-practices']?.score),
      seo: pct(lhr.categories.seo?.score),
      metrics: {
        firstContentfulPaint: display('first-contentful-paint'),
        largestContentfulPaint: display('largest-contentful-paint'),
        totalBlockingTime: display('total-blocking-time'),
        cumulativeLayoutShift: display('cumulative-layout-shift'),
        speedIndex: display('speed-index'),
      },
      lighthouseVersion: lhr.lighthouseVersion,
    };
  } finally {
    signal?.removeEventListener('abort', kill);
    await kill();
  }
}
