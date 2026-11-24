# DriftWatch — ML Reliability Platform

Enterprise data-drift detection and ML model monitoring. Upload a reference window and a
production window, and DriftWatch computes **real statistics** — Population Stability Index,
two-sample Kolmogorov–Smirnov, Pearson chi-square and Jensen–Shannon divergence — then evaluates
model performance, separates the four failure modes, raises severity-graded alerts, produces a
grounded AI root-cause analysis and exports PDF/CSV reports.

Nothing is simulated. There is no `Math.random()` anywhere in the product code, no mock data and no
hardcoded metrics. Every number shown in the UI was computed from rows stored in Postgres.

---

## Contents

- [Feature overview](#feature-overview)
- [Statistical methods](#statistical-methods)
- [Drift taxonomy](#drift-taxonomy)
- [Architecture](#architecture)
- [Database schema](#database-schema)
- [REST API](#rest-api)
- [Running locally](#running-locally)
- [Docker deployment](#docker-deployment)
- [Serverless deployment](#serverless-deployment)
- [Environment variables](#environment-variables)
- [Testing](#testing)
- [Sample datasets](#sample-datasets)
- [Security](#security)

---

## Feature overview

| Module | What it does |
| --- | --- |
| **Authentication** | Email + password and Google sign-in via Supabase Auth. JWTs verified server-side on every API route. Protected routes, per-user data isolation, audit logging. |
| **Projects** | Full CRUD. Cascade delete of all child models, datasets, runs, drift results and alerts. |
| **Models** | Register classification or regression models with target / prediction / probability column mapping, framework, owner, metadata and multiple versions (one marked active). |
| **Datasets** | CSV, TSV and Excel upload parsed in the browser, then profiled server-side: column type inference, missing-value rates, duplicate detection, numeric quantiles, categorical top-values, and a validation rule set. Preview, schema view and upload history. |
| **Drift engine** | Per-feature PSI, KS, chi-square and JS with p-values, reference vs production statistics, new/missing category detection, distribution and PSI-contribution charts. |
| **Performance** | Accuracy, precision, recall, F1 (macro + weighted), ROC-AUC and confusion matrix for classification; MAE, MSE, RMSE, R² and MAPE for regression. Reference vs production comparison with degradation detection. |
| **AI analysis** | "Generate AI Analysis" produces drift explanation, most affected features, root-cause hypotheses, business impact, reliability risks, investigation steps and prioritised corrective actions — stored in Postgres. |
| **Dashboard** | Live aggregates: projects, models, healthy vs drifted, critical alerts, recent runs, drift trends, model health and most-affected features. |
| **Monitoring history** | Search, status filter, project filter, date range, pagination, run-to-run comparison and per-run deletion. |
| **Alerts** | Four severities, six alert types, search/filter/detail/resolve/bulk-resolve, resolution notes, in-app badge and notifications. |
| **Reports** | Downloadable PDF and CSV containing the dataset comparison, threshold config, full drift table, model metrics, concept-drift verdict, alerts and the AI analysis. Export history persisted. |
| **Settings** | Per-user thresholds (snapshotted into every run so history stays reproducible), theme, notifications, LLM provider status, demo-data management and the audit log. |

---

## Statistical methods

All implementations live in [`api/_lib/stats.js`](api/_lib/stats.js) and
[`api/_lib/metrics.js`](api/_lib/metrics.js), and are verified against analytically known values in
[`tests/stats.test.js`](tests/stats.test.js).

**Numerical features**

- **Population Stability Index** — `PSI = Σ (cur% − ref%) · ln(cur% / ref%)` over equal-frequency
  (quantile) bins derived from the reference sample. Empty bins are floored at `1e-4` so the
  logarithm stays finite. Duplicate quantile edges collapse automatically, which handles
  low-cardinality numerics.
- **Two-sample Kolmogorov–Smirnov** — exact `D = max|F₁(x) − F₂(x)|` computed by a merged walk over
  both sorted samples, with the asymptotic p-value
  `Q_KS(λ) = 2 Σ (−1)^{j−1} e^{−2j²λ²}`, `λ = (√(n₁n₂/(n₁+n₂)) + 0.12 + 0.11/√(…)) · D`.
- **Jensen–Shannon divergence** — base-2, therefore bounded in `[0, 1]`, over the same bins.

**Categorical features**

- **Pearson chi-square** goodness-of-fit against reference proportions with additive (Laplace,
  α = 0.5) smoothing so unseen categories yield a finite expectation. p-value from the regularized
  incomplete gamma function (series + continued-fraction expansion with a Lanczos `lgamma`).
- **PSI and Jensen–Shannon** over category proportions.
- **New / missing category detection**, reported explicitly per feature.

**Status banding** (configurable in Settings; defaults shown)

| PSI | Status |
| --- | --- |
| `< 0.10` | Low |
| `0.10 – 0.20` | Moderate |
| `> 0.20` | Significant |

Effect size is authoritative. A hypothesis test can lift a feature *into* the moderate band when the
rejection is strong (`p < α/5`) **and** the effect size is non-trivial (`PSI ≥ 0.2 × low threshold`),
but statistical significance alone never produces a "significant" verdict — with large samples any
microscopic shift becomes "significant", which is exactly the false-alarm mode this guards against.
Jensen–Shannon divergence, being a bounded effect size, may raise a feature to significant.

---

## Drift taxonomy

The platform measures and reports the four failure modes **separately** — they are not conflated:

| Mode | Definition | How it is measured |
| --- | --- | --- |
| **Data drift** | Input distributions `P(X)` changed | Per-feature PSI / KS / chi-square / JS |
| **Prediction drift** | Output distribution `P(ŷ)` changed | The same tests applied to the prediction column |
| **Concept drift** | The relationship `P(y\|X)` changed | Performance loss on labelled production data **while** input distributions stayed stable |
| **Performance degradation** | Measured quality dropped | Primary metric (F1 for classification, R² for regression) vs reference, against the configured relative threshold |

When degradation occurs *alongside* widespread covariate drift, the engine labels it
`covariate_shift_driven_degradation` rather than concept drift. When ground truth is unavailable for
the production window, concept drift is reported as **not evaluated** — never estimated.

---

## Architecture

```
┌─────────────────────────── Browser ────────────────────────────┐
│  React 19 · TypeScript · Vite · Tailwind v4 · Recharts         │
│  CSV/XLSX parsed client-side · PDF/CSV generated client-side   │
└──────────────────────────────┬─────────────────────────────────┘
                               │  fetch('/api/…') + Bearer JWT
┌──────────────────────────────▼─────────────────────────────────┐
│  REST API  (api/*.js — Vercel functions, or server.js in Docker)│
│  auth.js  → JWT verification, rate limiting, audit logging      │
│  engine.js→ run orchestration, alerting, taxonomy               │
│  stats.js · metrics.js · profile.js · ai.js · demo-data.js      │
└──────────────────────────────┬─────────────────────────────────┘
                               │  Supabase JS client (service role)
┌──────────────────────────────▼─────────────────────────────────┐
│  PostgreSQL — 12 tables, row-level security, per-user isolation │
└─────────────────────────────────────────────────────────────────┘
```

> **Note on the stack.** The original specification asked for a Python/FastAPI backend. The hosted
> target is a serverless Node runtime with no Python available, so the backend is implemented as
> typed Node handlers that expose the identical REST surface, and **every statistical algorithm was
> ported to exact JavaScript numerics and unit-tested against known values** (chi-square table
> values, closed-form PSI, scikit-learn-equivalent metric fixtures). `server.js` mounts the exact
> same handlers for the Docker deployment, so serverless and self-hosted behave identically.

---

## Database schema

Twelve tables, defined in [`db/migrations/0001_init.sql`](db/migrations/0001_init.sql):

| Table | Purpose |
| --- | --- |
| `projects` | Workspaces grouping models and data |
| `models` | Registered models, task type, column mapping |
| `model_versions` | Version history, active flag |
| `datasets` | Uploaded rows (`jsonb`) + profile, quality and validation |
| `monitoring_runs` | One row per execution: summary, performance, concept drift, schema diff, config snapshot |
| `drift_results` | One row per feature per run: all statistics and distributions |
| `performance_results` | Reference and production metrics + confusion matrix |
| `ai_explanations` | Generated analyses with the exact context they were derived from |
| `alerts` | Severity-graded findings with resolution state |
| `reports` | PDF/CSV export history |
| `settings` | Per-user thresholds and preferences |
| `audit_logs` | Every mutation performed in the workspace |

Users are managed by Supabase Auth (`auth.users`); application tables reference `user_id`.
Row-level security is applied by [`0002_row_level_security.sql`](db/migrations/0002_row_level_security.sql).

---

## REST API

All routes require `Authorization: Bearer <jwt>`, return JSON, use proper status codes
(`200/201/400/401/404/405/413/429/500`) and are rate limited per user.

| Route | Methods | Notes |
| --- | --- | --- |
| `/api/projects` | GET, POST, PUT, DELETE | List includes model/dataset/run counts and last status |
| `/api/models` | GET, POST, PUT, DELETE | `?resource=versions` for version CRUD |
| `/api/datasets` | GET, POST, DELETE | `?id=` returns the profile plus a preview slice |
| `/api/monitoring` | GET, POST, DELETE | `?id=` detail · `?compare=1&a=&b=` comparison · `?resource=trend` series · paginated history with filters |
| `/api/ai-analysis` | GET, POST, DELETE | Generates and stores a grounded analysis for a run |
| `/api/alerts` | GET, PUT, DELETE | Filters: status, severity, type, project, model, run, date range, full-text |
| `/api/reports` | GET, POST, DELETE | `?build=1&run_id=` assembles the full report payload |
| `/api/dashboard` | GET | Aggregated workspace state |
| `/api/settings` | GET, PUT | `?resource=audit` for the audit log |
| `/api/seed-demo` | POST, DELETE | Build / remove the demonstration workspace |
| `/api/health` | GET | Liveness probe (Docker runtime) |

---

## Running locally

```bash
git clone <repo> && cd ml-reliability-platform
cp .env.example .env          # fill in Supabase URL + keys
npm install
npm test                      # 24 algorithm assertions
npm run dev                   # http://localhost:5173
```

`npm run dev` serves the frontend. To exercise the API locally against the built frontend:

```bash
npm run build
node server.js                # http://localhost:8080 (frontend + /api/*)
```

**Demo account:** `demo@driftwatch.io` / `driftwatch123`.
After signing in, click **Load demo workspace** on the dashboard to generate a project, a registered
model, four datasets and three real monitoring runs.

---

## Docker deployment

```bash
cp .env.example .env          # set Supabase keys and POSTGRES_PASSWORD
docker compose up --build -d
docker compose logs -f app
# → http://localhost:8080
```

`docker-compose.yml` starts:

- **`db`** — PostgreSQL 16, with `db/migrations/*.sql` applied automatically on first boot and a
  `pg_isready` healthcheck.
- **`app`** — multi-stage Node 22 Alpine image (build → runtime), running as a non-root user with an
  HTTP healthcheck on `/api/health`.

Useful commands:

```bash
docker compose ps
docker compose exec db psql -U driftwatch -d driftwatch -c '\dt'
docker compose down            # stop
docker compose down -v         # stop and delete the database volume
```

---

## Serverless deployment

Each file in `api/` becomes a serverless function; `dist/` is served as static assets.

```bash
npm run build
npx vercel deploy --prod
```

Set the environment variables below in the hosting dashboard. `api/_lib/**` is ignored by the
function builder (leading underscore) and is bundled into the handlers that import it.

---

## Environment variables

| Variable | Scope | Required | Purpose |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | server | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | server | ✅ | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server | ✅ | Service role — **never** exposed to the browser |
| `VITE_SUPABASE_URL` | client | ✅ | Supabase URL for the auth client |
| `VITE_SUPABASE_ANON_KEY` | client | ✅ | Public anon key (safe to ship) |
| `VITE_GOOGLE_CLIENT_ID` | client | — | Enables Google sign-in |
| `VITE_GOOGLE_AUTH_PROXY` | client | — | OAuth callback proxy |
| `LLM_API_URL` | server | — | OpenAI-compatible `/chat/completions` endpoint |
| `LLM_API_KEY` | server | — | Bearer key for that endpoint |
| `LLM_MODEL` | server | — | Model name (default `gpt-4o-mini`) |
| `POSTGRES_*` | compose | — | Self-hosted database credentials |

### AI provider behaviour

The AI module is provider-agnostic. If `LLM_API_URL` and `LLM_API_KEY` are set, the stored run
statistics are sent to that endpoint with a strict system prompt (`only reason from the numbers
provided; never invent features, values or causes; label causal statements as hypotheses`) and a
JSON-mode response contract.

If no provider is configured, the request times out, or the response is malformed, the platform
falls back to a **built-in deterministic statistical reasoner** that derives every sentence from the
stored numbers — mean/σ shifts measured in reference standard deviations, variance ratios,
missing-rate deltas, newly observed categories, and the measured metric change. Causal statements
are explicitly prefixed with `Hypothesis —`. **The feature therefore works with zero external
dependencies and never fabricates a cause.**

---

## Testing

```bash
npm test
```

24 assertions in [`tests/stats.test.js`](tests/stats.test.js), all against values that can be checked
by hand:

- `lgamma` vs known factorials; chi-square survival function vs published critical values
  (3.841/df1, 5.991/df2, 11.07/df5 → p = 0.05).
- PSI = 0 for identical distributions and equal to the closed form for a two-bin shift.
- KS: `D = 1` and rejection for disjoint samples; `D = 0`, `p = 1` for identical samples; no
  rejection for two samples from the same distribution.
- Jensen–Shannon bounds: `0` for identical, `1` for disjoint (base-2).
- Chi-square detects a categorical shift (`p < 1e-6`) and ignores a stable one (`p > 0.05`).
- Classification metrics vs a hand-computed 6-sample confusion matrix; ROC-AUC = 1 / 0 / 0.75 / 0.5
  (ties) and `null` for a single-class input; regression metrics vs the scikit-learn documentation
  fixture (`MAE 0.5`, `MSE 0.375`, `R² 0.948608…`).
- End-to-end runs: a no-drift scenario stays `healthy` with 0 drifted features; a shifted scenario
  reaches `critical`, raises drift *and* performance alerts; concept drift is correctly separated
  from covariate shift; concept drift reports *not evaluated* without ground truth.
- The three demo scenarios reproduce their intended drift levels in strict order.

A live database round-trip check (`scripts/verify-db.mjs`) inserts a full run — project, model,
versions, datasets, 11 drift results, performance records, 13 alerts, an AI explanation, a report,
settings and an audit entry — reads the numerics back, and cleans up.

---

## Sample datasets

`public/sample-data/` contains four deterministic CSVs (1,000 rows × 14 columns, consumer-credit
default risk), also downloadable from the Datasets page:

| File | Expected result |
| --- | --- |
| `reference_training_window.csv` | Baseline — upload with role **Reference** |
| `production_no_drift.csv` | `healthy` · 0/11 features drifted · performance within tolerance |
| `production_moderate_drift.csv` | `drifted` · ~5/11 features in the moderate band · no performance loss |
| `production_significant_drift.csv` | `critical` · 10/11 drifted · new category `affiliate_x`, 18% income nulls, F1 0.79 → 0.61 |

Demo data created in-app is tagged `is_demo = true` on every row, is visually marked throughout the
UI, and can be removed in one click from **Settings → Demonstration data** without touching data you
created yourself.

---

## Security

- **Password hashing & JWT** — delegated to Supabase Auth (bcrypt); tokens verified server-side on
  every request via `supabase.auth.getUser(token)`.
- **Authorisation** — every query is filtered by `user_id`; ownership is re-checked before updates
  and deletes. Cross-user access returns `404`, never another user's data.
- **Row-level security** — `auth.uid()::text = user_id` policies on all 12 tables, so even a leaked
  anon key exposes nothing. Verified: an anonymous client sees 0 rows in every table.
- **SQL injection** — impossible by construction; all access goes through the parameterised
  PostgREST query builder. No string-concatenated SQL anywhere.
- **Input validation** — required fields, length caps, numeric range checks on every threshold,
  enum validation for `task_type`, `kind`, `severity`, `format` and `status`.
- **File validation** — extension allow-list (`.csv .tsv .txt .xlsx .xls`), 10 MB client limit,
  8 MB server payload limit (`413`), 20,000-row cap, header presence check.
- **Rate limiting** — per-user token buckets: 90 req/min general, 20 runs/min, 12 AI analyses/min,
  3 demo rebuilds/min (`429`).
- **CORS** — explicit method and header allow-lists with pre-flight handling on every route.
- **Secrets** — read exclusively from environment variables; the service-role key and any LLM key
  never reach the client bundle. `.env` is git-ignored and Docker-ignored.
- **Audit logging** — every create, update, delete, run execution, AI generation and export is
  recorded with actor, entity and payload, viewable in Settings.
- **Error handling** — all handlers wrap in try/catch, log server-side and return a safe message;
  the UI renders explicit loading, empty and error states with retry.

---

## Licence

Provided as-is for evaluation and internal use.
