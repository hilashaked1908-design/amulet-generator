/**
 * Renders individual amulet layer vectors as a single united outline
 * (raster union → outer contour → stroke, like the loader vessels).
 */
import {
  clearChoicePresetThumbVectors,
  syncChoicePresetThumbVectors,
} from './choice-preset-vectors.js?v=20250709-choice-vectors';

const DETAIL_VECTOR_COLOR = '#F4F4E8'; /* צהוב לבן - --pagmar-yellow-white */
/** Internal mask raster only (never shown). Must stay pure white - lum threshold is 248. */
const DETAIL_RASTER_MASK_BG = '#ffffff';
const DETAIL_VECTOR_STROKE = 1.5;
const DETAIL_VECTOR_STROKE_MARGIN = 6;
const DETAIL_VECTOR_BOX_W = 151.168;
const DETAIL_VECTOR_BOX_H = 132.379;
const DETAIL_VECTOR_BOX_BY_VARIANT = {
  'pagmar__detail-vector--timing': 151.168,
  'pagmar__detail-vector--belonging': 150.314,
  'pagmar__detail-vector--request': 151.168,
};
const DETAIL_VECTOR_PAD = 12;
/** Room under the shape so the stroke is not clipped on the shared baseline. */
const DETAIL_VECTOR_BOTTOM_PAD = DETAIL_VECTOR_PAD + DETAIL_VECTOR_STROKE + DETAIL_VECTOR_STROKE_MARGIN;
/** Shrink-to-fit inset so stroke + joins stay inside the frame. */
const DETAIL_VECTOR_FIT_INSET = 0.86;
const DETAIL_VECTOR_VIEW_BLEED = 20;
const DETAIL_VECTOR_SCALE = DETAIL_VECTOR_FIT_INSET;
const DETAIL_MASK_SCALE = 4;
const DEFAULT_MASK_STROKE = 17;
const PATH_MAIN_W = 45 * 0.37;
const CONTOUR_SUBSAMPLE_DIST = 4;
const CONTOUR_CHAIKIN_PASSES = 2;
const STAGE_CONTOUR_SUBSAMPLE_DIST = 3;
const STAGE_CONTOUR_CHAIKIN_PASSES = 3;
const QUESTIONNAIRE_THUMB_BOX_W = 90.3;
const QUESTIONNAIRE_THUMB_BOX_H = 89.813;

const LAYER_VECTOR_CONFIG = {
  '.layer-q3-stone-engrave': { dilate: 16, pad: 56, minCropH: 72, minCropW: 100 },
  '.layer-2': { dilate: 16, pad: 48, minCropH: 100, minCropW: 88 },
  '.layer-3': { dilate: 18, pad: 60, minCropH: 160, minCropW: 100 },
};

function waitForPaint() {
  return new Promise(function (resolve) {
    requestAnimationFrame(function () {
      requestAnimationFrame(resolve);
    });
  });
}

function yieldToBrowser() {
  return new Promise(function (resolve) {
    window.setTimeout(resolve, 0);
  });
}

function stripQuotes(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/^[\u05F4"\u201C]+|[\u05F4"\u201D]+$/g, '').trim();
}

function setDetailFieldText(el, sourceText) {
  if (!el) return;
  el.textContent = String(sourceText || '').trim() || '-';
}

const composeCache = new Map();

export function invalidateDetailComposeCache() {
  composeCache.clear();
}

window.amuletInvalidateDetailComposeCache = invalidateDetailComposeCache;

export async function getSharedDetailCompose(record, options = {}) {
  const entryPrefix =
    options.entryId != null ? 'entry:' + String(options.entryId) + '|' : '';
  const key = entryPrefix + JSON.stringify(record || {});
  if (!composeCache.has(key)) {
    composeCache.set(key, loadCompose(record));
  }
  return composeCache.get(key);
}

async function loadCompose(record) {
  await yieldToBrowser();
  const compose = await import('./amulet-compose.js');
  await yieldToBrowser();
  await compose.initAmuletCompose();
  await yieldToBrowser();
  return compose.composeFullAmuletForPbr(record);
}

async function waitForFonts() {
  if (document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (_) {}
  }
}

export async function bootDetailVectors() {
  await waitForDetailContent();
  await waitForDetailCatalog();
  await waitForFonts();
  if (window.pagmarDetailComposePreload) {
    try {
      await window.pagmarDetailComposePreload;
    } catch (_) {}
  }
  await waitForPaint();
  await renderVectors();
}

export async function refreshDetailVectors() {
  await waitForFonts();
  await waitForPaint();
  return renderVectors({ markBootDone: false });
}

async function waitForDetailContent() {
  const boot = window.pagmarDetailBoot;
  if (!boot || !boot._pending || !boot._pending.content) return;
  const deadline = Date.now() + 15000;
  while (boot._pending && boot._pending.content && Date.now() < deadline) {
    await new Promise(function (resolve) {
      window.setTimeout(resolve, 40);
    });
  }
}

async function waitForDetailCatalog() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (
      typeof window.getAmuletRecord === 'function' &&
      (window.AMULET_QUESTIONS || []).length
    ) {
      return;
    }
    await new Promise(function (resolve) {
      window.setTimeout(resolve, 40);
    });
  }
}

function readNavAnswersForEntry(entryId) {
  if (entryId == null) return null;
  try {
    const navRaw = sessionStorage.getItem('pagmarAmuletDetailNav');
    if (!navRaw) return null;
    const nav = JSON.parse(navRaw);
    if (nav && nav.entryId == entryId && nav.answers) {
      return nav.answers;
    }
  } catch (_) {}
  return null;
}

function resolveDetailAnswers(idx) {
  const entryId = resolveDetailEntryId(idx);
  if (entryId != null) {
    const navAnswers = readNavAnswersForEntry(entryId);
    if (navAnswers && navAnswers.q1Wish) return navAnswers;
    if (
      window.__pagmarDetailAnswersByEntryId &&
      window.__pagmarDetailAnswersByEntryId[entryId] &&
      window.__pagmarDetailAnswersByEntryId[entryId].q1Wish
    ) {
      return window.__pagmarDetailAnswersByEntryId[entryId];
    }
    if (typeof window.pagmarFindCollectionEntryById === 'function') {
      const entry = window.pagmarFindCollectionEntryById(entryId);
      if (entry && entry.answers && entry.answers.q1Wish) return entry.answers;
    }
  }
  if (typeof window.pagmarResolveCollectionEntry === 'function') {
    const entry = window.pagmarResolveCollectionEntry(idx);
    if (entry && entry.answers && entry.answers.q1Wish) return entry.answers;
  }
  if (typeof window.getAmuletRecord === 'function') {
    const record = window.getAmuletRecord(idx);
    if (record && record.q1Wish) return record;
  }
  return null;
}

function authoritativeDetailAnswers(entryId, idx) {
  if (entryId != null) {
    const navAnswers = readNavAnswersForEntry(entryId);
    if (navAnswers && navAnswers.q1Wish) return navAnswers;
    if (
      window.__pagmarDetailAnswersByEntryId &&
      window.__pagmarDetailAnswersByEntryId[entryId] &&
      window.__pagmarDetailAnswersByEntryId[entryId].q1Wish
    ) {
      return window.__pagmarDetailAnswersByEntryId[entryId];
    }
    if (typeof window.pagmarFindCollectionEntryById === 'function') {
      const entry = window.pagmarFindCollectionEntryById(entryId);
      if (entry && entry.answers && entry.answers.q1Wish) return entry.answers;
    }
    return null;
  }
  return resolveDetailAnswers(idx);
}

function readFreshComposedFromStorage() {
  try {
    const raw =
      sessionStorage.getItem('amuletComposed3D') ||
      localStorage.getItem('amuletComposed3D');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.svg) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

async function resolveResultCompose(answers) {
  try {
    const composed = await getSharedDetailCompose(answers);
    if (composed?.svg && composedSvgHasLayers(composed.svg)) return composed;
  } catch (err) {
    console.warn('[result-vectors] compose failed, trying cache', err);
  }

  const cached = readFreshComposedFromStorage();
  if (cached?.svg && composedSvgHasLayers(cached.svg)) return cached;

  return getSharedDetailCompose(answers);
}

function resolveDetailEntryId(idx) {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('entry');
    if (raw != null && raw !== '') {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) return n;
    }
  } catch (_) {}

  try {
    const navRaw = sessionStorage.getItem('pagmarAmuletDetailNav');
    if (navRaw) {
      const nav = JSON.parse(navRaw);
      const urlEntryRaw = new URLSearchParams(window.location.search).get('entry');
      const urlEntry =
        urlEntryRaw != null && urlEntryRaw !== '' ? parseInt(urlEntryRaw, 10) : null;
      if (nav && nav.entryId != null) {
        if (Number.isFinite(urlEntry) && nav.entryId == urlEntry) return nav.entryId;
        if (nav.index === idx) return nav.entryId;
      }
    }
  } catch (_) {}

  if (typeof window.pagmarResolveCollectionEntry === 'function') {
    const entry = window.pagmarResolveCollectionEntry(idx);
    if (entry && entry.id != null) return entry.id;
  }
  return null;
}

async function readComposedForEntry(entryId) {
  if (entryId == null) return null;
  try {
    const store = await import('./amulet-glb-store.js');
    const raw = await store.loadSnapshot('composed3d-' + entryId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.svg) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

const DETAIL_LAYER_SELECTORS = ['.layer-2', '.layer-3', '.layer-q3-stone-engrave'];

function composedSvgHasLayers(svgMarkup) {
  if (!svgMarkup) return false;
  try {
    const doc = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return false;
    return DETAIL_LAYER_SELECTORS.every(function (selector) {
      return Boolean(svgEl.querySelector(selector));
    });
  } catch (_) {
    return false;
  }
}

export async function preloadDetailCompose(entryId, answers) {
  if (entryId == null) return null;
  window.__pagmarDetailComposedByEntryId = window.__pagmarDetailComposedByEntryId || {};
  if (
    window.__pagmarDetailComposedByEntryId[entryId] &&
    composedSvgHasLayers(window.__pagmarDetailComposedByEntryId[entryId].svg)
  ) {
    return window.__pagmarDetailComposedByEntryId[entryId];
  }
  try {
    const fromIdb = await readComposedForEntry(entryId);
    if (fromIdb?.svg && composedSvgHasLayers(fromIdb.svg)) {
      window.__pagmarDetailComposedByEntryId[entryId] = fromIdb;
      return fromIdb;
    }
  } catch (_) {}
  return null;
}

/** Per-amulet compose for detail page - preloaded/cache first, then live compose, then IDB. */
async function resolveDetailPageCompose(record, idx, entryIdOverride) {
  const entryId = entryIdOverride != null ? entryIdOverride : resolveDetailEntryId(idx);

  if (entryId != null && window.__pagmarDetailComposedByEntryId?.[entryId]) {
    const cached = window.__pagmarDetailComposedByEntryId[entryId];
    if (cached?.svg && composedSvgHasLayers(cached.svg)) return cached;
  }

  if (entryId != null) {
    const perEntry = await readComposedForEntry(entryId);
    if (perEntry?.svg && composedSvgHasLayers(perEntry.svg)) {
      window.__pagmarDetailComposedByEntryId = window.__pagmarDetailComposedByEntryId || {};
      window.__pagmarDetailComposedByEntryId[entryId] = perEntry;
      return perEntry;
    }
  }

  if (window.pagmarDetailComposePreload) {
    try {
      const preloaded = await window.pagmarDetailComposePreload;
      if (preloaded?.svg && composedSvgHasLayers(preloaded.svg)) return preloaded;
    } catch (_) {}
  }

  if (record && record.q1Wish) {
    try {
      const compose = await import('./amulet-compose.js');
      await compose.initAmuletCompose();
      const composed = await getSharedDetailCompose(record, { entryId: entryId });
      if (composed?.svg && composedSvgHasLayers(composed.svg)) {
        if (entryId != null) {
          window.__pagmarDetailComposedByEntryId = window.__pagmarDetailComposedByEntryId || {};
          window.__pagmarDetailComposedByEntryId[entryId] = composed;
        }
        return composed;
      }
    } catch (err) {
      console.warn('[detail-vectors] compose from answers failed', err);
    }
  }

  return getSharedDetailCompose(record, { entryId: entryId });
}

export async function renderResultOverlayVectors(answers) {
  if (!answers || !answers.q1Wish) return;

  try {
    await yieldToBrowser();
    const composed = await resolveResultCompose(answers);
    if (!composed || !composed.svg) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(composed.svg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return;

    const viewBox = svgEl.getAttribute('viewBox') || '0 0 680 680';
    const defsEl = svgEl.querySelector('defs');

    await extractAndRender(
      'resultVectorTiming',
      svgEl,
      '.layer-q3-stone-engrave',
      viewBox,
      defsEl,
      composed.style2,
      composed.style3
    );
    await yieldToBrowser();
    await extractAndRender(
      'resultVectorBelonging',
      svgEl,
      '.layer-2',
      viewBox,
      defsEl,
      composed.style2,
      composed.style3
    );
    await yieldToBrowser();
    await extractAndRender(
      'resultVectorRequest',
      svgEl,
      '.layer-3',
      viewBox,
      defsEl,
      composed.style2,
      composed.style3
    );

    applyQuestionnaireFieldLabels(
      composed.questionnaire || {
        requesterName: answers.q2Name,
        timingReason: answers.q3WhyNow,
        wishText: answers.q1Wish,
      },
      {
        name: 'resultName',
        timing: 'resultTiming',
      }
    );
  } catch (err) {
    console.warn('[result-vectors] failed:', err);
  }
}

export async function renderExportCardVectors(answers) {
  if (!answers || !answers.q1Wish) return;

  try {
    await yieldToBrowser();
    const composed = await resolveResultCompose(answers);
    if (!composed || !composed.svg) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(composed.svg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return;

    const viewBox = svgEl.getAttribute('viewBox') || '0 0 680 680';
    const defsEl = svgEl.querySelector('defs');

    await extractAndRender(
      'exportVectorQ1',
      svgEl,
      '.layer-3',
      viewBox,
      defsEl,
      composed.style2,
      composed.style3
    );
    await yieldToBrowser();
    await extractAndRender(
      'exportVectorQ2',
      svgEl,
      '.layer-2',
      viewBox,
      defsEl,
      composed.style2,
      composed.style3
    );
    await yieldToBrowser();
    await extractAndRender(
      'exportVectorQ3',
      svgEl,
      '.layer-q3-stone-engrave',
      viewBox,
      defsEl,
      composed.style2,
      composed.style3
    );
  } catch (err) {
    console.warn('[export-vectors] failed:', err);
  }
}

function detailVectorsComplete() {
  return ['detailVectorTiming', 'detailVectorBelonging', 'detailVectorRequest'].every(function (id) {
    const el = document.getElementById(id);
    return el && el.querySelector('svg path[d]');
  });
}

async function renderVectorsOnce(options) {
  const markBootDone = options.markBootDone !== false;
  await import('./seed-bootstrap.js')
    .then(function (mod) {
      return mod.ensureSeedCollectionLoaded();
    })
    .catch(function () {});

  const idx = parseAmuletIndex();
  const base = (window.AMULET_QUESTIONS || []).length;
  if (idx < base) return false;

  const entryId = resolveDetailEntryId(idx);
  const record = authoritativeDetailAnswers(entryId, idx);
  if (!record || !record.q1Wish) return false;

  clearDetailVectorSlots();

  await waitForFonts();
  await yieldToBrowser();
  const composed = await resolveDetailPageCompose(record, idx, entryId);
  if (!composed || !composed.svg) return false;

  const parser = new DOMParser();
  const doc = parser.parseFromString(composed.svg, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return false;

  const viewBox = svgEl.getAttribute('viewBox') || '0 0 680 680';
  const defsEl = svgEl.querySelector('defs');

  await extractAndRender(
    'detailVectorTiming',
    svgEl,
    '.layer-q3-stone-engrave',
    viewBox,
    defsEl,
    composed.style2,
    composed.style3
  );
  await yieldToBrowser();
  await extractAndRender(
    'detailVectorBelonging',
    svgEl,
    '.layer-2',
    viewBox,
    defsEl,
    composed.style2,
    composed.style3
  );
  await yieldToBrowser();
  await extractAndRender(
    'detailVectorRequest',
    svgEl,
    '.layer-3',
    viewBox,
    defsEl,
    composed.style2,
    composed.style3
  );

  if (composed.questionnaire) {
    applyQuestionnaireFieldLabels(composed.questionnaire, {
      request: 'detailRequestCriterion',
      name: 'detailName',
      timing: 'detailTiming',
    });
  }

  return detailVectorsComplete();
}

async function renderVectors(options = {}) {
  const markBootDone = options.markBootDone !== false;
  try {
    let rendered = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (attempt > 0) {
        if (window.pagmarDetailComposePreload) {
          try {
            await window.pagmarDetailComposePreload;
          } catch (_) {}
        }
        await waitForFonts();
        await waitForPaint();
        await new Promise(function (resolve) {
          window.setTimeout(resolve, 140 * attempt);
        });
      }
      rendered = await renderVectorsOnce(options);
      if (rendered) break;
    }
    if (!rendered) {
      console.warn('[detail-vectors] incomplete after retries');
    }
  } catch (err) {
    console.warn('[detail-vectors] failed:', err);
  } finally {
    try {
      window.dispatchEvent(new CustomEvent('pagmar:detail-vectors-ready'));
    } catch (_) {}
    if (markBootDone && window.pagmarDetailBoot) window.pagmarDetailBoot.done('vectors');
  }
}

function applyQuestionnaireFieldLabels(q, ids) {
  if (ids.request) {
    setDetailFieldText(document.getElementById(ids.request), stripQuotes(q.wishText));
  }
  if (ids.name) {
    setDetailFieldText(document.getElementById(ids.name), q.requesterName);
  }
  if (ids.timing) {
    setDetailFieldText(document.getElementById(ids.timing), q.timingReason);
  }
}

function clearDetailVectorSlots() {
  ['detailVectorRequest', 'detailVectorBelonging', 'detailVectorTiming'].forEach(function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    const oldSvg = el.querySelector('svg');
    if (oldSvg) oldSvg.remove();
  });
}

function parseAmuletIndex() {
  try {
    const params = new URLSearchParams(window.location.search);
    const base = (window.AMULET_QUESTIONS || []).length;
    const raw = params.get('id');
    if (raw != null && raw !== '') {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= base) return n;
    }
    const entryRaw = params.get('entry');
    if (entryRaw != null && entryRaw !== '') {
      const entryId = parseInt(entryRaw, 10);
      if (
        Number.isFinite(entryId) &&
        typeof window.pagmarIndexForEntryId === 'function'
      ) {
        const fromEntry = window.pagmarIndexForEntryId(entryId);
        if (fromEntry != null) return fromEntry;
      }
    }
    return base;
  } catch (_) {
    return 0;
  }
}

function estimateMaskStroke(layers, selector, style2, style3) {
  if (selector === '.layer-2') {
    const gender = style2?.gender || 'female';
    const tubeR = gender === 'nonbinary' ? 13.2 : gender === 'male' ? 8.4 : 4.2;
    const bump2 = style2?.occupationSmoothness != null ? 1 - style2.occupationSmoothness : 0.5;
    const organic = 10 + bump2 * 14;
    const scaled = 2 * (tubeR * 1.2 + organic) * (style2?.amuletScale || 1);
    if (scaled > 0) return scaled;
  }
  if (selector === '.layer-3') {
    const scaled = PATH_MAIN_W * (style3?.amuletScale || 1) + 28;
    if (scaled > 0) return scaled;
  }
  if (selector === '.layer-q3-stone-engrave') {
    const scaled = PATH_MAIN_W * (style2?.amuletScale || style3?.amuletScale || 1) + 24;
    if (scaled > 0) return scaled;
  }

  let max = 0;
  layers.forEach(function (layer) {
    layer.querySelectorAll('[stroke-width]').forEach(function (el) {
      const sw = parseFloat(el.getAttribute('stroke-width'));
      if (Number.isFinite(sw) && sw > max) max = sw;
    });
  });
  return max > 0 ? max : DEFAULT_MASK_STROKE;
}

function layerVectorConfig(selector) {
  return LAYER_VECTOR_CONFIG[selector] || { dilate: 8, pad: 24, minCropH: 64, minCropW: 64 };
}

function normalizeCropForLayer(crop, viewSize, config) {
  if (!crop) return crop;
  const minH = config.minCropH || 64;
  const minW = config.minCropW || 64;
  let x = crop.x;
  let y = crop.y;
  let width = crop.width;
  let height = crop.height;
  if (height < minH) {
    const extra = minH - height;
    y = Math.max(0, y - extra * 0.55);
    height = Math.min(viewSize.h - y, height + extra);
  }
  if (width < minW) {
    const extra = minW - width;
    x = Math.max(0, x - extra * 0.5);
    width = Math.min(viewSize.w - x, width + extra);
  }
  return { x: x, y: y, width: width, height: height };
}

function countGridFilled(grid) {
  let n = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]) n++;
  return n;
}

async function mountComposedSvg(svgEl) {
  const ns = 'http://www.w3.org/2000/svg';
  const mount = svgEl.cloneNode(true);
  mount.setAttribute('xmlns', ns);
  const viewBox = svgEl.getAttribute('viewBox') || '0 0 680 680';
  mount.setAttribute('viewBox', viewBox);
  mount.setAttribute('width', '680');
  mount.setAttribute('height', '680');
  mount.style.cssText =
    'position:fixed;left:-10000px;top:0;width:680px;height:680px;pointer-events:none;z-index:-1';
  document.body.appendChild(mount);
  await waitForPaint();
  return mount;
}

function hideOtherLayers(mount, selector) {
  mount.querySelectorAll('.amulet-layer').forEach(function (layer) {
    if (!layer.matches(selector)) layer.setAttribute('display', 'none');
  });
  mount.querySelectorAll('.layer-frame').forEach(function (layer) {
    layer.setAttribute('display', 'none');
  });
  mount.querySelectorAll('.layer-metal-fringe').forEach(function (layer) {
    layer.setAttribute('display', 'none');
  });
}

function showOnlyLayers(mount, selectors) {
  const selectorList = selectors.join(',');
  mount.querySelectorAll('.amulet-layer').forEach(function (layer) {
    if (layer.matches(selectorList)) {
      layer.removeAttribute('display');
    } else {
      layer.setAttribute('display', 'none');
    }
  });
  mount.querySelectorAll('.layer-frame').forEach(function (layer) {
    layer.setAttribute('display', 'none');
  });
  mount.querySelectorAll('.layer-metal-fringe').forEach(function (layer) {
    layer.setAttribute('display', 'none');
  });
}

function combinedLayerConfig(selectors) {
  let dilate = 0;
  let pad = 0;
  selectors.forEach(function (selector) {
    const config = layerVectorConfig(selector);
    dilate = Math.max(dilate, config.dilate);
    pad = Math.max(pad, config.pad);
  });
  return { dilate: dilate, pad: pad };
}

function estimateCombinedMaskStroke(layers, selectors, style2, style3) {
  let max = 0;
  selectors.forEach(function (selector) {
    const selLayers = layers.filter(function (layer) {
      return layer.matches(selector);
    });
    max = Math.max(max, estimateMaskStroke(selLayers, selector, style2, style3));
  });
  return max > 0 ? max : DEFAULT_MASK_STROKE;
}

function layersContentBBox(mountedSvg, selectors, pad, maskStroke, dilate) {
  let combined = null;
  selectors.forEach(function (selector) {
    const box = layerContentBBox(mountedSvg, selector, pad, maskStroke, dilate);
    if (!box) return;
    if (!combined) {
      combined = {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      };
      return;
    }
    const x0 = Math.min(combined.x, box.x);
    const y0 = Math.min(combined.y, box.y);
    const x1 = Math.max(combined.x + combined.width, box.x + box.width);
    const y1 = Math.max(combined.y + combined.height, box.y + box.height);
    combined = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  });
  return combined;
}

function prepareLayerForMask(mountedSvg, selector, maskStroke) {
  hideOtherLayers(mountedSvg, selector);
  mountedSvg.querySelectorAll(selector).forEach(function (layer) {
    applyMaskStroke(layer, maskStroke);
  });
  mountedSvg.querySelectorAll('[filter]').forEach(function (el) {
    el.removeAttribute('filter');
  });
}

function buildMaskSvgMarkup(mountedSvg, extraBottom) {
  const clone = mountedSvg.cloneNode(true);
  clone.removeAttribute('style');
  const viewBox = clone.getAttribute('viewBox') || '0 0 680 680';
  const viewSize = parseViewBoxSize(viewBox);
  const extraH = Math.max(0, extraBottom || 0);
  const totalH = viewSize.h + extraH;
  clone.setAttribute('width', String(viewSize.w));
  clone.setAttribute('height', String(totalH));
  clone.setAttribute('viewBox', '0 0 ' + viewSize.w + ' ' + totalH);

  const ns = 'http://www.w3.org/2000/svg';
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', String(viewSize.w));
  bg.setAttribute('height', String(totalH));
  bg.setAttribute('fill', DETAIL_RASTER_MASK_BG);
  clone.insertBefore(bg, clone.firstChild);

  return '<?xml version="1.0" encoding="UTF-8"?>' + new XMLSerializer().serializeToString(clone);
}

function loadSvgMarkupAsImage(svgMarkup) {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup);
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      reject(new Error('SVG rasterize failed'));
    };
    img.src = url;
  });
}

function rasterBBoxPad(maskStroke, dilate, pad) {
  return Math.ceil((maskStroke || 0) / 2) + (dilate || 0) + (pad || 0) + 28;
}

function rasterCropFromMountedSvg(mountedSvg, crop, scale, viewExtra) {
  const viewSize = parseViewBoxSize(mountedSvg.getAttribute('viewBox'));
  const extraH = Math.max(0, viewExtra || 0);
  const markup = buildMaskSvgMarkup(mountedSvg, extraH);
  const totalH = viewSize.h + extraH;
  return loadSvgMarkupAsImage(markup).then(function (img) {
    const bw = Math.max(1, Math.round(crop.width * scale));
    const bh = Math.max(1, Math.round(crop.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = bw;
    canvas.height = bh;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = DETAIL_RASTER_MASK_BG;
    ctx.fillRect(0, 0, bw, bh);

    const sx = (img.naturalWidth || viewSize.w) / viewSize.w;
    const sy = (img.naturalHeight || totalH) / totalH;
    ctx.drawImage(
      img,
      crop.x * sx,
      crop.y * sy,
      crop.width * sx,
      crop.height * sy,
      0,
      0,
      bw,
      bh
    );
    return ctx.getImageData(0, 0, bw, bh).data;
  });
}

function parseViewBoxSize(viewBox) {
  const parts = String(viewBox || '0 0 680 680').trim().split(/[\s,]+/).map(Number);
  return {
    w: Number.isFinite(parts[2]) && parts[2] > 0 ? parts[2] : 680,
    h: Number.isFinite(parts[3]) && parts[3] > 0 ? parts[3] : 680,
  };
}

function dilateAxis(grid, bw, bh, radius, horizontal) {
  const out = new Uint8Array(bw * bh);
  if (horizontal) {
    for (let y = 0; y < bh; y++) {
      const row = y * bw;
      for (let x = 0; x < bw; x++) {
        if (!grid[row + x]) continue;
        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(bw - 1, x + radius);
        for (let nx = x0; nx <= x1; nx++) out[row + nx] = 1;
      }
    }
  } else {
    for (let y = 0; y < bh; y++) {
      const row = y * bw;
      for (let x = 0; x < bw; x++) {
        if (!grid[row + x]) continue;
        const y0 = Math.max(0, y - radius);
        const y1 = Math.min(bh - 1, y + radius);
        for (let ny = y0; ny <= y1; ny++) out[ny * bw + x] = 1;
      }
    }
  }
  return out;
}

function dilateCircularGrid(grid, bw, bh, radius) {
  if (!radius) return grid;
  return dilateAxis(dilateAxis(grid, bw, bh, radius, true), bw, bh, radius, false);
}

function applyMaskStroke(root, strokeWidth) {
  const sw = String(strokeWidth);
  root.querySelectorAll('[filter]').forEach(function (el) {
    el.removeAttribute('filter');
  });
  root.querySelectorAll('.path-main').forEach(function (g) {
    g.setAttribute('stroke', '#000000');
    g.setAttribute('stroke-width', sw);
    g.setAttribute('stroke-opacity', '1');
    g.setAttribute('fill', 'none');
    g.removeAttribute('filter');
  });
  root.querySelectorAll('path,circle,ellipse,line,polyline,polygon').forEach(function (p) {
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', '#000000');
    p.setAttribute('stroke-width', sw);
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
  });
}

function contourFromRaster(data, bw, bh, dilateRadius) {
  let grid = gridFromImageData(data, bw, bh);
  grid = dilateCircularGrid(grid, bw, bh, dilateRadius);
  const raw = traceLargestBoundary(grid, bw, bh, 0, 0);
  if (raw.length < 8) return null;
  return smoothContour(raw);
}

function gridFromImageData(data, bw, bh) {
  const grid = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = (y * bw + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (lum < 248) grid[y * bw + x] = 1;
    }
  }
  return grid;
}

function isBoundaryPixel(grid, bw, bh, x, y) {
  if (!grid[y * bw + x]) return false;
  if (x === 0 || y === 0 || x === bw - 1 || y === bh - 1) return true;
  return (
    !grid[y * bw + (x - 1)] ||
    !grid[y * bw + (x + 1)] ||
    !grid[(y - 1) * bw + x] ||
    !grid[(y + 1) * bw + x]
  );
}

function traceBoundaryLoop(grid, bw, bh, sx, sy, x0, y0) {
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];
  let x = sx;
  let y = sy;
  let dir = 6;
  const contour = [];
  let guard = 0;
  const maxGuard = Math.min(bw + bh, 8000) * 4;

  do {
    contour.push({ x: x + x0 + 0.5, y: y + y0 + 0.5 });
    let found = false;
    for (let i = 0; i < 8; i++) {
      const nd = (dir + i) % 8;
      const nx = x + dx[nd];
      const ny = y + dy[nd];
      if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
      if (grid[ny * bw + nx] && isBoundaryPixel(grid, bw, bh, nx, ny)) {
        x = nx;
        y = ny;
        dir = (nd + 5) % 8;
        found = true;
        break;
      }
    }
    if (!found) break;
    guard++;
  } while ((x !== sx || y !== sy || contour.length < 3) && guard < maxGuard);

  return contour;
}

function subsampleContour(points, minDist) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= minDist) {
      out.push(points[i]);
    }
  }
  return out.length >= 3 ? out : points;
}

function traceLargestBoundary(grid, bw, bh, x0, y0) {
  const visited = new Uint8Array(bw * bh);
  let best = [];
  let components = 0;
  outer: for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      if (!isBoundaryPixel(grid, bw, bh, x, y) || visited[y * bw + x]) continue;
      components++;
      if (components > 12) break outer;
      const contour = traceBoundaryLoop(grid, bw, bh, x, y, x0, y0);
      for (let i = 0; i < contour.length; i++) {
        const p = contour[i];
        const px = Math.floor(p.x - x0);
        const py = Math.floor(p.y - y0);
        if (px >= 0 && px < bw && py >= 0 && py < bh) visited[py * bw + px] = 1;
      }
      if (contour.length > best.length) best = contour;
    }
  }
  return best.length >= 3 ? best : [];
}

function chaikinSmoothClosed(points, passes) {
  let pts = points;
  for (let pass = 0; pass < passes; pass++) {
    const next = [];
    const n = pts.length;
    if (n < 3) return pts;
    for (let i = 0; i < n; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % n];
      next.push({
        x: 0.75 * p0.x + 0.25 * p1.x,
        y: 0.75 * p0.y + 0.25 * p1.y,
      });
      next.push({
        x: 0.25 * p0.x + 0.75 * p1.x,
        y: 0.25 * p0.y + 0.75 * p1.y,
      });
    }
    pts = next;
  }
  return pts;
}

function smoothContour(points, options) {
  if (!points || points.length < 8) return points;
  const minDist = options?.subsampleDist ?? CONTOUR_SUBSAMPLE_DIST;
  const passes = options?.chaikinPasses ?? CONTOUR_CHAIKIN_PASSES;
  const subsampled = subsampleContour(points, minDist);
  let smoothed = chaikinSmoothClosed(subsampled, passes);
  if (contourSelfIntersects(smoothed)) {
    smoothed = chaikinSmoothClosed(subsampled, Math.max(1, passes - 1));
    if (contourSelfIntersects(smoothed)) smoothed = subsampled;
  }
  return smoothed;
}

function smoothContourStage(points) {
  return smoothContour(points, {
    subsampleDist: STAGE_CONTOUR_SUBSAMPLE_DIST,
    chaikinPasses: STAGE_CONTOUR_CHAIKIN_PASSES,
  });
}

/** Straight segments - Catmull-Rom overshoots concave corners and self-intersects. */
function closedPolylinePath(points) {
  const n = points.length;
  if (n < 3) return '';
  let d = 'M ' + points[0].x.toFixed(2) + ' ' + points[0].y.toFixed(2);
  for (let i = 1; i < n; i++) {
    d += ' L ' + points[i].x.toFixed(2) + ' ' + points[i].y.toFixed(2);
  }
  return d + ' Z';
}

/** Quadratic mid-point smoothing - rounded corners without Catmull-Rom overshoot. */
function closedRoundedPath(points) {
  const n = points.length;
  if (n < 3) return closedPolylinePath(points);
  let d = 'M ' + points[0].x.toFixed(2) + ' ' + points[0].y.toFixed(2);
  for (let i = 0; i < n; i++) {
    const cur = points[i];
    const nxt = points[(i + 1) % n];
    const mx = cur.x + (nxt.x - cur.x) * 0.5;
    const my = cur.y + (nxt.y - cur.y) * 0.5;
    d +=
      ' Q ' +
      cur.x.toFixed(2) +
      ' ' +
      cur.y.toFixed(2) +
      ' ' +
      mx.toFixed(2) +
      ' ' +
      my.toFixed(2);
  }
  return d + ' Z';
}

function contourPathD(contour, rounded) {
  if (!contour || contour.length < 3) return '';
  const pts = rounded ? smoothContourStage(contour) : contour;
  return rounded ? closedRoundedPath(pts) : closedPolylinePath(pts);
}

function segmentsIntersect(a, b, c, d) {
  function cross(o, p, q) {
    return (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  }
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  return false;
}

function contourSelfIntersects(points) {
  const n = points.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

async function unionLayerContour(layers, defsEl, svgEl, selector, style2, style3) {
  const config = layerVectorConfig(selector);
  let maskStroke = estimateMaskStroke(layers, selector, style2, style3);
  const scale = DETAIL_MASK_SCALE;
  const viewSize = parseViewBoxSize(svgEl.getAttribute('viewBox'));
  const fullCrop = { x: 0, y: 0, width: viewSize.w, height: viewSize.h };

  for (let attempt = 0; attempt < 5; attempt++) {
    const mountedSvg = await mountComposedSvg(svgEl);
    try {
      prepareLayerForMask(mountedSvg, selector, maskStroke);
      await waitForPaint();

      let crop =
        layerContentBBox(mountedSvg, selector, config.pad, maskStroke, config.dilate) || fullCrop;
      crop = normalizeCropForLayer(crop, viewSize, config);
      if (!crop || crop.width < 8 || crop.height < 8) continue;

      const contour = await rasterContourFromCrop(
        mountedSvg,
        crop,
        scale,
        config.dilate,
        maskStroke
      );
      if (contour && isContourUsable(contour, selector)) return contour;
    } catch (err) {
      console.warn('[detail-vectors] raster attempt failed for', selector, err);
    } finally {
      if (mountedSvg.parentNode) mountedSvg.parentNode.removeChild(mountedSvg);
    }
    maskStroke *= 1.35;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const mountedSvg = await mountComposedSvg(svgEl);
    try {
      prepareLayerForMask(mountedSvg, selector, maskStroke);
      await waitForPaint();
      const contour = await rasterContourFromCrop(
        mountedSvg,
        fullCrop,
        scale,
        config.dilate,
        maskStroke
      );
      if (contour && isContourUsable(contour, selector)) return contour;
    } catch (err) {
      console.warn('[detail-vectors] full-view raster failed for', selector, err);
    } finally {
      if (mountedSvg.parentNode) mountedSvg.parentNode.removeChild(mountedSvg);
    }
    maskStroke *= 1.35;
  }

  return null;
}

async function rasterContourFromCrop(mountedSvg, crop, scale, dilate, maskStroke) {
  const viewSize = parseViewBoxSize(mountedSvg.getAttribute('viewBox'));
  const cropBottom = crop.y + crop.height;
  const touchesViewBottom = cropBottom >= viewSize.h - 1;
  const edgePad = touchesViewBottom
    ? Math.max(72, Math.ceil((maskStroke || 0) / 2) + (dilate || 0) + 36)
    : Math.max(24, Math.ceil((dilate || 0) / 2) + 8);
  const rasterCrop = {
    x: crop.x,
    y: crop.y,
    width: crop.width,
    height: crop.height + edgePad,
  };
  const viewExtra = touchesViewBottom ? edgePad : 0;
  const data = await rasterCropFromMountedSvg(mountedSvg, rasterCrop, scale, viewExtra);
  const bw = Math.max(1, Math.round(rasterCrop.width * scale));
  const bh = Math.max(1, Math.round(rasterCrop.height * scale));
  if (countGridFilled(gridFromImageData(data, bw, bh)) < 16) return null;

  const raw = contourFromRaster(data, bw, bh, Math.round(dilate * scale));
  if (!raw) return null;

  return raw.map(function (p) {
    return { x: p.x / scale + rasterCrop.x, y: p.y / scale + rasterCrop.y };
  });
}

function mergeAxisBBox(minX, minY, maxX, maxY, bb) {
  if (!bb || bb.width <= 0 || bb.height <= 0) {
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }
  return {
    minX: Math.min(minX, bb.x),
    minY: Math.min(minY, bb.y),
    maxX: Math.max(maxX, bb.x + bb.width),
    maxY: Math.max(maxY, bb.y + bb.height),
  };
}

function layerContentBBox(mountedSvg, selector, pad, maskStroke, dilate) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // Layer roots first — getBBox includes mirrored halves (amulet-mirror transforms).
  mountedSvg.querySelectorAll(selector).forEach(function (layer) {
    try {
      const merged = mergeAxisBBox(minX, minY, maxX, maxY, layer.getBBox());
      minX = merged.minX;
      minY = merged.minY;
      maxX = merged.maxX;
      maxY = merged.maxY;
    } catch (_) {}
  });

  if (!isFinite(minX)) {
    const geometrySelector =
      selector +
      ' path,' +
      selector +
      ' circle,' +
      selector +
      ' ellipse,' +
      selector +
      ' line,' +
      selector +
      ' polyline,' +
      selector +
      ' polygon,' +
      selector +
      ' rect';
    mountedSvg.querySelectorAll(geometrySelector).forEach(function (el) {
      try {
        const merged = mergeAxisBBox(minX, minY, maxX, maxY, el.getBBox());
        minX = merged.minX;
        minY = merged.minY;
        maxX = merged.maxX;
        maxY = merged.maxY;
      } catch (_) {}
    });
  }
  if (!isFinite(minX)) return null;
  const viewSize = parseViewBoxSize(mountedSvg.getAttribute('viewBox'));
  const edgePad = rasterBBoxPad(maskStroke, dilate, pad);
  const x = Math.max(0, minX - edgePad);
  const y = Math.max(0, minY - edgePad);
  const x1 = Math.min(viewSize.w, maxX + edgePad);
  const y1 = Math.min(viewSize.h, maxY + edgePad);
  return {
    x: x,
    y: y,
    width: Math.max(1, x1 - x),
    height: Math.max(1, y1 - y),
  };
}

function isContourUsable(contour, selector) {
  if (!contour || contour.length < 8) return false;
  const b = contourBounds(contour);
  const cw = Math.max(b.maxX - b.minX, 0);
  const ch = Math.max(b.maxY - b.minY, 0);
  if (cw < 8 || ch < 8) return false;

  if (selector === '.layer-q3-stone-engrave') {
    if (ch < 14 || cw < 24) return false;
    return cw * ch >= 280;
  }
  if (selector === '.layer-3') {
    if (ch < 22 || cw < 20) return false;
    if (cw / Math.max(ch, 1) > 7) return false;
    return cw * ch >= 400;
  }
  if (selector === '.layer-2') {
    if (ch < 18 || cw < 20) return false;
    if (ch < 26 && cw / Math.max(ch, 1) > 4) return false;
    return cw * ch >= 360;
  }

  if (cw * ch < 180) return false;
  if (ch < 22 && cw / Math.max(ch, 1) > 3.5) return false;
  if (cw < 22 && ch / Math.max(cw, 1) > 3.5) return false;
  return true;
}

function contourBounds(points) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach(function (p) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  });
  return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
}

function detailVectorBoxForContainer(container) {
  if (!container || !container.classList) return DETAIL_VECTOR_BOX_W;
  const classes = Object.keys(DETAIL_VECTOR_BOX_BY_VARIANT);
  for (let i = 0; i < classes.length; i++) {
    if (container.classList.contains(classes[i])) {
      return DETAIL_VECTOR_BOX_BY_VARIANT[classes[i]];
    }
  }
  return DETAIL_VECTOR_BOX_W;
}

function detailVectorFrameSize(options) {
  return {
    boxW: options?.boxW ?? DETAIL_VECTOR_BOX_W,
    boxH: options?.boxH ?? DETAIL_VECTOR_BOX_H,
  };
}

/** Center stage preview - square viewBox hugging contour, not the full compose canvas. */
function questionnaireStageFitLayout(bounds) {
  const minX = bounds.minX;
  const minY = bounds.minY;
  const maxX = bounds.maxX;
  const maxY = bounds.maxY;
  const cw = Math.max(maxX - minX, 1);
  const ch = Math.max(maxY - minY, 1);
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const bleed = DETAIL_VECTOR_STROKE * 2 + DETAIL_VECTOR_STROKE_MARGIN;
  const boxSize = Math.max(cw, ch) + bleed * 2;
  const vbX = cx - boxSize * 0.5;
  const vbY = cy - boxSize * 0.5;
  return {
    viewBox: vbX + ' ' + vbY + ' ' + boxSize + ' ' + boxSize,
    preserveAspectRatio: 'xMidYMid meet',
  };
}

function estimateDetailVectorScale(bounds, options) {
  const minX = bounds.minX;
  const minY = bounds.minY;
  const maxX = bounds.maxX;
  const maxY = bounds.maxY;
  const cw = Math.max(maxX - minX, 1);
  const ch = Math.max(maxY - minY, 1);
  const frame = detailVectorFrameSize(options);
  const innerW = frame.boxW - DETAIL_VECTOR_PAD * 2;
  const innerH = frame.boxH - DETAIL_VECTOR_PAD - DETAIL_VECTOR_BOTTOM_PAD;
  return Math.min(innerW / cw, innerH / ch) * DETAIL_VECTOR_SCALE;
}

function strokeBleedInUserUnits(scale) {
  const screenBleed = DETAIL_VECTOR_STROKE * 2 + DETAIL_VECTOR_STROKE_MARGIN * 2 + 6;
  return Math.max(DETAIL_VECTOR_VIEW_BLEED, screenBleed / Math.max(scale, 0.05));
}

/** Hug the contour in compose space — no transform, generous bleed so stroke is never clipped. */
function detailContourFitLayout(bounds) {
  const minX = bounds.minX;
  const minY = bounds.minY;
  const maxX = bounds.maxX;
  const maxY = bounds.maxY;
  const cw = Math.max(maxX - minX, 1);
  const ch = Math.max(maxY - minY, 1);
  const bleed = DETAIL_VECTOR_VIEW_BLEED;
  const boxW = cw + bleed * 2;
  const boxH = ch + bleed * 2;
  const vbX = minX - bleed;
  const vbY = minY - bleed;
  return {
    viewBox: vbX + ' ' + vbY + ' ' + boxW + ' ' + boxH,
    transform: '',
    preserveAspectRatio: 'xMidYMax meet',
  };
}

function detailVectorFitLayout(bounds, options) {
  const minX = bounds.minX;
  const minY = bounds.minY;
  const maxX = bounds.maxX;
  const maxY = bounds.maxY;
  const cw = Math.max(maxX - minX, 1);
  const ch = Math.max(maxY - minY, 1);
  const frame = detailVectorFrameSize(options);

  if (options && (options.tight || options.frame)) {
    const padX = DETAIL_VECTOR_PAD + DETAIL_VECTOR_STROKE + DETAIL_VECTOR_STROKE_MARGIN;
    const padTop = DETAIL_VECTOR_PAD;
    const padBottom = DETAIL_VECTOR_BOTTOM_PAD;
    const innerW = frame.boxW - padX * 2;
    const innerH = frame.boxH - padTop - padBottom;
    const scale = Math.min(innerW / cw, innerH / ch) * DETAIL_VECTOR_SCALE;
    const tx = (frame.boxW - cw * scale) * 0.5 - minX * scale;
    const ty = frame.boxH - padBottom - maxY * scale;
    return {
      viewBox: '0 0 ' + frame.boxW + ' ' + frame.boxH,
      transform: 'translate(' + tx + ',' + ty + ') scale(' + scale + ')',
      preserveAspectRatio: 'xMidYMid meet',
    };
  }

  if (options && options.thumb) {
    const boxW = QUESTIONNAIRE_THUMB_BOX_W;
    const boxH = QUESTIONNAIRE_THUMB_BOX_H;
    const pad = 8;
    const innerW = boxW - pad * 2;
    const innerH = boxH - pad * 2;
    const scale = Math.min(innerW / cw, innerH / ch);
    const tx = boxW - pad - maxX * scale;
    const ty = boxH - pad - maxY * scale;
    return {
      viewBox: '0 0 ' + boxW + ' ' + boxH,
      transform: 'translate(' + tx + ',' + ty + ') scale(' + scale + ')',
      preserveAspectRatio: 'xMaxYMax meet',
    };
  }

  const innerW = frame.boxW - DETAIL_VECTOR_PAD * 2;
  const innerH = frame.boxH - DETAIL_VECTOR_PAD - DETAIL_VECTOR_BOTTOM_PAD;
  const scale = Math.min(innerW / cw, innerH / ch) * DETAIL_VECTOR_SCALE;
  const tx = frame.boxW - DETAIL_VECTOR_PAD - maxX * scale;
  const ty = frame.boxH - DETAIL_VECTOR_BOTTOM_PAD - maxY * scale;
  return {
    viewBox: '0 0 ' + frame.boxW + ' ' + frame.boxH,
    transform: 'translate(' + tx + ',' + ty + ') scale(' + scale + ')',
    preserveAspectRatio: 'xMaxYMax meet',
  };
}

function renderContourSvg(contour, container, options) {
  const rounded = Boolean(options && options.rounded);
  const pathD = contourPathD(contour, rounded);
  if (!pathD) return false;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('xmlns', ns);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('overflow', 'visible');

  const pathEl = document.createElementNS(ns, 'path');
  pathEl.setAttribute('d', pathD);
  pathEl.setAttribute('fill', 'none');
  pathEl.setAttribute('stroke', DETAIL_VECTOR_COLOR);
  pathEl.setAttribute('stroke-width', String(DETAIL_VECTOR_STROKE));
  pathEl.setAttribute('stroke-linejoin', 'round');
  pathEl.setAttribute('stroke-linecap', 'round');
  pathEl.setAttribute('vector-effect', 'non-scaling-stroke');
  pathEl.setAttribute('shape-rendering', 'geometricPrecision');

  const bounds = contourBounds(contour);
  let layout;
  if (options && options.detail) {
    layout = detailContourFitLayout({
      minX: bounds.minX - DETAIL_VECTOR_VIEW_BLEED,
      minY: bounds.minY - DETAIL_VECTOR_VIEW_BLEED,
      maxX: bounds.maxX + DETAIL_VECTOR_VIEW_BLEED,
      maxY: bounds.maxY + DETAIL_VECTOR_VIEW_BLEED,
    });
  } else {
    const preliminaryScale = estimateDetailVectorScale(bounds, options);
    const bleed = strokeBleedInUserUnits(preliminaryScale);
    layout = detailVectorFitLayout(
      {
        minX: bounds.minX - bleed,
        minY: bounds.minY - bleed,
        maxX: bounds.maxX + bleed,
        maxY: bounds.maxY + bleed,
      },
      options
    );
  }

  svg.setAttribute('viewBox', layout.viewBox);
  svg.setAttribute('preserveAspectRatio', layout.preserveAspectRatio || 'xMaxYMax meet');

  const group = document.createElementNS(ns, 'g');
  if (layout.transform) group.setAttribute('transform', layout.transform);
  group.appendChild(pathEl);
  svg.appendChild(group);

  const oldSvg = container.querySelector('svg');
  if (oldSvg) oldSvg.remove();
  container.appendChild(svg);
  return true;
}

function styleLayerGeometryForRaster(root, strokeWidth) {
  const sw = String(strokeWidth);
  root.querySelectorAll('[filter]').forEach(function (el) {
    el.removeAttribute('filter');
  });
  root.querySelectorAll('path,circle,ellipse,line,polyline,polygon,rect').forEach(function (el) {
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', '#000000');
    el.setAttribute('stroke-width', sw);
    el.setAttribute('stroke-linecap', 'round');
    el.setAttribute('stroke-linejoin', 'round');
    el.removeAttribute('filter');
  });
}

async function rasterContourFromMountedLayer(mountedSvg, selector, style2, style3, rasterOptions) {
  const config = layerVectorConfig(selector);
  const layers = Array.from(mountedSvg.querySelectorAll(selector));
  if (!layers.length) return null;

  let maskStroke = estimateMaskStroke(layers, selector, style2, style3);
  const scale = DETAIL_MASK_SCALE;
  const viewSize = parseViewBoxSize(mountedSvg.getAttribute('viewBox'));
  const fullCrop = { x: 0, y: 0, width: viewSize.w, height: viewSize.h };
  const fullOnly = Boolean(rasterOptions && rasterOptions.fullOnly);

  async function tryFullCrop() {
    hideOtherLayers(mountedSvg, selector);
    mountedSvg.querySelectorAll(selector).forEach(function (layer) {
      styleLayerGeometryForRaster(layer, maskStroke);
    });
    await waitForPaint();
    return rasterContourFromCrop(mountedSvg, fullCrop, scale, config.dilate, maskStroke);
  }

  if (fullOnly) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const contour = await tryFullCrop();
        if (contour && isContourUsable(contour, selector)) return contour;
      } catch (err) {
        console.warn('[detail-vectors] full-only raster failed for', selector, err);
      }
      maskStroke *= 1.3;
    }
    return null;
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const contour = await tryFullCrop();
      if (contour && isContourUsable(contour, selector)) return contour;
      maskStroke *= 1.3;
    } catch (err) {
      console.warn('[detail-vectors] full-view raster failed for', selector, err);
      maskStroke *= 1.3;
    }
  }

  maskStroke = estimateMaskStroke(layers, selector, style2, style3);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      hideOtherLayers(mountedSvg, selector);
      mountedSvg.querySelectorAll(selector).forEach(function (layer) {
        styleLayerGeometryForRaster(layer, maskStroke);
      });
      await waitForPaint();

      let crop =
        layerContentBBox(mountedSvg, selector, config.pad, maskStroke, config.dilate) || fullCrop;
      crop = normalizeCropForLayer(crop, viewSize, config);
      if (!crop || crop.width < 8 || crop.height < 8) {
        maskStroke *= 1.35;
        continue;
      }

      const contour = await rasterContourFromCrop(
        mountedSvg,
        crop,
        scale,
        config.dilate,
        maskStroke
      );
      if (contour && isContourUsable(contour, selector)) return contour;

      maskStroke *= 1.35;
    } catch (err) {
      console.warn('[detail-vectors] clone raster attempt failed for', selector, err);
      maskStroke *= 1.35;
    }
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      hideOtherLayers(mountedSvg, selector);
      mountedSvg.querySelectorAll(selector).forEach(function (layer) {
        styleLayerGeometryForRaster(layer, maskStroke);
      });
      await waitForPaint();
      const contour = await rasterContourFromCrop(
        mountedSvg,
        fullCrop,
        scale,
        config.dilate,
        maskStroke
      );
      if (contour && isContourUsable(contour, selector)) return contour;
      maskStroke *= 1.35;
    } catch (err) {
      console.warn('[detail-vectors] clone full-view raster failed for', selector, err);
      maskStroke *= 1.35;
    }
  }

  return null;
}

async function renderClonedUnitedOutline(svgEl, selector, container, style2, style3, options) {
  const mountedSvg = await mountComposedSvg(svgEl);
  try {
    const contour = await rasterContourFromMountedLayer(mountedSvg, selector, style2, style3);
    if (!contour || !isContourUsable(contour, selector)) return false;
    return renderContourSvg(contour, container, options);
  } finally {
    if (mountedSvg.parentNode) mountedSvg.parentNode.removeChild(mountedSvg);
  }
}

const QUESTIONNAIRE_STAGE_SELECTORS = {
  1: ['.layer-3'],
  2: ['.layer-3', '.layer-2'],
  3: ['.layer-3', '.layer-2', '.layer-q3-stone-engrave'],
};

const QUESTIONNAIRE_THUMB_SELECTORS = {
  1: '.layer-3',
  2: '.layer-2',
  3: '.layer-q3-stone-engrave',
};

async function extractUnifiedContour(svgEl, selectors, style2, style3) {
  const selectorList = selectors.join(',');
  const layers = Array.from(svgEl.querySelectorAll(selectorList));
  if (!layers.length) return null;

  const config = combinedLayerConfig(selectors);
  let maskStroke = estimateCombinedMaskStroke(layers, selectors, style2, style3);
  const scale = DETAIL_MASK_SCALE;
  const viewSize = parseViewBoxSize(svgEl.getAttribute('viewBox'));
  const fullCrop = { x: 0, y: 0, width: viewSize.w, height: viewSize.h };

  for (let attempt = 0; attempt < 5; attempt++) {
    const mountedSvg = await mountComposedSvg(svgEl);
    try {
      showOnlyLayers(mountedSvg, selectors);
      mountedSvg.querySelectorAll(selectorList).forEach(function (layer) {
        styleLayerGeometryForRaster(layer, maskStroke);
      });
      await waitForPaint();

      const crop =
        layersContentBBox(mountedSvg, selectors, config.pad, maskStroke, config.dilate) ||
        fullCrop;
      if (!crop || crop.width < 8 || crop.height < 8) {
        maskStroke *= 1.35;
        continue;
      }

      const contour = await rasterContourFromCrop(
        mountedSvg,
        crop,
        scale,
        config.dilate,
        maskStroke
      );
      if (contour && isContourUsable(contour, selectors[selectors.length - 1])) {
        return contour;
      }
    } catch (err) {
      console.warn('[detail-vectors] unified raster attempt failed', err);
    } finally {
      if (mountedSvg.parentNode) mountedSvg.parentNode.removeChild(mountedSvg);
    }
    maskStroke *= 1.35;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const mountedSvg = await mountComposedSvg(svgEl);
    try {
      showOnlyLayers(mountedSvg, selectors);
      mountedSvg.querySelectorAll(selectorList).forEach(function (layer) {
        styleLayerGeometryForRaster(layer, maskStroke);
      });
      await waitForPaint();
      const contour = await rasterContourFromCrop(
        mountedSvg,
        fullCrop,
        scale,
        config.dilate,
        maskStroke
      );
      if (contour && contour.length >= 8) return contour;
    } catch (err) {
      console.warn('[detail-vectors] unified full-view raster failed', err);
    } finally {
      if (mountedSvg.parentNode) mountedSvg.parentNode.removeChild(mountedSvg);
    }
    maskStroke *= 1.35;
  }

  return null;
}

function samplePathContourFromLayer(mountedSvg, selector) {
  const points = [];
  mountedSvg.querySelectorAll(selector + ' path').forEach(function (path) {
    try {
      const len = path.getTotalLength();
      if (!Number.isFinite(len) || len <= 0) return;
      const steps = Math.max(20, Math.min(180, Math.ceil(len / 6)));
      for (let i = 0; i <= steps; i += 1) {
        const pt = path.getPointAtLength((len * i) / steps);
        if (Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
          points.push({ x: pt.x, y: pt.y });
        }
      }
    } catch (_) {}
  });
  if (points.length < 12) return null;
  return subsampleContour(points, CONTOUR_SUBSAMPLE_DIST);
}

async function extractLayerContour(svgEl, selector, defsEl, style2, style3, extractOptions) {
  const layers = Array.from(svgEl.querySelectorAll(selector));
  if (!layers.length) return null;
  const preferFullCrop = Boolean(extractOptions && extractOptions.preferFullCrop);

  const mountedSvg = await mountComposedSvg(svgEl);
  try {
    if (preferFullCrop) {
      const fullContour = await rasterContourFromMountedLayer(
        mountedSvg,
        selector,
        style2,
        style3,
        { fullOnly: true }
      );
      if (fullContour && isContourUsable(fullContour, selector)) return fullContour;
    }

    const rasterContour = await rasterContourFromMountedLayer(mountedSvg, selector, style2, style3);
    if (rasterContour && isContourUsable(rasterContour, selector)) return rasterContour;

    const sampled = samplePathContourFromLayer(mountedSvg, selector);
    if (sampled && isContourUsable(sampled, selector)) return sampled;
  } finally {
    if (mountedSvg.parentNode) mountedSvg.parentNode.removeChild(mountedSvg);
  }

  if (!preferFullCrop) {
    try {
      const contour = await unionLayerContour(layers, defsEl, svgEl, selector, style2, style3);
      if (contour && isContourUsable(contour, selector)) return contour;
    } catch (err) {
      console.warn('[detail-vectors] union failed for', selector, err);
    }
  }

  return null;
}

function renderUnifiedStageSvg(contour, container, viewBox) {
  const pathD = contourPathD(contour, true);
  if (!pathD) return null;

  const bounds = contourBounds(contour);
  const bleed = DETAIL_VECTOR_STROKE + DETAIL_VECTOR_STROKE_MARGIN;
  const layout = questionnaireStageFitLayout({
    minX: bounds.minX - bleed,
    minY: bounds.minY - bleed,
    maxX: bounds.maxX + bleed,
    maxY: bounds.maxY + bleed,
  });

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('xmlns', ns);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', layout.viewBox || viewBox || '0 0 680 680');
  svg.setAttribute('preserveAspectRatio', layout.preserveAspectRatio || 'xMidYMid meet');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('overflow', 'visible');
  svg.classList.add('pagmar__questionnaire-stage-vector');

  const pathEl = document.createElementNS(ns, 'path');
  pathEl.setAttribute('d', pathD);
  pathEl.setAttribute('fill', 'none');
  pathEl.setAttribute('stroke', DETAIL_VECTOR_COLOR);
  pathEl.setAttribute('stroke-width', String(DETAIL_VECTOR_STROKE));
  pathEl.setAttribute('stroke-linejoin', 'round');
  pathEl.setAttribute('stroke-linecap', 'round');
  pathEl.setAttribute('vector-effect', 'non-scaling-stroke');
  pathEl.setAttribute('shape-rendering', 'geometricPrecision');
  svg.appendChild(pathEl);

  container.innerHTML = '';
  container.appendChild(svg);
  return svg;
}

export function clearQuestionnaireThumbVectors() {
  for (let q = 1; q <= 8; q += 1) {
    const container = document.getElementById('vectorThumbQ' + q);
    if (!container) continue;
    container.hidden = true;
    container.innerHTML = '';
  }
  clearChoicePresetThumbVectors();
}

async function renderQuestionnaireThumbVectors(svgEl, vectorStage, style2, style3) {
  for (let q = 1; q <= 8; q += 1) {
    const container = document.getElementById('vectorThumbQ' + q);
    if (!container) continue;

    const selector = QUESTIONNAIRE_THUMB_SELECTORS[q];
    if (!selector || q > vectorStage) {
      container.hidden = true;
      container.innerHTML = '';
      continue;
    }

    await yieldToBrowser();
    const contour = await extractLayerContour(svgEl, selector, null, style2, style3);
    if (!contour) {
      container.hidden = true;
      container.innerHTML = '';
      continue;
    }

    renderContourSvg(contour, container, { thumb: true, rounded: true });
    container.hidden = false;
  }
}

/**
 * Questionnaire center stage - same united-outline vectors as the amulet detail page.
 * @param {{ svg: string, style2: object, style3: object, container: HTMLElement, vectorStage?: number, onProgress?: Function }} opts
 */
export async function renderQuestionnaireStageVectors(opts) {
  const { svg, style2, style3, container, vectorStage = 1, onProgress, answers } = opts || {};
  if (!container || !svg) return null;

  const selectors =
    QUESTIONNAIRE_STAGE_SELECTORS[vectorStage] || QUESTIONNAIRE_STAGE_SELECTORS[1];

  onProgress?.(0.08, 'מצייר וקטורים…');

  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return null;

  const viewBox = svgEl.getAttribute('viewBox') || '0 0 680 680';

  await yieldToBrowser();
  const unifiedContour = await extractUnifiedContour(svgEl, selectors, style2, style3);
  onProgress?.(0.72, 'מצייר וקטורים…');

  if (!unifiedContour) return null;

  renderUnifiedStageSvg(unifiedContour, container, viewBox);
  await renderQuestionnaireThumbVectors(svgEl, vectorStage, style2, style3);
  if (answers) {
    await syncChoicePresetThumbVectors(answers);
  }
  onProgress?.(1, 'הושלם');

  return {
    vector: true,
    pbr: false,
    vectorStage: vectorStage,
    interactive: false,
    layers: 1,
  };
}

async function extractAndRender(containerId, svgEl, selector, viewBox, defsEl, style2, style3) {
  const container = document.getElementById(containerId);
  if (!container) return false;

  const layers = Array.from(svgEl.querySelectorAll(selector));
  if (!layers.length) return false;

  const renderOptions = container.classList.contains('pagmar__result-vector')
    ? { tight: true, rounded: true }
    : {
        detail: true,
        preferFullCrop: true,
        rounded: true,
        boxW: detailVectorBoxForContainer(container),
        boxH: DETAIL_VECTOR_BOX_H,
      };

  const contour = await extractLayerContour(svgEl, selector, defsEl, style2, style3, {
    preferFullCrop: Boolean(renderOptions.detail),
  });
  if (contour && renderContourSvg(contour, container, renderOptions)) {
    return true;
  }

  try {
    if (await renderClonedUnitedOutline(svgEl, selector, container, style2, style3, renderOptions)) {
      return true;
    }
  } catch (err) {
    console.warn('[detail-vectors] clone union failed for', selector, err);
  }

  console.warn('[detail-vectors] united contour empty for', selector);
  return false;
}
