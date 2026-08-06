#!/usr/bin/env bash
# Scheduled ingestion worker: fetch Caixa CSVs and upsert into the catalog DB.
#
# Fetching drives a real (headed) Chrome past the bot manager, so on a headless
# host we wrap it in a virtual display via xvfb-run. Pass worker args through,
# e.g.  ./run-ingest.sh --ufs PR,SP --geocode
#
# Requires: xvfb (apt-get install xvfb) and Google Chrome installed for
# Playwright (playwright install chrome). DATABASE_URL must point at the same
# database the API reads.
set -euo pipefail
cd "$(dirname "$0")/backend"

if command -v xvfb-run >/dev/null 2>&1; then
  exec xvfb-run -a ../.venv/bin/python -m ingestion.worker "$@"
else
  echo "xvfb-run not found; running without a virtual display (headed Chrome needs a display)." >&2
  exec ../.venv/bin/python -m ingestion.worker "$@"
fi
