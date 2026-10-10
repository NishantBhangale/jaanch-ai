import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { useI18n } from '../i18n.jsx';

export default function AuthModal() {
  const { t } = useI18n();
  const { modal, openAuth, closeAuth, login, signup } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const first = useRef(null);

  useEffect(() => {
    if (!modal) return undefined;
    setError('');
    const timer = setTimeout(() => first.current?.focus(), 50);
    const onKey = (e) => e.key === 'Escape' && closeAuth();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [modal, closeAuth]);

  if (!modal) return null;
  const isSignup = modal === 'signup';
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (isSignup) await signup(form.email, form.password, form.name);
      else await login(form.email, form.password);
      setForm({ name: '', email: '', password: '' });
    } catch (err) {
      setError(err.message || t('network'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && closeAuth()}>
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button type="button" className="modal-close" onClick={closeAuth} aria-label={t('close')}>×</button>
        <h2 id="auth-title">{isSignup ? t('signupTitle') : t('loginTitle')}</h2>
        <p className="muted small">{t('authOptional')}</p>
        <form onSubmit={submit} className="auth-form">
          {isSignup ? (
            <label>
              <span>{t('nameOptional')}</span>
              <input ref={first} type="text" autoComplete="name" value={form.name} onChange={set('name')} maxLength={60} />
            </label>
          ) : null}
          <label>
            <span>{t('email')}</span>
            <input ref={isSignup ? null : first} type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
          </label>
          <label>
            <span>{t('password')}</span>
            <input type="password" required minLength={isSignup ? 8 : 1} autoComplete={isSignup ? 'new-password' : 'current-password'} value={form.password} onChange={set('password')} />
          </label>
          {isSignup ? <p className="muted small">{t('passwordHint')}</p> : null}
          {error ? <p className="notice" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy}>{busy ? t('checking') : isSignup ? t('signup') : t('login')}</button>
        </form>
        <p className="small auth-switch">
          {isSignup ? t('haveAccount') : t('noAccount')}{' '}
          <button type="button" className="linklike" onClick={() => openAuth(isSignup ? 'login' : 'signup')}>
            {isSignup ? t('login') : t('signup')}
          </button>
        </p>
      </div>
    </div>
  );
}
