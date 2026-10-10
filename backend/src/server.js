import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { sessionMiddleware } from './auth/auth.js';
import { createStore } from './db/index.js';
import { resolveChromePath } from './health/browser.js';
import { createApiRouter } from './routes/api.js';
import { startWorker } from './worker.js';

const store = await createStore();
await store.init();
const worker = config.workerEnabled ? startWorker(store) : null;

const app = express();
app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'img-src': ["'self'", 'data:', 'https:'],
        'upgrade-insecure-requests': null, // keeps plain http://localhost working
      },
    },
  }),
);
app.use(express.json({ limit: '10kb' }));

// Used by the load balancer and by you: 200 means the app and its database are up.
app.get('/health', async (req, res) => {
  try {
    await store.ping();
    res.json({ status: 'ok', db: store.kind, worker: Boolean(worker) });
  } catch {
    res.status(503).json({ status: 'error', db: 'down' });
  }
});

app.use('/api', sessionMiddleware(store));
app.use('/api', createApiRouter({ store, worker }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use('/screenshots', express.static(config.localScreenshotDir, { maxAge: '1h' }));

const indexFile = path.join(config.publicDir, 'index.html');
if (fs.existsSync(indexFile)) {
  app.use(express.static(config.publicDir));
  app.get('*', (req, res) => res.sendFile(indexFile));
} else {
  app.get('/', (req, res) =>
    res
      .type('text')
      .send(
        'Jaanch.ai API is running, but the web app has not been built into this server.\n' +
          'For development, run the frontend on http://localhost:5173 (see README.md).',
      ),
  );
}

app.use((err, req, res, next) => {
  void next;
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request' });
  console.error(err);
  return res.status(500).json({ error: 'Something went wrong' });
});

const server = app.listen(config.port, () => {
  console.log(
    `Jaanch.ai API on http://localhost:${config.port}  (db: ${store.kind}, llm: ${config.llmProvider}, worker: ${worker ? 'on' : 'off'})`,
  );
  if (config.allowPrivateTargets) {
    console.warn('[security] ALLOW_PRIVATE_TARGETS is on: the SSRF protection is disabled. Use for local testing only.');
  }
  resolveChromePath().then((chrome) =>
    console.log(
      chrome
        ? `[browser] using ${chrome}`
        : '[browser] Chrome not found: Health Reports will not run. Install Chrome or set CHROME_PATH (see README).',
    ),
  );
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  await worker?.stop();
  server.close(async () => {
    await store.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
