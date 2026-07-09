/**
 * Full amulet render - questionnaire result page only (not prototype).
 */
import { renderThreePbrAmulet } from '../three-pbr-amulet.js';
import {
  initAmuletCompose,
  composeFromAnswers,
  buildQuestionnairePayload,
} from './amulet-compose.js';

const STORAGE_KEY = 'amuletQuestionnaire';
const L3_MASS_SCALE = 0.37;

function loadAnswers() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function allAnswered(answers, count) {
  const keys = [
    'q1Wish',
    'q2Name',
    'q3WhyNow',
    'q4Belief',
    'q5Feeling',
    'q6Difficulty',
    'q7Change',
  ];
  return keys.slice(0, count).every(function (key) {
    const v = answers[key];
    return v !== undefined && v !== null && String(v).trim() !== '';
  });
}

function setStatus(text, visible) {
  const el = document.getElementById('resultStatus');
  if (!el) return;
  el.textContent = text;
  el.hidden = visible === false;
}

async function main() {
  const answers = loadAnswers();
  const questionCount = window.AMULET_QUESTIONS?.length || 7;

  if (!allAnswered(answers, questionCount)) {
    window.location.replace('./');
    return;
  }

  const container = document.getElementById('amuletContainer');
  if (!container) return;

  try {
    setStatus('מכין את הקמע…', true);
    await initAmuletCompose();

    const composed = await composeFromAnswers(answers);
    if (!composed) throw new Error('לא ניתן לבנות קמע מהתשובות');

    const { result, shapeDerived } = composed;
    const {
      svg,
      style2,
      style3,
      metalEmbossLetters,
      q3StoneEngraveLetters,
      q7Letters,
      q4Letters,
    } = result;

    const questionnaire = buildQuestionnairePayload(
      answers,
      shapeDerived,
      metalEmbossLetters,
      q3StoneEngraveLetters,
      q7Letters,
      q4Letters
    );

    await renderThreePbrAmulet({
      svg,
      style2,
      style3: { ...style3, l3MassScale: L3_MASS_SCALE },
      container,
      questionnaire,
      domainHex: questionnaire.ceramicHex,
      ageNum: questionnaire.ageNum ?? 25,
      l3MaterialMode: 'stone',
      onProgress: function (_frac, label) {
        if (label) setStatus(label, true);
      },
    });

    setStatus('', false);
  } catch (err) {
    console.error('[questionnaire] result render failed', err);
    setStatus('לא הצלחנו להציג את הקמע. נסי לרענן.', true);
  }
}

main();
