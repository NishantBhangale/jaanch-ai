import { Fragment, useEffect, useState } from 'react';
import DomainFacts from '../components/DomainFacts.jsx';
import ExplanationCard from '../components/ExplanationCard.jsx';
import FindingList from '../components/FindingList.jsx';
import HealthPanel from '../components/HealthPanel.jsx';
import ScoreBreakdown from '../components/ScoreBreakdown.jsx';
import TrustMeter from '../components/TrustMeter.jsx';
import { useI18n } from '../i18n.jsx';
import { Link } from '../router.jsx';
import { scanPdfUrl } from '../api.js';
import ReportActions from '../components/ReportActions.jsx';
import { useScan } from '../useScan.js';

const STAGES = ['queued', 'trust', 'ai', 'health', 'explain'];

export function Progress({ stage }) {
  const { t } = useI18n();
  const current = Math.max(0, STAGES.indexOf(stage));
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const percent = Math.round(((current + 0.5) / STAGES.length) * 100);
  return (
    <div className="progress-wrap">
      <div className="progress-top">
        <span className="progress-title"><span className="spinner" aria-hidden="true" />{t('checkingNow')}<span className="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></span>
        <span className="progress-time">{seconds}s</span>
      </div>
      <div className="progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <ol className="progress" aria-live="polite">
        {STAGES.map((name, index) => (
          <li key={name} className={index < current ? 'done' : index === current ? 'active' : ''}>
            <span className="step-dot" aria-hidden="true">{index < current ? '✓' : index === current ? <span className="spinner small" /> : index + 1}</span>
            <span className="step-label">{t(`stage_${name}`)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The right-hand column: what was checked, and the health of the site. */
export function RightColumn({ scan }) {
  const { t } = useI18n();
  const running = scan.status === 'pending' || scan.status === 'running';
  return (
    <>
      {scan.trust ? (
        <section className="card">
          <h2>{t('findings')}</h2>
          <FindingList findings={scan.trust.findings} />
        </section>
      ) : null}
      {scan.status !== 'failed' && (scan.health || running) ? (
        <section className="card">
          <h2>{t('healthReport')}</h2>
          <HealthPanel health={scan.health} screenshotUrl={scan.screenshotUrl} pending={running} />
        </section>
      ) : null}
    </>
  );
}

/** The left-hand column: the verdict, the plain-words explanation and how the score was built. */
export function LeftColumn({ scan, lang }) {
  const { t } = useI18n();
  const finished = scan.status === 'done';
  return (
    <>
      {scan.trust ? (
        <>
          <section className={`card trust-card verdict-${scan.trust.verdict}`}>
            <h2>{t('trustCheck')}</h2>
            <TrustMeter score={scan.trust.score} verdict={scan.trust.verdict} confidence={scan.trust.confidence} />
            <DomainFacts trust={scan.trust} requestedUrl={scan.url} />
          </section>
          {finished ? <ExplanationCard explanation={scan.explanations?.[lang]} /> : null}
          <ScoreBreakdown findings={scan.trust.findings} score={scan.trust.score} />
        </>
      ) : null}
    </>
  );
}

export default function LinkReport({ id }) {
  const { t, lang } = useI18n();
  const { scan, problem } = useScan(id, lang);

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
    <Fragment>
      <header className="report-head">
        <div>
          <p className="muted small">{t('siteAddress')}</p>
          {/* Plain text on purpose: never make a possibly dangerous address clickable. */}
          <p className="site-address break-anywhere">{scan.url}</p>
        </div>
        <ReportActions pdfUrl={scanPdfUrl(scan.id)} ready={scan.status === 'done'} />
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
        </section>
      ) : null}

      <div className="report-grid">
        <div className="col col-left">
          <LeftColumn scan={scan} lang={lang} />
        </div>
        <div className="col col-right">
          <RightColumn scan={scan} />
        </div>
      </div>
    </Fragment>
  );
}
