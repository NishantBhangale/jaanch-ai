import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

function trustProxy(value) {
  if (value === undefined || value === '') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return bool(value);
}

export const config = {
  backendRoot,
  port: int(process.env.PORT, 3000),
  trustProxy: trustProxy(process.env.TRUST_PROXY),

  databaseUrl: process.env.DATABASE_URL || '',
  pgSsl: bool(process.env.PG_SSL, false),

  workerEnabled: bool(process.env.WORKER_ENABLED, true),
  maxConcurrentScans: Math.max(1, int(process.env.MAX_CONCURRENT_SCANS, 1)),
  workerPollMs: int(process.env.WORKER_POLL_MS, 1500),
  scanTimeoutMs: int(process.env.SCAN_TIMEOUT_MS, 120000),
  scanCacheMinutes: int(process.env.SCAN_CACHE_MINUTES, 30),
  maxLinksToCheck: int(process.env.MAX_LINKS_TO_CHECK, 25),

  rateLimitMax: int(process.env.RATE_LIMIT_MAX, 10),
  rateLimitWindowMin: int(process.env.RATE_LIMIT_WINDOW_MIN, 15),
  allowPrivateTargets: bool(process.env.ALLOW_PRIVATE_TARGETS, false),

  safeBrowsingKey: process.env.SAFE_BROWSING_API_KEY || '',
  openPhishEnabled: bool(process.env.OPENPHISH_ENABLED, true),
  openPhishRefreshHours: int(process.env.OPENPHISH_REFRESH_HOURS, 12),
  // Registration dates come from the registry's own RDAP server (found through the IANA list);
  // rdap.org is only a fallback because it is rate limited and sometimes unreachable.
  rdapBootstrapUrl: process.env.RDAP_BOOTSTRAP_URL || 'https://data.iana.org/rdap/dns.json',
  rdapBase: process.env.RDAP_BASE === undefined ? 'https://rdap.org/domain/' : process.env.RDAP_BASE,

  chromePath: process.env.CHROME_PATH || '',
  chromeNoSandbox: bool(process.env.CHROME_NO_SANDBOX, isRoot),

  llmProvider: (process.env.LLM_PROVIDER || 'ollama').toLowerCase(),
  llmTimeoutMs: int(process.env.LLM_TIMEOUT_MS, 90000),
  ollamaUrl: (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'gemma2:9b',
  bedrockRegion: process.env.BEDROCK_REGION || process.env.AWS_REGION || 'ap-south-1',
  bedrockModelId: process.env.BEDROCK_MODEL_ID || '',

  // AI second opinion on every scan: it can only add caution, never make a verdict safer.
  aiReviewEnabled: bool(process.env.AI_REVIEW, true),
  aiReviewTimeoutMs: int(process.env.AI_REVIEW_TIMEOUT_MS, 25000),

  // Optional accounts. Set SESSION_SECRET to a long random string so logins survive restarts.
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionDays: int(process.env.SESSION_DAYS, 30),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),

  s3Bucket: process.env.S3_BUCKET || '',
  s3Region: process.env.S3_REGION || process.env.AWS_REGION || process.env.BEDROCK_REGION || 'ap-south-1',
  localScreenshotDir: path.join(backendRoot, 'data', 'screenshots'),
  publicDir: path.join(backendRoot, 'public'),
};
