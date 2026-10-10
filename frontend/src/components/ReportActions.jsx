import { useState } from 'react';
import { useI18n } from '../i18n.jsx';
import { IconDownload } from './Icons.jsx';

/** Copy link + download PDF. The PDF is offered once the check has finished. */
export default function ReportActions({ pdfUrl, ready }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt(t('copyLink'), window.location.href);
    }
  }
  return (
    <div className="report-actions">
      {ready ? (
        <a className="button-link primary-action" href={pdfUrl} download>
          <IconDownload /> {t('downloadPdf')}
        </a>
      ) : null}
      <button type="button" className="secondary" onClick={copy}>
        {copied ? t('copied') : t('copyLink')}
      </button>
    </div>
  );
}
