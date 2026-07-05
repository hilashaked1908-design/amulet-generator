#!/bin/bash
# Auto-restart loop for server.py — keeps the server alive after crashes.
set +e
ROOT="$(cd "$(dirname "$0")" && pwd)"
LOGDIR="$ROOT/logs"
LOGFILE="$LOGDIR/server.log"
WATCHDOG_LOG="$LOGDIR/watchdog.log"

mkdir -p "$LOGDIR"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] watchdog started (pid $$)" >>"$WATCHDOG_LOG"

while true; do
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] starting server.py" >>"$LOGFILE"
  python3 -u "$ROOT/server.py" >>"$LOGFILE" 2>&1
  code=$?
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] server.py exited ($code), restart in 2s" >>"$LOGFILE"
  sleep 2
done
