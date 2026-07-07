# גיבוי גרסה כחולה + ערפל (2025-07-07)

שומר את מצב הגן **לפני** הסרת הערפל והחזרת רשת הרצפה.

## לשחזור הערפל

```bash
cp questionnaire/backup/blue-fog-20250707/garden-fog.js questionnaire/
cp questionnaire/backup/blue-fog-20250707/garden-atmosphere.js questionnaire/
cp questionnaire/backup/blue-fog-20250707/garden-three.js questionnaire/
cp questionnaire/backup/blue-fog-20250707/index.html questionnaire/
cp questionnaire/backup/blue-fog-20250707/questionnaire.css ../css/
```

ואז hard refresh בדפדפן.

## מה כלול בגרסה הזו

- רקע כחול Fantik (`garden-atmosphere.js`)
- ערפל Luca לבן-אפור בשכבות (`garden-fog.js` + `createLucaFog` ב-`garden-three.js`)
- ללא רשת רצפה (`grid-perspective.js` לא נטען)
