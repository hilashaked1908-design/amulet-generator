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
let deferredBuildToken = 0;

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

/** True when answering will reveal a vector layer not already on screen. */
export function willShowNewVectorLayer(answers) {
  if (!answers?.q1Wish?.trim()) return false;
  const container = document.getElementById('amuletContainer');
  const plan = getCreateRenderPlan(answers, true);

  if (plan.type === 'vector' && plan.stage) {
    if (plan.stage > lastVectorStage) return true;
    if (!containerHasPreview(container)) return true;
    if (vectorAnswerKey(answers) !== lastVectorAnswerKey) return true;
    return false;
  }

  if (plan.type === 'loading-textures') {
    return lastVectorStage < 3 && !containerHasPreview(container);
  }

  return false;
}

/** Finish missing vector stage in the background (no new visible layer for the user). */
export function needsVectorCatchup(answers) {
  if (!answers?.q1Wish?.trim()) return false;
  const plan = getCreateRenderPlan(answers, true);
  return plan.type === 'loading-textures' && lastVectorStage < 3;
}

export function needsVectorFrameLoad(answers) {
  return willShowNewVectorLayer(answers) || needsVectorCatchup(answers);
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

function scheduleDeferredPreviewUpdate(answers, options) {
  const token = ++deferredBuildToken;

  function runDeferred() {
    if (token !== deferredBuildToken) return;
    const nextOptions = Object.assign({}, options, { defer: false });
    void updateAmuletPreview(answers, nextOptions);
  }

  window.requestAnimationFrame(function () {
    if (token !== deferredBuildToken) return;
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(runDeferred, { timeout: 2500 });
    } else {
      window.setTimeout(runDeferred, 0);
    }
  });
}

export function scheduleAmuletPrecompose(answers) {
  if (!answers?.q1Wish?.trim()) return;
  scheduleBackgroundPrecompose(answers);
}

async function ensureVectorStage(answers, container, stage, signal, token) {
  if (lastVectorStage >= stage && containerHasPreview(container)) return false;

  await renderQuestionnaireAmulet(answers, container, {
    partial: true,
    forceVectorStage: stage,
    signal,
    autoRotate: false,
  });

  if (token !== buildToken || signal.aborted) return false;
  lastVectorStage = stage;
  lastVectorAnswerKey = vectorAnswerKey(answers);
  syncAmuletPosterState(container);
  return true;
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
  deferredBuildToken += 1;
  if (buildAbort) buildAbort.abort();
  buildAbort = null;
  buildToken += 1;
  setZoneBuilding(false);
  hideAmuletFrameLoader();
  resetAmuletLoaderCache();
}

/** Drop loader/build chrome without aborting an in-flight background render. */
export function clearAmuletBuildUi() {
  setZoneBuilding(false);
  hideAmuletFrameLoader();
}

export async function showTextureLoadingState() {
  setTextureLoading(false);
  setZoneBuilding(false);
  const { showAmuletLoader: showFull } = await import('./amulet-loader.js');
  await showFull('טוען קמע', { fullscreen: true, progress: 0 });
}

export async function updateAmuletPreview(answers, options = {}) {
  const uiBlocking = options.uiBlocking !== false;
  const showLoader = options.showLoader !== false;
  const container = document.getElementById('amuletContainer');
  if (!container) return;

  if (options.defer) {
    scheduleDeferredPreviewUpdate(answers, options);
    return;
  }

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
  const newLayerVisible = willShowNewVectorLayer(answers);
  const catchupOnly = !newLayerVisible && needsVectorCatchup(answers);

  /* Q4–Q7: vectors already on screen — precompose PBR in the background, no loader. */
  if (
    plan.type === 'loading-textures' &&
    lastVectorStage >= 3 &&
    containerHasPreview(container)
  ) {
    scheduleBackgroundPrecompose(answers);
    return;
  }

  /* Nothing new to draw — skip loader and render entirely. */
  if (!newLayerVisible && !catchupOnly) {
    return;
  }

  if (buildAbort) buildAbort.abort();
  buildAbort = new AbortController();
  const signal = buildAbort.signal;
  const token = ++buildToken;
  const loaderStartedAt = performance.now();
  let didRenderWork = false;
  const shouldShowLoader = showLoader && newLayerVisible;

  if (shouldShowLoader) {
    await showAmuletLoader('טוען קמע', { keepPreview: false });
  }

  if (uiBlocking && shouldShowLoader) {
    setTextureLoading(false);
    setZoneBuilding(true);
  } else if (typeof window.amuletUnlockSemanticQuestionUi === 'function') {
    window.amuletUnlockSemanticQuestionUi();
  }

  try {
    container.hidden = false;

    if (plan.type === 'loading-textures') {
      didRenderWork = await ensureVectorStage(answers, container, 3, signal, token);
      if (token !== buildToken || signal.aborted) return;
      syncAmuletPosterState(container);
      scheduleBackgroundPrecompose(answers);
      return;
    }

    const stageBefore = lastVectorStage;
    const keyBefore = lastVectorAnswerKey;

    await renderQuestionnaireAmulet(answers, container, {
      partial: true,
      signal,
      autoRotate: false,
    });

    if (token !== buildToken || signal.aborted) return;
    if (plan.type === 'vector' && plan.stage) {
      lastVectorStage = plan.stage;
      lastVectorAnswerKey = vectorAnswerKey(answers);
    }
    didRenderWork =
      lastVectorStage > stageBefore || lastVectorAnswerKey !== keyBefore;
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
    const isCurrent = token === buildToken;
    if (isCurrent) {
      if (didRenderWork && shouldShowLoader) {
        await finishFrameLoader(loaderStartedAt, token, answers);
      } else {
        hideAmuletFrameLoader();
      }
      if (uiBlocking) setZoneBuilding(false);
    } else {
      hideAmuletFrameLoader();
      if (uiBlocking) setZoneBuilding(false);
    }
    if (!uiBlocking && typeof window.amuletUnlockSemanticQuestionUi === 'function') {
      window.amuletUnlockSemanticQuestionUi();
    }
  }
}

window.amuletBuildUpdate = updateAmuletPreview;
window.amuletWillShowNewVectorLayer = willShowNewVectorLayer;
window.amuletNeedsVectorCatchup = needsVectorCatchup;
window.amuletNeedsVectorFrameLoad = needsVectorFrameLoad;
window.amuletBuildCancel = cancelAmuletBuild;
window.amuletClearBuildUi = clearAmuletBuildUi;
window.amuletShowTextureLoading = showTextureLoadingState;
window.amuletSchedulePrecompose = scheduleAmuletPrecompose;
window.amuletPreloadCompose = initAmuletCompose;

void preloadLoaderGallerySpin();
void initAmuletCompose();
