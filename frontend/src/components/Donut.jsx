const R = 54;
const C = 2 * Math.PI * R;

// Donut chart of verdict counts. `parts` = [{ key, value, label }]; colours come from CSS classes.
export default function Donut({ parts, total, centerLabel }) {
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
        <circle cx="70" cy="70" r={R} className="donut-bg" />
        {total > 0
          ? parts.map((part) => {
              const length = (part.value / total) * C;
              const circle = (
                <circle
                  key={part.key}
                  cx="70"
                  cy="70"
                  r={R}
                  className={`donut-seg donut-${part.key}`}
                  strokeDasharray={`${length} ${C - length}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 70 70)"
                />
              );
              offset += length;
              return circle;
            })
          : null}
        <text x="70" y="68" textAnchor="middle" className="donut-total">{total}</text>
        <text x="70" y="88" textAnchor="middle" className="donut-caption">{centerLabel}</text>
      </svg>
      <ul className="donut-legend">
        {parts.map((part) => (
          <li key={part.key}>
            <span className={`dot dot-${part.key}`} aria-hidden="true" />
            {part.label} <strong>{part.value}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
