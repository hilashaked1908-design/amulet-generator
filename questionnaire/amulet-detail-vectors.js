/**
 * Renders individual amulet layer vectors as a single united outline
 * (raster union → outer contour → stroke, like the loader vessels).
 */

const DETAIL_VECTOR_COLOR = '#f5f5f5';
const DETAIL_VECTOR_STROKE = 2;
const DETAIL_VECTOR_BOX_W = 224.39;
const DETAIL_VECTOR_BOX_H = 224.39;
const DETAIL_VECTOR_PAD = 24;
const DETAIL_VECTOR_SCALE = 1;
const DETAIL_VECTOR_STROKE_MARGIN = 3;
const DETAIL_MASK_SCALE = 4;
const DEFAULT_MASK_STROKE = 17;
const PATH_MAIN_W = 45 * 0.37;
const CONTOUR_SUBSAMPLE_DIST = 5;
const CONTOUR_CHAIKIN_PASSES = 1;

const LAYER_VECTOR_CONFIG = {
  '.layer-q3-stone-engrave': { dilate: 10, pad: 32 },
  '.layer-2': { dilate: 12, pad: 36 },
  '.layer-3': { dilate: 10, pad: 40 },
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
  el.textContent = String(sourceText || '').trim() || '—';
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

function resolveDetailAnswers(idx) {
  const entryId = resolveDetailEntryId(idx);
  if (
    entryId != null &&
    window.__pagmarDetailAnswersByEntryId &&
    window.__pagmarDetailAnswersByEntryId[entryId] &&
    window.__pagmarDetailAnswersByEntryId[entryId].q1Wish
  ) {
    return window.__pagmarDetailAnswersByEntryId[entryId];
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
      if (nav && nav.index === idx && nav.entryId != null) return nav.entryId;
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

/** Per-amulet compose for detail page — never the global live-builder snapshot. */
async function resolveDetailPageCompose(record, idx) {
  const entryId = resolveDetailEntryId(idx);
  if (entryId != null) {
    const perEntry = await readComposedForEntry(entryId);
    if (perEntry?.svg && composedSvgHasLayers(perEntry.svg)) return perEntry;
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

async function renderVectors(options = {}) {
  const markBootDone = options.markBootDone !== false;
  try {
    await import('./seed-bootstrap.js')
      .then(function (mod) {
        return mod.ensureSeedCollectionLoaded();
      })
      .catch(function () {});

    const idx = parseAmuletIndex();
    const base = (window.AMULET_QUESTIONS || []).length;
    if (idx < base) return;

    const record = resolveDetailAnswers(idx);
    if (!record || !record.q1Wish) return;

    clearDetailVectorSlots();

    await yieldToBrowser();
    const composed = await resolveDetailPageCompose(record, idx);
    if (!composed || !composed.svg) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(composed.svg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return;

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
  } catch (err) {
    console.warn('[detail-vectors] failed:', err);
  } finally {
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
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('id');
  if (raw == null || raw === '') return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
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
  return LAYER_VECTOR_CONFIG[selector] || { dilate: 8, pad: 24 };
}

function countGridFilled(grid) {
  let n = 0;
  for (let i = 0; i < grid.length; i++) if (grid[i]) n++;
  return n;
}

function mountComposedSvg(svgEl) {
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

function prepareLayerForMask(mountedSvg, selector, maskStroke) {
  hideOtherLayers(mountedSvg, selector);
  mountedSvg.querySelectorAll(selector).forEach(function (layer) {
    applyMaskStroke(layer, maskStroke);
  });
  mountedSvg.querySelectorAll('[filter]').forEach(function (el) {
    el.removeAttribute('filter');
  });
}

function buildMaskSvgMarkup(mountedSvg) {
  const clone = mountedSvg.cloneNode(true);
  clone.removeAttribute('style');
  const viewBox = clone.getAttribute('viewBox') || '0 0 680 680';
  const viewSize = parseViewBoxSize(viewBox);
  clone.setAttribute('width', String(viewSize.w));
  clone.setAttribute('height', String(viewSize.h));
  clone.setAttribute('viewBox', viewBox);

  const ns = 'http://www.w3.org/2000/svg';
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', String(viewSize.w));
  bg.setAttribute('height', String(viewSize.h));
  bg.setAttribute('fill', '#ffffff');
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

function rasterCropFromMountedSvg(mountedSvg, crop, scale) {
  const viewSize = parseViewBoxSize(mountedSvg.getAttribute('viewBox'));
  const markup = buildMaskSvgMarkup(mountedSvg);
  return loadSvgMarkupAsImage(markup).then(function (img) {
    const bw = Math.max(1, Math.round(crop.width * scale));
    const bh = Math.max(1, Math.round(crop.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = bw;
    canvas.height = bh;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, bw, bh);

    const sx = (img.naturalWidth || viewSize.w) / viewSize.w;
    const sy = (img.naturalHeight || viewSize.h) / viewSize.h;
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

function smoothContour(points) {
  if (!points || points.length < 8) return points;
  const subsampled = subsampleContour(points, CONTOUR_SUBSAMPLE_DIST);
  let smoothed = chaikinSmoothClosed(subsampled, CONTOUR_CHAIKIN_PASSES);
  if (contourSelfIntersects(smoothed)) {
    smoothed = subsampled;
  }
  return smoothed;
}

/** Straight segments — Catmull-Rom overshoots concave corners and self-intersects. */
function closedPolylinePath(points) {
  const n = points.length;
  if (n < 3) return '';
  let d = 'M ' + points[0].x.toFixed(2) + ' ' + points[0].y.toFixed(2);
  for (let i = 1; i < n; i++) {
    d += ' L ' + points[i].x.toFixed(2) + ' ' + points[i].y.toFixed(2);
  }
  return d + ' Z';
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
    const mountedSvg = mountComposedSvg(svgEl);
    try {
      prepareLayerForMask(mountedSvg, selector, maskStroke);
      await waitForPaint();

      const crop = layerContentBBox(mountedSvg, selector, config.pad) || fullCrop;
      if (!crop || crop.width < 8 || crop.height < 8) continue;

      const contour = await rasterContourFromCrop(mountedSvg, crop, scale, config.dilate);
      if (contour) return contour;
    } catch (err) {
      console.warn('[detail-vectors] raster attempt failed for', selector, err);
    } finally {
      if (mountedSvg.parentNode) mountedSvg.parentNode.removeChild(mountedSvg);
    }
    maskStroke *= 1.35;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const mountedSvg = mountComposedSvg(svgEl);
    try {
      prepareLayerForMask(mountedSvg, selector, maskStroke);
      await waitForPaint();
      const contour = await rasterContourFromCrop(mountedSvg, fullCrop, scale, config.dilate);
      if (contour) return contour;
    } catch (err) {
      console.warn('[detail-vectors] full-view raster failed for', selector, err);
    } finally {
      if (mountedSvg.parentNode) mountedSvg.parentNode.removeChild(mountedSvg);
    }
    maskStroke *= 1.35;
  }

  return null;
}

async function rasterContourFromCrop(mountedSvg, crop, scale, dilate) {
  const data = await rasterCropFromMountedSvg(mountedSvg, crop, scale);
  const bw = Math.max(1, Math.round(crop.width * scale));
  const bh = Math.max(1, Math.round(crop.height * scale));
  if (countGridFilled(gridFromImageData(data, bw, bh)) < 16) return null;

  const raw = contourFromRaster(data, bw, bh, Math.round(dilate * scale));
  if (!raw) return null;

  return raw.map(function (p) {
    return { x: p.x / scale + crop.x, y: p.y / scale + crop.y };
  });
}

function layerContentBBox(mountedSvg, selector, pad) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  mountedSvg.querySelectorAll(selector).forEach(function (layer) {
    try {
      const bb = layer.getBBox();
      if (bb.width > 0 && bb.height > 0) {
        minX = Math.min(minX, bb.x);
        minY = Math.min(minY, bb.y);
        maxX = Math.max(maxX, bb.x + bb.width);
        maxY = Math.max(maxY, bb.y + bb.height);
      }
    } catch (_) {}
  });
  if (!isFinite(minX)) return null;
  const viewSize = parseViewBoxSize(mountedSvg.getAttribute('viewBox'));
  const inset = pad || 0;
  const x = Math.max(0, minX - inset);
  const y = Math.max(0, minY - inset);
  return {
    x: x,
    y: y,
    width: Math.min(viewSize.w - x, maxX - minX + inset * 2),
    height: Math.min(viewSize.h - y, maxY - minY + inset * 2),
  };
}

function isContourUsable(contour, selector) {
  if (!contour || contour.length < 8) return false;
  const b = contourBounds(contour);
  const cw = Math.max(b.maxX - b.minX, 0);
  const ch = Math.max(b.maxY - b.minY, 0);
  if (cw < 6 || ch < 6) return false;
  if (selector === '.layer-q3-stone-engrave' && cw / Math.max(ch, 1) > 10 && ch < 24) {
    return false;
  }
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

function detailVectorFitLayout(bounds, options) {
  const minX = bounds.minX;
  const minY = bounds.minY;
  const maxX = bounds.maxX;
  const maxY = bounds.maxY;
  const cw = Math.max(maxX - minX, 1);
  const ch = Math.max(maxY - minY, 1);

  if (options && options.tight) {
    const pad = DETAIL_VECTOR_PAD + DETAIL_VECTOR_STROKE + DETAIL_VECTOR_STROKE_MARGIN;
    const vbX = minX - pad;
    const vbY = minY - pad;
    const vbW = cw + pad * 2;
    const vbH = ch + pad * 2;
    return {
      viewBox: vbX + ' ' + vbY + ' ' + vbW + ' ' + vbH,
      transform: '',
      preserveAspectRatio: 'xMidYMid meet',
    };
  }

  const innerW = DETAIL_VECTOR_BOX_W - DETAIL_VECTOR_PAD * 2;
  const innerH = DETAIL_VECTOR_BOX_H - DETAIL_VECTOR_PAD * 2;
  const scale = Math.min(innerW / cw, innerH / ch) * DETAIL_VECTOR_SCALE;
  const tx = (DETAIL_VECTOR_BOX_W - cw * scale) / 2 - minX * scale;
  const ty = (DETAIL_VECTOR_BOX_H - ch * scale) / 2 - minY * scale;
  return {
    viewBox: '0 0 ' + DETAIL_VECTOR_BOX_W + ' ' + DETAIL_VECTOR_BOX_H,
    transform: 'translate(' + tx + ',' + ty + ') scale(' + scale + ')',
    preserveAspectRatio: 'xMidYMid meet',
  };
}

function renderContourSvg(contour, container, options) {
  const pathD = closedPolylinePath(contour);
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
  const strokeMargin = DETAIL_VECTOR_STROKE_MARGIN;
  const layout = detailVectorFitLayout({
    minX: bounds.minX - strokeMargin,
    minY: bounds.minY - strokeMargin,
    maxX: bounds.maxX + strokeMargin,
    maxY: bounds.maxY + strokeMargin,
  }, options);
  svg.setAttribute('viewBox', layout.viewBox);
  svg.setAttribute('preserveAspectRatio', layout.preserveAspectRatio || 'xMidYMid meet');

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

async function rasterContourFromMountedLayer(mountedSvg, selector, style2, style3) {
  const config = layerVectorConfig(selector);
  const layers = Array.from(mountedSvg.querySelectorAll(selector));
  if (!layers.length) return null;

  let maskStroke = estimateMaskStroke(layers, selector, style2, style3);
  const scale = DETAIL_MASK_SCALE;
  const viewSize = parseViewBoxSize(mountedSvg.getAttribute('viewBox'));
  const fullCrop = { x: 0, y: 0, width: viewSize.w, height: viewSize.h };

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      hideOtherLayers(mountedSvg, selector);
      mountedSvg.querySelectorAll(selector).forEach(function (layer) {
        styleLayerGeometryForRaster(layer, maskStroke);
      });
      await waitForPaint();

      const crop = layerContentBBox(mountedSvg, selector, config.pad) || fullCrop;
      if (!crop || crop.width < 8 || crop.height < 8) {
        maskStroke *= 1.35;
        continue;
      }

      const contour = await rasterContourFromCrop(mountedSvg, crop, scale, config.dilate);
      if (contour && contour.length >= 8) return contour;

      maskStroke *= 1.35;
    } catch (err) {
      console.warn('[detail-vectors] clone raster attempt failed for', selector, err);
      maskStroke *= 1.35;
    }
  }

  return null;
}

async function renderClonedUnitedOutline(svgEl, selector, container, style2, style3, options) {
  const mountedSvg = mountComposedSvg(svgEl);
  try {
    const contour = await rasterContourFromMountedLayer(mountedSvg, selector, style2, style3);
    if (!contour || !isContourUsable(contour, selector)) return false;
    return renderContourSvg(contour, container, options);
  } finally {
    if (mountedSvg.parentNode) mountedSvg.parentNode.removeChild(mountedSvg);
  }
}

async function extractAndRender(containerId, svgEl, selector, viewBox, defsEl, style2, style3) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const layers = Array.from(svgEl.querySelectorAll(selector));
  if (!layers.length) return;

  const renderOptions =
    container.classList.contains('pagmar__detail-vector') ||
    container.classList.contains('pagmar__result-vector')
      ? { tight: true }
      : null;

  let contour;
  try {
    contour = await unionLayerContour(layers, defsEl, svgEl, selector, style2, style3);
  } catch (err) {
    console.warn('[detail-vectors] union failed for', selector, err);
    contour = null;
  }

  if (contour && isContourUsable(contour, selector) && renderContourSvg(contour, container, renderOptions)) {
    return;
  }

  try {
    if (await renderClonedUnitedOutline(svgEl, selector, container, style2, style3, renderOptions)) {
      return;
    }
  } catch (err) {
    console.warn('[detail-vectors] clone union failed for', selector, err);
  }

  console.warn('[detail-vectors] united contour empty for', selector);
}
