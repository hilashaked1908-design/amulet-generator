#!/bin/bash
# Copy a lean deploy folder to Desktop (English path, no huge junk).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Desktop/amulet-netlify-upload"

echo "Preparing $DEST ..."
rm -rf "$DEST"
mkdir -p "$DEST"

rsync -a \
  --exclude '.git' \
  --exclude '.cursor' \
  --exclude '.cursor-*' \
  --exclude '.cursor-audit-*' \
  --exclude '.cursor-revert-originals' \
  --exclude 'logs' \
  --exclude 'node_modules' \
  --exclude 'screenshots' \
  --exclude '*.zip' \
  --exclude '*.checkpoint.*' \
  --exclude '*backup*' \
  --exclude 'amulet-generator-for-claude.zip' \
  --exclude '.DS_Store' \
  "$ROOT/" "$DEST/"

if [ -d "$ROOT/questionnaire/seed" ]; then
  echo "✓ seed folder included ($(find "$ROOT/questionnaire/seed" -type f | wc -l | tr -d ' ') files)"
else
  echo "⚠ WARNING: questionnaire/seed/ missing — export amulets first:"
  echo "  http://localhost:8080/questionnaire/export-netlify-seed.html"
fi

SIZE="$(du -sh "$DEST" | cut -f1)"
echo "Done. Upload folder: $DEST ($SIZE)"
echo "Drag THIS folder to https://app.netlify.com/drop"
