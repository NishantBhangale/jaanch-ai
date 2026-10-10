import { useEffect, useState } from 'react';
import { getScan, requestExplanation } from '../api.js';
import ExplanationCard from '../components/ExplanationCard.jsx';
import FindingList from '../components/FindingList.jsx';
import HealthPanel from '../components/HealthPanel.jsx';
import ScoreBreakdown from '../components/ScoreBreakdown.jsx';
import TrustMeter from '../components/TrustMeter.jsx';
import { useI18n } from '../i18n.jsx';
import { Link } from '../router.jsx';

const STAGES = ['queued', 'trust', 'health', 'explain'];

function Progress({ stage }) {
  const { t } = useI18n();
  const current = Math.max(0, STAGES.indexOf(stage));
  return (
    <ol className="progress" aria-live="polite">
      {STAGES.map((name, index) => (
        <li key={name} className={index < current ? 'done' : index === current ? 'active' : ''}>
          <span className="step-dot" aria-hidden="true">{index < current ? '✓' : index + 1}</span>
          <span className="step-label">{t(`stage_${name}`)}</span>
        </li>
      ))}
    </ol>
  );
}

function ShareButton() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t('copyLink'), window.location.href);
    }
  }
  return (
    <button type="button" className="secondary" onClick={copy}>
      {copied ? t('copied') : t('copyLink')}
    </button>
  );
}

export default function Report({ id }) {
  const { t, lang } = useI18n();
  const [scan, setScan] = useState(null);
  const [problem, setProblem] = useState(null); // 'notFound' | 'network'

  // Keep reading the report until the scan has finished.
  useEffect(() => {
    let cancelled = false;
    let timer;
    async function load() {
      try {
        const data = await getScan(id);
        if (cancelled) return;
        setScan(data);
        setProblem(null);
        if (data.status === 'pending' || data.status === 'running') timer = setTimeout(load, 2000);
      } catch (err) {
        if (cancelled) return;
        if (err.status === 404) {
          setProblem('notFound');
        } else {
          setProblem('network');
          timer = setTimeout(load, 4000);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id]);

  // When the language is switched, ask the server for that language's explanation once.
  const finished = scan?.status === 'done';
  const hasExplanation = Boolean(scan?.explanations?.[lang]);
  useEffect(() => {
    if (!finished || hasExplanation) return undefined;
    let cancelled = false;
    let timer;
    async function poll() {
      try {
        const data = await getScan(id);
        if (cancelled) return;
        setScan(data);
        if (!data.explanations?.[lang]) timer = setTimeout(poll, 2500);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 4000);
      }
    }
    requestExplanation(id, lang)
      .catch(() => {})
      .finally(() => {
        if (!cancelled) timer = setTimeout(poll, 1500);
      });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [finished, hasExplanation, lang, id]);

  if (problem === 'notFound') {
    return (
      <>
        <p className="notice" role="alert">{t('notFound')}</p>
        <Link to="/" className="button-link">{t('anotherSite')}</Link>
      </>
    );
  }
  if (!scan) return <p className="muted">{problem === 'network' ? t('network') : t('checking')}</p>;

  const running = scan.status === 'pending' || scan.status === 'running';

  return (
    <>
      <header className="report-head">
        <div>
          <p className="muted small">{t('siteAddress')}</p>
          {/* Shown as plain text on purpose: never make a possibly dangerous address clickable. */}
          <p className="site-address break-anywhere">{scan.url}</p>
        </div>
        <div className="actions">
          <ShareButton />
          <Link to="/" className="button-link">{t('anotherSite')}</Link>
        </div>
      </header>

      {problem === 'network' ? <p className="notice" role="alert">{t('network')}</p> : null}

      {running ? (
        <section className="card">
          <Progress stage={scan.stage || 'queued'} />
        </section>
      ) : null}

      {scan.status === 'failed' ? (
        <section className="card">
          <h2>{t('failed')}</h2>
          <p>{scan.error}</p>
          <Link to="/" className="button-link">{t('anotherSite')}</Link>
        </section>
      ) : null}

      {scan.trust ? (
        <>
          <section className={`card trust-card verdict-${scan.trust.verdict}`}>
            <h2>{t('trustCheck')}</h2>
            <TrustMeter score={scan.trust.score} verdict={scan.trust.verdict} confidence={scan.trust.confidence} />
          </section>

          {finished ? <ExplanationCard explanation={scan.explanations?.[lang]} /> : null}

          <ScoreBreakdown findings={scan.trust.findings} score={scan.trust.score} />

          <section className="card">
            <h2>{t('findings')}</h2>
            <FindingList findings={scan.trust.findings} />
          </section>
        </>
      ) : null}

      {scan.status !== 'failed' && (scan.health || running) ? (
        <section className="card">
          <h2>{t('healthReport')}</h2>
          <HealthPanel health={scan.health} screenshotUrl={scan.screenshotUrl} pending={running} />
        </section>
      ) : null}

      <p className="muted small">{t('disclaimer')}</p>
    </>
  );
}
