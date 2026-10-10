import { useEffect, useState } from 'react';
import AiStatus from './components/AiStatus.jsx';
import AuthModal from './components/AuthModal.jsx';
import CheckForm from './components/CheckForm.jsx';
import HeroArt from './components/HeroArt.jsx';
import HowItWorks from './components/HowItWorks.jsx';
import { IconLanguage, IconPulse, IconShield, IconUser } from './components/Icons.jsx';
import ReportFraud from './components/ReportFraud.jsx';
import Logo from './components/Logo.jsx';
import VerdictScale from './components/VerdictScale.jsx';
import { useAuth } from './auth.jsx';
import { useI18n } from './i18n.jsx';
import Dashboard from './pages/Dashboard.jsx';
import History from './pages/History.jsx';
import LinkReport from './pages/LinkReport.jsx';
import SmsReport from './pages/SmsReport.jsx';
import { Link, useRoute } from './router.jsx';

const CARD_ICONS = [IconShield, IconPulse, IconLanguage];

function Header({ path }) {
  const { t, lang, setLang } = useI18n();
  const { user, ready, openAuth, logout } = useAuth();
  const current = (to) => (path === to || path.startsWith(`${to}/`) ? 'page' : undefined);
  return (
    <header className="site-header wrap">
      <Link to="/" className="brand" aria-label="Jaanch.ai">
        <Logo tagline={t('logoTagline')} />
      </Link>
      <nav aria-label="Main">
        <AiStatus />
        <Link to="/" aria-current={path === '/' ? 'page' : undefined}>{t('navCheck')}</Link>
        <Link to="/dashboard" aria-current={current('/dashboard')}>{t('dashboard')}</Link>
        {user ? <Link to="/history" aria-current={current('/history')}>{t('navHistory')}</Link> : null}
        {ready && !user ? (
          <button type="button" className="nav-btn" onClick={() => openAuth('login')}><IconUser /> {t('login')}</button>
        ) : null}
        {user ? (
          <button type="button" className="nav-btn" onClick={logout} title={user.email}><IconUser /> {t('logout')}</button>
        ) : null}
        <div className="lang" role="group" aria-label={t('language')}>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
          <button type="button" aria-pressed={lang === 'hi'} onClick={() => setLang('hi')} lang="hi">हिंदी</button>
        </div>
      </nav>
    </header>
  );
}

function routeFor(path) {
  const link = /^\/report\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  if (link) return { type: 'link', id: link[1] };
  const sms = /^\/sms\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  if (sms) return { type: 'sms', id: sms[1] };
  if (path === '/dashboard' || path === '/dashboard/') return { type: 'dashboard' };
  if (path === '/history' || path === '/history/') return { type: 'history' };
  return { type: 'home' };
}

function Idle() {
  const { t } = useI18n();
  return (
    <>
      <section className="cards" aria-label="What Jaanch.ai checks">
        {[1, 2, 3].map((n) => {
          const Icon = CARD_ICONS[n - 1];
          return (
            <article key={n} className={`card feature feature-${n}`}>
              <span className="feature-icon"><Icon /></span>
              <h2>{t(`card${n}Title`)}</h2>
              <p>{t(`card${n}Text`)}</p>
            </article>
          );
        })}
      </section>
      <HowItWorks />
      <VerdictScale />
    </>
  );
}

export default function App() {
  const { t } = useI18n();
  const path = useRoute();
  const route = routeFor(path);
  const [mode, setMode] = useState(route.type === 'sms' ? 'sms' : 'link');

  // Opening a link or SMS result switches the form to the matching tab.
  useEffect(() => {
    if (route.type === 'sms') setMode('sms');
    else if (route.type === 'link') setMode('link');
  }, [route.type]);

  const isChecker = route.type !== 'dashboard' && route.type !== 'history';
  const hasResult = route.type === 'link' || route.type === 'sms';

  return (
    <>
      <div className="bg-fx" aria-hidden="true"><i className="orb orb-1" /><i className="orb orb-2" /><i className="orb orb-3" /></div>
      <div className={`topband ${hasResult ? 'is-compact' : ''} ${isChecker ? '' : 'is-thin'}`}>
        <Header path={path} />
        {isChecker ? (
          <section className="hero wrap">
            <div className="hero-copy">
              {!hasResult ? <p className="eyebrow">{t('eyebrow')}</p> : null}
              <h1>{t('tagline')}</h1>
              {!hasResult ? <p className="lead">{t('subtitle')}</p> : null}
              <CheckForm mode={mode} onModeChange={setMode} />
              {!hasResult ? <p className="hero-note">{t('disclaimer')}</p> : null}
            </div>
            {!hasResult ? <HeroArt /> : null}
          </section>
        ) : null}
      </div>

      <main className="wrap content">
        {route.type === 'link' ? <LinkReport key={route.id} id={route.id} /> : null}
        {route.type === 'sms' ? <SmsReport key={route.id} group={route.id} /> : null}
        {route.type === 'dashboard' ? <Dashboard /> : null}
        {route.type === 'history' ? <History /> : null}
        {route.type === 'home' ? <Idle /> : null}
        {hasResult ? <p className="muted small footnote">{t('disclaimer')}</p> : null}
      </main>
      <footer className="site-footer wrap">{t('footer')}</footer>
      <ReportFraud />
      <AuthModal />
    </>
  );
}
