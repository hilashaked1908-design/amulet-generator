/**
 * Amulet loaders - gallery vessel spin between questions, morph for idle Q1 / full-page PBR.
 */
import { mountVesselMorph, preloadVesselMorph } from './loader-vessel-morph.js?v=20250709-q-loader';

const DEFAULT_LOADER_TEXT = 'טוען קמע';
const GALLERY_VESSEL_ASSETS = [
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
let galleryFullpageActive = false;

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
  /* Loader sits on the frame - not inside the view, which is hidden while loading. */
  return amuletFrameEl();
}

function fullpageLoaderInner() {
  const loader = document.getElementById('pagmarCreateFullpageLoader');
  return loader?.querySelector('.pagmar__create-fullpage-loader__inner') || null;
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

function appendGalleryVesselSpin(parent, baseClass) {
  const vessels = document.createElement('div');
  vessels.className = baseClass + '__vessels';
  vessels.setAttribute('aria-hidden', 'true');

  GALLERY_VESSEL_ASSETS.forEach(function (src, index) {
    const img = document.createElement('img');
    img.className = baseClass + '__vessel ' + baseClass + '__vessel--' + (index + 1);
    img.src = src;
    img.alt = '';
    img.decoding = 'sync';
    img.draggable = false;
    vessels.appendChild(img);
  });

  parent.appendChild(vessels);
  return vessels;
}

function appendVesselMorph(parent, baseClass) {
  const vessels = document.createElement('div');
  vessels.className = baseClass + '__vessels';
  vessels.setAttribute('aria-hidden', 'true');
  const morph = mountVesselMorph(vessels);
  vessels._vesselMorph = morph;
  parent.appendChild(vessels);
  return vessels;
}

function startFrameLoaderMotion(root) {
  /* Gallery spin uses CSS animation - no JS start needed. */
}

function stopFrameLoaderMotion(root) {
  /* Gallery spin uses CSS animation - no JS stop needed. */
}

function frameHasVectorPreview() {
  const container = document.getElementById('amuletContainer');
  return Boolean(
    container?.querySelector('canvas') ||
      container?.querySelector('.pagmar__questionnaire-stage-vector')
  );
}

function showQuestionnaireFrameLoader(label) {
  /* Q1 - no vector yet: keep the idle stage morph running (don't tear it down). */
  if (!frameHasVectorPreview()) {
    if (typeof window.pagmarStartCreateAmuletMorph === 'function') {
      window.pagmarStartCreateAmuletMorph();
      return true;
    }
  } else {
    stopIdleMorph();
  }

  const loader = ensureFrameLoader();
  if (!loader) return false;

  loader.hidden = false;
  loader.setAttribute('aria-busy', 'true');
  startFrameLoaderMotion(loader);
  const sr = loader.querySelector('.pagmar__amulet-frame-loader__sr');
  if (sr) sr.textContent = label;
  return true;
}

function startVesselMorph(root) {
  const vessels = root?.querySelector('[class$="__vessels"]');
  const morph = vessels?._vesselMorph;
  if (!morph) return;
  morph.stop();
  morph.start();
}

function stopVesselMorph(root) {
  const vessels = root?.querySelector('[class$="__vessels"]');
  vessels?._vesselMorph?.stop();
}

function ensureFrameLoader() {
  const host = amuletLoaderHost();
  if (!host) return null;

  let loader = host.querySelector('.pagmar__amulet-frame-loader');
  if (loader) {
    if (!loader.querySelector('.pagmar__amulet-frame-loader__vessel')) {
      loader.querySelector('.pagmar__amulet-frame-loader__vessels')?.remove();
      appendGalleryVesselSpin(loader, 'pagmar__amulet-frame-loader');
    }
    return loader;
  }

  loader = document.createElement('div');
  loader.className = 'pagmar__amulet-frame-loader';
  loader.hidden = true;
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');

  appendGalleryVesselSpin(loader, 'pagmar__amulet-frame-loader');

  const sr = document.createElement('span');
  sr.className = 'pagmar__amulet-frame-loader__sr';
  sr.textContent = DEFAULT_LOADER_TEXT;

  loader.appendChild(sr);
  host.appendChild(loader);
  return loader;
}

async function ensureLoaderFogModule() {
  if (loaderFogBoot) return;
  const mod = await import('./loader-fog.js?v=20250708-loader-black');
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

function ensureGalleryFullpageLoader() {
  let loader = document.getElementById('pagmarGalleryFullpageLoader');
  if (loader) return loader;

  loader = document.createElement('div');
  loader.id = 'pagmarGalleryFullpageLoader';
  loader.className = 'pagmar__detail-page-loader pagmar__detail-page-loader--create';
  loader.hidden = true;
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');

  const vessels = document.createElement('div');
  vessels.className = 'pagmar__detail-page-loader__vessels';
  vessels.setAttribute('aria-hidden', 'true');

  GALLERY_VESSEL_ASSETS.forEach(function (src, index) {
    const img = document.createElement('img');
    img.className =
      'pagmar__detail-page-loader__vessel pagmar__detail-page-loader__vessel--' + (index + 1);
    img.src = src;
    img.alt = '';
    img.decoding = 'sync';
    img.draggable = false;
    vessels.appendChild(img);
  });

  const sr = document.createElement('span');
  sr.className = 'pagmar__detail-page-loader__sr';
  sr.textContent = DEFAULT_LOADER_TEXT;

  loader.appendChild(vessels);
  loader.appendChild(sr);
  document.body.appendChild(loader);
  return loader;
}

function hideGalleryFullpageLoader() {
  galleryFullpageActive = false;
  const loader = document.getElementById('pagmarGalleryFullpageLoader');
  if (!loader) return;
  loader.classList.remove('is-leaving');
  loader.hidden = true;
  loader.removeAttribute('aria-busy');
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

  appendVesselMorph(inner, 'pagmar__create-fullpage-loader');

  const caption = document.createElement('p');
  caption.className = 'pagmar__create-fullpage-loader__caption';

  const percent = document.createElement('span');
  percent.className = 'pagmar__create-fullpage-loader__percent';
  percent.textContent = '0%';

  caption.appendChild(percent);

  const sr = document.createElement('span');
  sr.className = 'pagmar__create-fullpage-loader__sr';
  sr.textContent = '0% ' + DEFAULT_LOADER_TEXT;

  inner.appendChild(caption);
  loader.appendChild(fog);
  loader.appendChild(inner);
  loader.appendChild(sr);
  document.body.appendChild(loader);
  return loader;
}

let frameLoaderIdleResolvers = [];

function isFrameLoaderActive() {
  const frame = amuletFrameEl();
  if (frame?.classList.contains('is-amulet-loading')) return true;
  const loader = frame?.querySelector('.pagmar__amulet-frame-loader');
  return Boolean(loader && !loader.hidden);
}

function resolveFrameLoaderIdle() {
  const pending = frameLoaderIdleResolvers.slice();
  frameLoaderIdleResolvers = [];
  pending.forEach(function (resolve) {
    resolve();
  });
}

export function waitForAmuletFrameLoaderIdle() {
  if (!isFrameLoaderActive()) return Promise.resolve();
  return new Promise(function (resolve) {
    frameLoaderIdleResolvers.push(resolve);
    window.setTimeout(resolve, 1400);
  });
}

function setFrameLoading(active, keepPreview) {
  const frame = amuletFrameEl();
  if (!frame) return;
  frame.classList.toggle('is-amulet-loading', Boolean(active));
  frame.classList.toggle('is-amulet-loading-keep-preview', Boolean(active && keepPreview));
  if (!active) resolveFrameLoaderIdle();
}

function setFullpageLoading(active) {
  document.body.classList.toggle('is-create-fullpage-loading', Boolean(active));
}

function maybeRestartIdleMorph() {
  if (typeof window.pagmarStartCreateAmuletMorph !== 'function') return;
  if (document.body.classList.contains('is-amulet-rendering')) return;
  if (
    !document.body.classList.contains('is-create-mode') &&
    !document.body.classList.contains('pagmar-create')
  ) {
    return;
  }
  const artboard = document.getElementById('requestArtboard');
  if (artboard?.classList.contains('is-amulet-live')) return;
  const container = document.getElementById('amuletContainer');
  if (
    container?.querySelector('canvas') ||
    container?.querySelector('.pagmar__questionnaire-stage-vector')
  ) {
    return;
  }
  window.pagmarStartCreateAmuletMorph();
}

function stopIdleMorph() {
  if (typeof window.pagmarHideCreateAmuletMorph === 'function') {
    window.pagmarHideCreateAmuletMorph();
  }
}

function hideFrameLoader(options) {
  const opts = options || {};
  setFrameLoading(false, false);
  const frame = amuletFrameEl();
  const loader = frame?.querySelector('.pagmar__amulet-frame-loader');
  if (loader) {
    stopFrameLoaderMotion(loader);
    loader.hidden = true;
    loader.removeAttribute('aria-busy');
  }
  if (!opts.skipIdleMorph) {
    maybeRestartIdleMorph();
  }
  resolveFrameLoaderIdle();
}

function hideFullpageLoader(options) {
  const opts = options || {};
  if (galleryFullpageActive) {
    hideGalleryFullpageLoader();
    setFullpageLoading(false);
    fullpageLoadProgress = 0;
    return true;
  }
  if (!opts.force && fullpageLoadProgress < 1) return false;
  setFullpageLoading(false);
  stopFullpageLoaderFog();
  resetFullpageLoaderPosition();
  const loader = document.getElementById('pagmarCreateFullpageLoader');
  if (loader) {
    stopVesselMorph(loader);
    loader.hidden = true;
    loader.removeAttribute('aria-busy');
  }
  fullpageLoadProgress = 0;
  return true;
}

export function setAmuletLoaderProgress(frac) {
  if (galleryFullpageActive) return;
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

  if (opts.fullscreen && !opts.gallery) {
    await preloadVesselMorph();
  } else {
    await preloadLoaderGallerySpin();
  }

  if (opts.fullscreen && opts.gallery) {
    stopIdleMorph();
    hideFrameLoader({ skipIdleMorph: true });
    hideFullpageLoader({ force: true });
    galleryFullpageActive = true;
    fullpageLoadProgress = 0;
    const loader = ensureGalleryFullpageLoader();
    setFullpageLoading(true);
    loader.hidden = false;
    loader.classList.remove('is-leaving');
    loader.setAttribute('aria-busy', 'true');
    const sr = loader.querySelector('.pagmar__detail-page-loader__sr');
    if (sr) sr.textContent = label;
  } else if (opts.fullscreen) {
    galleryFullpageActive = false;
    stopIdleMorph();
    hideFrameLoader({ skipIdleMorph: true });
    const loader = ensureFullpageLoader();
    setFullpageLoading(true);
    loader.hidden = false;
    loader.setAttribute('aria-busy', 'true');
    startVesselMorph(loader);
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

    resetFullpageLoaderPosition();
  } else {
    hideFullpageLoader({ force: true });
    setFrameLoading(true, Boolean(opts.keepPreview));
    showQuestionnaireFrameLoader(label);
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
    GALLERY_VESSEL_ASSETS.map(function (src) {
      return new Promise(function (resolve) {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = src;
      });
    })
  ).then(function () {
    return preloadVesselMorph();
  });
}

window.amuletShowLoader = showAmuletLoader;
window.amuletHideLoader = hideAmuletLoader;
window.amuletWaitFrameLoaderIdle = waitForAmuletFrameLoaderIdle;
window.amuletSetLoaderProgress = setAmuletLoaderProgress;
