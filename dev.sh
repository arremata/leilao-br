#!/usr/bin/env bash
# Run both backend + frontend together
set -e
ROOT="$(dirname "$0")"
cd "$ROOT"

# Start backend in background
(cd backend && ../.venv/bin/python api.py) &
BACK_PID=$!

# Start frontend
cd frontend
npm run dev &
FRONT_PID=$!

# Wait for either to exit
wait -n $BACK_PID $FRONT_PID 2>/dev/null
kill $BACK_PID $FRONT_PID 2>/dev/null
