#!/usr/bin/env sh
set -eu
PORT="${PORT:-4173}"
echo "PicklePulse is available at http://localhost:${PORT}"
python3 -m http.server "$PORT"
