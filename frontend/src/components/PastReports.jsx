import { useI18n } from '../i18n.jsx';

/** What the web says about this site or fake copies of its brand. Sources are real search results. */
export default function PastReports({ incidents }) {
  const { t } = useI18n();
  if (!incidents) return null;

  if (incidents.status === 'pending') {
    return (
      <section className="card past-reports" aria-live="polite">
        <h2>{t('pastReports')}</h2>
        <p className="muted past-pending">
          <span className="spinner small" aria-hidden="true" /> {t('pastChecking')}
        </p>
      </section>
    );
  }

  return (
    <section className="card past-reports" aria-live="polite">
      <h2>{t('pastReports')}</h2>
      {incidents.status === 'done' ? (
        <>
          {incidents.summary ? <p className="explanation-text">{incidents.summary}</p> : null}
          <ul className="past-list">
            {incidents.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.title}</a>
                <span className="muted small"> · {s.host}{s.exact ? ` · ${t('pastExact')}` : ''}</span>
              </li>
            ))}
          </ul>
          <p className="muted small">
            {incidents.summary && incidents.provider ? `${t('pastByAi')} ` : ''}{t('pastNote')}
          </p>
        </>
      ) : incidents.status === 'unavailable' ? (
        <p className="muted">{t('pastUnavailable')}</p>
      ) : (
        <p className="muted">{t('pastNone')}</p>
      )}
    </section>
  );
}
