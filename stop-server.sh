#!/bin/bash
# Stop the amulet-generator daemon server.
exec "$(dirname "$0")/start-server.sh" stop
