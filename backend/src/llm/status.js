import { config } from '../config.js';
import { activitySnapshot, USE_CASES } from './activity.js';

// A call that ends stays "running" for this long, so a short call is still visible on the page.
export const LINGER_MS = 3000;

let cached = null;
const CACHE_MS = 15_000;

/** Is the configured model service reachable? Cheap check, cached for a few seconds. */
async function probe() {
  const provider = config.llmProvider;
  if (provider === 'none') return { reachable: false, detail: 'AI is switched off on this server' };
  if (provider === 'ollama') {
    try {
      const res = await fetch(`${config.ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) return { reachable: false, detail: `Ollama answered ${res.status}` };
      const data = await res.json().catch(() => ({}));
      const names = (data.models || []).map((m) => m.name);
      const wanted = config.ollamaModel.includes(':') ? config.ollamaModel : `${config.ollamaModel}:latest`;
      if (names.length && !names.includes(wanted)) return { reachable: false, detail: `Model ${config.ollamaModel} is not downloaded yet` };
      return { reachable: true, detail: null };
    } catch {
      return { reachable: false, detail: 'Cannot reach Ollama' };
    }
  }
  if (provider === 'bedrock') {
    // There is no free ping for Bedrock. It counts as online when configured and the last call worked.
    if (!config.bedrockModelId) return { reachable: false, detail: 'BEDROCK_MODEL_ID is not set' };
    const { lastOkAt, lastErrorAt } = activitySnapshot();
    if (lastErrorAt && (!lastOkAt || lastErrorAt > lastOkAt)) return { reachable: false, detail: 'The last Bedrock call failed' };
    return { reachable: true, detail: null };
  }
  return { reachable: false, detail: `Unknown LLM_PROVIDER "${provider}"` };
}

export function serviceName() {
  if (config.llmProvider === 'ollama') return { provider: 'Ollama', model: config.ollamaModel };
  if (config.llmProvider === 'bedrock') return { provider: 'Amazon Bedrock', model: config.bedrockModelId || null };
  return { provider: 'Rules only', model: null };
}

/** queue = { pending, running } from the store. */
export async function aiStatus(queue = { pending: 0, running: 0 }) {
  if (!cached || Date.now() - cached.at > CACHE_MS) cached = { at: Date.now(), value: await probe() };
  const { reachable, detail } = cached.value;
  const activity = activitySnapshot();
  const off = config.llmProvider === 'none';
  // "Working" means the AI model itself is being used right now (or was, a moment ago). Scans that are
  // only running the rule checks do not count: the light is about the AI service.
  const working = activity.active > 0 || Date.now() - activity.lastEndAt < LINGER_MS;
  const activeTasks = Object.keys(activity.tasks);
  if (!activeTasks.length && working && activity.lastTask) activeTasks.push(activity.lastTask);
  return {
    ...serviceName(),
    state: off ? 'off' : reachable ? 'online' : 'offline',
    detail,
    working,
    activeTasks,
    useCases: USE_CASES,
    activeAiCalls: activity.active,
    queue,
    reviewEnabled: config.aiReviewEnabled && !off,
    lastOkAt: activity.lastOkAt,
    totalCalls: activity.total,
    failedCalls: activity.failed,
    checkedAt: new Date(cached.at).toISOString(),
  };
}

export const resetStatusCache = () => { cached = null; };
