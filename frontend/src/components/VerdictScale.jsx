import { useI18n } from '../i18n.jsx';

// Home page strip that shows what the three verdicts mean and the score ranges behind them.
export default function VerdictScale() {
  const { t } = useI18n();
  return (
    <section className="scale" aria-labelledby="scale-title">
      <h2 id="scale-title">{t('scaleTitle')}</h2>
      <div className="scale-bar" aria-hidden="true">
        <span className="scale-bad" style={{ flexBasis: '40%' }}>0–39</span>
        <span className="scale-warn" style={{ flexBasis: '30%' }}>40–69</span>
        <span className="scale-good" style={{ flexBasis: '30%' }}>70–100</span>
      </div>
      <ul className="scale-list">
        <li className="verdict-likely_fake">
          <strong>{t('verdict_likely_fake')}</strong>
          <span>{t('scaleFake')}</span>
        </li>
        <li className="verdict-careful">
          <strong>{t('verdict_careful')}</strong>
          <span>{t('scaleCareful')}</span>
        </li>
        <li className="verdict-safe">
          <strong>{t('verdict_safe')}</strong>
          <span>{t('scaleSafe')}</span>
        </li>
      </ul>
    </section>
  );
}
