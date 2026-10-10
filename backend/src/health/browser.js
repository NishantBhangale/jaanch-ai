import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { config } from '../config.js';

let cached;

/**
 * Finds a Chrome or Chromium to use for both Lighthouse and Playwright:
 * CHROME_PATH, then a Playwright-installed Chromium, then a normally installed Chrome.
 */
export async function resolveChromePath() {
  if (cached !== undefined) return cached;
  let found = config.chromePath || '';
  if (!found) {
    try {
      const candidate = chromium.executablePath();
      if (candidate && fs.existsSync(candidate)) found = candidate;
    } catch {
      // not installed
    }
  }
  if (!found) {
    try {
      const { getChromePath } = await import('chrome-launcher');
      found = getChromePath();
    } catch {
      // no Chrome installation found
    }
  }
  cached = found || null;
  return cached;
}

export class ChromeNotFoundError extends Error {
  constructor() {
    super('Chrome was not found. Install Google Chrome, or set CHROME_PATH in backend/.env.');
    this.name = 'ChromeNotFoundError';
  }
}

export function chromeFlags() {
  const flags = [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--mute-audio',
    '--ignore-certificate-errors', // the Trust Check reports certificate problems, health checks still run
  ];
  if (config.chromeNoSandbox) flags.push('--no-sandbox');
  return flags;
}
