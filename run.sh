#!/usr/bin/env bash
# Installs dependencies (first run only) and starts the app.
# Open http://localhost:8000 once it's running.
set -e
cd "$(dirname "$0")/backend"
pip install -r requirements.txt --quiet
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
