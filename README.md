# Jaanch.ai

**Check before you trust.** Paste a website address and get two things:

- **Trust Check**: does the site look genuine? (HTTPS certificate, domain age, `.gov.in` / `.nic.in`, look-alike names, phishing lists) ending in a clear **Safe / Be Careful / Likely Fake** verdict.
- **Health Report**: is the site well built? (mobile speed, accessibility, broken links, security headers)

The verdict comes from fixed, tested rules. The AI model only **explains** the findings in simple English or Hindi. It never decides.

This folder contains the application code only (final version). Docker, Docker Compose and GitHub Actions are intentionally not included. The frontend ships with an `nginx.conf` for serving it (section 12).

---

See [docs/CODE_GUIDE.md](docs/CODE_GUIDE.md) for a file-by-file explanation of the code.

## What is in this draft

| Stage | Where | Status |
|---|---|---|
| Paste a URL, validate it, block internal addresses (SSRF protection) | `backend/src/security/` | Done and tested |
| Scan queue (Postgres, or in memory) and background worker | `backend/src/db/`, `backend/src/worker.js` | Done and tested |
| Trust checks: HTTPS/TLS, domain age (RDAP), government domain, look-alike names, Google Safe Browsing, OpenPhish feed, page signals | `backend/src/trust/` | Done. Network lookups need internet (see "Tested so far") |
| Deterministic Trust Score and verdict | `backend/src/trust/scoring.js` | Done, 11 unit tests |
| Health checks: Lighthouse (mobile), axe-core accessibility, broken links, security headers, phone screenshot | `backend/src/health/` | Done and tested |
| AI explanation: Ollama (local) or Amazon Bedrock (cloud), switched by `LLM_PROVIDER`, with a rule-based fallback | `backend/src/llm/` | Ollama adapter tested against a fake server; Bedrock written but not run |
| English / Hindi (screen text and AI explanation) | `frontend/src/i18n.jsx`, `backend/src/llm/` | Done. Hindi AI quality depends on your model, test it |
| React report page with colour-coded trust meter, shareable link, dashboard | `frontend/` | Done |
| Screenshots and report JSON in Amazon S3 | `backend/src/storage/` | Written, not run. Local disk is used when `S3_BUCKET` is empty |

Not included: Docker, Docker Compose, GitHub Actions, Elastic Beanstalk files, PhishTank feed, user accounts.

---

## 1. What you need

| Needed | Why | Notes |
|---|---|---|
| **Node.js 22.19 or newer** | Runs backend and frontend | Lighthouse 13 requires it. Built and tested on Node 22. Check with `node -v` |
| **Google Chrome or Chromium** | Lighthouse and the accessibility scan need a real browser | Without it the Trust Check still works, the Health Report shows "Chrome was not found" |
| PostgreSQL 14+ (optional) | Keeps scan history | Skip it at first: without `DATABASE_URL` the app uses memory (lost on restart) |
| Ollama (optional) | Local AI explanations, no API key | Skip it at first: set `LLM_PROVIDER=none` |
| Google Safe Browsing key (optional) | Extra reputation check | Free. Without it that check is shown as "not checked" |

---

## 2. Quick start (about 5 minutes)

From this folder:

```bash
# 1. Install everything
npm run install:all

# 2. Create your settings files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
#   Windows (Command Prompt):  copy backend\.env.example backend\.env
#                              copy frontend\.env.example frontend\.env
```

Open `backend/.env` and, for the very first run, set:

```
LLM_PROVIDER=none
```

(You will switch this to `ollama` in section 4.) Then start both parts in **two terminals**:

```bash
# Terminal 1: API and scan worker  (http://localhost:3000)
npm run dev:backend

# Terminal 2: web app  (http://localhost:5173)
npm run dev:frontend
```

Open **http://localhost:5173**, paste a website address such as `incometax.gov.in`, and press **Check**.

When the backend starts it prints which Chrome it found, for example `[browser] using /usr/bin/chromium`. If it prints "Chrome not found", see Troubleshooting.

### Run as one server (closer to production)

```bash
npm run build     # builds the React app and copies it into backend/public
npm start         # http://localhost:3000 serves the app and the API together
```

---

## 3. Optional: PostgreSQL

Without a database the app keeps scans in memory, which is fine for trying it out. To keep history and use the dashboard properly:

```bash
createdb jaanch
```

Then in `backend/.env`:

```
DATABASE_URL=postgres://YOUR_USER:YOUR_PASSWORD@localhost:5432/jaanch
```

Tables are created automatically on start. For Amazon RDS later, also set `PG_SSL=true` (and do not put `?sslmode=` in the URL).

## 4. Optional: Ollama (local AI explanations)

1. Install Ollama from https://ollama.com and start it.
2. Download a model: `ollama pull llama3.2:3b` (small, for low-RAM laptops) or `ollama pull gemma2:9b` (better, needs about 8 GB RAM).
3. In `backend/.env`:

```
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b
```

**Test the Hindi output** (switch to हिंदी in the app, run a check). Small models are often weak at Hindi. If the quality is poor, try a larger model, or keep English for local runs.

If Ollama is off or fails, the app shows a rule-based summary instead, so nothing breaks.

## 5. Optional: Google Safe Browsing

1. In Google Cloud Console, create a project and enable the **Safe Browsing API**.
2. Create an **API key** (Credentials, Create credentials, API key).
3. Put it in `backend/.env`: `SAFE_BROWSING_API_KEY=your-key`

## 6. Optional: cloud settings (for later)

`LLM_PROVIDER=bedrock` with `BEDROCK_REGION` and `BEDROCK_MODEL_ID`, and `S3_BUCKET` for screenshots. They use your normal AWS credentials (`aws configure`, or an instance role when deployed). All variables are explained in `backend/.env.example`.

---

## 7. Trying it out

Good first checks:

| Try | What you should see |
|---|---|
| `incometax.gov.in` | Government domain, official-domain credit, high score |
| `example.com` | Valid HTTPS, old domain, usually "Safe" or "Be Careful" depending on page signals |
| `sbi-online-login.xyz` (a made-up look-alike) | Bank-name look-alike warning. It may not load at all, which is also reported |
| `http://localhost` or `169.254.169.254` | Refused: "points to a private or internal network" |
| `http://sbi.login.com` | Likely Fake: bank name placed in front of another site. Unreachable names are judged by name |
| SMS tab, "Fake SMS" example | Every link in the message is checked, plus wording signals (threats, KYC bait, prizes, OTP requests) |

Switch language with the **EN / हिंदी** buttons. Use **Copy report link** to share a report. Open **Dashboard** for totals and recently flagged sites.

### Testing against a site on your own computer

Internal addresses are blocked on purpose. To scan a page you run locally, add this to `backend/.env`, restart, then scan `http://127.0.0.1:PORT/`:

```
ALLOW_PRIVATE_TARGETS=true
```

This **switches off the SSRF protection**. Use it only on your own machine and remove it afterwards. Never enable it on a public deployment.

### SMS check

Open the **SMS message** tab and paste a message. Up to 3 links (and 1000 characters) are found, including hxxp and `[.]` disguised ones, and each link gets a full, fresh Trust Check and Health Report. The message verdict is never better than its worst link, and scam wording (English and Hindi) lowers it further. A message with no link is never marked Safe.

### Domain registration date

The date comes from the registry itself (RDAP, found through the IANA list; `.in`, `.com`, `.net` and `.org` are built in). If it cannot be fetched, the panel says why (for example "registry did not answer") instead of staying empty. Your computer needs outbound internet for this. `RDAP_BASE` and `RDAP_BOOTSTRAP_URL` in `backend/.env` are optional.

### Optional accounts and My history

Login is optional. Without an account everything works. With one (the **Log in** button), every link and SMS you check is saved under **My history**. Passwords are hashed with scrypt and the session is an HttpOnly cookie. Set `SESSION_SECRET` in `backend/.env` to a long random value (otherwise logins reset when the server restarts), and set `COOKIE_SECURE=true` once the site is on HTTPS. With the in-memory store (no `DATABASE_URL`) accounts are lost on restart; with PostgreSQL the `users` table is created automatically.

### Download as PDF

Finished link and SMS reports have a **Download PDF** button. The PDF holds everything on the report screen (gauge, score breakdown, all checks, Health Report with scores, speed details, security headers, broken links, accessibility issues and the phone screenshot). It is built on the server (pdfkit, no browser needed). It is always in English because the built-in PDF fonts cannot draw Hindi.

### AI status light

The pill in the header shows the AI service name (Ollama, Amazon Bedrock) and its state:

- **green, ready**: the AI service is reachable and idle.
- **yellow, running in backend**: the model is being used right now. It also says what for (writing the plain-language explanation, or the second opinion on the page wording). It stays yellow for about 3 seconds after a call ends so short calls are visible, then returns to green.
- **red, offline**: the service cannot be reached (or the model is not downloaded). **grey, off**: `LLM_PROVIDER=none`.

Scans that are only running the rule checks do not turn it yellow; it is about the AI model itself. Hover for the model name, what it is doing and what it is used for. It reads `GET /api/ai/status` every 2 seconds.

### AI second opinion (protection)

After the fixed rules decide a verdict, the AI reads the visible wording of the page and answers in strict JSON (low, medium or high risk, with short reasons). It can only **add caution**: it can lower the score and move the verdict toward Likely Fake, never the other way. Official sites (.gov.in and known bank domains) are skipped. Page text is treated as untrusted (fenced, shortened, and the model is told not to obey it), and any answer that is not the exact JSON shape is ignored. If the AI is off or fails, the scan is unchanged. Turn it off with `AI_REVIEW=false`.

### Test your own lists

`backend/test-data/links.json` holds 12 genuine sites (gov and others), 3 dead pages on real domains, 10 fake sites (http and https), 5 genuine SMS and 5 fake SMS. With the backend running (with internet), start it with a higher rate limit and run the checker:

```bash
# Terminal 1 (backend folder)
RATE_LIMIT_MAX=300 npm start        # Windows PowerShell: $env:RATE_LIMIT_MAX=300; npm start
# Terminal 2 (backend folder)
npm run check:links
```

It prints PASS/FAIL per item and saves `test-data/last-results.json`. Genuine items should reach 80+ when the network works.

### Automated tests

```bash
npm test
```

Runs 65 tests: address blocking, look-alike detection (including brand-in-subdomain), page signals, security headers, scoring, domain age lookup, the SMS checks, the AI second opinion rules, accounts and sessions, the PDF endpoint and the AI status endpoint.

---

## 8. How a scan works

```
Paste URL
  -> API checks the address, refuses internal targets, stores a "pending" scan, returns an id
  -> Worker picks it up
       1. Opens the page safely (every redirect re-checked, size and time limited)
       2. Trust Check (in parallel): TLS certificate, domain age (RDAP), government domain,
          look-alike names, Google Safe Browsing, OpenPhish, page signals
       3. Rules turn the findings into a score and a verdict
       4. Health Report: Lighthouse (mobile), axe-core accessibility, broken links,
          security headers, phone screenshot
       5. AI writes the explanation (English or Hindi) from the findings
  -> The report page refreshes every 2 seconds until it is done
```

### Trust Score rules

Score = 50 plus the points below, limited to 0 to 100.

| Result | Score |
|---|---|
| Safe | 70 and above |
| Be Careful | 40 to 69 |
| Likely Fake | below 40 |

| Signal | Points |
|---|---|
| Valid HTTPS certificate | +15 |
| No HTTPS / expired / mismatched / untrusted certificate | -25 / -30 / -30 / -30 |
| Domain age: under 7 days / 30 days / 90 days | -30 / -20 / -10 |
| Domain age: 1+ / 3+ / 8+ years | +5 / +10 / +15 |
| `.gov.in` or `.nic.in` domain | +25 |
| Known official domain (bank, shop, service list) | +20 |
| Brand look-alike (`sbi-online-login.xyz`, `amaz0n.in`) | -45 |
| Website is a raw IP address / `name@` trick in the address | -20 / -25 |
| Google Safe Browsing match | -60 and always "Likely Fake" |
| Exact URL in the OpenPhish feed | -60 and always "Likely Fake" |
| Password / OTP / card form without HTTPS | -30 |
| Brand-new site (under 30 days) asking for sensitive details | -20 |
| Form sends data to another website | -15 |
| Hidden frames, automatic redirect elsewhere, redirect to another domain | -10 each |
| Contact and privacy pages linked / both missing | +5 / -5 |

Extra rules: a result with any serious ("bad") finding can never be "Safe". **Confidence** drops when checks could not run (for example no Safe Browsing key or no internet).

All of this is in `backend/src/trust/scoring.js` and is covered by tests, so you can change a number and see what breaks.

### API

| Method and path | Purpose |
|---|---|
| `GET /health` | Returns 200 when the app and database are up |
| `POST /api/scans` `{ "url": "...", "lang": "en" }` | Starts a scan, returns `{ id }`. Same URL within 30 minutes returns the existing result |
| `GET /api/scans/:id` | Report so far (poll until `status` is `done` or `failed`) |
| `POST /api/scans/:id/explain` `{ "lang": "hi" }` | Creates the explanation in another language |
| `GET /api/dashboard` | Totals and recently flagged host names |

---

## 9. Project layout

```
jaanch-ai/
  package.json               shortcuts: install:all, dev:backend, dev:frontend, build, start, test
  scripts/copy-frontend.mjs  copies the built React app into backend/public
  backend/
    .env.example
    src/
      server.js              Express app, /health, serves the built React app
      config.js              every setting, read from .env
      worker.js              takes pending scans and runs the pipeline
      routes/api.js          the API above, with rate limiting
      security/              ssrf.js (address rules), safeFetch.js (safe page fetching)
      trust/                 tls, domainAge, govDomain, lookalike (+ data/brands.json),
                             safeBrowsing, feeds, pageSignals, scoring, index
      health/                lighthouse, pageChecks (axe, links, screenshot), headers, browser
      llm/                   prompt, ollama, bedrock, index (with rule-based fallback)
      storage/               screenshots and report JSON: local disk or S3
      db/                    schema.sql, pgStore (PostgreSQL), memoryStore
    test/                    unit tests
  frontend/
    .env.example
    nginx.conf               serves the built app and forwards /api, /screenshots, /health to the backend
    src/                     App, pages (Home, Report, Dashboard), components, i18n, styles
```

---

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| "Chrome was not found" in the Health Report | Install Google Chrome, or set `CHROME_PATH` in `backend/.env` to its full path. Alternative: `npx playwright-core install chromium` |
| Chrome fails to start on Linux or in a container | Set `CHROME_NO_SANDBOX=true` (it turns on automatically when running as root) |
| Health Report is slow | Lighthouse takes 20 to 60 seconds on a normal site. Keep `MAX_CONCURRENT_SCANS=1` |
| Report says "The AI explanation is not available right now" | Ollama is not running or the model is not pulled. Run `ollama list`, or set `LLM_PROVIDER=none` |
| Many checks show "could not be checked" | The server cannot reach the internet (RDAP, Safe Browsing, OpenPhish), or you have no Safe Browsing key |
| "Too many checks from your network" | Rate limit (10 checks per 15 minutes per IP). Raise `RATE_LIMIT_MAX` for testing |
| Port 3000 is already in use | Change `PORT` in `backend/.env` and `VITE_BACKEND_URL` in `frontend/.env` |
| Frontend shows "Could not reach the server" | The backend is not running, or `VITE_BACKEND_URL` does not match its port |
| Database connection error | Check `DATABASE_URL`. Leave it empty to use the in-memory store |

---

## 11. Tested so far, and limits to know about

**Tested while building this draft** (all passing): the 65 tests; a full scan of a local test site covering Lighthouse, accessibility, broken links, security headers, screenshot and the rule-based explanation; the same scan stored in a real PostgreSQL database, including caching, the dashboard and English/Hindi explanations; rejection of internal addresses (localhost, private ranges, cloud metadata, hex and decimal IP tricks, odd ports); rate limiting; the Ollama adapter against a fake Ollama server; and the fallback when Ollama or Bedrock fail.

**Not tested here:** real internet scans (RDAP, Google Safe Browsing and OpenPhish need outbound access that the build environment did not have), Amazon Bedrock, Amazon S3, and a real Ollama model. Run a few real sites on your machine and check each finding.

**Known limits of this draft:**

- **SSRF protection is strong but not absolute.** Page fetching, redirects, link checks and every request the browser makes for the accessibility scan are checked. Lighthouse drives its own Chrome and follows redirects itself, so it only receives the final address that was already checked. When you deploy, also restrict the server's outbound network access and turn on IMDSv2.
- **The look-alike list is a starter** (29 Indian banks, government services and shops in `backend/src/trust/data/brands.json`). Extend it. The matching is a heuristic and can give false alarms or miss things.
- **Findings are shown in English.** The screen text and the AI explanation switch to Hindi, but the individual check names and details do not yet.
- **The AI never changes the verdict**, but a small model can still word things badly. The prompt tells it not to claim certainty.
- **No `robots.txt` handling and no login.** The scanner only reads public pages, does not submit forms and does not store anything people type.
- **Rate limiting is kept in memory per server.** With several servers each has its own counter.
- **Only OpenPhish** is used as a phishing list. PhishTank can be added in `trust/feeds.js`.

---

## 12. Serving the frontend with nginx

In production the browser talks only to nginx. nginx serves the built React app and forwards API calls to the backend, so everything is one origin and the backend needs no CORS settings.

1. Build the frontend: `cd frontend && npm install && npm run build`. The output is `frontend/dist/`.
2. Put `frontend/dist/` where nginx serves files from (`/usr/share/nginx/html` in the official image) and use `frontend/nginx.conf` as the nginx configuration (`/etc/nginx/nginx.conf`).
3. In `nginx.conf`, set the backend address in the `upstream` block: `backend:3000` for a container called `backend` on the same network, or `127.0.0.1:3000` when the backend runs on the same machine. nginx must be able to resolve that name when it starts.
4. Start the backend as usual (`npm start` in `backend/`).

What the file does: serves `index.html` for any route that is not a file (so refreshing `/report/abc` works), forwards `/api/`, `/screenshots/` and `/health` to the backend, caches `/assets/` for a year and never caches `index.html`, compresses text files, limits request bodies to 16 KB, and adds security headers including a Content-Security-Policy. `/nginx-health` answers `ok` from nginx itself. Turn on the HSTS line only when the site is served over HTTPS.

**`TRUST_PROXY`:** the backend uses it to find the real visitor for rate limiting. Use `1` for browser, nginx, backend. Use `2` if a load balancer sits in front of nginx. A wrong value makes every visitor share one rate limit.

Without nginx you can still run everything from the backend alone (`npm run build`, then `npm start`), as in section 2.

---

## 13. Settings for the cloud (for later)

For a cloud run set: `LLM_PROVIDER=bedrock`, `BEDROCK_REGION`, `BEDROCK_MODEL_ID`, `DATABASE_URL` with `PG_SSL=true`, `S3_BUCKET`, `SAFE_BROWSING_API_KEY`, `TRUST_PROXY` (see section 12) and `CHROME_NO_SANDBOX=true` (when the backend runs as a normal user inside a container). Keep `ALLOW_PRIVATE_TARGETS` off.
