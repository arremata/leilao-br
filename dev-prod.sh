#!/usr/bin/env bash
# Run the local UI and full backend against the production database.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$ROOT/.env.production.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE"
  echo "Create it with: DATABASE_URL=postgresql+psycopg://USER:..."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required in $ENV_FILE"
  exit 1
fi

PYTHON_BIN="${ARREMATE_PYTHON:-$ROOT/.venv/bin/python}"
if [[ ! -x "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3)"
fi
if ! "$PYTHON_BIN" -c 'import fastapi, sqlalchemy, uvicorn, psycopg' 2>/dev/null; then
  echo "Python dependencies are missing. Run: make install"
  exit 1
fi

(cd "$ROOT/backend" && "$PYTHON_BIN" api.py) &
BACK_PID=$!

cleanup() {
  kill "$BACK_PID" 2>/dev/null || true
  if [[ -n "${FRONT_PID:-}" ]]; then
    kill "$FRONT_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cd "$ROOT/frontend"
npm run dev &
FRONT_PID=$!
# macOS still ships Bash 3, which does not support `wait -n`.
wait "$FRONT_PID"
