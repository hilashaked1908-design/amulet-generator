#!/bin/bash
# Start the amulet-generator local server (port 8080).
cd "$(dirname "$0")"
PORT="${PORT:-8080}"

if lsof -ti ":$PORT" >/dev/null 2>&1; then
  echo "Port $PORT in use — stopping old server..."
  lsof -ti ":$PORT" | xargs kill 2>/dev/null || true
  sleep 1
fi

echo "Starting server in: $(pwd)"
echo "Open: http://localhost:$PORT/prototype-v2-thick.html"
echo "Press Ctrl+C to stop."
exec python3 -u server.py
