#!/bin/bash
# Prepare large seed files for GitHub (Git LFS).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if ! command -v git-lfs >/dev/null 2>&1; then
  echo ""
  echo "❌ Git LFS לא מותקן."
  echo ""
  echo "1. פתחי Safari → https://git-lfs.com"
  echo "2. לחצי Download for Mac → התקיני"
  echo "3. הריצי שוב: bash setup-git-lfs.sh"
  echo ""
  exit 1
fi

echo "מתקין Git LFS..."
git lfs install

echo "מגדיר מעקב אחרי קבצים גדולים..."
git lfs track "questionnaire/seed/**/*.glb"
git lfs track "questionnaire/seed/**/*.png"
git add .gitattributes

echo "מעביר seed ל-LFS (פעם אחת)..."
git lfs migrate import --include="questionnaire/seed/**" --everything

echo ""
echo "✅ מוכן!"
echo "עכשיו ב-GitHub Desktop → Publish branch"
echo "(ההעלאה תהיה קטנה יותר ולא תיפול)"
