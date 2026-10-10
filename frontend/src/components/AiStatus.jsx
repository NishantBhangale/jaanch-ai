import { useEffect, useState } from 'react';
import { getAiStatus } from '../api.js';
import { useI18n } from '../i18n.jsx';

// A small light in the header: is the AI service on, and is it busy right now?
export default function AiStatus() {
  const { t, lang } = useI18n();
  const [status, setStatus] = useState(null);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer;
    async function load() {
      try {
        const data = await getAiStatus();
        if (!cancelled) {
          setStatus(data);
          setUnreachable(false);
        }
      } catch {
        if (!cancelled) setUnreachable(true);
      }
      // Quick polling so a short AI call is seen, and a slow one while the tab is hidden.
      if (!cancelled) timer = setTimeout(load, document.hidden ? 30000 : 2000);
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (unreachable && !status) return null;
  if (!status) return null;

  const state = status.state; // online | offline | off
  const working = state === 'online' && status.working;
  const tone = state === 'offline' ? 'bad' : state === 'off' ? 'off' : working ? 'busy' : 'ok';
  const word = state === 'off' ? t('aiOff') : state === 'offline' ? t('aiOffline') : working ? t('aiWorking') : t('aiReady');
  const queue = status.queue ? status.queue.pending + status.queue.running : 0;
  const cases = status.useCases || [];
  const caseName = (id) => cases.find((c) => c.id === id)?.[lang] || cases.find((c) => c.id === id)?.en || id;
  const doing = working ? (status.activeTasks || []).map(caseName).join(', ') : '';
  const tip = [
    `${t('aiService')}: ${status.provider}${status.model ? ` (${status.model})` : ''}`,
    status.detail || null,
    doing ? `${t('aiNowDoing')}: ${doing}` : null,
    queue ? `${t('aiQueue')}: ${queue}` : null,
    cases.length ? `${t('aiUsedFor')}: ${cases.map((c) => caseName(c.id)).join('; ')}` : null,
    status.reviewEnabled ? t('aiReviewOn') : null,
  ].filter(Boolean).join('\n');

  return (
    <span className={`ai-pill ai-${tone}`} title={tip} role="status" aria-label={`${t('aiService')}: ${status.provider}, ${word}`}>
      <i className="ai-dot" aria-hidden="true" />
      <span className="ai-name">{status.provider}</span>
      <span className="ai-word">{word}</span>
      {doing ? <span className="ai-doing">{doing}</span> : null}
    </span>
  );
}
