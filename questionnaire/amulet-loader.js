/**
 * Amulet loaders — frame-scoped vessel spin (Q1–Q3) and full-page overlay (final PBR).
 */
const DEFAULT_LOADER_TEXT = 'טוען קמע';

const VESSEL_SRC = [
  'assets/detail/loader-vessel-1.svg',
  'assets/detail/loader-vessel-2.svg',
  'assets/detail/loader-vessel-3.svg',
  'assets/detail/loader-vessel-4.svg',
];

let vesselsPreloaded = false;

function statusEl() {
  return (
    document.getElementById('createAmuletStatus') || document.getElementById('amuletStatus')
  );
}

function amuletFrameEl() {
  return document.querySelector(
    '.pagmar__index-create-amulet-frame, .pagmar__create-amulet-frame, .pagmar__request-amulet-build'
  );
}

function appendVesselImages(parent, baseClass) {
  VESSEL_SRC.forEach(function (src, index) {
    const img = document.createElement('img');
    img.className = baseClass + '__vessel ' + baseClass + '__vessel--' + (index + 1);
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    parent.appendChild(img);
  });
}

function ensureFrameLoader() {
  const frame = amuletFrameEl();
  if (!frame) return null;

  let loader = frame.querySelector('.pagmar__amulet-frame-loader');
  if (loader) return loader;

  loader = document.createElement('div');
  loader.className = 'pagmar__amulet-frame-loader';
  loader.hidden = true;
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');

  const vessels = document.createElement('div');
  vessels.className = 'pagmar__amulet-frame-loader__vessels';
  vessels.setAttribute('aria-hidden', 'true');
  appendVesselImages(vessels, 'pagmar__amulet-frame-loader');

  const sr = document.createElement('span');
  sr.className = 'pagmar__amulet-frame-loader__sr';
  sr.textContent = DEFAULT_LOADER_TEXT;

  loader.appendChild(vessels);
  loader.appendChild(sr);
  frame.appendChild(loader);
  return loader;
}

function ensureFullpageLoader() {
  let loader = document.getElementById('pagmarCreateFullpageLoader');
  if (loader) return loader;

  loader = document.createElement('div');
  loader.id = 'pagmarCreateFullpageLoader';
  loader.className = 'pagmar__create-fullpage-loader';
  loader.hidden = true;
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');

  const inner = document.createElement('div');
  inner.className = 'pagmar__create-fullpage-loader__inner';

  const vessels = document.createElement('div');
  vessels.className = 'pagmar__create-fullpage-loader__vessels';
  vessels.setAttribute('aria-hidden', 'true');
  appendVesselImages(vessels, 'pagmar__create-fullpage-loader');

  const caption = document.createElement('p');
  caption.className = 'pagmar__create-fullpage-loader__caption';

  const percent = document.createElement('span');
  percent.className = 'pagmar__create-fullpage-loader__percent';
  percent.textContent = '0%';

  const label = document.createElement('span');
  label.className = 'pagmar__create-fullpage-loader__label';
  label.textContent = DEFAULT_LOADER_TEXT;

  caption.appendChild(percent);
  caption.appendChild(label);

  const sr = document.createElement('span');
  sr.className = 'pagmar__create-fullpage-loader__sr';
  sr.textContent = '0% ' + DEFAULT_LOADER_TEXT;

  inner.appendChild(vessels);
  inner.appendChild(caption);
  loader.appendChild(inner);
  loader.appendChild(sr);
  document.body.appendChild(loader);
  return loader;
}

function setFrameLoading(active, keepPreview) {
  const frame = amuletFrameEl();
  if (!frame) return;
  frame.classList.toggle('is-amulet-loading', Boolean(active));
  frame.classList.toggle('is-amulet-loading-keep-preview', Boolean(active && keepPreview));
}

function setFullpageLoading(active) {
  document.body.classList.toggle('is-create-fullpage-loading', Boolean(active));
}

function hideFrameLoader() {
  setFrameLoading(false, false);
  const frame = amuletFrameEl();
  const loader = frame?.querySelector('.pagmar__amulet-frame-loader');
  if (loader) {
    loader.hidden = true;
    loader.removeAttribute('aria-busy');
  }
}

function hideFullpageLoader() {
  setFullpageLoading(false);
  const loader = document.getElementById('pagmarCreateFullpageLoader');
  if (loader) {
    loader.hidden = true;
    loader.removeAttribute('aria-busy');
  }
}

export function setAmuletLoaderProgress(frac) {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  const loader = document.getElementById('pagmarCreateFullpageLoader');
  if (!loader) return;

  const percentEl = loader.querySelector('.pagmar__create-fullpage-loader__percent');
  const labelEl = loader.querySelector('.pagmar__create-fullpage-loader__label');
  const sr = loader.querySelector('.pagmar__create-fullpage-loader__sr');
  const label = labelEl?.textContent || DEFAULT_LOADER_TEXT;

  if (percentEl) percentEl.textContent = pct + '%';
  if (sr) sr.textContent = pct + '% ' + label;
}

export async function showAmuletLoader(text, options) {
  const opts = options || {};
  const label = text || DEFAULT_LOADER_TEXT;

  if (opts.fullscreen) {
    hideFrameLoader();
    const loader = ensureFullpageLoader();
    setFullpageLoading(true);
    loader.hidden = false;
    loader.setAttribute('aria-busy', 'true');

    const labelEl = loader.querySelector('.pagmar__create-fullpage-loader__label');
    if (labelEl) labelEl.textContent = label;

    const sr = loader.querySelector('.pagmar__create-fullpage-loader__sr');
    const percentEl = loader.querySelector('.pagmar__create-fullpage-loader__percent');
    const pct = percentEl?.textContent || '0%';
    if (sr) sr.textContent = pct + ' ' + label;

    if (typeof opts.progress === 'number') {
      setAmuletLoaderProgress(opts.progress);
    }
  } else {
    hideFullpageLoader();
    const loader = ensureFrameLoader();
    setFrameLoading(true, Boolean(opts.keepPreview));

    if (loader) {
      loader.hidden = false;
      loader.setAttribute('aria-busy', 'true');
      const sr = loader.querySelector('.pagmar__amulet-frame-loader__sr');
      if (sr) sr.textContent = label;
    }
  }

  const el = statusEl();
  if (el) el.hidden = true;
}

export function hideAmuletFrameLoader() {
  hideFrameLoader();
}

export function hideAmuletLoader() {
  hideFrameLoader();
  hideFullpageLoader();

  const frame = amuletFrameEl();
  if (frame) frame.classList.remove('is-amulet-loading-keep-preview');

  const el = statusEl();
  if (el) el.hidden = true;
}

export function resetAmuletLoaderCache() {
  hideAmuletLoader();
}

export async function setBuildStatus(text, visible) {
  if (visible === false) {
    hideAmuletLoader();
    return;
  }
  await showAmuletLoader(text);
}

export function preloadLoaderGallerySpin() {
  if (vesselsPreloaded) return Promise.resolve();
  vesselsPreloaded = true;
  return Promise.all(
    VESSEL_SRC.map(function (src) {
      return new Promise(function (resolve) {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = src;
      });
    })
  );
}

window.amuletShowLoader = showAmuletLoader;
window.amuletHideLoader = hideAmuletLoader;
window.amuletSetLoaderProgress = setAmuletLoaderProgress;
