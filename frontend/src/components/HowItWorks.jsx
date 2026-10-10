import { useI18n } from '../i18n.jsx';
import { IconBulb, IconPaste, IconRadar } from './Icons.jsx';

const STEPS = [
  { key: 'step1', Icon: IconPaste },
  { key: 'step2', Icon: IconRadar },
  { key: 'step3', Icon: IconBulb },
];

export default function HowItWorks() {
  const { t } = useI18n();
  return (
    <section className="how" aria-labelledby="how-title">
      <h2 id="how-title">{t('howTitle')}</h2>
      <ol className="how-steps">
        {STEPS.map(({ key, Icon }, index) => (
          <li key={key} className="how-step">
            <span className="how-icon">
              <Icon />
              <span className="how-num">{index + 1}</span>
            </span>
            <h3>{t(`${key}Title`)}</h3>
            <p>{t(`${key}Text`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
