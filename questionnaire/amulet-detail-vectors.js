/**
 * Renders individual amulet layer vectors as flat white 2D shapes.
 * Shares one compose pass with the 3D scene boot.
 */

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

const composeCache = new Map();

export function invalidateDetailComposeCache() {
  composeCache.clear();
}

window.amuletInvalidateDetailComposeCache = invalidateDetailComposeCache;

export async function getSharedDetailCompose(record) {
  const key = JSON.stringify(record || {});
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

export async function bootDetailVectors() {
  await waitForPaint();
  await renderVectors();
}

export async function renderResultOverlayVectors(answers) {
  if (!answers || !answers.q1Wish) return;

  const vectorMap = {
    resultVectorRequest: '.layer-3',
    resultVectorBelonging: '.layer-2',
    resultVectorTiming: '.layer-q3-thread, .layer-q3-stone-engrave',
  };

  try {
    const composed = await getSharedDetailCompose(answers);
    if (!composed || !composed.svg) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(composed.svg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return;

    const viewBox = svgEl.getAttribute('viewBox') || '0 0 680 680';

    Object.keys(vectorMap).forEach(function (containerId) {
      extractAndRender(containerId, svgEl, vectorMap[containerId], viewBox);
    });

    if (composed.questionnaire) {
      const q3Letters = composed.questionnaire.engravedLetters || [];
      const timingEl = document.getElementById('resultTiming');
      if (q3Letters.length && timingEl) {
        timingEl.textContent = q3Letters.join(' ');
      }
    }
  } catch (err) {
    console.warn('[result-vectors] failed:', err);
  }
}

async function renderVectors() {
  try {
    const idx = parseAmuletIndex();
    const base = (window.AMULET_QUESTIONS || []).length;
    if (idx < base) return;

    const record = typeof window.getAmuletRecord === 'function'
      ? window.getAmuletRecord(idx, null, null)
      : null;
    if (!record || !record.q1Wish) return;

    const composed = await getSharedDetailCompose(record);
    if (!composed || !composed.svg) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(composed.svg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return;

    const viewBox = svgEl.getAttribute('viewBox') || '0 0 680 680';

    extractAndRender('detailVectorRequest', svgEl, '.layer-3', viewBox);
    extractAndRender('detailVectorBelonging', svgEl, '.layer-2', viewBox);
    extractAndRender('detailVectorTiming', svgEl, '.layer-q3-thread, .layer-q3-stone-engrave', viewBox);

    if (composed.questionnaire) {
      const q3Letters = composed.questionnaire.engravedLetters || [];
      const timingEl = document.getElementById('detailTiming');
      if (q3Letters.length && timingEl) {
        timingEl.textContent = q3Letters.join(' ');
      }
    }
  } catch (err) {
    console.warn('[detail-vectors] failed:', err);
  } finally {
    if (window.pagmarDetailBoot) window.pagmarDetailBoot.done('vectors');
  }
}

function parseAmuletIndex() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('id');
  if (raw == null || raw === '') return 0;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function extractAndRender(containerId, svgEl, selector, viewBox) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const layers = svgEl.querySelectorAll(selector);
  if (!layers.length) return;

  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('xmlns', ns);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const wrapper = document.createElementNS(ns, 'g');
  layers.forEach(layer => {
    const clone = layer.cloneNode(true);
    clone.removeAttribute('filter');
    wrapper.appendChild(clone);
  });
  svg.appendChild(wrapper);

  svg.querySelectorAll('path, circle, rect, polygon, ellipse, line, polyline').forEach(el => {
    el.removeAttribute('filter');
    el.style.cssText = '';
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', '#ffffff');
    el.setAttribute('vector-effect', 'non-scaling-stroke');
    el.setAttribute('stroke-width', '2');
  });

  svg.querySelectorAll('g').forEach(g => {
    g.removeAttribute('filter');
    g.style.cssText = '';
  });

  const oldSvg = container.querySelector('svg');
  if (oldSvg) oldSvg.remove();
  container.appendChild(svg);

  try {
    const bbox = wrapper.getBBox();
    if (bbox.width > 0 && bbox.height > 0) {
      const pad = 8;
      svg.setAttribute('viewBox',
        (bbox.x - pad) + ' ' + (bbox.y - pad) + ' ' +
        (bbox.width + pad * 2) + ' ' + (bbox.height + pad * 2));
    }
  } catch (_) {}
}
