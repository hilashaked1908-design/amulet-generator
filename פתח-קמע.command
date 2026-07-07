#!/bin/bash
# Double-click this file in Finder to start the server and open Safari.
cd "$(dirname "$0")"
PORT=8080 bash start-server.sh start
sleep 2
open -a Safari "http://127.0.0.1:8080/go"
echo ""
echo "✓ Safari should open your site at http://127.0.0.1:8080/go"
echo "  Leave Terminal running, or run: bash start-server.sh start"
sleep 4
