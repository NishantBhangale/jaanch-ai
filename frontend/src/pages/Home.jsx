import HeroArt from '../components/HeroArt.jsx';
import HowItWorks from '../components/HowItWorks.jsx';
import { IconLanguage, IconPulse, IconShield } from '../components/Icons.jsx';
import UrlForm from '../components/UrlForm.jsx';
import VerdictScale from '../components/VerdictScale.jsx';
import { useI18n } from '../i18n.jsx';

const CARD_ICONS = [IconShield, IconPulse, IconLanguage];

export default function Home() {
  const { t } = useI18n();
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">{t('eyebrow')}</p>
          <h1>{t('tagline')}</h1>
          <p className="lead">{t('subtitle')}</p>
          <UrlForm />
          <p className="muted small">{t('disclaimer')}</p>
        </div>
        <HeroArt />
      </section>
      <section className="cards" aria-label="What Jaanch.ai checks">
        {[1, 2, 3].map((n) => {
          const Icon = CARD_ICONS[n - 1];
          return (
            <article key={n} className={`card feature feature-${n}`}>
              <span className="feature-icon">
                <Icon />
              </span>
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
