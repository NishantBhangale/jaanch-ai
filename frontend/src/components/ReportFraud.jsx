import { useEffect, useRef, useState } from 'react';
import { CYBER_CONTACTS } from '../contacts.js';
import { useI18n } from '../i18n.jsx';

/** A small "Report fraud" button in the header. It opens a panel over the page, so reports are never pushed around. */
export default function ReportFraud() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const { helpline, emergency, portal } = CYBER_CONTACTS;

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div className="rf" ref={box}>
      <button type="button" className="nav-btn rf-btn" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        <span aria-hidden="true">☎</span> {t('rfButton')}
      </button>
      {open ? (
        <div className="rf-panel" role="dialog" aria-label={t('rfTitle')}>
          <p className="rf-title">{t('rfTitle')}</p>
          <p className="rf-note">{t('rfNote')}</p>
          <ul>
            <li><span>{t('rfHelpline')}</span><a href={`tel:${helpline}`}>{helpline}</a></li>
            <li><span>{t('rfEmergency')}</span><a href={`tel:${emergency}`}>{emergency}</a></li>
            <li><span>{t('rfPortal')}</span><a href={portal} target="_blank" rel="noopener noreferrer">cybercrime.gov.in</a></li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
