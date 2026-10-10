import { useState } from 'react';
import { createScan, createSms } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { navigate } from '../router.jsx';
import { LINK_SAMPLES, SMS_SAMPLES } from '../samples.js';
import { IconLink, IconMessage } from './Icons.jsx';

// One form, two modes: a website address or a pasted SMS.
export default function CheckForm({ mode, onModeChange }) {
  const { t, lang } = useI18n();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isSms = mode === 'sms';

  function switchMode(next) {
    if (next === mode) return;
    setValue('');
    setError('');
    onModeChange(next);
  }

  async function submit(event) {
    event.preventDefault();
    if (!value.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      if (isSms) {
        const result = await createSms(value.trim(), lang);
        if (result.group) {
          navigate(`/sms/${result.group}`);
        } else {
          // No link in the message: show what the wording alone tells us.
          try {
            window.sessionStorage.setItem('jaanch-sms-nolink', JSON.stringify(result));
          } catch {
            // storage may be blocked; the next page then shows a short note instead
          }
          navigate('/sms/none');
        }
      } else {
        const { id } = await createScan(value.trim(), lang);
        navigate(`/report/${id}`);
      }
      setBusy(false);
    } catch (err) {
      setError(err.status ? err.message : t('network'));
      setBusy(false);
    }
  }

  const samples = isSms ? SMS_SAMPLES : LINK_SAMPLES;

  return (
    <div className="check-form">
      <div className="tabs" role="tablist" aria-label={t('checkType')}>
        <button type="button" role="tab" aria-selected={!isSms} className="tab" onClick={() => switchMode('link')}>
          <IconLink width={18} height={18} /> {t('tabLink')}
        </button>
        <button type="button" role="tab" aria-selected={isSms} className="tab" onClick={() => switchMode('sms')}>
          <IconMessage width={18} height={18} /> {t('tabSms')}
        </button>
      </div>

      <form onSubmit={submit} noValidate className={`form-row ${isSms ? 'is-sms' : ''}`}>
        {isSms ? (
          <>
            <label htmlFor="sms" className="sr-only">{t('smsLabel')}</label>
            <textarea
              id="sms"
              rows={3}
              maxLength={1000}
              placeholder={t('smsPlaceholder')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'form-error' : undefined}
            />
          </>
        ) : (
          <>
            <label htmlFor="url" className="sr-only">{t('urlLabel')}</label>
            <input
              id="url"
              type="text"
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              placeholder={t('placeholder')}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={error ? 'true' : undefined}
              aria-describedby={error ? 'form-error' : undefined}
            />
          </>
        )}
        <button type="submit" className="go" disabled={busy || !value.trim()}>
          {busy ? t('checking') : isSms ? t('checkSms') : t('check')}
        </button>
      </form>

      {error ? (
        <p id="form-error" className="form-error" role="alert">{error}</p>
      ) : (
        <p className="samples">
          <span>{t('tryExample')}</span>
          {samples.map((sample) => (
            <button key={sample.key} type="button" className="sample" onClick={() => setValue(sample.value)}>
              {t(sample.key)}
            </button>
          ))}
        </p>
      )}
    </div>
  );
}
