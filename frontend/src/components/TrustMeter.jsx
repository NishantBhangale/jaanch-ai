import { useEffect, useState } from 'react';
import { useI18n } from '../i18n.jsx';

const CX = 120;
const CY = 120;
const R = 90;

// 0 is the far left of the half circle, 100 the far right.
function point(score, radius = R) {
  const angle = Math.PI * (1 - score / 100);
  return [CX + radius * Math.cos(angle), CY - radius * Math.sin(angle)];
}

function arc(from, to) {
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

export default function TrustMeter({ score, verdict, confidence }) {
  const { t } = useI18n();
  // Start the needle at 0 and let CSS sweep it to the score once the meter is on screen.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const label = t(`verdict_${verdict}`);

  return (
    <div className={`meter verdict-${verdict}`}>
      <div className="meter-glow" aria-hidden="true" />
      <svg viewBox="0 0 240 140" role="img" aria-label={`${t('trustScore')}: ${score} ${t('outOf')}. ${label}`}>
        <path d={arc(0, 39.5)} className="band band-bad" />
        <path d={arc(40.5, 69.5)} className="band band-warn" />
        <path d={arc(70.5, 100)} className="band band-good" />
        <text x="30" y="136" className="tick" textAnchor="middle">0</text>
        <text x="210" y="136" className="tick" textAnchor="middle">100</text>
        <g className="needle-group" style={{ transform: `rotate(${shown ? score * 1.8 : 0}deg)` }}>
          <line x1={CX} y1={CY} x2={CX - 70} y2={CY} className="needle" />
        </g>
        <circle cx={CX} cy={CY} r="8" className="hub" />
      </svg>
      <div className="meter-score">
        <span className="meter-number">{score}</span>
        <span className="meter-of">{t('outOf')}</span>
      </div>
      <div className="meter-verdict">{label}</div>
      {confidence ? (
        <div className="meter-confidence">
          {t('confidence')}: {t(`confidence_${confidence}`)}
        </div>
      ) : null}
    </div>
  );
}
