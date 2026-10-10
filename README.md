<div align="center">

# 🛡️ Jaanch.ai 🇮🇳

### Check before you trust.

Paste a **website link** or an **SMS** and get an answer in seconds:
✅ **Safe** · ⚠️ **Be Careful** · 🚫 **Likely Fake**

plus a full **Health Report** of the website, explained in **English and हिंदी**.

</div>

> 📸 **Screenshot placeholder:** home page (`docs/images/home.png`)

---

## ✨ Features

| | |
|---|---|
| 🔍 **Trust Check** | HTTPS certificate, domain registration age, `.gov.in` / `.nic.in`, look-alike brand names, Google Safe Browsing, OpenPhish feed and page signals, ending in a clear verdict and score |
| 💬 **SMS check** | Paste a message. Every link in it gets a full check, and the wording (threats, KYC bait, prizes, OTP requests, in English and Hindi) is scored too |
| 🩺 **Health Report** | Mobile speed, accessibility, best practices, SEO (Lighthouse), accessibility issues (axe-core), broken links, security headers and a phone screenshot |
| 🧠 **AI that only adds caution** | Fixed, tested rules decide the verdict. The AI explains it in plain words, and a **second opinion** on the page wording can only lower a score, never raise it |
| 🟢 **Live AI status light** | Header pill shows the AI service (Ollama): green ready, yellow while the model is working, red offline |
| 📄 **PDF report** | One click downloads everything on the report screen (English) |
| 👤 **Optional login** | Sign up to keep a **My history** of the sites and messages you checked. Everything also works without an account |
| 🌐 **English / हिंदी**, 🌙 dark mode, 📱 phone friendly | Progress tracker with live indicators while a check runs |
| 📞 **Report fraud button** | Always visible. National Cyber Crime Helpline **1930**, police **112**, and the cybercrime.gov.in portal |

> 📸 **Screenshot placeholders:** Trust Check (`docs/images/trust.png`) · Health Report (`docs/images/health.png`) · SMS check (`docs/images/sms.png`) · Progress tracker (`docs/images/progress.png`) · Dashboard (`docs/images/dashboard.png`) · PDF report (`docs/images/pdf.png`)

**Built with:** Node.js 22+ · Express · React + Vite · PostgreSQL · Lighthouse · Playwright · axe-core · Ollama · Docker Compose

---

## 🚀 Run it

You can run Jaanch.ai on your machine ([Option A](#option-a-run-locally-no-docker)) or with Docker Compose ([Option B](#option-b-docker-compose)). Amazon Elastic Beanstalk deployment will be added at the end of this file.

### What you need

| Needed | Notes |
|---|---|
| **Node.js 22.19+** (Option A) | `node -v` to check |
| **Google Chrome or Chromium** (Option A) | Needed for the Health Report. Without it the Trust Check still works. Docker installs Chromium for you |
| **Docker + Docker Compose** (Option B) | |
| PostgreSQL 14+ | Optional locally (memory is used without it). Compose starts one for you |
| Ollama | Optional, for the AI explanation. Without it you get a rule-based summary |
| Google Safe Browsing API key | Optional and free. Without it that check shows "not checked" |

### Option A: Run locally (no Docker)

```bash
npm run install:all                      # install backend and frontend
cp backend/.env.example backend/.env     # Windows: copy backend\.env.example backend\.env
cp frontend/.env.example frontend/.env
```

For a first run, set `LLM_PROVIDER=none` in `backend/.env`. Then, in two terminals:

```bash
npm run dev:backend      # API and scan worker  -> http://localhost:3000
npm run dev:frontend     # web app              -> http://localhost:5173
```

Open **http://localhost:5173**, paste `incometax.gov.in` and press **Check**. The backend prints which Chrome it found, for example `[browser] using /usr/bin/chromium`.

One-server mode (closer to production): `npm run build` then `npm start`, and open http://localhost:3000.

**Database (optional):** `createdb jaanch`, then set `DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/jaanch` in `backend/.env`. The backend creates all tables itself on start, so there is no SQL file to run.

### Option B: Docker Compose

Compose starts PostgreSQL, the backend (with Chromium inside), the frontend and, optionally, Ollama.

**1. Settings files**

| File | What goes in it |
|---|---|
| `.env` (project root, next to `docker-compose.yml`) | Values the compose file uses: `postgres_user`, `postgres_password`, `postgres_db`, `postgres_port`, `backend_port`, `frontend_port` |
| `backend/.env` | Copy of `backend/.env.example` with the container settings below |
| `frontend/.env` | `VITE_BACKEND_URL=<backend service address, using its name in docker-compose.yml>` |

Container values for `backend/.env`:

```
DATABASE_URL=postgres://<postgres_user>:<postgres_password>@postgres:5432/<postgres_db>
CHROME_PATH=<path to Chromium inside the container>
CHROME_NO_SANDBOX=<true>
SESSION_SECRET=<long random value>
LLM_PROVIDER=<ollama | none>
OLLAMA_URL=<address of the Ollama service>
OLLAMA_MODEL=<model name>
```

> `docker run --env-file` and compose `env_file` **override** values baked into the image, so `CHROME_PATH` and `CHROME_NO_SANDBOX` must be set here or the Lighthouse part of the Health Report will fail.
> Never commit a real `.env`. If a key was ever pasted somewhere public, create a new one.

**2. Start**

```bash
docker login dhi.io            # only if your Dockerfiles use dhi.io (Docker Hardened Images) base images
docker compose up -d --build
docker compose logs -f jaanch_backend
```

If your compose file keeps the `ollama` profile, use `docker compose --profile ollama up -d --build` instead.

Open **http://localhost:4173** (frontend) · API at http://localhost:3000 · health check at http://localhost:3000/health

**3. Stop:** `docker compose down` (add `-v` to also delete the database and model volumes).

Compose notes:
- **Startup order:** the backend waits for PostgreSQL's health check, then creates its tables.
- **Chromium:** gets 1 GB shared memory (`shm_size`) for Lighthouse. Give the Docker host at least 2 GB of RAM.
- **Screenshots:** kept in a named volume. Set `S3_BUCKET` to store them in Amazon S3 instead.
- **Frontend:** served by `vite preview` and forwards `/api` and `/screenshots` to `VITE_BACKEND_URL`. `frontend/nginx.conf` is an optional alternative if you prefer to serve the built files with nginx.

---

## 🤖 AI model (Ollama)

The AI writes the plain-words explanation and the second opinion. If it is off or fails, the app shows a rule-based summary and nothing breaks.

| `LLM_PROVIDER` | Meaning |
|---|---|
| `ollama` | Local open-source model, no API key |
| `none` | AI off, rule-based summary only |

### Ollama in Docker Compose

The compose `ollama` service keeps the model loaded (`OLLAMA_KEEP_ALIVE=24h`) and a one-time `ollama-pull` job downloads the model named in `backend/.env`:

```
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=gemma3:4b
```

Check it: `docker exec ollama ollama list` and `docker exec ollama ollama ps`. The header pill turns from red to green when the model answers.

### Ollama on your machine (without Docker)

Install from https://ollama.com, then `ollama pull gemma3:4b` and set `OLLAMA_URL=http://localhost:11434`. If the backend runs in Docker but Ollama runs on the host, run Ollama with `OLLAMA_HOST=0.0.0.0` and use `OLLAMA_URL=http://host.docker.internal:11434` (add `extra_hosts: ["host.docker.internal:host-gateway"]` to the backend service).

### Which model

| Hardware | Model |
|---|---|
| CPU only, 8 to 16 GB RAM | `gemma3:4b` (good, handles Hindi reasonably) or `llama3.2:3b` (faster) |
| GPU with 4 GB VRAM | `llama3.2:3b` fits fully, `gemma3:4b` is a tight fit |
| GPU with 8 GB+ VRAM | `gemma2:9b` or larger |

Test the Hindi output (switch to हिंदी and run a check): small models are often weak at Hindi. A model bigger than your GPU memory is split onto the CPU and becomes slow. If you see timeouts, use a smaller model or raise `LLM_TIMEOUT_MS`.

**GPU in Docker** needs the NVIDIA Container Toolkit. Without it the compose GPU settings fail with "could not select device driver". Plain CPU works everywhere.

---

## 🧪 Try it and test it

| Try | You should see |
|---|---|
| `incometax.gov.in` | Government domain, official-domain credit, high score |
| `http://sbi.login.com` | Likely Fake: bank name placed in front of another site |
| `http://localhost` | Refused: points to a private network |
| SMS tab, "Fake SMS" example | Every link checked, plus wording signals |

```bash
npm test                 # 65 automated tests (run from the project root)
npm run check:links      # in backend/: runs backend/test-data/links.json (needs internet and the backend running)
```

`backend/test-data/links.json` holds 12 genuine sites, 3 dead pages, 10 fake sites, 5 genuine SMS and 5 fake SMS.

---

## 🧭 How it works

```
Paste URL or SMS
  -> API validates the address, refuses internal targets, stores a "pending" scan
  -> Worker: opens the page safely -> Trust Check (rules -> score and verdict)
          -> AI second opinion (can only add caution)
          -> Health Report (Lighthouse, axe, links, headers, screenshot)
          -> AI writes the explanation in English or Hindi
  -> The report page follows each stage live until it is done
```

**Trust Score:** starts at 50, good signs add points, warning signs subtract, limited to 0 to 100. **Safe** is 70+, **Be Careful** 40 to 69, **Likely Fake** below 40. A Google Safe Browsing or OpenPhish match always means Likely Fake, and any serious finding can never be Safe. The full rules are in `backend/src/trust/scoring.js` and covered by tests.

**API:**

| Endpoint | Purpose |
|---|---|
| `GET /health` | App and database status |
| `POST /api/scans` · `GET /api/scans/:id` | Start a link scan, read its report |
| `POST /api/sms` · `GET /api/sms/:group` | Check an SMS message and its links |
| `GET /api/scans/:id/pdf` · `GET /api/sms/:group/pdf` | PDF reports |
| `POST /api/scans/:id/explain` | Explanation in another language |
| `GET /api/ai/status` | AI service name and state (powers the header pill) |
| `POST /api/auth/signup` · `login` · `logout` · `GET /api/auth/me` · `GET /api/me/history` | Optional accounts and history |
| `GET /api/dashboard` | Totals and recently flagged sites |

---

## 🗂️ Project layout

```
jaanch-ai/
  docker-compose.yml
  backend/    Dockerfile, .env.example, src/ (routes, trust, health, llm, sms, report, auth, db, storage), test/, test-data/
  frontend/   Dockerfile, nginx.conf (optional), .env.example, src/ (pages, components, i18n, styles)
  docs/       CODE_GUIDE.md
```

---

## 🩹 Troubleshooting

| Problem | Fix |
|---|---|
| Health Report shows "-" for speed, accessibility, best practices, SEO | In Docker, set `CHROME_NO_SANDBOX=true` and `CHROME_PATH=/usr/bin/chromium` in `backend/.env`, then recreate the container (`docker compose up -d`) |
| "Chrome was not found" | Install Chrome, or set `CHROME_PATH` |
| AI pill says offline, or "AI explanation not available" | Ollama is not running, the model is not pulled, or `OLLAMA_MODEL` has a typo. Check `docker exec ollama ollama list` and `docker compose logs jaanch_backend` |
| Ollama timeouts | Model too big for your hardware. Use a smaller model, keep it loaded, raise `LLM_TIMEOUT_MS` |
| `vite: command not found` while building the frontend image | The build stage must use `npm ci` (not `--omit=dev`), because Vite is a dev dependency |
| `docker compose` GPU error "could not select device driver" | NVIDIA Container Toolkit is not installed. Remove the GPU settings to run on CPU |
| "Too many checks from your network" | Rate limit. Raise `RATE_LIMIT_MAX` for testing |
| Everyone is logged out after each restart | Set `SESSION_SECRET` |
| `.env` change has no effect | Recreate the container (`docker compose up -d`). A plain restart does not re-read it |

---

## ☁️ Deploy to AWS Elastic Beanstalk

*Coming soon: build and push the images, configure the environment (database, S3, instance role), health checks and the DevSecOps pipeline.*

> 📸 **Screenshot placeholders:** architecture diagram (`docs/images/architecture.png`) · CI/CD pipeline (`docs/images/pipeline.png`)
