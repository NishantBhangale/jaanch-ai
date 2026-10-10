import { useI18n } from '../i18n.jsx';

const STATUS_WORD = {
  en: { good: 'Good sign', bad: 'Serious warning', warn: 'Warning', info: 'Note', unknown: 'Could not check', skipped: 'Not checked' },
  hi: { good: 'अच्छा संकेत', bad: 'गंभीर चेतावनी', warn: 'चेतावनी', info: 'ध्यान दें', unknown: 'जाँच नहीं हो सकी', skipped: 'जाँचा नहीं गया' },
};

function StatusIcon({ status }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true, className: `icon icon-${status}` };
  if (status === 'good') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="m7.5 12.5 3 3 6-7" />
      </svg>
    );
  }
  if (status === 'bad') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="m8.5 8.5 7 7m0-7-7 7" />
      </svg>
    );
  }
  if (status === 'warn') {
    return (
      <svg {...common}>
        <path d="M12 3 22 20H2z" />
        <path d="M12 10v4.5M12 17.2v.1" />
      </svg>
    );
  }
  if (status === 'info') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 11v6M12 7.5v.1" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1.9-1.1 1.8M12 16.5v.1" />
    </svg>
  );
}

export default function FindingList({ findings }) {
  const { lang } = useI18n();
  return (
    <ul className="findings">
      {findings.map((finding) => (
        <li key={finding.id} className={`finding finding-${finding.status}`}>
          <StatusIcon status={finding.status} />
          <div>
            <p className="finding-title">
              <span className="sr-only">{STATUS_WORD[lang][finding.status]}: </span>
              {finding.title}
            </p>
            {finding.detail ? <p className="finding-detail">{finding.detail}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
