import { useI18n } from '../i18n.jsx';

export default function ExplanationCard({ explanation }) {
  const { t } = useI18n();
  return (
    <section className="card explanation" aria-live="polite">
      <h2>{t('explanation')}</h2>
      {explanation ? (
        <>
          <p className="explanation-text">{explanation.text}</p>
          {explanation.fallback ? <p className="muted small">{t('aiFallback')}</p> : null}
        </>
      ) : (
        <p className="muted">{t('preparing')}</p>
      )}
    </section>
  );
}
