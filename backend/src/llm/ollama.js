import { config } from '../config.js';

/** Local open-source model through Ollama (http://localhost:11434). No API key needed. */
export async function explainWithOllama({ system, user, json = false, timeoutMs }) {
  const res = await fetch(`${config.ollamaUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs || config.llmTimeoutMs),
    body: JSON.stringify({
      model: config.ollamaModel,
      stream: false,
      ...(json ? { format: 'json' } : {}),
      options: { temperature: 0.2, num_predict: 400 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Ollama returned ${res.status}${body ? `: ${body.slice(0, 150)}` : ''}`);
  }
  const data = await res.json();
  return data?.message?.content || '';
}
