<div align="center">

# 🛡️ Jaanch.ai 🇮🇳

### Check before you trust.

Paste a **website link** or an **SMS** and get an answer in seconds:
✅ **Safe** · ⚠️ **Be Careful** · 🚫 **Likely Fake**

plus a full **Health Report** of the website, explained in **English and हिंदी**.

</div>

![Jaanch.ai home page](docs/images/home.png)

---

## ✨ Features

| | |
|---|---|
| 🔍 **Trust Check** | HTTPS certificate, domain registration age, `.gov.in` / `.nic.in`, look-alike brand names, Google Safe Browsing, OpenPhish feed and page signals, ending in a clear verdict and score |
| 💬 **SMS check** | Paste a message. Every link in it gets a full check, and the wording (threats, KYC bait, prizes, OTP requests, in English and Hindi) is scored too |
| 🩺 **Health Report** | Mobile speed, accessibility, best practices, SEO (Lighthouse), accessibility issues (axe-core), broken links, security headers and a phone screenshot |
| 🧠 **AI that only adds caution** | Fixed, tested rules decide the verdict. The AI explains it in plain words, and a **second opinion** on the page wording can only lower a score, never raise it |
| 🔎 **Past reports** | For suspicious sites, the app searches the web for earlier scam reports about the same domain or fake copies of the brand, and the AI summarises what it found with links. Shown in the report and the PDF |
| 🟢 **Live AI status light** | Header pill shows the AI service (Ollama or Amazon Bedrock): green ready, yellow while the model is working, red offline |
| 📄 **PDF report** | One click downloads everything on the report screen (English) |
| 👤 **Optional login** | Sign up to keep a **My history** of the sites and messages you checked. Everything also works without an account |
| 🌐 **English / हिंदी**, 🌙 dark mode, 📱 phone friendly | Progress tracker with live indicators while a check runs |
| 📞 **Report fraud button** | Always visible. National Cyber Crime Helpline **1930**, police **112**, and the cybercrime.gov.in portal |

| Trust Check | Health Report |
|---|---|
| ![Trust Check](docs/images/trust.png) | ![Health Report](docs/images/health.png) |

| SMS check | Progress tracker |
|---|---|
| ![SMS check](docs/images/sms.png) | ![Progress tracker](docs/images/progress.png) |

| Dashboard | Likely Fake result |
|---|---|
| ![Dashboard](docs/images/dashboard.png) | ![Likely Fake result](docs/images/trust-fake.png) |

**Built with:** Node.js 22+ · Express · React + Vite · PostgreSQL · Lighthouse · Playwright · axe-core · Ollama · Amazon Bedrock · SearXNG · Docker Compose · Terraform · GitHub Actions · AWS Elastic Beanstalk

---

## 🚀 Run it

You can run Jaanch.ai on your machine ([Option A](#option-a-run-locally-no-docker)) or with Docker Compose ([Option B](#option-b-docker-compose)). The AWS deployment (Elastic Beanstalk, with a CI/CD pipeline) is described in [Deploy to AWS Elastic Beanstalk](#️-deploy-to-aws-elastic-beanstalk).

### What you need

| Needed | Notes |
|---|---|
| **Node.js 22.19+** (Option A) | `node -v` to check |
| **Google Chrome or Chromium** (Option A) | Needed for the Health Report. Without it the Trust Check still works. Docker installs Chromium for you |
| **Docker + Docker Compose** (Option B) | |
| PostgreSQL 14+ | Optional locally (memory is used without it). Compose starts one for you |
| Ollama or Amazon Bedrock | Optional, for the AI explanation. Without one you get a rule-based summary |
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

Compose starts PostgreSQL, the backend (with Chromium inside), the frontend, SearXNG (web search for past reports) and, optionally, Ollama.

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
LLM_PROVIDER=<ollama | bedrock | none>
OLLAMA_URL=<address of the Ollama service>
OLLAMA_MODEL=<model name>
SEARCH_URL=<address of the SearXNG service, or empty to switch past reports off>
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
- **SearXNG:** uses `searxng/settings.yml` (JSON output on, limiter off) and is reachable only inside the Docker network. Set `SEARXNG_SECRET` in the root `.env`.
- **Screenshots:** kept in a named volume. Set `S3_BUCKET` to store them in Amazon S3 instead.
- **Frontend:** served by `vite preview` and forwards `/api` and `/screenshots` to `VITE_BACKEND_URL`. `frontend/nginx.conf` is an optional alternative if you prefer to serve the built files with nginx.

---

## 🤖 AI model (Ollama or Amazon Bedrock)

The AI writes the plain-words explanation and the second opinion. If it is off or fails, the app shows a rule-based summary and nothing breaks.

| `LLM_PROVIDER` | Meaning |
|---|---|
| `ollama` | Local open-source model, no API key |
| `bedrock` | Amazon Bedrock model in the cloud. Uses the AWS credentials of the machine or instance role, so no key goes in `.env` |
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

### Amazon Bedrock

Set `LLM_PROVIDER=bedrock`, `BEDROCK_REGION` and `BEDROCK_MODEL_ID` (for example `google.gemma-3-27b-it`). The identity running the backend (an Elastic Beanstalk instance role, or your own AWS profile locally) needs `bedrock:InvokeModel`, and the model must be available to the AWS account in that region. The header pill shows "Amazon Bedrock" when it answers.

### Which model (Ollama)

| Hardware | Model |
|---|---|
| CPU only, 8 to 16 GB RAM | `gemma3:4b` (good, handles Hindi reasonably) or `llama3.2:3b` (faster) |
| GPU with 4 GB VRAM | `llama3.2:3b` fits fully, `gemma3:4b` is a tight fit |
| GPU with 8 GB+ VRAM | `gemma2:9b` or larger |

Test the Hindi output (switch to हिंदी and run a check): small models are often weak at Hindi. A model bigger than your GPU memory is split onto the CPU and becomes slow. If you see timeouts, use a smaller model or raise `LLM_TIMEOUT_MS`.

**GPU in Docker** needs the NVIDIA Container Toolkit. Without it the compose GPU settings fail with "could not select device driver". Plain CPU works everywhere.

---

## 🔎 Past reports (web search)

For a **Be Careful / Likely Fake** result, or any look-alike of a known brand, the backend searches the web (through [SearXNG](https://github.com/searxng/searxng)) for earlier reports of the same domain and of fake copies of the brand. The AI model then writes a two-sentence summary from the numbered results.

- **The model never browses.** It only reads the search results the backend gives it, and every link shown is a real search result. The model can choose which results to cite but cannot add links or facts.
- **It can only add caution.** A report naming this exact domain lowers the score by 10. Reports about similar fake sites are shown but cost nothing. It never makes a verdict safer.
- **No reports never means safe.** New fake sites usually have no history yet, and the card says so.
- **No extra waiting.** It runs next to the Health Report, and results are cached for 6 hours per domain.
- Without SearXNG, the AI, or internet access, the card shows links only or says the search was unavailable, and the scan finishes as before.

Turn it on by setting `SEARCH_URL` in `backend/.env` (`http://searxng:8080` in Docker Compose). Leave it empty to switch it off. For a local run without Compose: `docker run -d -p 8080:8080 -e SEARXNG_SECRET=<random> -v "$PWD/searxng/settings.yml:/etc/searxng/settings.yml" searxng/searxng`, then `SEARCH_URL=http://localhost:8080`.

---

## 🧪 Try it and test it

| Try | You should see |
|---|---|
| `incometax.gov.in` | Government domain, official-domain credit, high score |
| `http://sbi.login.com` | Likely Fake: bank name placed in front of another site |
| `http://localhost` | Refused: points to a private network |
| SMS tab, "Fake SMS" example | Every link checked, plus wording signals |

```bash
npm test                 # 73 automated tests: 72 backend + 1 frontend (run from the project root)
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
          -> Past reports: web search + AI summary (in parallel with the next step)
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
  searxng/    settings.yml (web search for past reports)
  deploy/eb/  docker-compose.yml and searxng/ config uploaded to Elastic Beanstalk
  infra/      Terraform: bootstrap/ (state bucket, GitHub OIDC role) and app/ (S3, IAM, RDS, Elastic Beanstalk)
  .github/    workflows: ci-devsecops, cd, dast, destroy
  docs/       CODE_GUIDE.md, images/
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
| "Past reports" card says the search is unavailable | SearXNG is not running, `SEARCH_URL` is wrong, or `searxng/settings.yml` is not mounted (it must allow `json` output). Check `docker compose logs searxng` |
| Bedrock: `AccessDeniedException`, "model is not available for this account" | The model is not enabled for the AWS account in that region. Enable it in the Bedrock console, then check `BEDROCK_MODEL_ID` and `BEDROCK_REGION` |
| "Google Safe Browsing was not checked: no API key is set on this server" | `SAFE_BROWSING_API_KEY` is not set. Add it to `backend/.env`, or as the `SAFE_BROWSING_API_KEY` repository secret for the AWS deployment |
| "Too many checks from your network" | Rate limit. Raise `RATE_LIMIT_MAX` for testing |
| Everyone is logged out after each restart | Set `SESSION_SECRET` |
| `.env` change has no effect | Recreate the container (`docker compose up -d`). A plain restart does not re-read it |

---

## ☁️ Deploy to AWS Elastic Beanstalk

Jaanch.ai runs on **AWS Elastic Beanstalk** (Docker on Amazon Linux 2023) behind an Application Load Balancer. A GitHub Actions pipeline builds and scans the images, creates the infrastructure with Terraform, deploys the app and tests it. The pipeline authenticates to AWS with GitHub OIDC, so no AWS access keys are stored in the repository.

![Architecture](docs/images/architecture.png)

### What gets created

| Piece | Details |
|---|---|
| Elastic Beanstalk - Standard (Cluster-Future Scope)| One environment, Docker platform on Amazon Linux 2023, `t3.large`, Application Load Balancer (public), enhanced health, logs streamed to CloudWatch |
| App containers | Backend, frontend and SearXNG from `deploy/eb/docker-compose.yml`, with the images pinned to the commit SHA |
| Database | Amazon RDS PostgreSQL 16 (`db.t4g.micro`), private, reached with `DATABASE_URL` and `PG_SSL=true` |
| Screenshots | A private S3 bucket (`S3_BUCKET`) |
| AI | Amazon Bedrock, called through the instance role (`bedrock:InvokeModel`) |
| Identity | An instance role and a service role for Elastic Beanstalk; a GitHub OIDC role for the pipeline |

Elastic Beanstalk writes its environment properties to the `.env` the compose file reads. Terraform sets them:

| Property | Value |
|---|---|
| `LLM_PROVIDER`, `BEDROCK_REGION`, `BEDROCK_MODEL_ID`, `LLM_TIMEOUT_MS` | `bedrock`, the region, the model ID, `60000` |
| `DATABASE_URL`, `PG_SSL` | generated from the RDS instance, `true` |
| `S3_BUCKET`, `S3_REGION` | the screenshots bucket and its region |
| `SEARCH_URL`, `SEARXNG_SECRET` | `http://searxng:8080`, a generated secret |
| `SESSION_SECRET` | a generated secret |
| `CHROME_PATH`, `CHROME_NO_SANDBOX` | `/usr/bin/chromium`, `true` |
| `TRUST_PROXY`, `COOKIE_SECURE` | `1`, `false` (the default Elastic Beanstalk URL is plain HTTP) |
| `RATE_LIMIT_MAX` | `60` (the code default is 10) |
| `SAFE_BROWSING_API_KEY` | from the repository secret; left out when the secret is empty |

### CI/CD pipeline

Four workflows work together. Each one is a separate file in `.github/workflows/`, and they hand over to each other in this order:

![CI/CD pipeline](docs/images/pipeline.png)

```
ci-devsecops  (manual: Actions -> Run workflow)
  |- code-quality    \
  |- secret-scanning  |
  |- dependency-check |  run in parallel, all must finish
  |- docker-scan      |
  |- sonar-scan       |
  |- code-test       /
  '- docker-push     (only if all six above passed) -> Docker Hub, tags :latest and :<commit SHA>
        |
        |  CI succeeded on main  (workflow_run)
        v
cd-deploy  (also runnable by hand with a commit SHA)
  1 gate -> 2 verify images -> 3 plan -> 4 apply (approval) -> 5 deploy
                                                   -> 6 smoke tests -> 6b rollback (on failure)
                                                   -> 7 dast.yml (OWASP ZAP) -> 8 summary

destroy  (manual only, approval) -> removes everything cd-deploy created
```

| Workflow | File | Starts when | Purpose |
|---|---|---|---|
| `ci-devsecops` | `ci-devsecops.yml` | Manually (**Actions -> ci-devsecops -> Run workflow**). The `push` trigger on `main` is commented out on purpose while the project is not being pushed to often; to run CI on every push, uncomment the `push:` block under `on:` in `ci-devsecops.yml` | Checks the code and builds the images |
| `cd-deploy` | `cd.yml` | Automatically when `ci-devsecops` succeeds on `main`, or manually with a `commit_sha` | Creates the AWS infrastructure, deploys, tests |
| `dast` | `dast.yml` | Called by `cd-deploy` as a reusable workflow (it can also be run by hand with a URL) | Security scan of the live site |
| `destroy` | `destroy.yml` | Manually, after typing `destroy` | Removes everything from AWS |

#### 1. CI: `ci-devsecops`

![CI run: ci-devsecops](docs/images/ci-run.png)

*A successful `ci-devsecops` run: six checks in parallel, then `docker-push`.*

`ci-devsecops.yml` contains no steps of its own. It calls six check workflows and then the image build. Splitting them this way means each check has its own file, its own logs, and can be reused.

| Job | Reusable workflow | What it does | Blocks the build? |
|---|---|---|---|
| `code-quality` | `code-quality-check.yml` | ESLint (`npm run lint`) for `frontend` and `backend` (matrix) | Yes |
| `secret-scanning` | `secret-scanning-check.yml` | Gitleaks scans the whole git history (`fetch-depth: 0`) for committed secrets | Yes |
| `dependency-check` | `dependency-scan-check.yml` | `npm audit` (high and above) for both folders, prints a summary and uploads `audit-report.json` as an artifact | No, report only |
| `docker-scan` | `docker-scan-checks.yml` | Hadolint checks each Dockerfile, the image is built, and Trivy scans it for CRITICAL vulnerabilities (fixable ones only) | Hadolint yes; Trivy is reported but set to `continue-on-error` |
| `sonar-scan` | `sonar-scan-check.yml` | SonarQube static analysis of the code (`SONAR_TOKEN`) | Yes |
| `code-test` | `test-code-check.yml` | `npm test` for `frontend` and `backend` (Node 24) | Yes |
| `docker-push` | `dockerpush.yml` | Builds both images and pushes them to Docker Hub, tagged `:latest` and `:<full commit SHA>`. **Runs only when the six jobs above have all finished** (`needs:`) | n/a |

The SHA tag matters: it ties a running deployment to an exact commit. CD never deploys `:latest`, only the SHA that CI built.

#### 2. CD: `cd-deploy`

![CD run: cd-deploy](docs/images/cd-run.png)

*A successful `cd-deploy` run (11 minutes). `6b Roll back` is skipped because the smoke tests passed.*

`cd.yml` starts on its own when `ci-devsecops` finishes successfully on `main` (the `workflow_run` trigger). Failed or non-`main` CI runs are ignored. It can also be started by hand: **Actions -> cd-deploy -> Run workflow**, optionally with a `commit_sha` (blank means the latest commit of the branch). That SHA must already have images on Docker Hub, which means CI must have run for it.

Only one CD or destroy run can be active at a time (`concurrency: jaanch-cd`), so two runs never change the same infrastructure together.

| # | Job | What it does |
|---|---|---|
| 1 | **Gate** | Decides the commit SHA to deploy: the CI run's SHA, or the one typed in by hand |
| 2 | **Verify images** | Checks that `jaanch-backend:<sha>` and `jaanch-frontend:<sha>` exist on Docker Hub. Retries a few times, then fails fast. A commit that changed only workflows or Terraform has no images, so run CI first or pass a SHA that has them |
| 3 | **Terraform validate, scan, plan** | Signs in to AWS with OIDC, then runs `fmt`, `validate`, Checkov (IaC scan, report only) and `terraform plan`. The plan is saved as an artifact |
| 4 | **Approve and terraform apply** | Pauses on the `production` environment until a reviewer approves, then applies the saved plan: S3, IAM, RDS and the Elastic Beanstalk environment |
| 5 | **Deploy** | Writes the commit SHA into `docker-compose.yml`, zips it with the SearXNG config, uploads it as a new application version (`<sha7>-run<N>`) and updates the environment. The previous version label is remembered |
| 6 | **Smoke tests** | Calls `/` and `/api/ai/status` on the live URL (retries every 10 seconds for up to 2 minutes each). Both must return HTTP 200 |
| 6b | **Roll back** | Runs only if deploy or smoke tests failed. Redeploys the previous version label. On a first deployment there is nothing to go back to, so it leaves the environment as is and warns |
| 7 | **DAST** | Calls `dast.yml` against the live URL (below) |
| 8 | **Summary** | Writes the live URL, version, image tags and results to the run summary |

![Approval gate](docs/images/approval.png)

*The run pauses at job 4 until a reviewer approves the `production` environment.*

**Safety points**
- **No stored AWS keys.** Jobs that touch AWS use `permissions: id-token: write` and GitHub OIDC. The role trusts only this repository (pinned by numeric owner and repository IDs) and only the `main` branch and the `production` and `destroy` environments.
- **Approval before changes.** Nothing is created until a reviewer has read the plan and approved the `production` environment.
- **Secrets stay out of logs.** Terraform marks generated passwords as sensitive, and the Elastic Beanstalk settings that hold them are applied in a way that keeps the values out of the public log.

#### 3. DAST: `dast`

`dast.yml` is a **reusable workflow**. `cd.yml` calls it as job 7 with `target_url` set to the new environment's URL, so it only runs after smoke tests pass.

1. It waits until the site answers HTTP 200.
2. It runs an [OWASP ZAP](https://www.zaproxy.org/) **baseline scan**, which crawls the live site passively and looks for issues such as missing security headers and insecure cookies.
3. It is **report only** (`fail_action: false`), so findings never fail the deploy. The report is uploaded as the `zap-report` artifact.

The default Elastic Beanstalk URL is plain HTTP, so expect findings about missing HTTPS-related headers.

#### 4. Destroy: `destroy`

`destroy.yml` removes everything `cd-deploy` created, so the demo does not keep costing money. It never runs by itself.

1. **Confirm input:** you must type `destroy` when starting the run, or it stops.
2. **Approve and destroy:** pauses on the `destroy` environment until a reviewer approves.
3. `terraform destroy` removes Elastic Beanstalk, RDS (no final snapshot), the screenshots bucket (emptied first) and the application IAM roles.
4. A cleanup step then deletes the application bundles that Elastic Beanstalk keeps in its shared S3 bucket and the CloudWatch log groups, which Terraform does not own. A report lists what was removed.

It shares the `jaanch-cd` concurrency group, so it cannot run while a deploy is in progress. A destroy takes about 6 minutes. After it, the pipeline can be run again from scratch with no manual cleanup.

#### Environments (approval gates)

GitHub *environments* are named deployment targets that can require a human to approve before a job runs. This project uses two. Create them under **Settings -> Environments** and add yourself as a required reviewer.

| Environment | Used by | Job that waits | What the approval protects |
|---|---|---|---|
| `production` | `cd-deploy` | `4 Approve and terraform apply` | Creating or changing the AWS infrastructure. The reviewer reads the Terraform plan first |
| `destroy` | `destroy` | `Approve and destroy` | Deleting everything. It is separate from `production` so a deploy approval never also approves a destroy |

The environment name is also part of the identity GitHub presents to AWS (OIDC). The AWS role trusts only `main`, `production` and `destroy`, so a job that is not in one of these cannot assume the role.

#### Configuration the pipelines need

| Kind | Name | Used by |
|---|---|---|
| Variable | `DOCKERHUB_USERNAME` | CI (image build), CD (image check) |
| Secret | `DOCKERHUB_TOKEN` | CI |
| Secret | `SONAR_TOKEN` | CI |
| Variable | `AWS_ROLE_ARN`, `TF_STATE_BUCKET`, `AWS_REGION` | CD, destroy (printed by the bootstrap script) |
| Variable | `BEDROCK_MODEL_ID` | CD (the Bedrock model the app calls) |
| Secret | `SAFE_BROWSING_API_KEY` | CD, optional. Without it the Google Safe Browsing check is shown as "not checked" |
| Environments | `production`, `destroy` | Approval gates for apply and destroy. Add yourself as a required reviewer |

#### Running it end to end

1. **Actions -> ci-devsecops -> Run workflow.** Wait for all jobs to pass and the images to be pushed.
2. `cd-deploy` starts by itself. Open it, read the plan, and approve the `production` environment.
3. After about 11 minutes the run summary shows the live URL.
4. When you are done, run **destroy**, type `destroy`, and approve the `destroy` environment.

The one-time setup (state bucket, OIDC role, variables, environments) is in [infra/README.md](infra/README.md).

### Tear down

Use the **destroy** workflow described above. Afterwards, to also remove the one-time bootstrap (state bucket and OIDC role), run `infra/bootstrap/bootstrap-destroy.sh` from the machine that ran the bootstrap. Details are in [infra/README.md](infra/README.md).
