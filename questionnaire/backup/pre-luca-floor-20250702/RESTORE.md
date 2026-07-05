# גיבוי לפני Luca floor fog (2025-07-02)

קבצים אלו שומרים את הגרסה **לפני** יישום מדויק של רצפת הערפל לפי aboutluca.com.

## לשחזור

```bash
cp questionnaire/backup/pre-luca-floor-20250702/garden-fog.js questionnaire/
cp questionnaire/backup/pre-luca-floor-20250702/garden-atmosphere.js questionnaire/
cp questionnaire/backup/pre-luca-floor-20250702/garden-three.js questionnaire/
cp questionnaire/backup/pre-luca-floor-20250702/index.html questionnaire/
```

ואז hard refresh בדפדפן.

## מה השתנה בגרסה החדשה

- מישור ערפל **אופקי** (רצפה) עם shader Luca מדויק
- `topFade` + מסכות אנכיות — בריכת ערפל בתחתית
- opacity Luca (0.015) × scale לנראות בסצנה שלנו
- raycast עכבר → UV (swirl, לא displacement)
- grain ברקע בלבד
