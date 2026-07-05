/**
 * Shared render path — vector preview (Q1–Q3), PBR only when all answers are in.
 */
import {
  renderThreePbrAmuletInteractive,
  renderVectorPreviewInteractive,
} from '../three-pbr-amulet.js';
import {
  initAmuletCompose,
  composeFromAnswers,
  buildQuestionnairePayload,
  L3_MASS_SCALE,
} from './amulet-compose.js';

const ALL_KEYS = [
  'q1Wish',
  'q2Name',
  'q3WhyNow',
  'q4Belief',
  'q5Feeling',
  'q6Difficulty',
  'q7Change',
];

function hasAnswer(answers, key) {
  const v = answers[key];
  return v !== undefined && v !== null && String(v).trim() !== '';
}

function allAnswered(answers) {
  return ALL_KEYS.every(function (key) {
    return hasAnswer(answers, key);
  });
}

function pastVectorPhase(answers) {
  return (
    hasAnswer(answers, 'q4Belief') ||
    hasAnswer(answers, 'q5Feeling') ||
    hasAnswer(answers, 'q6Difficulty') ||
    hasAnswer(answers, 'q7Change')
  );
}

/** @returns {{ type: 'none'|'vector'|'loading-textures'|'pbr', stage?: number }} */
export function getCreateRenderPlan(answers, partial) {
  if (!hasAnswer(answers, 'q1Wish')) return { type: 'none' };

  if (!partial) {
    return allAnswered(answers) ? { type: 'pbr' } : { type: 'none' };
  }

  if (!hasAnswer(answers, 'q2Name')) return { type: 'vector', stage: 1 };
  if (!hasAnswer(answers, 'q3WhyNow')) return { type: 'vector', stage: 2 };
  if (!pastVectorPhase(answers)) return { type: 'vector', stage: 3 };
  return { type: 'loading-textures', stage: 3 };
}

/**
 * @param {Record<string, string>} answers
 * @param {HTMLElement} container
 * @param {{ partial?: boolean, onProgress?: Function, signal?: AbortSignal }} [options]
 */
export async function renderQuestionnaireAmulet(answers, container, options = {}) {
  const { partial = false, onProgress, signal, forceVectorStage, autoRotate = false } = options;
  if (!container) return null;
  if (signal?.aborted) return null;

  const plan = getCreateRenderPlan(answers, partial);
  if (plan.type === 'none') return null;
  if (plan.type === 'loading-textures' && typeof forceVectorStage !== 'number') {
    return null;
  }

  const vectorStage =
    typeof forceVectorStage === 'number' ? forceVectorStage : plan.stage;
  const vectorOnly =
    plan.type === 'vector' || typeof forceVectorStage === 'number';

  await initAmuletCompose();
  if (signal?.aborted) return null;

  const composeOpts = { partial: vectorOnly };
  if (vectorOnly) {
    composeOpts.vectorStage = vectorStage;
  }

  const composed = await composeFromAnswers(answers, composeOpts);
  if (!composed) return null;
  if (signal?.aborted) return null;

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
    q4Letters,
    { partial: vectorOnly && partial }
  );

  container.hidden = false;

  const style3Scaled = { ...style3, l3MassScale: L3_MASS_SCALE };
  const ageNum = questionnaire.ageNum ?? 25;

  if (vectorOnly) {
    return renderVectorPreviewInteractive({
      svg,
      style2,
      style3: style3Scaled,
      container,
      vectorStage,
      ageNum,
      onProgress,
      autoRotate,
    });
  }

  return renderThreePbrAmuletInteractive({
    svg,
    style2,
    style3: style3Scaled,
    container,
    questionnaire,
    domainHex: questionnaire.ceramicHex,
    ageNum,
    l3MaterialMode: 'stone',
    onProgress,
  });
}
