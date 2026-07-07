#!/usr/bin/env bash
# One-shot: bake sage stone garden snapshots from GLB (does not touch port 8080).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${BAKE_PORT:-8095}"
URL="http://localhost:${PORT}/questionnaire/regenerate-sage-snapshots.html?autorun=1"
LOG="/tmp/amulet-sage-snapshot-bake.log"

cd "$ROOT"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT already in use — set BAKE_PORT to another port."
  exit 1
fi

echo "Starting bake server on port $PORT…"
PORT="$PORT" python3 server.py >"$LOG" 2>&1 &
PID=$!
cleanup() {
  kill "$PID" 2>/dev/null || true
}
trap cleanup EXIT

for i in $(seq 1 30); do
  if curl -sf "http://localhost:${PORT}/api/server-info" >/dev/null 2>&1; then
    break
  fi
  sleep 0.4
done

CHROME=""
for c in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
  if [[ -x "$c" ]]; then CHROME="$c"; break; fi
done

if [[ -z "$CHROME" ]]; then
  echo "Chrome not found. Open manually: $URL"
  exit 1
fi

echo "Rendering sage snapshots (may take 1–2 min)…"
"$CHROME" \
  --headless=new \
  --disable-gpu \
  --no-sandbox \
  --window-size=1280,900 \
  --virtual-time-budget=300000 \
  "$URL" >/dev/null 2>&1 || true

# Wait until the page sets the done flag via console or timeout
for i in $(seq 1 120); do
  if grep -q "saved seed snapshot" "$LOG" 2>/dev/null; then
    sleep 2
    break
  fi
  sleep 1
done

echo "Done. Seed PNGs updated under questionnaire/seed/snapshots/"
grep "saved seed snapshot" "$LOG" 2>/dev/null || echo "(check $LOG for details)"
