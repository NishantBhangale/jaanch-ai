import { useI18n } from '../i18n.jsx';

// What the wording of the message gives away. Shown next to the link results.
export default function SmsSignals({ signals, reassuring }) {
  const { t, lang } = useI18n();
  return (
    <section className="card">
      <h2>{t('smsNoticed')}</h2>
      {signals.length === 0 ? (
        <p className="muted">{t('smsNoWording')}</p>
      ) : (
        <ul className="signals">
          {signals.map((signal) => (
            <li key={signal.id} className={`signal signal-${signal.severity}`}>
              <span className="signal-pill">{signal.severity === 'high' ? t('sevHigh') : t('sevMedium')}</span>
              <div>
                <p className="signal-title">{signal.title[lang] || signal.title.en}</p>
                <p className="signal-detail">{signal.detail[lang] || signal.detail.en}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {reassuring ? <p className="muted small">{t('smsReassuring')}</p> : null}
    </section>
  );
}
