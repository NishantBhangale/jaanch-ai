import { useEffect, useState } from 'react';
import { getDashboard } from '../api.js';
import Donut from '../components/Donut.jsx';
import { useI18n } from '../i18n.jsx';
import { Link } from '../router.jsx';

export default function Dashboard() {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getDashboard().then(
      (result) => !cancelled && setData(result),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="notice" role="alert">{t('network')}</p>;
  if (!data) return <p className="muted">{t('checking')}</p>;

  const { stats, recentLikelyFake } = data;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('dashboardTitle')}</h1>
          <p className="muted">{t('dashboardNote')}</p>
        </div>
        <Link to="/" className="button-link primary-action">{t('newCheck')}</Link>
      </div>
      <div className="stats">
        <div className="card stat">
          <span className="stat-number">{stats.total}</span>
          <span>{t('totalChecks')}</span>
        </div>
        {['safe', 'careful', 'likely_fake'].map((key) => (
          <div key={key} className={`card stat verdict-${key}`}>
            <span className="stat-number">{stats.byVerdict[key]}</span>
            <span>{t(`verdict_${key}`)}</span>
          </div>
        ))}
      </div>
      <section className="card">
        <h2>{t('donutTitle')}</h2>
        <Donut
          total={stats.total}
          centerLabel={t('totalChecks')}
          parts={['safe', 'careful', 'likely_fake'].map((key) => ({
            key,
            value: stats.byVerdict[key],
            label: t(`verdict_${key}`),
          }))}
        />
      </section>
      <section className="card">
        <h2>{t('recentFake')}</h2>
        {recentLikelyFake.length === 0 ? (
          <p className="muted">{t('noneYet')}</p>
        ) : (
          <ul className="plain-list">
            {recentLikelyFake.map((site) => (
              <li key={site.hostname}>
                <span className="break-anywhere">{site.hostname}</span>{' '}
                <span className="muted small">
                  {t('trustScore')}: {site.score}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
