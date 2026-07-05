#!/bin/bash
# Check project is ready for Render deploy (GitHub push).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
SEED="$ROOT/questionnaire/seed"
ERR=0

echo "=== בדיקת פריסה ל-Render ==="

if [ ! -f "$SEED/collection.json" ]; then
  echo "❌ חסר questionnaire/seed/collection.json"
  echo "   פתחי: http://localhost:8080/questionnaire/export-netlify-seed.html"
  ERR=1
else
  N=$(python3 -c "import json; print(len(json.load(open('$SEED/collection.json'))))" 2>/dev/null || echo 0)
  echo "✓ collection.json — $N קמעות"
fi

if [ ! -d "$SEED/glbs" ] || [ -z "$(ls -A "$SEED/glbs" 2>/dev/null | grep '\.glb$' || true)" ]; then
  echo "❌ חסרים קבצי 3D (questionnaire/seed/glbs/*.glb)"
  echo "   ייצאי שוב מ-export-netlify-seed.html — חייב לכלול 3D"
  ERR=1
else
  G=$(ls "$SEED/glbs"/*.glb 2>/dev/null | wc -l | tr -d ' ')
  echo "✓ glbs/ — $G מודלים תלת־ממדיים"
fi

if [ ! -d "$SEED/snapshots" ] || [ -z "$(ls -A "$SEED/snapshots" 2>/dev/null || true)" ]; then
  echo "❌ חסרים snapshots"
  ERR=1
else
  S=$(ls "$SEED/snapshots" 2>/dev/null | wc -l | tr -d ' ')
  echo "✓ snapshots/ — $S תמונות"
fi

if [ "$ERR" -eq 0 ]; then
  echo ""
  echo "=== מוכן! ==="
  echo "1. GitHub Desktop → Commit → Push origin"
  echo "2. render.com → New Web Service → amulet-generator → Deploy"
  echo "3. האתר: https://amulet-generator.onrender.com/questionnaire/"
else
  echo ""
  echo "תקני את הסימון ❌ לפני Push ל-GitHub."
  exit 1
fi
