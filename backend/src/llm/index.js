import { config } from '../config.js';
import { explainWithBedrock } from './bedrock.js';
import { explainWithOllama } from './ollama.js';
import { trackEnd, trackStart } from './activity.js';
import { buildPrompt } from './prompt.js';

const HEADLINE = {
  en: {
    safe: 'This site looks safe, but this is guidance, not a guarantee.',
    careful: 'Be careful: some warning signs were found.',
    likely_fake: 'This site is likely fake or unsafe. Do not enter passwords, OTPs or card details.',
  },
  hi: {
    safe: 'यह साइट सुरक्षित लग रही है, लेकिन यह केवल मार्गदर्शन है, गारंटी नहीं।',
    careful: 'सावधान रहें: कुछ चेतावनी संकेत मिले हैं।',
    likely_fake: 'यह साइट नकली या असुरक्षित हो सकती है। पासवर्ड, OTP या कार्ड की जानकारी न डालें।',
  },
};
const ACTION_LABEL = { en: 'What you can do:', hi: 'आप क्या कर सकते हैं:' };
const TIPS = {
  en: [
    'Open the official website by typing its address yourself.',
    'Do not share OTP, PIN or card details.',
    'Confirm with the organisation on its official helpline.',
  ],
  hi: [
    'आधिकारिक वेबसाइट का पता खुद टाइप करके खोलें।',
    'OTP, PIN या कार्ड की जानकारी किसी को न दें।',
    'संस्था की आधिकारिक हेल्पलाइन से पुष्टि करें।',
  ],
};

/** Used when the LLM is off or fails: the app still gives a useful answer. */
export function ruleBasedSummary(scan, lang = 'en') {
  const language = lang === 'hi' ? 'hi' : 'en';
  const reasons = (scan.trust.findings || [])
    .filter((f) => f.status === 'bad' || f.status === 'warn')
    .slice(0, 3)
    .map((f) => `• ${f.title}`);
  return [
    HEADLINE[language][scan.trust.verdict],
    ...(reasons.length ? ['', ...reasons] : []),
    '',
    ACTION_LABEL[language],
    ...TIPS[language].map((tip) => `- ${tip}`),
  ].join('\n');
}

function fallback(scan, lang, note) {
  return { text: ruleBasedSummary(scan, lang), provider: 'rules', model: null, fallback: true, note };
}

function clean(text) {
  return String(text || '')
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .trim()
    .slice(0, 1500);
}

/** Sends one prompt to the configured model and returns its text. Throws on failure. Counts as AI activity. */
export async function askModel(prompt, task = 'explain') {
  const provider = config.llmProvider;
  if (provider !== 'ollama' && provider !== 'bedrock') throw new Error('The AI service is switched off');
  trackStart(task);
  try {
    const raw = provider === 'bedrock' ? await explainWithBedrock(prompt) : await explainWithOllama(prompt);
    trackEnd(true, null, task);
    return raw;
  } catch (err) {
    trackEnd(false, err, task);
    throw err;
  }
}

/** One call for every provider. Never throws: on any failure it returns the rule-based summary. */
export async function explainScan(scan, lang = 'en') {
  const provider = config.llmProvider;
  if (provider === 'none') return fallback(scan, lang, 'The AI explanation is turned off on this server.');
  if (provider !== 'ollama' && provider !== 'bedrock') {
    return fallback(scan, lang, `Unknown LLM_PROVIDER "${provider}". Use ollama, bedrock or none.`);
  }
  try {
    const prompt = buildPrompt(scan, lang);
    const raw = await askModel(prompt, 'explain');
    const text = clean(raw);
    if (!text) throw new Error('The model returned an empty answer');
    return {
      text,
      provider,
      model: provider === 'bedrock' ? config.bedrockModelId : config.ollamaModel,
      fallback: false,
      note: null,
    };
  } catch (err) {
    console.warn(`[llm] ${provider} failed: ${err.message}`);
    return fallback(scan, lang, 'The AI explanation is not available right now. Showing a rule-based summary instead.');
  }
}
