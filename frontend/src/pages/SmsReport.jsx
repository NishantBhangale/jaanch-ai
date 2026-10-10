import { useState } from 'react';
import DomainFacts from '../components/DomainFacts.jsx';
import SmsSignals from '../components/SmsSignals.jsx';
import TrustMeter from '../components/TrustMeter.jsx';
import { useI18n } from '../i18n.jsx';
import { Link } from '../router.jsx';
import { useSms } from '../useScan.js';
import { smsPdfUrl } from '../api.js';
import ReportActions from '../components/ReportActions.jsx';
import { RightColumn } from './LinkReport.jsx';

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function readNoLinkResult() {
  try {
    return JSON.parse(window.sessionStorage.getItem('jaanch-sms-nolink'));
  } catch {
    return null;
  }
}

function OverallCard({ overall, linkCount }) {
  const { t } = useI18n();
  const ready = overall.status === 'done' && ['safe', 'careful', 'likely_fake'].includes(overall.verdict);
  return (
    <section className={`card trust-card ${ready ? `verdict-${overall.verdict}` : ''}`}>
      <h2>{t('smsVerdictTitle')}</h2>
      {ready ? (
        <>
          <TrustMeter score={overall.score} verdict={overall.verdict} />
          <p className="sms-verdict-text">{t(`smsVerdict_${overall.verdict}`)}</p>
        </>
      ) : overall.status === 'failed' ? (
        <p className="muted">{t('smsAllFailed')}</p>
      ) : (
        <p className="muted">
          {t('smsChecking').replace('{n}', linkCount)}
        </p>
      )}
    </section>
  );
}

function NoLink() {
  const { t } = useI18n();
  const result = readNoLinkResult();
  return (
    <div className="report-grid">
      <div className="col col-left">
        <section className="card">
          <h2>{t('smsVerdictTitle')}</h2>
          <p className="sms-verdict-text">{t('smsNoLink')}</p>
          <p className="muted small">{t('smsNoLinkHelp')}</p>
        </section>
      </div>
      <div className="col col-right">
        {result ? <SmsSignals signals={result.signals} reassuring={result.reassuring} /> : null}
        <Link to="/" className="button-link">{t('anotherMessage')}</Link>
      </div>
    </div>
  );
}

export default function SmsReport({ group }) {
  const { t } = useI18n();
  const { sms, problem } = useSms(group === 'none' ? null : group);
  const [chosen, setChosen] = useState(null);

  if (group === 'none') return <NoLink />;
  if (problem === 'notFound') {
    return (
      <>
        <p className="notice" role="alert">{t('notFound')}</p>
        <Link to="/" className="button-link">{t('anotherMessage')}</Link>
      </>
    );
  }
  if (!sms) return <p className="muted">{problem === 'network' ? t('network') : t('checking')}</p>;

  const links = sms.links;
  const selected = links.find((l) => l.id === chosen) || links.find((l) => l.id === sms.overall.worstLink) || links[0];

  return (
    <>
      <header className="report-head">
        <div>
          <p className="muted small">{t('smsFound').replace('{n}', links.length)}</p>
          <p className="site-address">{t('smsReportTitle')}</p>
        </div>
        <ReportActions pdfUrl={smsPdfUrl(group)} ready={links.every((l) => l.status === 'done' || l.status === 'failed')} />
      </header>

      <div className="report-grid">
        <div className="col col-left">
          <OverallCard overall={sms.overall} linkCount={links.length} />
          <SmsSignals signals={sms.signals} reassuring={sms.reassuring} />
          <section className="card">
            <h2>{t('smsLinks')}</h2>
            <ul className="link-list">
              {links.map((link) => {
                const running = link.status === 'pending' || link.status === 'running';
                return (
                  <li key={link.id}>
                    <button
                      type="button"
                      className={`link-item ${link.id === selected.id ? 'is-selected' : ''}`}
                      onClick={() => setChosen(link.id)}
                      aria-pressed={link.id === selected.id}
                    >
                      <span className="break-anywhere link-host">{hostOf(link.url)}</span>
                      {running ? (
                        <span className="chip-running">{t('checking')}</span>
                      ) : (
                        <span className={`verdict-chip verdict-${link.verdict || 'careful'}`}>
                          {link.verdict ? t(`verdict_${link.verdict}`) : '–'}
                          {typeof link.score === 'number' ? ` · ${link.score}` : ''}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <div className="col col-right">
          <section className="card">
            <h2>{t('smsLinkDetails')}</h2>
            <p className="site-address break-anywhere">{selected.url}</p>
            {selected.trust ? <DomainFacts trust={selected.trust} requestedUrl={selected.url} /> : null}
            <p>
              <Link to={`/report/${selected.id}`} className="small">{t('openFullReport')}</Link>
            </p>
          </section>
          <RightColumn scan={selected} />
        </div>
      </div>
    </>
  );
}
