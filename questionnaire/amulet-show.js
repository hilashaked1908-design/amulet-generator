/**
 * Final textured amulet — after all 7 answers (prototype-v2-thick pipeline).
 */
import { renderFinalAmuletLikePrototype } from './amulet-final-render.js';
import {
  showAmuletLoader,
  hideAmuletLoader,
  setAmuletLoaderProgress,
} from './amulet-loader.js';
import { exportAmuletCanvasPng, exportCanvasAsTransparentPng } from './amulet-export.js';
import { captureLiveAmuletSnapshot } from '../three-pbr-amulet.js';
import { renderResultOverlayVectors } from './amulet-detail-vectors.js?v=20250708-result-answers';

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
  const trimmed = (text || '').trim();
  if (!trimmed) return '—';
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
    const label = '[' + String(getNextAmuletIndex()).padStart(3, '0') + ']';
    const inner = numEl.querySelector('.pagmar__glass-pill__text');
    if (inner) inner.textContent = label;
    else numEl.textContent = label;
  }

  const name = (a.q2Name || '').trim() || spec?.name || '—';
  const timing = (a.q3WhyNow || '').trim() || spec?.whyNow || '—';
  const wish = formatResultWish(a.q1Wish) || spec?.wish || '—';

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
  const rightEl = document.querySelector('.pagmar__result-right');
  const vectorEl = rightEl?.querySelector('.pagmar__result-vector--request');
  if (!storyEl || !requestEl) return;

  const u = getResultUnitPx();
  const tagEl = requestEl.querySelector('.pagmar__result-tag');
  const tagH = tagEl ? tagEl.offsetHeight : 0;
  const gap = 16 * u;
  const vectorReserve = vectorEl ? vectorEl.offsetTop : 544.715 * u;
  const maxStoryPx = Math.max(48, vectorReserve - tagH - gap - 8);
  let sizePx = 75 * u;
  const minPx = 28 * u;

  storyEl.style.fontSize = sizePx + 'px';
  storyEl.style.lineHeight = 'normal';

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

async function waitForOverlayLayout() {
  return new Promise(function (resolve) {
    requestAnimationFrame(function () {
      requestAnimationFrame(resolve);
    });
  });
}

function isSheshAmulet(answers) {
  return answers?.q4Belief === 'doubt';
}

function mountLiveCreateCanvasInSlot(slot, sourceCanvas) {
  if (!sourceCanvas?.width || !sourceCanvas?.height) {
    throw new Error('create canvas missing');
  }
  slot.appendChild(sourceCanvas);
  capturePresentedSnapshot = function () {
    return cloneCanvasSnapshot(sourceCanvas);
  };
  disposePresentedAmulet = null;
}

async function mountResultAmuletLikeDetail(slot, glbKey) {
  const present = await import('./amulet-detail-present.js?v=20250705-save-fix5');
  capturePresentedSnapshot = present.capturePresentedAmuletSnapshot;
  disposePresentedAmulet = present.disposePresentedAmulet;

  try {
    await present.mountDetailStyleAmulet(slot, glbKey, { useDetailPresentation: true });
    return true;
  } catch (err) {
    console.warn('[amulet-show] detail mount failed, retrying once', err);
  }

  await new Promise(function (resolve) {
    window.setTimeout(resolve, 80);
  });

  await present.mountDetailStyleAmulet(slot, glbKey, { useDetailPresentation: true });
  return true;
}

async function resolveCanvasForGardenSave(slot, container, options) {
  const opts = options || {};
  if (!opts.fresh) {
    const cached = getSavedSnapshotIfCurrent();
    if (cached?.width && cached?.height) return cached;
  }
  if (capturePresentedSnapshot) {
    try {
      const snap = capturePresentedSnapshot({ targetPx: 2048 });
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

  populateResultOverlay(answers);

  overlay.hidden = false;
  overlay.classList.remove('is-visible');
  document.body.classList.add('is-result-overlay-open');
  await waitForOverlayLayout();

  slot.innerHTML = '';

  const fogMod = await import('./result-overlay-fog.js?v=20250708-result-layout');
  try {
    await fogMod.bootResultOverlayFog();
  } catch (err) {
    console.warn('[amulet-show] result fog boot failed', err);
  }

  try {
    if (isSheshAmulet(answers)) {
      await mountResultAmuletLikeDetail(slot, 'user-amulet');
    } else {
      const liveCanvas = container?.querySelector('canvas');
      mountLiveCreateCanvasInSlot(slot, liveCanvas);
    }
  } catch (err) {
    console.error('[amulet-show] could not mount result amulet', err);

    const liveCanvas = container?.querySelector('canvas');
    if (liveCanvas?.width && liveCanvas?.height) {
      try {
        slot.appendChild(liveCanvas);
        capturePresentedSnapshot = function () {
          return cloneCanvasSnapshot(liveCanvas);
        };
        disposePresentedAmulet = null;
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

  if (workspace) workspace.classList.remove('is-open');

  overlay.classList.add('is-visible');
  document.body.classList.remove('is-amulet-rendering');
  markResultViewActive();

  try {
    const hoverMod = await import('./result-overlay-hover.js?v=20250708-result-hover');
    if (typeof hoverMod.bootResultAmuletHover === 'function') {
      hoverMod.bootResultAmuletHover();
    }
  } catch (err) {
    console.warn('[amulet-show] result hover boot failed', err);
  }

  fitResultStoryTypography();
  if (!window.__pagmarResultStoryFitBound) {
    window.__pagmarResultStoryFitBound = true;
    window.addEventListener('resize', function () {
      if (!document.body.classList.contains('is-result-overlay-open')) return;
      fitResultStoryTypography();
    });
  }

  await waitForOverlayLayout();
  try {
    await renderResultOverlayVectors(answers);
  } catch (err) {
    console.warn('[amulet-show] result vectors failed', err);
  }

  fitResultStoryTypography();

  setAmuletLoaderProgress(1);
  hideAmuletLoader();

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

  import('./result-overlay-fog.js?v=20250708-result-layout')
    .then(function (mod) {
      mod.stopResultOverlayFog();
    })
    .catch(function () {});

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

async function placeIndexAmuletInGarden(container, answers) {
  const liveCanvas = container?.querySelector('canvas');
  const canvas = captureGardenSnapshotFromCanvas(liveCanvas);
  if (!canvas) {
    console.warn('[amulet-show] placeIndexAmuletInGarden — no canvas');
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
    await window.gardenAddUserAmulet(canvas, {
      answers: answers || loadAnswers(),
      composed3D: readComposed3DForSave(),
    });
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
  [120, 350, 700].forEach(function (delayMs) {
    window.setTimeout(tryFocus, delayMs);
  });
}

function returnToIndexHomeAfterSave(container, answers) {
  hideResultOverlay();
  hideAmuletLoader({ force: true });
  closeIndexCreateAfterAmulet(container, answers);
  if (typeof window.pagmarResetCreateHistoryAfterSave === 'function') {
    window.pagmarResetCreateHistoryAfterSave();
  }
}

async function saveAmuletAndReturnHome(container, answers, options) {
  const opts = options || {};
  const slot = opts.slot || document.getElementById('resultAmulet3D');
  const finalAnswers = answers || pendingAnswers || loadAnswers();

  let canvasForGarden = await resolveCanvasForGardenSave(slot, container, { fresh: true });
  if (!canvasForGarden?.width || !canvasForGarden?.height) {
    console.warn('[amulet-show] no canvas for save');
    setStatus('לא הצלחנו לשמור את הקמע', true);
    return false;
  }

  clearSavedSnapshot();
  returnToIndexHomeAfterSave(container, finalAnswers);

  const gardenReady = await waitForGardenAdd(5000);
  if (!gardenReady) {
    setStatus('לא הצלחנו לשמור את הקמע', true);
    return false;
  }

  try {
    const sprite = await window.gardenAddUserAmulet(canvasForGarden, {
      answers: finalAnswers,
      composed3D: readComposed3DForSave(),
      focusAfterPlace: true,
      finalize: true,
    });
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
    'is-result-overlay-open'
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

  window.dispatchEvent(new CustomEvent('questionnaire:close-panel'));
  window.dispatchEvent(new CustomEvent('questionnaire:create-close'));
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
    console.warn('[amulet] showFinishedAmulet — not all answers yet', answers);
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
    await showAmuletLoader('טוען קמע', { fullscreen: true, progress: 0 });
    document.body.classList.add('is-amulet-rendering');
  }

  try {
    if (!inlineCreate) {
      await showAmuletLoader('טוען קמע', { fullscreen: true, progress: 0 });
    }
    console.log('[amulet] starting prototype PBR render');

    await renderFinalAmuletLikePrototype(answers, container, function (frac) {
      if (token !== renderToken) return;
      setAmuletLoaderProgress(frac);
    });

    if (token !== renderToken) return;

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
        hideAmuletLoader();
        const workspace = document.getElementById('indexCreateWorkspace');
        if (wasIndexCreate && workspace) workspace.classList.add('is-open');
        document.body.classList.add(
          wasIndexCreate ? 'is-create-amulet-ready' : 'is-amulet-ready'
        );
        showCreateCompletePanel(wasIndexCreate);
        if (wasIndexCreate) {
          showIndexCreateActionButtons();
          const placed = await placeIndexAmuletInGarden(container, answers);
          if (!placed) {
            setStatus('לא הצלחנו להציג את מסך התוצאה. נסי שוב או רענני.', true);
          }
        } else if (isCreatePage) {
          showCreateExportButton();
        }
      }
    } else {
      setAmuletLoaderProgress(1);
      hideAmuletLoader();
    }

    setStatus('', false);
    console.log('[amulet] prototype PBR render complete');
  } catch (err) {
    if (token !== renderToken) return;
    if (inlineCreate) document.body.classList.remove('is-amulet-rendering');
    hideAmuletLoader({ force: true });
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

function bindResultActionButtonHover() {
  document.querySelectorAll('.pagmar__result-overlay .figma-q__btn-outer').forEach(function (outer) {
    if (outer.dataset.hoverBound === '1') return;
    outer.dataset.hoverBound = '1';

    outer.addEventListener('mouseenter', function () {
      outer.classList.add('is-hovered');
    });
    outer.addEventListener('mouseleave', function () {
      outer.classList.remove('is-hovered');
    });
    outer.addEventListener('focusin', function () {
      outer.classList.add('is-hovered');
    });
    outer.addEventListener('focusout', function () {
      outer.classList.remove('is-hovered');
    });
  });

  if (window.pagmarButtonRoll) {
    window.pagmarButtonRoll.enhance(document);
  }
}

function bindResultOverlayButtons(container, answers) {
  bindResultActionButtonHover();
  const saveBtn = document.getElementById('resultSaveBtn');
  const exportBtn = document.getElementById('resultExportBtn');
  const closeBtn = document.getElementById('resultCloseBtn');

  if (currentSaveHandler && saveBtn) {
    saveBtn.removeEventListener('click', currentSaveHandler);
  }
  if (currentExportHandler && exportBtn) {
    exportBtn.removeEventListener('click', currentExportHandler);
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
    const slot = document.getElementById('resultAmulet3D');
    const liveCanvas = slot?.querySelector('canvas');
    const exportContainer = liveCanvas ? slot : container;
    try {
      const snap = captureGardenSnapshotFromCanvas(liveCanvas);
      if (snap) {
        exportCanvasAsTransparentPng(snap, { filename: 'amulet' });
        return;
      }

      exportAmuletCanvasPng(exportContainer, { filename: 'amulet' });
    } catch (err) {
      console.error('[amulet-show] export failed', err);
    }
  }

  currentSaveHandler = handleSave;
  currentCloseHandler = handleSave;
  currentExportHandler = handleExport;

  if (saveBtn) {
    saveBtn.addEventListener('click', handleSave);
  }

  if (exportBtn) {
    exportBtn.disabled = false;
    exportBtn.addEventListener('click', handleExport);
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
  await showAmuletLoader('טוען קמע', { fullscreen: true, progress: 0 });

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
