#!/usr/bin/env bash
# Run the FastAPI backend (port 8000)
set -e
cd "$(dirname "$0")/backend"
../.venv/bin/python api.py
