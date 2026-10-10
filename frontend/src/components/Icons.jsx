// Small line icons used by the cards, steps and hero art. All decorative (aria-hidden).
const base = {
  width: 28,
  height: 28,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export function IconShield(props) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 20 6v6c0 4.5-3.3 7.8-8 9-4.7-1.2-8-4.5-8-9V6z" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </svg>
  );
}

export function IconPulse(props) {
  return (
    <svg {...base} {...props}>
      <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
    </svg>
  );
}

export function IconLanguage(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5h9M8.5 3v2M6 5c.6 3.5 2.6 6 5.5 7.5M11 5c-.6 3.5-3 6.2-6.5 7.7" />
      <path d="m13 20 4-9 4 9M14.4 17h5.2" />
    </svg>
  );
}

export function IconPaste(props) {
  return (
    <svg {...base} {...props}>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4.5h6V3H9zM9 11h6M9 15h4" />
    </svg>
  );
}

export function IconRadar(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4.5" />
      <path d="M12 12 18 6" />
    </svg>
  );
}

export function IconBulb(props) {
  return (
    <svg {...base} {...props}>
      <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
    </svg>
  );
}

export function IconLock(props) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconGlobe(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
    </svg>
  );
}

export function IconClock(props) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconLink(props) {
  return (
    <svg {...base} {...props}>
      <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
    </svg>
  );
}

export function IconMessage(props) {
  return (
    <svg {...base} {...props}>
      <path d="M4 5h16v11H9l-5 4z" />
      <path d="M8 9.5h8M8 12.5h5" />
    </svg>
  );
}

export function IconCalendar(props) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </svg>
  );
}

export function IconRedirect(props) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h12M13 7l5 5-5 5" />
    </svg>
  );
}

export function IconDownload(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <path d="M12 4v11" />
      <path d="m7.5 11 4.5 4.5 4.5-4.5" />
      <path d="M5 19h14" />
    </svg>
  );
}

export function IconUser(props) {
  return (
    <svg {...base} width={18} height={18} {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </svg>
  );
}
