import { useState } from 'react';
import { createScan } from '../api.js';
import { useI18n } from '../i18n.jsx';
import { navigate } from '../router.jsx';

export default function UrlForm() {
  const { t, lang } = useI18n();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const { id } = await createScan(url.trim(), lang);
      navigate(`/report/${id}`);
    } catch (err) {
      setError(err.status ? err.message : t('network'));
      setBusy(false);
    }
  }

  return (
    <form className="url-form" onSubmit={submit} noValidate>
      <label htmlFor="url" className="sr-only">
        {t('urlLabel')}
      </label>
      <input
        id="url"
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck="false"
        placeholder={t('placeholder')}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        aria-describedby={error ? 'url-error' : undefined}
        aria-invalid={error ? 'true' : undefined}
      />
      <button type="submit" disabled={busy || !url.trim()}>
        {busy ? t('checking') : t('check')}
      </button>
      {error ? (
        <p id="url-error" className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
