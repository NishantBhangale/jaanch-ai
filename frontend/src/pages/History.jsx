import { useEffect, useState } from 'react';
import { getHistory } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';
import { Link } from '../router.jsx';

function when(value, lang) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function History() {
  const { t, lang } = useI18n();
  const { user, ready, openAuth } = useAuth();
  const [items, setItems] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!user) return undefined;
    let cancelled = false;
    getHistory().then(
      (data) => !cancelled && setItems(data.items),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!ready) return <p className="muted">{t('checking')}</p>;
  if (!user) {
    return (
      <section className="card history-gate">
        <h1>{t('historyTitle')}</h1>
        <p className="muted">{t('historyLoginNote')}</p>
        <div className="report-actions">
          <button type="button" onClick={() => openAuth('login')}>{t('login')}</button>
          <button type="button" className="secondary" onClick={() => openAuth('signup')}>{t('signup')}</button>
          <Link to="/" className="button-link">{t('backToCheck')}</Link>
        </div>
      </section>
    );
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('historyTitle')}</h1>
          <p className="muted">{t('historyNote')}</p>
        </div>
        <Link to="/" className="button-link primary-action">{t('newCheck')}</Link>
      </div>
      {failed ? <p className="notice" role="alert">{t('network')}</p> : null}
      {!items && !failed ? <p className="muted">{t('checking')}</p> : null}
      {items && items.length === 0 ? (
        <section className="card"><p className="muted">{t('historyEmpty')}</p></section>
      ) : null}
      {items && items.length ? (
        <ul className="history-list">
          {items.map((item) => (
            <li key={item.id || item.group}>
              <Link to={item.type === 'sms' ? `/sms/${item.group}` : `/report/${item.id}`} className={`history-item verdict-${item.verdict || 'none'}`}>
                <span className="history-kind">{item.type === 'sms' ? t('kindSms') : t('kindLink')}</span>
                <span className="history-main">
                  <strong className="break-anywhere">{item.hostname}</strong>
                  <span className="muted small">{when(item.createdAt, lang)}</span>
                </span>
                <span className="history-verdict">
                  {item.verdict ? `${t(`verdict_${item.verdict}`)} · ${item.score}` : t('checking')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
