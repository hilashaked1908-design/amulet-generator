/**
 * Incremental amulet build — short frame loader only when vectors actually re-render,
 * full-page "טוען קמע" loader only after question 8 (amulet-show.js).
 */
import {
  renderQuestionnaireAmulet,
  getCreateRenderPlan,
} from './amulet-render.js';
import { initAmuletCompose } from './amulet-compose.js';
import {
  showAmuletLoader,
  hideAmuletFrameLoader,
  resetAmuletLoaderCache,
  preloadLoaderGallerySpin,
} from './amulet-loader.js';

/** Minimum loader visibility when a vector re-render runs (was 3000ms). */
const FRAME_LOADER_MIN_MS = 650;

let buildToken = 0;
let buildAbort = null;
let lastVectorStage = 0;
let lastVectorAnswerKey = '';
let precomposeToken = 0;

function amuletFrameSelector() {
  if (document.querySelector('.pagmar__request-amulet-build')) {
    return '.pagmar__request-amulet-build';
  }
  if (
    document.body.classList.contains('pagmar-index') &&
    document.body.classList.contains('is-create-mode')
  ) {
    return '.pagmar__index-create-amulet-frame';
  }
  return '.pagmar__create-amulet-frame';
}

function setZoneBuilding(isBuilding) {
  const zone = document.querySelector(amuletFrameSelector());
  if (zone) zone.classList.toggle('is-building', Boolean(isBuilding));
}

function setTextureLoading(active) {
  const zone = document.querySelector(amuletFrameSelector());
  if (zone) zone.classList.toggle('is-textures-loading', Boolean(active));
}

function containerHasPreview(container) {
  return Boolean(container && container.querySelector('canvas'));
}

function syncAmuletPosterState(container) {
  const artboard = document.getElementById('requestArtboard');
  if (!artboard) return;
  artboard.classList.toggle('is-amulet-live', containerHasPreview(container));
}

function waitFrameLoaderMin(startedAt) {
  const remaining = FRAME_LOADER_MIN_MS - (performance.now() - startedAt);
  if (remaining <= 0) return Promise.resolve();
  return new Promise(function (resolve) {
    window.setTimeout(resolve, remaining);
  });
}

const ALL_QUESTION_KEYS = [
  'q1Wish',
  'q2Name',
  'q3WhyNow',
  'q4Belief',
  'q5Feeling',
  'q6Difficulty',
  'q7Change',
  'q8Motivation',
];

function allQuestionsAnswered(answers) {
  return ALL_QUESTION_KEYS.every(function (key) {
    const v = answers[key];
    return v !== undefined && v !== null && String(v).trim() !== '';
  });
}

function vectorAnswerKey(answers) {
  return [answers.q1Wish, answers.q2Name, answers.q3WhyNow].join('\0');
}

function canSkipVectorRender(answers, plan) {
  return (
    plan.type === 'vector' &&
    plan.stage <= lastVectorStage &&
    vectorAnswerKey(answers) === lastVectorAnswerKey
  );
}

function scheduleBackgroundPrecompose(answers) {
  const token = ++precomposeToken;

  function runPrecompose() {
    if (token !== precomposeToken) return;
    void import('./amulet-final-render.js')
      .then(function (finalMod) {
        if (token !== precomposeToken) return;
        return finalMod.precomposeForFinalRender(answers);
      })
      .catch(function (err) {
        console.warn('[create] precompose failed', err);
      });
  }

  /* Let the next-question transition paint before heavy SVG compose. */
  window.setTimeout(function () {
    if (token !== precomposeToken) return;
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(runPrecompose, { timeout: 4000 });
    } else {
      runPrecompose();
    }
  }, 400);
}

export function scheduleAmuletPrecompose(answers) {
  if (!answers?.q1Wish?.trim()) return;
  scheduleBackgroundPrecompose(answers);
}

async function ensureVectorStage(answers, container, stage, signal, token) {
  if (lastVectorStage >= stage && containerHasPreview(container)) return;

  await renderQuestionnaireAmulet(answers, container, {
    partial: true,
    forceVectorStage: stage,
    signal,
    autoRotate: false,
  });

  if (token !== buildToken || signal.aborted) return;
  lastVectorStage = stage;
  lastVectorAnswerKey = vectorAnswerKey(answers);
  syncAmuletPosterState(container);
}

async function finishFrameLoader(startedAt, token, answers) {
  await waitFrameLoaderMin(startedAt);
  if (token !== buildToken) return;
  hideAmuletFrameLoader();
  if (allQuestionsAnswered(answers)) {
    setTextureLoading(true);
  }
}

export function cancelAmuletBuild() {
  if (buildAbort) buildAbort.abort();
  buildAbort = null;
  buildToken += 1;
  setZoneBuilding(false);
  hideAmuletFrameLoader();
  resetAmuletLoaderCache();
}

export async function showTextureLoadingState() {
  setTextureLoading(false);
  setZoneBuilding(false);
  const { showAmuletLoader: showFull } = await import('./amulet-loader.js');
  await showFull('טוען קמע', { fullscreen: true, progress: 0 });
}

export async function updateAmuletPreview(answers) {
  const container = document.getElementById('amuletContainer');
  if (!container) return;

  if (!answers.q1Wish?.trim()) {
    container.innerHTML = '';
    lastVectorStage = 0;
    lastVectorAnswerKey = '';
    syncAmuletPosterState(container);
    setTextureLoading(false);
    hideAmuletFrameLoader();
    resetAmuletLoaderCache();
    return;
  }

  const plan = getCreateRenderPlan(answers, true);

  /* Q4–Q7: vectors already on screen — precompose PBR in the background, no loader. */
  if (plan.type === 'loading-textures' && containerHasPreview(container)) {
    scheduleBackgroundPrecompose(answers);
    return;
  }

  /* Same vector stage + same Q1–Q3 answers — nothing new to draw. */
  if (canSkipVectorRender(answers, plan) && containerHasPreview(container)) {
    return;
  }

  if (buildAbort) buildAbort.abort();
  buildAbort = new AbortController();
  const signal = buildAbort.signal;
  const token = ++buildToken;
  const loaderStartedAt = performance.now();
  let didRenderWork = false;

  setTextureLoading(false);
  setZoneBuilding(true);

  await showAmuletLoader('טוען קמע');

  try {
    container.hidden = false;

    if (plan.type === 'loading-textures') {
      await ensureVectorStage(answers, container, 3, signal, token);
      if (token !== buildToken || signal.aborted) return;
      didRenderWork = true;
      syncAmuletPosterState(container);
      scheduleBackgroundPrecompose(answers);
      return;
    }

    await renderQuestionnaireAmulet(answers, container, {
      partial: true,
      signal,
      autoRotate: false,
    });

    if (token !== buildToken || signal.aborted) return;
    didRenderWork = true;
    if (plan.type === 'vector' && plan.stage) {
      lastVectorStage = plan.stage;
      lastVectorAnswerKey = vectorAnswerKey(answers);
    }
    syncAmuletPosterState(container);
  } catch (err) {
    if (token !== buildToken || signal.aborted) return;
    console.error('[create] amulet render failed', err);
    const statusEl =
      document.getElementById('createAmuletStatus') ||
      document.getElementById('amuletStatus');
    if (statusEl) {
      statusEl.textContent = 'לא הצלחנו לעדכן את הקמע';
      statusEl.hidden = false;
    }
  } finally {
    if (token === buildToken) {
      if (didRenderWork) {
        await finishFrameLoader(loaderStartedAt, token, answers);
      } else {
        hideAmuletFrameLoader();
      }
      setZoneBuilding(false);
    }
  }
}

window.amuletBuildUpdate = updateAmuletPreview;
window.amuletBuildCancel = cancelAmuletBuild;
window.amuletShowTextureLoading = showTextureLoadingState;
window.amuletSchedulePrecompose = scheduleAmuletPrecompose;
window.amuletPreloadCompose = initAmuletCompose;

void preloadLoaderGallerySpin();
void initAmuletCompose();
