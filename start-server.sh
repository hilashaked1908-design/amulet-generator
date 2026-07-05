#!/bin/bash
# Amulet-generator local server (port 8080).
#
# On macOS, launchd cannot access Desktop folders (TCC) — we start via Terminal
# or a detached python3 process when run from a normal shell.
#
#   bash start-server.sh          — start (idempotent)
#   bash start-server.sh stop     — stop
#   bash start-server.sh restart  — restart
#   bash start-server.sh status   — check
#   bash start-server.sh fg       — foreground in current terminal
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
PORT="${PORT:-8080}"
PIDFILE="$ROOT/.server.pid"
LOGDIR="$ROOT/logs"
LOGFILE="$LOGDIR/server.log"
LAUNCH_LINK="$HOME/amulet-generator"

mkdir -p "$LOGDIR"
ln -sfn "$ROOT" "$LAUNCH_LINK"

server_responding() {
  curl -sf --max-time 3 "http://127.0.0.1:${PORT}/api/server-info" >/dev/null 2>&1
}

port_pids() {
  lsof -ti ":$PORT" 2>/dev/null || true
}

read_pid() {
  if [ -f "$PIDFILE" ]; then
    cat "$PIDFILE" 2>/dev/null || true
  fi
}

pid_alive() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

sync_pidfile_from_port() {
  local port_pid
  port_pid="$(port_pids)"
  if [ -n "$port_pid" ]; then
    echo "$port_pid" >"$PIDFILE"
  fi
}

wait_for_server() {
  local i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 24 28 32 36 40; do
    if server_responding; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

print_open() {
  echo "Open: http://localhost:$PORT/questionnaire/index.html"
}

needs_terminal_start() {
  # Cursor/agent shells kill background children; launchd cannot read Desktop.
  [ "$(uname -s)" = "Darwin" ] && {
    [ -n "${CURSOR_AGENT:-}" ] ||
      [ "${TERM_PROGRAM:-}" = "cursor" ] ||
      [ "${TERM_PROGRAM:-}" = "vscode" ] ||
      ! [ -t 1 ]
  }
}

stop_all() {
  local pid port_pid
  pid="$(read_pid)"
  if pid_alive "$pid"; then
    echo "Stopping server (pid $pid)..."
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      pid_alive "$pid" || break
      sleep 0.3
    done
    if pid_alive "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$PIDFILE"
  pkill -f "$LAUNCH_LINK/server.py" 2>/dev/null || true
  pkill -f "$ROOT/server.py" 2>/dev/null || true

  port_pid="$(port_pids)"
  if [ -n "$port_pid" ]; then
    echo "Clearing port $PORT..."
    echo "$port_pid" | xargs kill 2>/dev/null || true
    sleep 0.5
    port_pid="$(port_pids)"
    if [ -n "$port_pid" ]; then
      echo "$port_pid" | xargs kill -9 2>/dev/null || true
    fi
  fi
}

start_detached() {
  local pid
  echo "Starting detached server..."
  cd "$LAUNCH_LINK"
  nohup python3 -u server.py >>"$LOGFILE" 2>&1 &
  pid=$!
  disown "$pid" 2>/dev/null || true
  echo "$pid" >"$PIDFILE"
}

start_via_terminal() {
  echo "Opening Terminal to run server (macOS Desktop permission)..."
  osascript <<APPLESCRIPT
tell application "Terminal"
  activate
  do script "cd '$LAUNCH_LINK' && echo '▶ Amulet server on http://localhost:$PORT — leave this window open' && exec python3 -u server.py"
end tell
APPLESCRIPT
}

start_daemon() {
  local pid

  if server_responding; then
    sync_pidfile_from_port
    echo "Server already running"
    print_open
    return 0
  fi

  pid="$(read_pid)"
  if pid_alive "$pid" || [ -n "$(port_pids)" ]; then
    echo "Cleaning stale process..."
    stop_all
  fi

  echo "Starting server: $ROOT"
  if needs_terminal_start; then
    start_via_terminal
  else
    start_detached
  fi

  if wait_for_server; then
    sync_pidfile_from_port
    pid="$(read_pid)"
    echo "Server running (pid ${pid:-unknown})"
    print_open
    echo "Logs: $LOGFILE"
    return 0
  fi

  echo "Server failed to start — check $LOGFILE"
  tail -20 "$LOGFILE" 2>/dev/null || true
  return 1
}

run_foreground() {
  if server_responding; then
    echo "Server already running — not stopping it."
    print_open
    return 0
  fi
  stop_all
  echo "Starting server in foreground..."
  print_open
  echo "Press Ctrl+C to stop."
  cd "$LAUNCH_LINK"
  exec python3 -u server.py
}

show_status() {
  local pid
  if server_responding; then
    sync_pidfile_from_port
    pid="$(read_pid)"
    echo "running (pid ${pid:-unknown}) — http://localhost:$PORT/questionnaire/index.html"
    return 0
  fi
  if [ -n "$(port_pids)" ]; then
    echo "port $PORT in use but server not responding"
    return 0
  fi
  rm -f "$PIDFILE"
  echo "stopped"
  return 0
}

cmd="${1:-start}"
case "$cmd" in
  start | "")
    start_daemon
    ;;
  stop)
    stop_all
    echo "Server stopped."
    ;;
  restart)
    stop_all
    start_daemon
    ;;
  status)
    show_status
    ;;
  fg | foreground)
    run_foreground
    ;;
  *)
    echo "Usage: bash start-server.sh [start|stop|restart|status|fg]"
    exit 1
    ;;
esac
