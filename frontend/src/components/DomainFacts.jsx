import { useI18n } from '../i18n.jsx';
import { IconCalendar, IconLock, IconRedirect } from './Icons.jsx';

const REASONS = {
  en: {
    not_found: 'The registry has no public record for this name',
    timeout: 'The lookup timed out',
    no_registration_date: 'The registry does not publish the date',
    lookup_failed: 'The lookup failed',
    rate_limited: 'The registry is limiting lookups, try again shortly',
    no_rdap_server: 'This domain ending has no public lookup',
    not_a_domain: 'Not a domain name',
  },
  hi: {
    not_found: 'रजिस्ट्री में इस नाम का सार्वजनिक रिकॉर्ड नहीं है',
    timeout: 'जाँच का समय समाप्त हो गया',
    no_registration_date: 'रजिस्ट्री तारीख़ प्रकाशित नहीं करती',
    lookup_failed: 'जाँच विफल रही',
    rate_limited: 'रजिस्ट्री अभी सीमित कर रही है, थोड़ी देर में फिर कोशिश करें',
    no_rdap_server: 'इस डोमेन के लिए सार्वजनिक जाँच उपलब्ध नहीं है',
    not_a_domain: 'यह डोमेन नाम नहीं है',
  },
};

function humanAge(days, lang) {
  const years = Math.floor(days / 365);
  const months = Math.floor(days / 30);
  if (lang === 'hi') {
    if (days < 60) return `${days} दिन`;
    if (days < 730) return `${months} महीने`;
    return `${years} साल`;
  }
  if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
  if (days < 730) return `${months} months`;
  return `${years} years`;
}

function ageTone(days) {
  if (days < 30) return 'bad';
  if (days < 90) return 'warn';
  if (days < 365) return 'info';
  return 'good';
}

// The three facts people ask about first: when the name was registered, the certificate, and any redirect.
export default function DomainFacts({ trust, requestedUrl }) {
  const { t, lang } = useI18n();
  const domain = trust?.domain;
  const cert = trust?.certificate;
  const redirected = trust?.finalUrl && requestedUrl && new URL(trust.finalUrl).hostname !== new URL(requestedUrl).hostname;
  const dateText = (iso) =>
    new Date(iso).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <ul className="facts">
      {domain ? (
        <li className={domain.available ? `fact fact-${ageTone(domain.ageDays)}` : 'fact fact-unknown'}>
          <IconCalendar width={20} height={20} />
          <div>
            <span className="fact-label">{t('registered')}</span>
            {domain.available ? (
              <strong>
                {dateText(domain.registeredAt)} <em>· {humanAge(domain.ageDays, lang)}</em>
              </strong>
            ) : (
              <strong className="fact-missing">
                {t('dateUnavailable')} <em>· {REASONS[lang][domain.reason] || REASONS[lang].lookup_failed}</em>
              </strong>
            )}
          </div>
        </li>
      ) : null}
      <li className={cert ? 'fact fact-good' : 'fact fact-unknown'}>
        <IconLock width={20} height={20} />
        <div>
          <span className="fact-label">{t('certificate')}</span>
          {cert ? (
            <strong>
              {cert.issuer || t('valid')} <em>· {t('daysLeft').replace('{n}', cert.daysLeft)}</em>
            </strong>
          ) : (
            <strong className="fact-missing">{t('noCertificate')}</strong>
          )}
        </div>
      </li>
      {redirected ? (
        <li className="fact fact-warn">
          <IconRedirect width={20} height={20} />
          <div>
            <span className="fact-label">{t('redirectsTo')}</span>
            <strong className="break-anywhere">{new URL(trust.finalUrl).hostname}</strong>
          </div>
        </li>
      ) : null}
    </ul>
  );
}
