import { useI18n } from '../i18n.jsx';

// Shows how each finding moved the score up or down from the starting 50.
export default function ScoreBreakdown({ findings, score }) {
  const { t } = useI18n();
  const rows = findings.filter((f) => typeof f.points === 'number' && f.points !== 0);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((f) => Math.abs(f.points)), 10);

  return (
    <section className="card" aria-labelledby="breakdown-title">
      <h2 id="breakdown-title">{t('breakdownTitle')}</h2>
      <p className="muted small">{t('breakdownNote')}</p>
      <ul className="breakdown">
        {rows.map((f) => {
          const width = `${(Math.abs(f.points) / max) * 50}%`;
          const positive = f.points > 0;
          return (
            <li key={f.id}>
              <span className="bd-label">{f.title}</span>
              <span className="bd-track" aria-hidden="true">
                <span className="bd-mid" />
                <span className={`bd-bar ${positive ? 'bd-pos' : 'bd-neg'}`} style={{ width }} />
              </span>
              <span className={`bd-points ${positive ? 'pos' : 'neg'}`}>
                {positive ? '+' : ''}
                {f.points}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="bd-total">
        {t('breakdownBase')}: <strong>50</strong> → {t('trustScore')}: <strong>{score}</strong>
      </p>
    </section>
  );
}
