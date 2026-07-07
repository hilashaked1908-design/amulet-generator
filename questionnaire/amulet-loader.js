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
let loaderFogBoot = null;
let loaderFogResize = null;
let loaderFogStop = null;
let fullpageLoadProgress = 0;
let fullpageLoaderResizeBound = false;

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

function amuletLoaderHost() {
  return (
    document.querySelector('.pagmar__index-create-amulet-view, .pagmar__create-amulet-view') ||
    amuletFrameEl()
  );
}

function fullpageLoaderInner() {
  const loader = document.getElementById('pagmarCreateFullpageLoader');
  return loader?.querySelector('.pagmar__create-fullpage-loader__inner') || null;
}

function syncFullpageLoaderPosition() {
  const frame = amuletFrameEl();
  const inner = fullpageLoaderInner();
  const loader = document.getElementById('pagmarCreateFullpageLoader');
  if (!frame || !inner || !loader || loader.hidden) return;

  const rect = frame.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  loader.classList.add('is-frame-anchored');
  inner.style.position = 'fixed';
  inner.style.left = rect.left + rect.width / 2 + 'px';
  inner.style.top = rect.top + rect.height / 2 + 'px';
  inner.style.transform = 'translate(-50%, -50%)';
}

function resetFullpageLoaderPosition() {
  const loader = document.getElementById('pagmarCreateFullpageLoader');
  const inner = fullpageLoaderInner();
  loader?.classList.remove('is-frame-anchored');
  if (!inner) return;
  inner.style.position = '';
  inner.style.left = '';
  inner.style.top = '';
  inner.style.transform = '';
}

function bindFullpageLoaderResize() {
  if (fullpageLoaderResizeBound) return;
  fullpageLoaderResizeBound = true;
  window.addEventListener('resize', syncFullpageLoaderPosition);
}

function unbindFullpageLoaderResize() {
  if (!fullpageLoaderResizeBound) return;
  fullpageLoaderResizeBound = false;
  window.removeEventListener('resize', syncFullpageLoaderPosition);
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
  const host = amuletLoaderHost();
  if (!host) return null;

  let loader = host.querySelector('.pagmar__amulet-frame-loader');
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
  host.appendChild(loader);
  return loader;
}

async function ensureLoaderFogModule() {
  if (loaderFogBoot) return;
  const mod = await import('./loader-fog.js?v=20250707-garden-loader-fog');
  loaderFogBoot = mod.bootCreateLoaderFog;
  loaderFogResize = mod.resizeCreateLoaderFog;
  loaderFogStop = mod.stopCreateLoaderFog;
}

function stopFullpageLoaderFog() {
  if (loaderFogStop) loaderFogStop();
}

async function startFullpageLoaderFog() {
  await ensureLoaderFogModule();
  if (loaderFogBoot) await loaderFogBoot();
}

function ensureFullpageLoader() {
  let loader = document.getElementById('pagmarCreateFullpageLoader');
  if (loader) {
    if (!loader.querySelector('#createFullpageLoaderFog')) {
      const fog = document.createElement('div');
      fog.id = 'createFullpageLoaderFog';
      fog.className = 'pagmar__create-fullpage-loader__fog pagmar__detail-fog';
      fog.setAttribute('aria-hidden', 'true');
      loader.insertBefore(fog, loader.firstChild);
    }
    loader.querySelector('.pagmar__create-fullpage-loader__label')?.remove();
    return loader;
  }

  loader = document.createElement('div');
  loader.id = 'pagmarCreateFullpageLoader';
  loader.className = 'pagmar__create-fullpage-loader';
  loader.hidden = true;
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');

  const fog = document.createElement('div');
  fog.id = 'createFullpageLoaderFog';
  fog.className = 'pagmar__create-fullpage-loader__fog pagmar__detail-fog';
  fog.setAttribute('aria-hidden', 'true');

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

  caption.appendChild(percent);

  const sr = document.createElement('span');
  sr.className = 'pagmar__create-fullpage-loader__sr';
  sr.textContent = '0% ' + DEFAULT_LOADER_TEXT;

  inner.appendChild(vessels);
  inner.appendChild(caption);
  loader.appendChild(fog);
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

function hideFullpageLoader(options) {
  const opts = options || {};
  if (!opts.force && fullpageLoadProgress < 1) return false;
  setFullpageLoading(false);
  stopFullpageLoaderFog();
  resetFullpageLoaderPosition();
  unbindFullpageLoaderResize();
  const loader = document.getElementById('pagmarCreateFullpageLoader');
  if (loader) {
    loader.hidden = true;
    loader.removeAttribute('aria-busy');
  }
  fullpageLoadProgress = 0;
  return true;
}

export function setAmuletLoaderProgress(frac) {
  const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
  fullpageLoadProgress = Math.max(fullpageLoadProgress, pct / 100);
  const loader = document.getElementById('pagmarCreateFullpageLoader');
  if (!loader) return;

  const percentEl = loader.querySelector('.pagmar__create-fullpage-loader__percent');
  const sr = loader.querySelector('.pagmar__create-fullpage-loader__sr');

  if (percentEl) percentEl.textContent = pct + '%';
  if (sr) sr.textContent = pct + '% ' + DEFAULT_LOADER_TEXT;
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
    fullpageLoadProgress =
      typeof opts.progress === 'number' ? Math.max(0, Math.min(1, opts.progress)) : 0;
    await startFullpageLoaderFog();

    const sr = loader.querySelector('.pagmar__create-fullpage-loader__sr');
    const percentEl = loader.querySelector('.pagmar__create-fullpage-loader__percent');
    const pct = percentEl?.textContent || '0%';
    if (sr) sr.textContent = pct + ' ' + DEFAULT_LOADER_TEXT;

    if (typeof opts.progress === 'number') {
      setAmuletLoaderProgress(opts.progress);
    }

    syncFullpageLoaderPosition();
    bindFullpageLoaderResize();
    requestAnimationFrame(syncFullpageLoaderPosition);
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

export function hideAmuletLoader(options) {
  hideFrameLoader();
  hideFullpageLoader(options);

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
