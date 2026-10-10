import { useI18n } from '../i18n.jsx';

// Decorative hero picture: a phone receiving a scam SMS, with the radar that checks it.
// Pure SVG and CSS (no images). The demo names are made-up examples.
export default function HeroArt() {
  const { t } = useI18n();
  return (
    <div className="hero-art" aria-hidden="true">
      <svg viewBox="0 0 380 340" className="hero-svg">
        <defs>
          <radialGradient id="ha-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f5a03a" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#f5a03a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="ha-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f5a03a" stopOpacity="0" />
            <stop offset="100%" stopColor="#f5a03a" stopOpacity="0.16" />
          </linearGradient>
          <linearGradient id="ha-phone" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10284a" />
            <stop offset="100%" stopColor="#081a33" />
          </linearGradient>
        </defs>

        <circle cx="190" cy="170" r="165" fill="url(#ha-glow)" />
        <circle cx="190" cy="170" r="150" className="ha-ring" />
        <circle cx="190" cy="170" r="112" className="ha-ring" />
        <circle cx="190" cy="170" r="74" className="ha-ring" />
        <g className="ha-sweep">
          <path d="M190 170 340 170A150 150 0 0 0 296 64z" fill="url(#ha-sweep)" />
        </g>

        {/* the phone */}
        <g className="ha-phone">
          <rect x="120" y="20" width="140" height="300" rx="28" fill="url(#ha-phone)" stroke="#3a679f" strokeWidth="2" />
          <rect x="172" y="30" width="36" height="6" rx="3" fill="#24466f" />
          <rect x="132" y="50" width="116" height="26" rx="9" fill="#17335d" />
          <circle cx="147" cy="63" r="7" fill="#f5a03a" />
          <rect x="160" y="58" width="52" height="5" rx="2.5" fill="#6f95c9" />
          <rect x="160" y="67" width="34" height="4" rx="2" fill="#3f6399" />

          <rect x="132" y="88" width="108" height="78" rx="13" fill="#1d3f70" />
          <rect x="142" y="100" width="86" height="6" rx="3" fill="#5d86bf" />
          <rect x="142" y="113" width="70" height="6" rx="3" fill="#5d86bf" />
          <rect x="142" y="126" width="80" height="6" rx="3" fill="#5d86bf" />
          <rect x="142" y="142" width="84" height="10" rx="5" fill="#ff6b5e" opacity="0.92" />
          <rect x="146" y="146.5" width="70" height="1.6" rx="0.8" fill="#fff" opacity="0.8" />

          {/* the check result */}
          <g className="ha-result">
            <rect x="132" y="180" width="116" height="124" rx="15" fill="#fff" />
            <path d="M154 242A36 36 0 0 1 172 210.8" fill="none" stroke="#d94141" strokeWidth="9" strokeLinecap="butt" />
            <path d="M172 210.8A36 36 0 0 1 208 210.8" fill="none" stroke="#e9a21a" strokeWidth="9" strokeLinecap="butt" />
            <path d="M208 210.8A36 36 0 0 1 226 242" fill="none" stroke="#17a35d" strokeWidth="9" strokeLinecap="butt" />
            <line x1="190" y1="242" x2="162.5" y2="237.6" stroke="#0b1f3a" strokeWidth="3.5" strokeLinecap="round" className="ha-needle" />
            <circle cx="190" cy="242" r="6" fill="#0b1f3a" />
            <rect x="148" y="262" width="84" height="24" rx="12" fill="#fde4e4" />
            <text x="190" y="278.5" textAnchor="middle" className="ha-verdict">{t('verdict_likely_fake')}</text>
          </g>
        </g>
      </svg>

      <span className="hero-chip chip-bad">
        <i className="chip-dot dot-bad" /> sbi-kyc-update.com
        <b>5</b>
      </span>
      <span className="hero-chip chip-good">
        <i className="chip-dot dot-good" /> incometax.gov.in
        <b>100</b>
      </span>
    </div>
  );
}
