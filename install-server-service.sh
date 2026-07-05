#!/bin/bash
# Install / uninstall macOS LaunchAgent — or start via Terminal on Desktop projects.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LABEL="com.amulet-generator.server"
LOGDIR="$ROOT/logs"

usage() {
  echo "Usage: bash install-server-service.sh [install|uninstall|status|restart]"
}

install_service() {
  mkdir -p "$LOGDIR"
  echo "Note: launchd cannot access Desktop folders on macOS — starting via start-server.sh instead."
  bash "$ROOT/start-server.sh" start
}

uninstall_service() {
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$HOME/Library/LaunchAgents/${LABEL}.plist"
  bash "$ROOT/start-server.sh" stop 2>/dev/null || true
  echo "Service removed."
}

show_status() {
  bash "$ROOT/start-server.sh" status
}

cmd="${1:-install}"
case "$cmd" in
  install) install_service ;;
  uninstall) uninstall_service ;;
  status) show_status ;;
  restart) bash "$ROOT/start-server.sh" restart ;;
  *)
    usage
    exit 1
    ;;
esac
