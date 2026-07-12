/**
 * Final textured amulet - after all 7 answers (prototype-v2-thick pipeline).
 */
import { renderFinalAmuletLikePrototype } from './amulet-final-render.js';
import {
  showAmuletLoader,
  hideAmuletLoader,
  setAmuletLoaderProgress,
} from './amulet-loader.js';
import { exportAmuletCanvasPng, exportCanvasAsTransparentPng } from './amulet-export.js';
import { captureGardenSnapshotFromActivePbr, captureLiveAmuletSnapshot, zoomActivePbrPresentation, renderActivePbrFrame } from '../three-pbr-amulet.js';
import { renderResultOverlayVectors } from './amulet-detail-vectors.js?v=20250708-vector-raster-fix';

const STORAGE_KEY = 'amuletQuestionnaire';
const SNAPSHOT_KEY = 'amuletUserSnapshot';
const RESULT_VIEW_KEY = 'pagmarResultViewActive';

export const DEMO_RESULT_ANSWERS = {
  q1Wish: 'שאהיה בטוחה בעצמי. כי מגיע לי. אהיה מאושרת יותר',
  q2Name: 'מאיה',
  q3WhyNow: 'סוף סוף מרגישה מוכנה לפתוח את הלב',
  q4Belief: 'signs',
  q5Feeling: 'hope',
  q6Difficulty: 'uncertainty',
  q7Change: 'אהיה פחות לבד בערבים',
  q8Motivation: 'כשאני רואה התקדמות קטנה',
  completedAt: Date.now(),
};

function markResultViewActive() {
  try {
    sessionStorage.setItem(RESULT_VIEW_KEY, '1');
  } catch (_) {}
}

function clearResultViewActive() {
  try {
    sessionStorage.removeItem(RESULT_VIEW_KEY);
  } catch (_) {}
}

export function shouldRestoreResultView() {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('result') === '1') return true;
    return sessionStorage.getItem(RESULT_VIEW_KEY) === '1';
  } catch (_) {
    return false;
  }
}

let renderToken = 0;
let exportBound = false;
let saveBound = false;
let pendingAnswers = null;

function loadAnswers() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function allAnswered(answers) {
  const keys = [
    'q1Wish',
    'q2Name',
    'q3WhyNow',
    'q4Belief',
    'q5Feeling',
    'q6Difficulty',
    'q7Change',
    'q8Motivation',
  ];
  return keys.every(function (key) {
    const v = answers[key];
    return v !== undefined && v !== null && String(v).trim() !== '';
  });
}

function isIndexCreateMode() {
  return (
    document.body.classList.contains('pagmar-index') &&
    document.body.classList.contains('is-create-mode')
  );
}

function isInlineCreateFlow() {
  return document.body.classList.contains('pagmar-create') || isIndexCreateMode();
}

function amuletFrameSelector() {
  if (document.querySelector('.pagmar__request-amulet-build')) {
    return '.pagmar__request-amulet-build';
  }
  return isIndexCreateMode()
    ? '.pagmar__index-create-amulet-frame'
    : '.pagmar__create-amulet-frame';
}

function setStatus(text, visible) {
  const el =
    document.getElementById('createAmuletStatus') ||
    document.getElementById('amuletStatus');
  if (!el) return;
  el.textContent = text;
  el.hidden = visible === false;
}

let createInputStash = null;

function setCreateCompleteState(active) {
  document.body.classList.toggle('is-create-complete', Boolean(active));
  const workspace = document.getElementById('indexCreateWorkspace');
  if (workspace) workspace.classList.toggle('is-create-complete', Boolean(active));
}

function stashCreateQuestionInput() {
  if (createInputStash) return;

  const stack = document.querySelector('.pagmar__create-question-stack');
  const questionBox = stack?.querySelector('.pagmar__create-question-box');
  const saveWrap = stack?.querySelector('.pagmar__create-save-wrap');
  const fieldWrap = document.getElementById('questionField');
  const submitBtn = document.getElementById('questionSubmit');

  if (fieldWrap) fieldWrap.innerHTML = '';
  if (submitBtn) submitBtn.hidden = true;
  if (!stack || (!questionBox && !saveWrap)) return;

  createInputStash = document.createElement('div');
  createInputStash.id = 'createInputStash';
  createInputStash.hidden = true;
  if (questionBox) {
    questionBox.hidden = true;
    createInputStash.appendChild(questionBox);
  }
  if (saveWrap) {
    saveWrap.hidden = true;
    createInputStash.appendChild(saveWrap);
  }
  stack.parentElement?.appendChild(createInputStash);
  setCreateCompleteState(true);
}

export function restoreCreateQuestionInput() {
  const stash = document.getElementById('createInputStash');
  const stack = document.querySelector('.pagmar__create-question-stack');
  if (!stash || !stack) {
    createInputStash = null;
    setCreateCompleteState(false);
    return;
  }

  const questionBox = stash.querySelector('.pagmar__create-question-box');
  const saveWrap = stash.querySelector('.pagmar__create-save-wrap');
  const fields = stack.querySelector('.pagmar__create-question-fields');
  const head = stack.querySelector('.pagmar__create-question-head');

  if (questionBox) {
    questionBox.hidden = false;
    questionBox.style.display = '';
    if (fields) {
      fields.appendChild(questionBox);
    } else if (head) {
      head.insertAdjacentElement('afterend', questionBox);
    } else {
      stack.appendChild(questionBox);
    }
  }
  if (saveWrap) {
    saveWrap.hidden = false;
    saveWrap.style.display = '';
    stack.appendChild(saveWrap);
  }

  stash.remove();
  createInputStash = null;

  const submitBtn = document.getElementById('questionSubmit');
  if (submitBtn) submitBtn.hidden = false;

  setCreateCompleteState(false);
}

function showCreateCompletePanel(indexCreate) {
  const frame = document.getElementById('questionFrame');
  const labelEl = document.getElementById('questionLabel');
  const textEl = document.getElementById('questionText');
  if (!frame || !labelEl || !textEl) return;

  if (indexCreate) stashCreateQuestionInput();

  labelEl.textContent = '[ ✓ ]';
  if (indexCreate) {
    textEl.innerHTML = '';
    const line1 = document.createElement('span');
    line1.className = 'pagmar__create-question-line';
    line1.textContent = 'הקמע שלך מוכן';
    const line2 = document.createElement('span');
    line2.className = 'pagmar__create-question-line pagmar__create-question-line--hint';
    line2.textContent = 'גררי לסיבוב';
    textEl.appendChild(line1);
    textEl.appendChild(line2);
  } else {
    textEl.textContent = 'הקמע שלך מוכן';
  }
  frame.hidden = false;
  document.body.classList.add('is-panel-open');
}

function getNextAmuletIndex() {
  try {
    const raw = localStorage.getItem('amuletCollection');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.length + 1 : 1;
  } catch (_) { return 1; }
}

var RESULT_COMPONENT_ITEM_CLASSES = { 1: 'pagmar__result-list-item--material' };

function formatResultWish(text) {
  const raw = window.pagmarNormalizeDashes ? window.pagmarNormalizeDashes(text) : text;
  const trimmed = (raw || '').trim();
  if (!trimmed) return '-';
  if (trimmed.charAt(0) === '״' || trimmed.charAt(0) === '"') return trimmed;
  return '״' + trimmed + '״';
}

function resolveResultSpec(answers) {
  const a = answers || loadAnswers();
  if (typeof window.getAmuletSpec === 'function') {
    return window.getAmuletSpec(liveUserAmuletIndex(), a);
  }
  return null;
}

function fillResultList(el, items, extraClassesByIndex) {
  if (!el) return;
  el.innerHTML = '';
  (items || []).forEach(function (text, index) {
    const li = document.createElement('li');
    li.className = 'pagmar__result-list-item';
    const extra = extraClassesByIndex && extraClassesByIndex[index];
    if (extra) li.classList.add(extra);
    li.textContent = text;
    el.appendChild(li);
  });
}

function liveUserAmuletIndex() {
  const base = (window.AMULET_QUESTIONS || []).length;
  return base + Math.max(0, getNextAmuletIndex() - 1);
}

function populateResultOverlay(answers) {
  const overlay = document.getElementById('resultOverlay');
  if (!overlay) return;

  const a = answers || loadAnswers();
  const spec = resolveResultSpec(a);

  const nameEl = document.getElementById('resultName');
  const numEl = document.getElementById('resultNum');
  const storyEl = document.getElementById('resultStory');
  const timingEl = document.getElementById('resultTiming');
  const tagsEl = document.getElementById('resultTags');
  const componentsEl = document.getElementById('resultComponents');

  if (numEl) {
    const textEl = numEl.querySelector('.pagmar__result-num__text');
    const label = String(getNextAmuletIndex()).padStart(3, '0');
    if (textEl) {
      textEl.textContent = '[' + label + ']';
    } else {
      const digits = numEl.querySelector('.pagmar__result-num__digits');
      if (digits) {
        digits.textContent = label;
      } else {
        numEl.textContent = '[' + label + ']';
      }
    }
  }

  const name = (a.q2Name || '').trim() || spec?.name || '-';
  const timing = (a.q3WhyNow || '').trim() || spec?.whyNow || '-';
  const wish = formatResultWish(a.q1Wish) || spec?.wish || '-';

  if (nameEl) nameEl.textContent = name;
  if (timingEl) timingEl.textContent = timing;
  if (storyEl) storyEl.textContent = wish;

  if (spec) {
    fillResultList(tagsEl, spec.tags);
    fillResultList(componentsEl, spec.components, RESULT_COMPONENT_ITEM_CLASSES);
  } else {
    fillResultList(tagsEl, []);
    fillResultList(componentsEl, []);
  }

  fitResultStoryTypography();
}

function getResultUnitPx() {
  const canvas = document.querySelector('.pagmar-canvas--result');
  if (!canvas) return 1;
  const w = canvas.clientWidth / 1920;
  const h = canvas.clientHeight / 1080;
  return Math.min(w, h) || 1;
}

function fitResultStoryTypography() {
  const storyEl = document.getElementById('resultStory');
  const requestEl = document.querySelector('.pagmar__result-request');
  const requestBlock = document.querySelector('.pagmar__result-request-block');
  const vectorEl = requestBlock?.querySelector('.pagmar__result-vector');
  if (!storyEl || !requestEl) return;

  const u = getResultUnitPx();
  const tagEl = requestEl.querySelector('.pagmar__result-tag');
  const tagH = tagEl ? tagEl.offsetHeight : 0;
  const gap = 32 * u;
  const blockH = requestBlock ? requestBlock.clientHeight : 0;
  const vectorH = vectorEl ? vectorEl.offsetHeight : 132.379 * u;
  const vectorGap = 32 * u;
  const maxStoryPx = Math.max(
    48,
    (blockH || 559.379 * u) - tagH - gap - vectorH - vectorGap - 8
  );
  let sizePx = 40 * u;
  const minPx = 24 * u;

  storyEl.style.fontSize = sizePx + 'px';
  storyEl.style.lineHeight = '1.11';

  let guard = 0;
  while (storyEl.scrollHeight > maxStoryPx + 1 && sizePx > minPx && guard < 80) {
    sizePx -= 1;
    storyEl.style.fontSize = sizePx + 'px';
    guard += 1;
  }
}

let capturePresentedSnapshot = null;
let disposePresentedAmulet = null;
let savedSnapshotCanvas = null;
let savedSnapshotRenderToken = 0;

function clearSavedSnapshot() {
  savedSnapshotCanvas = null;
  savedSnapshotRenderToken = 0;
}

function getSavedSnapshotIfCurrent() {
  if (savedSnapshotRenderToken !== renderToken) return null;
  return savedSnapshotCanvas;
}

function rememberSavedSnapshot(canvas) {
  if (!canvas?.width || !canvas?.height) return;
  savedSnapshotCanvas = canvas;
  savedSnapshotRenderToken = renderToken;
}

export function resetAmuletSaveState() {
  clearSavedSnapshot();
  capturePresentedSnapshot = null;
  if (disposePresentedAmulet) {
    disposePresentedAmulet();
  }
  disposePresentedAmulet = null;
}

function readComposed3DForSave() {
  try {
    const raw =
      sessionStorage.getItem('amuletComposed3D') ||
      localStorage.getItem('amuletComposed3D');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

async function allocateSaveEntryId() {
  const store = await import('./amulet-glb-store.js');
  const id = await store.allocateUniqueEntryId();
  try {
    sessionStorage.setItem('pagmarPendingEntryId', String(id));
  } catch (_) {}
  console.log('[amulet-show] allocated save entryId', id);
  return id;
}

async function consumePendingEntryId() {
  const peeked = peekPendingEntryId();
  if (peeked != null) {
    try {
      sessionStorage.removeItem('pagmarPendingEntryId');
    } catch (_) {}
    return peeked;
  }
  const store = await import('./amulet-glb-store.js');
  const id = await store.allocateUniqueEntryId();
  console.warn('[amulet-show] consumePendingEntryId had no pending id — allocated', id);
  return id;
}

function peekPendingEntryId() {
  try {
    const raw = sessionStorage.getItem('pagmarPendingEntryId');
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) return n;
    }
  } catch (_) {}
  return null;
}

async function gardenSaveOptions(answers, entryIdOverride) {
  let entryId = entryIdOverride;
  if (entryId == null) {
    const peeked = peekPendingEntryId();
    if (peeked != null) {
      entryId = peeked;
      try {
        sessionStorage.removeItem('pagmarPendingEntryId');
      } catch (_) {}
    } else {
      entryId = await consumePendingEntryId();
    }
  }
  return {
    answers: answers || loadAnswers(),
    composed3D: readComposed3DForSave(),
    entryId: entryId,
  };
}

async function waitForOverlayLayout() {
  return new Promise(function (resolve) {
    requestAnimationFrame(function () {
      requestAnimationFrame(resolve);
    });
  });
}

function waitForMs(ms) {
  return new Promise(function (resolve) {
    window.setTimeout(resolve, ms);
  });
}

const RESULT_OVERLAY_FADE_MS = 400;

const RESULT_AMULET_FIT_MARGIN = 1.08;
const RESULT_LIVE_CANVAS_ZOOM = 1.24;

let resultKeepAliveRaf = 0;
function stopResultAmuletKeepAlive() {
  if (resultKeepAliveRaf) {
    cancelAnimationFrame(resultKeepAliveRaf);
    resultKeepAliveRaf = 0;
  }
}
/* Some hosts only repaint the live WebGL canvas on interaction, leaving the
   result view black when idle. Keep rendering it every frame while the result
   overlay is open. */
function startResultAmuletKeepAlive() {
  stopResultAmuletKeepAlive();
  function tick() {
    if (!document.body.classList.contains('is-result-overlay-open')) {
      resultKeepAliveRaf = 0;
      return;
    }
    renderActivePbrFrame();
    resultKeepAliveRaf = requestAnimationFrame(tick);
  }
  resultKeepAliveRaf = requestAnimationFrame(tick);
}

function mountLiveCreateCanvasInSlot(slot, sourceCanvas) {
  if (!sourceCanvas?.width || !sourceCanvas?.height) {
    throw new Error('create canvas missing');
  }
  slot.appendChild(sourceCanvas);
  capturePresentedSnapshot = function () {
    const snap = captureGardenSnapshotFromActivePbr();
    if (snap?.width && snap?.height) return snap;
    return cloneCanvasSnapshot(sourceCanvas);
  };
  disposePresentedAmulet = null;
  zoomActivePbrPresentation(RESULT_LIVE_CANVAS_ZOOM);
  startResultAmuletKeepAlive();
}

async function mountResultAmuletLikeDetail(slot, glbKey, options) {
  const present = await import('./amulet-detail-present.js?v=20250705-save-fix5');
  const mountOpts = Object.assign(
    {
      useDetailPresentation: true,
      fitMargin: RESULT_AMULET_FIT_MARGIN,
    },
    options || {}
  );
  capturePresentedSnapshot = present.capturePresentedAmuletSnapshot;
  disposePresentedAmulet = present.disposePresentedAmulet;

  try {
    await present.mountDetailStyleAmulet(slot, glbKey, mountOpts);
    return true;
  } catch (err) {
    console.warn('[amulet-show] detail mount failed, retrying once', err);
  }

  await new Promise(function (resolve) {
    window.setTimeout(resolve, 80);
  });

  try {
    await present.mountDetailStyleAmulet(slot, glbKey, mountOpts);
    return true;
  } catch (retryErr) {
    console.warn('[amulet-show] detail mount retry failed', retryErr);
    return false;
  }
}

function yieldToMainThread() {
  return new Promise(function (resolve) {
    requestAnimationFrame(function () {
      requestAnimationFrame(resolve);
    });
  });
}

async function resolveCanvasForGardenSave(slot, container, options) {
  const opts = options || {};
  const targetPx = typeof opts.targetPx === 'number' ? opts.targetPx : 2048;
  if (!opts.fresh) {
    const cached = getSavedSnapshotIfCurrent();
    if (cached?.width && cached?.height) return cached;
  }
  if (capturePresentedSnapshot) {
    try {
      const snap = capturePresentedSnapshot({ targetPx: targetPx });
      if (snap?.width && snap?.height) return snap;
    } catch (err) {
      console.warn('[amulet-show] presented snapshot capture failed', err);
    }
  }
  const slotCanvas = slot?.querySelector('canvas');
  if (slotCanvas?.width && slotCanvas?.height) {
    return cloneCanvasSnapshot(slotCanvas);
  }
  const containerCanvas = container?.querySelector('canvas');
  if (containerCanvas?.width && containerCanvas?.height) {
    return cloneCanvasSnapshot(containerCanvas);
  }
  return null;
}

async function showResultOverlay(container, answers) {
  const overlay = document.getElementById('resultOverlay');
  const slot = document.getElementById('resultAmulet3D');
  const workspace = document.getElementById('indexCreateWorkspace');
  if (!overlay || !slot) return false;

  // Keep the result overlay OUT of the questionnaire wrapper: that wrapper gets
  // opacity:0 / visibility:hidden when the result opens, which was hiding the
  // whole result view (it showed for a moment then went black). Promote it to a
  // direct child of <body>, like the About overlay.
  if (overlay.parentElement !== document.body) {
    document.body.appendChild(overlay);
  }

  populateResultOverlay(answers);

  overlay.hidden = false;
  overlay.classList.remove('is-visible');
  document.body.classList.add('is-result-overlay-open');
  await waitForOverlayLayout();
  // Reveal the populated shell immediately (texts + structure); the amulet and
  // effects mount right after in the background. Avoids a black gap where the
  // loader is gone but the overlay isn't visible yet.
  overlay.classList.add('is-visible');

  slot.innerHTML = '';

  const fogMod = await import('./result-overlay-fog.js?v=20250709-result-layout');
  try {
    await fogMod.bootResultOverlayFog();
  } catch (err) {
    console.warn('[amulet-show] result fog boot failed', err);
  }

  try {
    const liveCanvas = container?.querySelector('canvas');
    // Prefer the already-rendered live canvas: it is framed and lit correctly
    // (it's what the user briefly sees). The GLB re-mount can mis-frame/under-
    // light the amulet on slower hosts, which showed as a black result view in
    // the cloud. Fall back to the detail re-mount only if no live canvas exists.
    if (liveCanvas?.width && liveCanvas?.height) {
      mountLiveCreateCanvasInSlot(slot, liveCanvas);
    } else {
      let mounted = false;
      try {
        mounted = await mountResultAmuletLikeDetail(slot, 'user-amulet');
      } catch (detailErr) {
        console.warn('[amulet-show] result detail mount failed', detailErr);
      }
      if (!mounted) {
        throw new Error('no live canvas available and detail mount failed');
      }
    }
  } catch (err) {
    console.error('[amulet-show] could not mount result amulet', err);

    const liveCanvas = container?.querySelector('canvas');
    if (liveCanvas?.width && liveCanvas?.height) {
      try {
        slot.appendChild(liveCanvas);
        capturePresentedSnapshot = function () {
          const snap = captureGardenSnapshotFromActivePbr();
          if (snap?.width && snap?.height) return snap;
          return cloneCanvasSnapshot(liveCanvas);
        };
        disposePresentedAmulet = null;
        zoomActivePbrPresentation(RESULT_LIVE_CANVAS_ZOOM);
      } catch (fallbackErr) {
        console.error('[amulet-show] canvas fallback failed', fallbackErr);
        overlay.hidden = true;
        document.body.classList.remove('is-result-overlay-open');
        fogMod.stopResultOverlayFog();
        if (workspace) workspace.classList.add('is-open');
        return false;
      }
    } else {
      overlay.hidden = true;
      document.body.classList.remove('is-result-overlay-open');
      fogMod.stopResultOverlayFog();
      if (workspace) workspace.classList.add('is-open');
      return false;
    }
  }

  fogMod.resizeResultOverlayFog();
  await waitForOverlayLayout();
  requestAnimationFrame(function () {
    fogMod.resizeResultOverlayFog();
  });

  try {
    await renderResultOverlayVectors(answers);
  } catch (err) {
    console.warn('[amulet-show] result vectors failed', err);
  }

  fitResultStoryTypography();
  await waitForOverlayLayout();

  try {
    const hoverMod = await import('./result-overlay-hover.js?v=20250710-result-glass-360');
    if (typeof hoverMod.bootResultAmuletHover === 'function') {
      hoverMod.bootResultAmuletHover();
    }
  } catch (err) {
    console.warn('[amulet-show] result hover boot failed', err);
  }

  try {
    const questionHoverMod = await import('./result-overlay-question-hover.js?v=20250710-result-tag-hover');
    if (typeof questionHoverMod.bootResultQuestionHover === 'function') {
      questionHoverMod.bootResultQuestionHover();
    }
  } catch (err) {
    console.warn('[amulet-show] result question hover boot failed', err);
  }

  if (window.pagmarGlassLens) {
    const resultNum = document.getElementById('resultNum');
    if (resultNum) window.pagmarGlassLens.register(resultNum);
    overlay.querySelectorAll('.glass-lens').forEach(function (lensEl) {
      window.pagmarGlassLens.register(lensEl);
    });
  }

  if (workspace) workspace.classList.remove('is-open');

  /* Reveal the finished result page behind the loader, then fade the loader out. */
  overlay.classList.add('is-visible');
  await waitForOverlayLayout();
  await waitForMs(RESULT_OVERLAY_FADE_MS);
  fitResultStoryTypography();
  await waitForOverlayLayout();

  markResultViewActive();
  if (!window.__pagmarResultStoryFitBound) {
    window.__pagmarResultStoryFitBound = true;
    window.addEventListener('resize', function () {
      if (!document.body.classList.contains('is-result-overlay-open')) return;
      fitResultStoryTypography();
    });
  }

  document.body.classList.remove('is-amulet-rendering');
  setAmuletLoaderProgress(1);
  await hideAmuletLoader();

  if (typeof window.pagmarPushResultHistory === 'function') {
    window.pagmarPushResultHistory();
  }

  return true;
}

function hideResultOverlay() {
  const overlay = document.getElementById('resultOverlay');
  if (!overlay) return;
  overlay.classList.remove('is-visible');
  overlay.hidden = true;
  overlay.style.display = 'none';
  overlay.style.pointerEvents = 'none';
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('is-result-overlay-open');
  clearResultViewActive();

  import('./result-overlay-fog.js?v=20250709-result-layout')
    .then(function (mod) {
      mod.stopResultOverlayFog();
    })
    .catch(function () {});

  if (
    document.body.classList.contains('is-create-mode') ||
    document.body.classList.contains('pagmar-create')
  ) {
    import('./request-flow-fog.js?v=20250709-garden-fog')
      .then(function (mod) {
        return mod.bootRequestFlowFog();
      })
      .catch(function () {});
  }

  if (disposePresentedAmulet) {
    disposePresentedAmulet();
  }
  capturePresentedSnapshot = null;
  disposePresentedAmulet = null;
  clearSavedSnapshot();
}

function restoreCreateWorkspaceAfterResult() {
  const workspace = document.getElementById('indexCreateWorkspace');
  if (!workspace) return;
  workspace.hidden = false;
  workspace.style.removeProperty('display');
  workspace.classList.add('is-open');
}

function hideResultOverlayFromHistory() {
  hideResultOverlay();
  hideAmuletLoader({ force: true });
  restoreCreateWorkspaceAfterResult();
  document.body.classList.remove('is-amulet-rendering', 'is-amulet-ready', 'is-create-amulet-ready');
}

function persistCompletedQuestionnaire(answers) {
  const payload = Object.assign({}, answers, {
    completedAt: answers.completedAt || Date.now(),
  });
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  if (typeof window.gardenPersistUserAmuletAnswers === 'function') {
    window.gardenPersistUserAmuletAnswers(payload);
  }
}

function persistRenderedAmuletSnapshot(canvas) {
  if (!canvas?.width || !canvas?.height) return false;
  if (typeof window.gardenPersistUserAmuletSnapshot === 'function') {
    window.gardenPersistUserAmuletSnapshot(canvas);
    return true;
  }
  try {
    const snapshot = document.createElement('canvas');
    snapshot.width = canvas.width;
    snapshot.height = canvas.height;
    snapshot.getContext('2d').drawImage(canvas, 0, 0);
    const dataUrl = snapshot.toDataURL('image/png');
    sessionStorage.setItem(SNAPSHOT_KEY, dataUrl);
    localStorage.setItem(SNAPSHOT_KEY, dataUrl);
    return true;
  } catch (err) {
    console.warn('[amulet-show] failed to persist snapshot fallback', err);
    return false;
  }
}

async function waitForGardenAdd(maxMs) {
  const deadline = Date.now() + (maxMs || 10000);
  while (Date.now() < deadline) {
    if (typeof window.gardenAddUserAmulet === 'function') return true;
    await new Promise(function (resolve) {
      setTimeout(resolve, 50);
    });
  }
  return typeof window.gardenAddUserAmulet === 'function';
}

async function placeIndexAmuletInGarden(container, answers, entryIdOverride) {
  const liveCanvas = container?.querySelector('canvas');
  const canvas = captureGardenSnapshotFromCanvas(liveCanvas);
  if (!canvas) {
    console.warn('[amulet-show] placeIndexAmuletInGarden - no canvas');
    return false;
  }

  if (answers) {
    persistCompletedQuestionnaire(answers);
  }
  persistRenderedAmuletSnapshot(canvas);

  const gardenReady = await waitForGardenAdd();
  if (!gardenReady) {
    console.error('[amulet-show] gardenAddUserAmulet not available');
    return false;
  }
  if (typeof window.gardenCapturePlacementAnchor === 'function') {
    window.gardenCapturePlacementAnchor();
  }
  try {
    await window.gardenAddUserAmulet(canvas, Object.assign(await gardenSaveOptions(answers, entryIdOverride), {
      focusAfterPlace: true,
      finalize: true,
    }));
    document.body.classList.add('has-user-amulet');
    return true;
  } catch (err) {
    console.error('[amulet-show] garden save failed', err);
    return false;
  }
}

function focusGardenOnSavedAmulet(sprite) {
  function tryFocus() {
    if (sprite && typeof window.gardenFocusSprite === 'function') {
      return window.gardenFocusSprite(sprite);
    }
    if (typeof window.gardenFocusSavedAmulet === 'function') {
      return window.gardenFocusSavedAmulet();
    }
    if (typeof window.gardenFocusUserAmulet === 'function') {
      return window.gardenFocusUserAmulet();
    }
    return false;
  }

  tryFocus();
  window.setTimeout(tryFocus, 400);
}

function returnToIndexHomeAfterSave(container, answers) {
  hideResultOverlay();
  hideAmuletLoader({ force: true });
  if (typeof window.pagmarStopCreateFlowEffects === 'function') {
    window.pagmarStopCreateFlowEffects();
  }
  closeIndexCreateAfterAmulet(container, answers);
}

async function saveAmuletAndReturnHome(container, answers, options) {
  const opts = options || {};
  const slot = opts.slot || document.getElementById('resultAmulet3D');
  const finalAnswers = answers || pendingAnswers || loadAnswers();

  let canvasForGarden = await resolveCanvasForGardenSave(slot, container, {
    fresh: true,
    targetPx: 2048,
  });
  if (!canvasForGarden?.width || !canvasForGarden?.height) {
    console.warn('[amulet-show] no canvas for save');
    setStatus('לא הצלחנו לשמור את הקמע', true);
    return false;
  }

  clearSavedSnapshot();
  returnToIndexHomeAfterSave(container, finalAnswers);
  await yieldToMainThread();

  const gardenReady = await waitForGardenAdd(5000);
  if (!gardenReady) {
    setStatus('לא הצלחנו לשמור את הקמע', true);
    return false;
  }

  try {
    const saveEntryId = peekPendingEntryId();
    const sprite = await window.gardenAddUserAmulet(
      canvasForGarden,
      Object.assign(await gardenSaveOptions(finalAnswers, saveEntryId), {
        focusAfterPlace: true,
        finalize: true,
      })
    );
    if (!sprite) {
      setStatus('לא הצלחנו לשמור את הקמע', true);
      return false;
    }
    document.body.classList.add('has-user-amulet');
    persistCompletedQuestionnaire(finalAnswers);
    window.setTimeout(function () {
      persistRenderedAmuletSnapshot(canvasForGarden);
    }, 0);
    focusGardenOnSavedAmulet(sprite);
    setStatus('', false);
    if (typeof window.pagmarResetCreateHistoryAfterSave === 'function') {
      window.setTimeout(function () {
        window.pagmarResetCreateHistoryAfterSave();
      }, 0);
    }
    return true;
  } catch (err) {
    console.error('[amulet-show] garden save failed', err);
    setStatus('לא הצלחנו לשמור את הקמע', true);
    return false;
  }
}

function closeIndexCreateAfterAmulet(container, answers) {
  const workspace = document.getElementById('indexCreateWorkspace');
  const stage = document.getElementById('questionStage');
  const garden = document.getElementById('questionGarden');
  const frame = document.getElementById('questionFrame');
  const createStatus = document.getElementById('createAmuletStatus');

  if (answers) {
    persistCompletedQuestionnaire(answers);
  }

  restoreCreateQuestionInput();

  if (workspace) {
    workspace.classList.remove('is-open', 'is-choice-question', 'is-compact-head', 'is-create-complete');
    workspace.hidden = true;
    workspace.style.display = 'none';
  }

  document.body.classList.remove(
    'is-create-mode',
    'is-panel-open',
    'is-building',
    'is-amulet-rendering',
    'is-amulet-ready',
    'is-create-amulet-ready',
    'is-create-complete',
    'is-choice-question',
    'is-result-overlay-open',
    'is-create-fullpage-loading',
    'is-vector-frame-loading',
    'is-question-transition-loading'
  );
  document.body.classList.add('is-create-exiting');
  document.body.style.background = '';
  window.setTimeout(function () {
    document.body.classList.remove('is-create-exiting');
  }, 750);
  if (!document.body.classList.contains('has-user-amulet')) {
    document.body.classList.add('has-user-amulet');
  }
  pendingAnswers = null;
  hideIndexCreateActionButtons();

  if (container) {
    container.innerHTML = '';
    container.hidden = true;
    if (stage && container.parentElement !== stage) {
      stage.appendChild(container);
    }
  }

  if (frame) frame.hidden = true;
  if (garden) {
    garden.hidden = false;
    garden.style.display = '';
  }
  if (stage) stage.hidden = false;
  if (createStatus) createStatus.hidden = true;

  if (window.questionnaireStar) {
    window.questionnaireStar.resumeFloat();
  }

  if (typeof window.gardenResetSpriteFocus === 'function') {
    window.gardenResetSpriteFocus();
  }

  window.dispatchEvent(new CustomEvent('questionnaire:close-panel'));
  window.dispatchEvent(
    new CustomEvent('questionnaire:create-close', { detail: { afterSave: true } })
  );
  window.dispatchEvent(new CustomEvent('questionnaire:user-amulet-ready'));
}

function hideIndexCreateActionButtons() {
  const actions = document.getElementById('createAmuletActions');
  if (actions) actions.hidden = true;
}

function showIndexCreateActionButtons() {
  const actions = document.getElementById('createAmuletActions');
  if (actions) actions.hidden = false;
  bindExportButton();
  bindSaveAmuletButton();
}

function showCreateExportButton() {
  const exportBtn = document.getElementById('exportAmuletBtn');
  if (exportBtn) exportBtn.hidden = false;
  bindExportButton();
}

function bindExportButton() {
  if (exportBound) return;
  const exportBtn = document.getElementById('exportAmuletBtn');
  if (!exportBtn) return;
  exportBound = true;
  exportBtn.addEventListener('click', function () {
    const container = document.getElementById('amuletContainer');
    const liveCanvas = container?.querySelector('canvas');
    try {
      const snap = captureGardenSnapshotFromCanvas(liveCanvas);
      if (snap) {
        exportCanvasAsTransparentPng(snap, { filename: 'amulet' });
        setStatus('התמונה יוצאה', true);
        window.setTimeout(function () {
          setStatus('', false);
        }, 2200);
        return;
      }

      exportAmuletCanvasPng(container, { filename: 'amulet' });
      setStatus('התמונה יוצאה', true);
      window.setTimeout(function () {
        setStatus('', false);
      }, 2200);
    } catch (err) {
      console.error('[create] export failed', err);
      setStatus('לא הצלחנו לייצא את התמונה', true);
    }
  });
}

function bindSaveAmuletButton() {
  if (saveBound) return;
  const saveBtn = document.getElementById('saveAmuletBtn');
  if (!saveBtn) return;
  saveBound = true;
  saveBtn.addEventListener('click', async function () {
    const container = document.getElementById('amuletContainer');
    const answers = pendingAnswers || loadAnswers();
    saveBtn.disabled = true;
    await saveAmuletAndReturnHome(container, answers);
    saveBtn.disabled = false;
  });
}

export async function showFinishedAmulet(answersOverride) {
  const answers = answersOverride || loadAnswers();
  if (!allAnswered(answers)) {
    console.warn('[amulet] showFinishedAmulet - not all answers yet', answers);
    return;
  }

  const container = document.getElementById('amuletContainer');
  if (!container) {
    console.error('[amulet] amuletContainer missing');
    return;
  }

  if (typeof window.amuletBuildCancel === 'function') {
    window.amuletBuildCancel();
  }
  document.body.classList.remove('is-building');

  const isCreatePage = document.body.classList.contains('pagmar-create');
  const inlineCreate = isInlineCreateFlow();
  const wasIndexCreate = isIndexCreateMode();
  const token = ++renderToken;
  resetAmuletSaveState();
  const zone = document.querySelector(amuletFrameSelector());

  if (inlineCreate) {
    if (zone) zone.classList.remove('is-textures-loading');
    if (wasIndexCreate) {
      hideIndexCreateActionButtons();
      stashCreateQuestionInput();
    }
    await showAmuletLoader('טוען קמע', { fullscreen: true, gallery: true });
    document.body.classList.add('is-amulet-rendering');
  }

  try {
    if (!inlineCreate) {
      await showAmuletLoader('טוען קמע', { fullscreen: true, gallery: true });
    }
    console.log('[amulet] starting prototype PBR render');

    const saveEntryIdPromise = allocateSaveEntryId();
    const resultOverlayPrefetch = Promise.all([
      import('./result-overlay-fog.js?v=20250709-result-layout'),
      import('./amulet-detail-present.js?v=20250705-save-fix5'),
      import('./result-overlay-hover.js?v=20250710-result-glass-360'),
      import('./result-overlay-question-hover.js?v=20250710-result-tag-hover'),
    ]);

    const saveEntryId = await saveEntryIdPromise;
    await renderFinalAmuletLikePrototype(answers, container, function (frac) {
      if (token !== renderToken) return;
      setAmuletLoaderProgress(frac);
    }, { entryId: saveEntryId });

    if (token !== renderToken) return;

    await resultOverlayPrefetch.catch(function () {});

    if (zone) zone.classList.remove('is-textures-loading');

    if (inlineCreate) {
      pendingAnswers = answers;
      persistCompletedQuestionnaire(answers);

      const shown = await showResultOverlay(container, answers);
      if (shown) {
        await rememberResultSnapshot();
        bindResultOverlayButtons(container, answers);
      } else {
        document.body.classList.remove('is-amulet-rendering');
        setAmuletLoaderProgress(1);
        await hideAmuletLoader({ force: true });
        const workspace = document.getElementById('indexCreateWorkspace');
        if (wasIndexCreate && workspace) workspace.classList.add('is-open');
        document.body.classList.add(
          wasIndexCreate ? 'is-create-amulet-ready' : 'is-amulet-ready'
        );
        showCreateCompletePanel(wasIndexCreate);
        if (wasIndexCreate) {
          showIndexCreateActionButtons();
          const placed = await placeIndexAmuletInGarden(container, answers, saveEntryId);
          if (!placed) {
            setStatus('לא הצלחנו להציג את מסך התוצאה. נסי שוב או רענני.', true);
          }
        } else if (isCreatePage) {
          showCreateExportButton();
        }
      }
    } else {
      setAmuletLoaderProgress(1);
      await hideAmuletLoader();
    }

    setStatus('', false);
    console.log('[amulet] prototype PBR render complete');
  } catch (err) {
    if (token !== renderToken) return;
    if (inlineCreate) document.body.classList.remove('is-amulet-rendering');
    await hideAmuletLoader({ force: true });
    if (zone) zone.classList.remove('is-textures-loading');
    console.error('[amulet] prototype PBR render failed', err);
    setStatus('לא הצלחנו להציג את הקמע: ' + (err?.message || err), true);
  }
}

function cloneCanvasSnapshot(sourceCanvas) {
  if (!sourceCanvas?.width || !sourceCanvas?.height) return null;
  const snap = document.createElement('canvas');
  snap.width = sourceCanvas.width;
  snap.height = sourceCanvas.height;
  const ctx = snap.getContext('2d', { alpha: true });
  ctx.clearRect(0, 0, snap.width, snap.height);
  ctx.drawImage(sourceCanvas, 0, 0);
  return snap;
}

function captureGardenSnapshotFromCanvas(sourceCanvas) {
  if (capturePresentedSnapshot) {
    try {
      const snap = capturePresentedSnapshot({ targetPx: 2048 });
      if (snap) return snap;
    } catch (_) {}
  }
  try {
    const live = captureLiveAmuletSnapshot();
    if (live) return live;
  } catch (_) {}
  return cloneCanvasSnapshot(sourceCanvas);
}

async function rememberResultSnapshot() {
  await new Promise(function (resolve) {
    requestAnimationFrame(function () {
      requestAnimationFrame(resolve);
    });
  });
  const slotCanvas = document.getElementById('resultAmulet3D')?.querySelector('canvas');
  const snap = captureGardenSnapshotFromCanvas(slotCanvas);
  if (snap) rememberSavedSnapshot(snap);
}

let currentSaveHandler = null;
let currentCloseHandler = null;

function captureSnapshotCanvas(sourceCanvas) {
  return captureGardenSnapshotFromCanvas(sourceCanvas);
}

let currentExportHandler = null;

let currentCreateAnotherHandler = null;

function bindResultOverlayButtons(container, answers) {
  const saveBtn = document.getElementById('resultSaveBtn');
  const exportBtn = document.getElementById('resultExportBtn');
  const createAnotherBtn = document.getElementById('resultCreateAnotherBtn');
  const closeBtn = document.getElementById('resultCloseBtn');

  if (currentSaveHandler && saveBtn) {
    saveBtn.removeEventListener('click', currentSaveHandler);
  }
  if (currentExportHandler && exportBtn) {
    exportBtn.removeEventListener('click', currentExportHandler);
  }
  if (currentCreateAnotherHandler && createAnotherBtn) {
    createAnotherBtn.removeEventListener('click', currentCreateAnotherHandler);
  }
  if (currentCloseHandler && closeBtn) {
    closeBtn.removeEventListener('click', currentCloseHandler);
  }

  async function handleSave() {
    if (saveBtn) saveBtn.disabled = true;
    await saveAmuletAndReturnHome(container, answers, {
      slot: document.getElementById('resultAmulet3D'),
    });
    if (saveBtn) saveBtn.disabled = false;
  }

  function handleExport() {
    try {
      sessionStorage.setItem('pagmarExportViewActive', '1');
    } catch (_) {}
    window.location.href = 'export-view.html';
  }

  function handleCreateAnother() {
    hideResultOverlay();
    hideAmuletLoader({ force: true });
    restoreCreateWorkspaceAfterResult();
    if (disposePresentedAmulet) {
      disposePresentedAmulet();
    }
    capturePresentedSnapshot = null;
    disposePresentedAmulet = null;
    clearSavedSnapshot();
    if (container) {
      container.innerHTML = '';
      container.hidden = false;
    }
    document.body.classList.remove(
      'is-amulet-rendering',
      'is-amulet-ready',
      'is-create-amulet-ready',
      'is-create-complete'
    );
    if (typeof window.pagmarRestartQuestionnaire === 'function') {
      window.pagmarRestartQuestionnaire();
      return;
    }
    if (typeof window.startIndexCreateFlow === 'function') {
      window.startIndexCreateFlow();
    }
  }

  currentSaveHandler = handleSave;
  currentCloseHandler = handleSave;
  currentExportHandler = handleExport;
  currentCreateAnotherHandler = handleCreateAnother;

  if (saveBtn) {
    saveBtn.addEventListener('click', handleSave);
  }

  if (exportBtn) {
    exportBtn.disabled = false;
    exportBtn.addEventListener('click', handleExport);
  }

  if (createAnotherBtn) {
    createAnotherBtn.addEventListener('click', handleCreateAnother);
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', handleSave);
  }
}

window.showFinishedAmulet = showFinishedAmulet;
window.resetAmuletSaveState = resetAmuletSaveState;
window.restoreCreateQuestionInput = restoreCreateQuestionInput;
window.pagmarHideResultOverlay = hideResultOverlayFromHistory;
window.pagmarShouldRestoreResultView = shouldRestoreResultView;

export async function restoreResultViewFromSession(answersOverride) {
  const answers = answersOverride || loadAnswers();
  if (!allAnswered(answers)) return false;

  const container = document.getElementById('amuletContainer');
  if (!container) return false;

  const createSlot = document.getElementById('createAmuletSlot');
  if (createSlot && container.parentElement !== createSlot) {
    createSlot.appendChild(container);
  }
  container.hidden = false;

  document.body.classList.add('is-amulet-rendering');
  await showAmuletLoader('טוען קמע', { fullscreen: true, gallery: true });

  try {
    const hasLiveCanvas = Boolean(container.querySelector('canvas')?.width);
    if (!hasLiveCanvas) {
      await renderFinalAmuletLikePrototype(answers, container, function (frac) {
        setAmuletLoaderProgress(frac);
      });
    }

    const shown = await showResultOverlay(container, answers);
    if (!shown) {
      hideAmuletLoader({ force: true });
      document.body.classList.remove('is-amulet-rendering');
      return false;
    }

    await rememberResultSnapshot();
    bindResultOverlayButtons(container, answers);
    return true;
  } catch (err) {
    console.error('[amulet-show] restore result view failed', err);
    hideAmuletLoader({ force: true });
    document.body.classList.remove('is-amulet-rendering');
    return false;
  }
}

window.pagmarRestoreResultView = restoreResultViewFromSession;

export async function prepareSaveFromExportPage(presentMod, answers) {
  const slot = document.getElementById('exportAmulet3D');
  let canvas = null;
  if (presentMod?.capturePresentedAmuletSnapshot) {
    canvas = presentMod.capturePresentedAmuletSnapshot({ targetPx: 2048 });
  }
  if (!canvas?.width && slot) {
    canvas = captureGardenSnapshotFromCanvas(slot.querySelector('canvas'));
  }
  if (!canvas?.width) return false;

  const finalAnswers = answers || loadAnswers();
  persistCompletedQuestionnaire(finalAnswers);
  persistRenderedAmuletSnapshot(canvas);

  try {
    sessionStorage.setItem('pagmarFinishSaveOnIndex', '1');
    sessionStorage.removeItem('pagmarExportViewActive');
    clearResultViewActive();
  } catch (_) {}

  window.location.href = 'index.html';
  return true;
}

export function startCreateAnotherFromExportPage() {
  try {
    sessionStorage.removeItem('pagmarExportViewActive');
    clearResultViewActive();
    sessionStorage.removeItem('pagmarFinishSaveOnIndex');
    sessionStorage.setItem('pagmarRestartQuestionnaireOnLoad', '1');
  } catch (_) {}
  window.location.href = 'index.html';
}

function loadSnapshotCanvasFromStorage() {
  let dataUrl = null;
  try {
    dataUrl =
      sessionStorage.getItem(SNAPSHOT_KEY) ||
      localStorage.getItem(SNAPSHOT_KEY);
  } catch (_) {}
  if (!dataUrl) return Promise.resolve(null);

  return new Promise(function (resolve) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas);
    };
    img.onerror = function () {
      resolve(null);
    };
    img.src = dataUrl;
  });
}

export async function finishPendingSaveOnIndex() {
  try {
    if (sessionStorage.getItem('pagmarFinishSaveOnIndex') !== '1') return false;
    sessionStorage.removeItem('pagmarFinishSaveOnIndex');
  } catch (_) {
    return false;
  }

  const answers = loadAnswers();
  if (!allAnswered(answers)) return false;

  const canvas = await loadSnapshotCanvasFromStorage();
  if (!canvas?.width) return false;

  const gardenReady = await waitForGardenAdd(8000);
  if (!gardenReady) return false;

  const saveEntryId = peekPendingEntryId();
  try {
    const sprite = await window.gardenAddUserAmulet(
      canvas,
      Object.assign(await gardenSaveOptions(answers, saveEntryId), {
        focusAfterPlace: true,
        finalize: true,
      })
    );
    if (!sprite) return false;
    document.body.classList.add('has-user-amulet');
    persistCompletedQuestionnaire(answers);
    focusGardenOnSavedAmulet(sprite);
    if (typeof window.amuletHideLoader === 'function') {
      window.amuletHideLoader({ force: true });
    }
    document.body.classList.remove('is-amulet-rendering', 'is-create-mode');
    return true;
  } catch (err) {
    console.error('[amulet-show] finish pending export save failed', err);
    return false;
  }
}

window.pagmarFinishPendingSaveOnIndex = finishPendingSaveOnIndex;
