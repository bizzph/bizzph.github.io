#!/usr/bin/env sh
set -eu
PORT="${PORT:-4173}"
python3 serve.py --port "$PORT"
