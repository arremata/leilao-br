# Caixa Ingestion on GitHub Actions

> Status: **implemented.** The workflow lives at
> `.github/workflows/ingest.yml`; it supports daily PR ingestion and manually
> dispatched runs with configurable environment, UFs, limit, and geocoding.

## Why GitHub Actions

The ingestion worker (`backend/ingestion/worker.py`) drives a **headed real
Chrome** past the Caixa site's Radware Bot Manager to download the per-state
CSV. Headless Playwright always hits the CAPTCHA wall; only
`channel="chrome", headless=False` under a virtual display passes transparently.

That requirement rules out Vercel for ingestion:

| Constraint | Vercel serverless | GitHub Actions `ubuntu-latest` |
|---|---|---|
| Headed Chrome (`headless=False`) | No display, no Xvfb | `xvfb-run` preinstalled |
| Persistent Chrome profile | Ephemeral filesystem | Ephemeral, but clean profile passes Radware fine |
| `playwright install chrome` | Can't install system Chrome | Works (`--with-deps`) |
| Wall-clock timeout | 10s Hobby / ≤300s Pro | 6h default, 20min is plenty |
| Reach an external Postgres | Yes | Yes |
| Cost | Per-invocation | Free 2000 min/mo (private repo), ~2 min/run × 30 ≈ 60 min/mo |

The frontend-facing API stays on Vercel; only ingestion moves to Actions.

GitHub Environments isolate credentials: manual runs default to `staging`,
while scheduled runs use `Production`. Each environment must define its own
`INGEST_DATABASE_URL` secret; the workflow maps it to `DATABASE_URL` for the
worker. Using the same secret value in both defeats this safety boundary.

## How it runs

The worker is already shaped for this — `worker.py:main` reads `DATABASE_URL`,
calls `init_db`, then `run_worker(ufs, session_factory, geocoder=...)`. The
runner just needs to install deps, install Chrome, and wrap the invocation in
`xvfb-run -a` so the headed browser has a display:

```yaml
# .github/workflows/ingest.yml
name: Caixa ingestion
on:
  schedule:
    - cron: "17 8 * *"          # daily ~08:17 UTC; off-peak minute to avoid the :00 herd
  workflow_dispatch: {}         # manual "Run workflow" button for testing
permissions:
  contents: read
jobs:
  ingest:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    concurrency:
      group: ingest
      cancel-in-progress: false   # never interrupt a mid-run UF; tomorrow's run can wait
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL }}
      PYTHONUNBUFFERED: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
          cache-dependency-path: backend/requirements.txt
      - run: pip install -r backend/requirements.txt
      - run: python -m playwright install --with-deps chrome
      - name: Run ingestion worker
        working-directory: backend
        run: xvfb-run -a python -m ingestion.worker --ufs PR
      - if: failure()
        run: echo "::error::Caixa ingestion failed — see job logs"
```

Notes on the choices:

- **Install-on-runner, not `Dockerfile.ingest`.** `ubuntu-latest` already has
  Xvfb; skipping the image build saves ~1–2 min and the Dockerfile remains the
  canonical path for ECS / k8s CronJob / any VPS cron. Both paths invoke the
  same `python -m ingestion.worker` entrypoint.
- **`concurrency.cancel-in-progress: false`** — two overlapping runs would
  hammer Caixa and race on the same DB rows. Queue, don't cancel.
- **`--geocode`** is optional. Nominatim rate-limits ~1 req/s; fine for a few
  new rows/day, risky during a 27-UF backfill. Keep it on for the daily drip,
  drop it for one-off bulk loads.
- **Cron drift.** GitHub scheduled workflows can fire ~5–15 min late at peak
  times and are UTC. `08:17 UTC` ≈ 05:17 BRT — off-peak, minimal drift.

## What the runner needs from the environment

The only real prerequisite is an **externally reachable Postgres** that the
Vercel API also reads. The runner connects over the public internet, so:

- Neon / Supabase / Railway / RDS / similar — all fine. Put the connection
  string in the repo secret `DATABASE_URL`.
- **If prod is still sqlite-in-a-file** (the dev default), GitHub Actions is the
  wrong place to start — there's no shared filesystem with Vercel. Move the API
  to a managed Postgres first, then wire up this workflow.

## Caveats

1. **Ephemeral Chrome profile.** Radware currently passes a clean headed
   Chrome with no CAPTCHA, so a fresh runner is fine. If it ever starts tripping
   the wall, a stateless runner cannot carry a persistent profile (unlike the
   `~/.cache/leilao/caixa_chrome_profile` the local `run-ingest.sh` reuses). At
   that point we'd move to a persistent host (ECS/Fargate task with an EBS-like
   volume, or a VPS). Not a problem today.
2. **Automated CAPTCHA-solving is off-limits** — detection evasion. If Radware
   tightens, the answer is a persistent-profile host, not a solver service.
3. **Per-UF isolation is already in the worker.** One UF failing (network, parse,
   transient CAPTCHA) does not abort the others, but the process exits nonzero
   after all UFs finish. The workflow therefore goes red on partial failures and
   writes a short failure notice to `$GITHUB_STEP_SUMMARY`.
4. **Cost ceiling.** Private repos get 2000 min/mo free; ~2 min × 30 ≈ 60 min/mo
   for one daily run. A 27-UF backfill at ~2 min/UF ≈ 54 min in one shot — still
   well within budget. Public repos are unmetered.
5. **No alerting wired here.** GitHub sends failed-run emails to the repo owner
   by default. If you want Slack/Teams, add a `failure()` step posting to a
   webhook secret.

## Cross-references

- `backend/ingestion/worker.py` — `run_worker(ufs, session_factory, …)`; the
  entrypoint this workflow invokes.
- `run-ingest.sh` — local Xvfb wrapper, same shape as the workflow step.
- `Dockerfile.ingest` — container alternative (ECS / k8s CronJob / VPS).
- `docs/superpowers/plans/2026-07-14-caixa-ingestion.md` — the ingestion
  architecture this worker implements.
- Project memory: `project_ingestion_worker.md`, `project_caixa_fetch.md`.
