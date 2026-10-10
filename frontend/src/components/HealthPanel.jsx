import { useI18n } from '../i18n.jsx';

const RING_R = 26;
const RING_C = 2 * Math.PI * RING_R;

function tone(value) {
  if (typeof value !== 'number') return 'none';
  if (value >= 90) return 'good';
  if (value >= 50) return 'warn';
  return 'bad';
}

function Ring({ value, label }) {
  const filled = typeof value === 'number' ? (value / 100) * RING_C : 0;
  return (
    <div className="ring">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={RING_R} className="ring-bg" />
        <circle
          cx="32"
          cy="32"
          r={RING_R}
          className={`ring-fg ring-${tone(value)}`}
          strokeDasharray={`${filled} ${RING_C}`}
          transform="rotate(-90 32 32)"
        />
      </svg>
      <span className="ring-value">{typeof value === 'number' ? value : '–'}</span>
      <span className="ring-label">{label}</span>
    </div>
  );
}

const METRIC_NAMES = {
  en: {
    firstContentfulPaint: 'First content shown',
    largestContentfulPaint: 'Main content shown',
    totalBlockingTime: 'Time page is unresponsive',
    cumulativeLayoutShift: 'Layout jumping',
    speedIndex: 'Speed index',
  },
  hi: {
    firstContentfulPaint: 'पहली सामग्री दिखी',
    largestContentfulPaint: 'मुख्य सामग्री दिखी',
    totalBlockingTime: 'पेज जवाब नहीं देता',
    cumulativeLayoutShift: 'लेआउट का हिलना',
    speedIndex: 'स्पीड इंडेक्स',
  },
};

const SHOW = 4;

function More({ total }) {
  const { t } = useI18n();
  return total > SHOW ? <li className="muted small">+{total - SHOW} {t('more')}</li> : null;
}

export default function HealthPanel({ health, screenshotUrl, pending }) {
  const { t, lang } = useI18n();

  if (!health) {
    return <p className="muted">{pending ? t('healthPending') : t('healthUnavailable')}</p>;
  }

  const lh = health.lighthouse;
  const errors = Object.values(health.errors || {});
  const hasData = lh || health.axe || health.links || health.headers;
  const metrics = lh?.metrics ? Object.entries(lh.metrics).filter(([, value]) => value) : [];

  return (
    <div className="health">
      <div className="health-top">
        {hasData ? (
          <div className="rings">
            <Ring value={health.healthScore} label={t('overall')} />
            <Ring value={lh?.performance} label={t('perf')} />
            <Ring value={lh?.accessibility} label={t('a11y')} />
            <Ring value={lh?.bestPractices} label={t('bestPractices')} />
            <Ring value={lh?.seo} label={t('seo')} />
            <Ring value={health.headers?.score} label={t('headers')} />
            <Ring value={health.linksScore} label={t('links')} />
          </div>
        ) : (
          <p className="muted">{t('healthUnavailable')}</p>
        )}
        {screenshotUrl ? (
          <figure className="shot">
            <img src={screenshotUrl} alt={t('screenshot')} loading="lazy" onError={(e) => { e.currentTarget.closest('figure').style.display = 'none'; }} />
            <figcaption>{t('screenshot')}</figcaption>
          </figure>
        ) : null}
      </div>

      {errors.map((message) => (
        <p key={message} className="notice">{message}</p>
      ))}

      <div className="health-cols">
        {metrics.length ? (
          <section>
            <h3>{t('metrics')}</h3>
            <dl className="metrics">
              {metrics.map(([key, value]) => (
                <div key={key}>
                  <dt>{METRIC_NAMES[lang][key] || key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {health.headers ? (
          <section>
            <h3>{t('headers')}</h3>
            <ul className="chips">
              {health.headers.items.map((item) => (
                <li key={item.id} className={item.present ? 'chip chip-ok' : 'chip chip-miss'} title={item.name}>
                  <span aria-hidden="true">{item.present ? '✓' : '✕'}</span>
                  <span className="sr-only">{item.present ? t('headersPresent') : t('headersMissing')}: </span>
                  {item.name}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="health-cols">
        {health.links ? (
          <section>
            <h3>
              {t('brokenLinks')}{' '}
              <span className={`count ${health.links.broken.length ? 'count-bad' : 'count-ok'}`}>
                {health.links.broken.length}/{health.links.checked}
              </span>
            </h3>
            {health.links.broken.length === 0 ? (
              <p className="muted small">{t('noBrokenLinks')}</p>
            ) : (
              <ul className="plain-list tight">
                {health.links.broken.slice(0, SHOW).map((link) => (
                  <li key={link.url}>
                    <span className="pill pill-serious">{link.status ?? link.error}</span>{' '}
                    <span className="break-anywhere small">{link.url}</span>
                  </li>
                ))}
                <More total={health.links.broken.length} />
              </ul>
            )}
          </section>
        ) : null}

        {health.axe ? (
          <section>
            <h3>
              {t('accessIssues')} <span className="count">{health.axe.issues.length}</span>
            </h3>
            {health.axe.issues.length === 0 ? (
              <p className="muted small">{t('noIssues')}</p>
            ) : (
              <ul className="plain-list tight">
                {health.axe.issues.slice(0, SHOW).map((issue) => (
                  <li key={issue.id}>
                    <span className={`pill pill-${issue.impact}`}>{issue.impact}</span>{' '}
                    <a href={issue.helpUrl} target="_blank" rel="noopener noreferrer" className="small">{issue.help}</a>
                  </li>
                ))}
                <More total={health.axe.issues.length} />
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
