// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { LangProvider } from '../i18n.jsx';
import PastReports from './PastReports.jsx';

afterEach(cleanup);

const show = (incidents) =>
  render(
    <LangProvider>
      <PastReports incidents={incidents} />
    </LangProvider>,
  );

test('shows the AI summary with a safe link, and never claims "safe" when nothing was found', () => {
  show({
    status: 'done',
    summary: 'Reported as a phishing page copying HDFC Bank.',
    provider: 'ollama',
    sources: [{ title: 'Phishing alert', url: 'https://scamwatch.example.org/x', host: 'scamwatch.example.org', exact: true }],
  });
  expect(screen.getByText('Reported as a phishing page copying HDFC Bank.')).toBeTruthy();
  const link = screen.getByRole('link', { name: 'Phishing alert' });
  expect(link.getAttribute('href')).toBe('https://scamwatch.example.org/x');
  expect(link.getAttribute('rel')).toContain('noopener');
  cleanup();

  show({ status: 'none' });
  expect(screen.getByText(/does not mean the site is safe/i)).toBeTruthy();
});
