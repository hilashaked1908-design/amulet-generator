window.AMULET_QUESTIONS = [
  {
    key: 'q1Wish',
    label: 'שאלה 1',
    tag: '[בקשה]',
    text: 'מה תרצו לבקש?',
    description:
      'כתבו את הדבר שאתם הכי רוצים שיקרה, שיתגשם, שתחוו, מה שמעסיק אתכם כרגע. הבקשה יכולה להיות בכל נושא שתרצו.',
    type: 'textarea',
    placeholderExamples: [
      'הלוואי שאמצא אהבה',
      'לטוס לתאילנד באוגוסט',
      'למצוא עבודה שאני באמת אוהב',
      'שאצליח להרגיש יותר בטוחה בעצמי.',
      'שהמשפחה שלי תהיה בריאה.',
      'שאפסיק לפחד ממה שיקרה בעתיד.',
    ],
  },
  {
    key: 'q2Name',
    label: 'שאלה 2',
    tag: '[שייכות]',
    text: 'איך קוראים לך?',
    description:
      'כתבו את השם שתרצו שהקמע יישא איתו. זה יכול להיות השם שלכם, כינוי, שם אהוב או כל מילה שמרגישה אישית עבורכם.',
    figmaTitleOffset: true,
    type: 'text',
    placeholder: 'מאיה',
    placeholderExamples: [
      'מאיה',
      'הילה',
      'נועם',
      'שירה',
      'דוד',
      'יעל',
    ],
  },
  {
    key: 'q3WhyNow',
    label: 'שאלה 3',
    tag: '[תזמון]',
    text: 'למה דווקא עכשיו?',
    description:
      'כתבו מה בחיים שלכם מסביר למה זה הזמן - מה השתנה, מה הסתיים, או מה גורם לכם להרגיש שעכשיו רגע מתאים.',
    figmaTitleOffset: true,
    type: 'text',
    placeholderExamples: [
      'סוף סוף מרגיש/ה מוכן/ה',
      'משהו הסתיים ואני צריכה להתחיל מחדש',
      'אני לא יכולה יותר לחכות',
      'השנה הזאת הרגישה כמו נקודת מפנה',
      'כי זה כבר מעסיק אותי יותר מדי זמן',
      'כי עכשיו יש לי את הזמן והמרחב לזה',
    ],
  },
  {
    key: 'q4Belief',
    label: 'שאלה 4',
    tag: '[אמונה]',
    text: 'מה הכי גורם לך להאמין שזה אפשרי?',
    description:
      'בחרו את מה שהכי משפיע עליכם כשאתם חושבים שהבקשה יכולה להתגשם.',
    figmaTitleOffset: true,
    type: 'choice',
    options: [
      { value: 'concrete_actions', label: 'המעשים שאני עושה' },
      { value: 'signs', label: 'סימנים וצירופי מקרים' },
      { value: 'gut', label: 'תחושת בטן' },
      { value: 'support', label: 'תמיכה מאנשים סביבי' },
      { value: 'doubt', label: 'אני עדיין לא מאמין שזה אפשרי', fitWidth: true },
    ],
  },
  {
    key: 'q5Feeling',
    label: 'שאלה 5',
    tag: '[תחושה]',
    text: 'איזו תחושה הכי נוכחת סביב הבקשה?',
    description:
      'בחרו את התחושה שהכי נוכחת לכם כשאתם חושבים על הבקשה.',
    figmaTitleOffset: true,
    type: 'choice',
    options: [
      { value: 'hope', label: 'תקווה' },
      { value: 'fear', label: 'פחד' },
      { value: 'longing', label: 'געגוע' },
      { value: 'excitement', label: 'התרגשות' },
      { value: 'impatience', label: 'חוסר סבלנות' },
      { value: 'confusion', label: 'בלבול' },
    ],
  },
  {
    key: 'q6Difficulty',
    label: 'שאלה 6',
    tag: '[קושי]',
    text: 'מה הכי חסר לך כרגע?',
    description:
      'בחרו את מה שהכי חסר לכם כרגע ביחס לבקשה.',
    figmaTitleOffset: true,
    type: 'choice',
    options: [
      { value: 'uncertainty', label: 'ביטחון' },
      { value: 'waiting', label: 'הצלחה' },
      { value: 'letting_go', label: 'תשובה' },
      { value: 'failure', label: 'שליטה' },
      { value: 'no_control', label: 'שקט' },
      { value: 'decision', label: 'זמן' },
    ],
  },
  {
    key: 'q7Change',
    label: 'שאלה 7',
    tag: '[שינוי]',
    text: 'אם הבקשה תתגשם, מה באמת ישתנה?',
    description:
      'כתבו בקצרה מה באמת ישתנה בחיים שלכם אם הבקשה תתגשם.',
    figmaTitleOffset: true,
    type: 'text',
    placeholderExamples: [
      'אהיה פחות לבד בערבים',
      'אוכל סוף סוף לנשום ולנוח',
      'היחסים שלי ירגישו יציבים יותר',
      'אתעורר בבוקר בלי חרדה',
      'יהיה לי כיוון ברור בחיים',
      'ארגיש שאני באמת במקום שלי',
    ],
  },
  {
    key: 'q8Motivation',
    label: 'שאלה 8',
    tag: '[מוטיבציה]',
    text: 'מה נותן לך ביטחון?',
    description:
      'כתבו מה עוזר לך להאמין שהבקשה שלך אפשרית.',
    figmaTitleOffset: true,
    type: 'text',
    placeholderExamples: [
      'כשאני רואה התקדמות קטנה',
      'אנשים שכבר עברו משהו דומה',
      'התמיכה של חברים קרובים',
      'הרגשה פנימית שזה אפשרי',
      'כשאני נזכרת בכמה כבר התגברתי',
      'תפילות קטנות בשקט',
    ],
  },
];

/** Long dashes (en/em) → short hyphen for all site copy. */
window.pagmarNormalizeDashes = function (text) {
  return String(text || '').replace(/[\u2013\u2014]/g, '-');
};
