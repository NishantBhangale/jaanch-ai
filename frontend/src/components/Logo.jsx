// The Jaanch.ai mark: a shield (protection) holding a magnifier (checking) with a tick (verified).
// Navy for trust, saffron for the Indian context. No decoration beyond that.
export function LogoMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" className="logo-mark">
      <defs>
        <linearGradient id="lm-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a6ab5" />
          <stop offset="1" stopColor="#0a2346" />
        </linearGradient>
      </defs>
      <path
        d="M32 3 57 11.5V31c0 15-10.3 25.6-25 30C17.3 56.6 7 46 7 31V11.5z"
        fill="url(#lm-body)"
        stroke="#f5a03a"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M32 8.5 52 15v16c0 12.2-8.2 21-20 25.2C20.2 52 12 43.2 12 31V15z" fill="#fff" fillOpacity="0.06" />
      <defs>
        <clipPath id="lm-lens"><circle cx="30" cy="29" r="9.8" /></clipPath>
      </defs>
      <circle className="lm-pulse" cx="32" cy="32" r="29" stroke="#f5a03a" strokeWidth="1.5" fill="none" />
      <g clipPath="url(#lm-lens)">
        <path className="lm-sweep" d="M30 29 30 17.5A11.5 11.5 0 0 1 41.5 29z" fill="#f5a03a" fillOpacity="0.45" />
      </g>
      <circle cx="30" cy="29" r="12" stroke="#fff" strokeWidth="4.5" />
      <path d="m39 38 9 9" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" />
      <path className="lm-tick" d="m24.5 29.5 4.2 4.2 8-9" stroke="#f5a03a" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" pathLength="1" />
    </svg>
  );
}

/** The national flag, drawn to proportion (3:2, equal bands, 24-spoke navy wheel). */
export function IndiaFlag({ width = 36 }) {
  const spokes = Array.from({ length: 24 }, (_, i) => {
    const a = (i * 15 * Math.PI) / 180;
    return <line key={i} x1={30 + 2.2 * Math.cos(a)} y1={20 + 2.2 * Math.sin(a)} x2={30 + 5.6 * Math.cos(a)} y2={20 + 5.6 * Math.sin(a)} />;
  });
  return (
    <svg className="logo-flag" width={width} height={(width * 2) / 3} viewBox="0 0 60 40" role="img" aria-label="India">
      <clipPath id="flag-clip"><rect width="60" height="40" rx="4" /></clipPath>
      <g clipPath="url(#flag-clip)">
        <rect width="60" height="13.4" fill="#FF9933" />
        <rect y="13.3" width="60" height="13.4" fill="#ffffff" />
        <rect y="26.6" width="60" height="13.4" fill="#138808" />
        <g stroke="#000080" strokeWidth="0.55" fill="none">
          <circle cx="30" cy="20" r="6" strokeWidth="0.9" />
          {spokes}
        </g>
        <rect className="flag-shine" width="60" height="40" fill="url(#flag-shine)" />
      </g>
      <defs>
        <linearGradient id="flag-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="60" height="40" rx="4" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1" />
    </svg>
  );
}

export default function Logo({ tagline }) {
  return (
    <span className="logo">
      <LogoMark />
      <span className="logo-text">
        <span className="logo-word">
          Jaanch<span className="logo-ai">.ai</span>
        </span>
        {tagline ? <span className="logo-tag">{tagline}</span> : null}
      </span>
      <IndiaFlag />
    </span>
  );
}
