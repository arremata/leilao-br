#!/usr/bin/env bash
# Run the Vite frontend dev server (port 5173, proxies /api → localhost:8000)
set -e
cd "$(dirname "$0")/frontend"
npm run dev
