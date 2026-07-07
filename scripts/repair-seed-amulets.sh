#!/usr/bin/env bash
# Repair mismatched seed GLBs from collection.json answers (port 8095, does not touch 8080).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${REPAIR_PORT:-8095}"
URL="http://localhost:${PORT}/questionnaire/repair-seed-amulets.html?autorun=bad"
LOG="/tmp/amulet-seed-repair.log"

cd "$ROOT"

if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT in use — set REPAIR_PORT or stop the other server."
  exit 1
fi

echo "Starting repair server on port $PORT…"
PORT="$PORT" python3 server.py >"$LOG" 2>&1 &
PID=$!
cleanup() { kill "$PID" 2>/dev/null || true; }
trap cleanup EXIT

for i in $(seq 1 40); do
  curl -sf "http://localhost:${PORT}/api/server-info" >/dev/null 2>&1 && break
  sleep 0.5
done

CHROME=""
for c in \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/Applications/Chromium.app/Contents/MacOS/Chromium" \
  "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary"; do
  if [[ -x "$c" ]]; then CHROME="$c"; break; fi
done

if [[ -z "$CHROME" ]]; then
  echo "Chrome not found."
  echo "Open manually: $URL"
  echo "Or restart main server and open: http://localhost:8080/questionnaire/repair-seed-amulets.html"
  exit 1
fi

echo "Repairing bad seed amulets (several minutes)…"
"$CHROME" --headless=new --disable-gpu --no-sandbox --window-size=1400,1000 \
  --virtual-time-budget=900000 "$URL" >/dev/null 2>&1 || true

for i in $(seq 1 180); do
  if grep -q "saved seed GLB" "$LOG" 2>/dev/null; then
    sleep 3
    break
  fi
  sleep 2
done

echo "Repair log:"
grep -E "saved seed (GLB|snapshot)" "$LOG" 2>/dev/null || tail -20 "$LOG"
