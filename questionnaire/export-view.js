/**
 * Export view page - Figma 2701:46347.
 */
import { renderExportCardVectors } from './amulet-detail-vectors.js?v=20250710-export-view';
import {
  bootExportViewFog,
  resizeExportViewFog,
  stopExportViewFog,
} from './export-view-fog.js?v=20250710-export-view';
import { bootExportAmuletHover } from './export-view-hover.js?v=20250710-export-view';
import { refreshExportBarcode } from './export-barcode.js?v=20250712-barcode-glass3';
import {
  applyFittedTextToElement,
  EXPORT_CARD_LAYOUT,
  fitExportText,
} from './export-text-fit.js?v=20250711-export-text-fit';

const STORAGE_KEY = 'amuletQuestionnaire';
const EXPORT_VIEW_KEY = 'pagmarExportViewActive';

const exportBoot = {
  SHOW_DELAY_MS: 250,
  MIN_LOADER_MS: 200,
  FAILSAFE_MS: 30000,
  _startedAt: Date.now(),
  _loaderShownAt: null,
  _showTimer: null,
  _finished: false,
  _pending: { fog: 1, amulet: 1, vectors: 1 },

  done(key) {
    if (this._finished || !this._pending[key]) return;
    delete this._pending[key];
    if (!Object.keys(this._pending).length) this.finish();
  },

  start() {
    document.body.classList.add('is-export-loading');
    this._showTimer = window.setTimeout(() => this.showLoader(), this.SHOW_DELAY_MS);
    window.setTimeout(() => {
      if (!this._finished) this.forceReveal('failsafe');
    }, this.FAILSAFE_MS);
  },

  showLoader() {
    if (this._finished) return;
    const loader = document.getElementById('exportPageLoader');
    if (!loader) return;
    this._loaderShownAt = Date.now();
    loader.hidden = false;
    loader.setAttribute('aria-busy', 'true');
  },

  finish() {
    if (this._finished) return;
    this._finished = true;
    window.clearTimeout(this._showTimer);

    const loader = document.getElementById('exportPageLoader');
    const hadLoader = this._loaderShownAt != null;

    const reveal = () => {
      document.body.classList.remove('is-export-loading');
      if (!loader) return;
      if (!hadLoader) {
        loader.hidden = true;
        loader.setAttribute('aria-busy', 'false');
        return;
      }
      loader.classList.add('is-leaving');
      window.setTimeout(() => {
        loader.hidden = true;
        loader.classList.remove('is-leaving');
        loader.setAttribute('aria-busy', 'false');
      }, 320);
    };

    if (!hadLoader) {
      reveal();
      return;
    }

    const wait = Math.max(0, this.MIN_LOADER_MS - (Date.now() - this._loaderShownAt));
    window.setTimeout(reveal, wait);
  },

  forceReveal(reason) {
    if (this._finished) return;
    if (reason) console.info('[export-view] force reveal:', reason);
    this._pending = {};
    this.finish();
  },
};

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
    return Boolean(String(answers?.[key] || '').trim());
  });
}

function normalizeText(text) {
  const raw = window.pagmarNormalizeDashes ? window.pagmarNormalizeDashes(text) : text;
  return String(raw || '').trim();
}

function formatExportName(name) {
  const trimmed = normalizeText(name);
  if (!trimmed) return '';
  return '[' + trimmed + ']';
}

function getExportUnitPx() {
  const card = document.getElementById('exportCard');
  if (card) {
    const w = card.getBoundingClientRect().width;
    if (w > 0) return w / 800;
  }
  const main = document.querySelector('.pagmar__export-main');
  if (!main) return 1;
  const w = main.clientWidth / 1920;
  const h = main.clientHeight / 1080;
  return Math.min(w, h) || 1;
}

function fitExportCardTypography() {
  const u = getExportUnitPx();
  const L = EXPORT_CARD_LAYOUT;
  const wishEl = document.getElementById('exportWish');

  if (wishEl?.textContent) {
    const fit = fitExportText(
      wishEl.textContent,
      L.wishWidth * u,
      L.wishHeight * u,
      'wish',
      u
    );
    applyFittedTextToElement(wishEl, fit, 'wish');
  }
}

function populateExportFields(answers) {
  const nameEl = document.getElementById('exportName');
  const timingEl = document.getElementById('exportTiming');
  const outcomeEl = document.getElementById('exportOutcome');
  const wishEl = document.getElementById('exportWish');

  if (nameEl) nameEl.textContent = formatExportName(answers.q2Name);
  if (timingEl) timingEl.textContent = normalizeText(answers.q3WhyNow) || '-';
  if (outcomeEl) outcomeEl.textContent = normalizeText(answers.q7Change) || '-';
  if (wishEl) wishEl.textContent = normalizeText(answers.q1Wish) || '-';

  fitExportCardTypography();
}

async function mountExportAmulet(slot) {
  const present = await import('./amulet-detail-present.js?v=20250710-export-view');
  await present.mountDetailStyleAmulet(slot, 'user-amulet', {
    useDetailPresentation: true,
    fitMargin: 1.18,
  });
  return present;
}

function bindChrome() {
  const closeBtn = document.getElementById('exportCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      window.location.href = 'index.html?result=1';
    });
  }

  const aboutBtn = document.getElementById('exportAboutBtn');
  if (aboutBtn) {
    aboutBtn.addEventListener('click', function () {
      window.location.href = 'index.html?about=1';
    });
  }
}

function bindExportActions(presentMod, answers) {
  const saveBtn = document.getElementById('exportSaveBtn');
  const createAnotherBtn = document.getElementById('exportCreateAnotherBtn');

  if (saveBtn) {
    saveBtn.addEventListener('click', async function () {
      saveBtn.disabled = true;
      try {
        const mod = await import('./amulet-show.js?v=20250710-export-view');
        await mod.prepareSaveFromExportPage(presentMod, answers);
      } catch (err) {
        console.error('[export-view] save failed', err);
        saveBtn.disabled = false;
      }
    });
  }

  if (createAnotherBtn) {
    createAnotherBtn.addEventListener('click', async function () {
      try {
        const mod = await import('./amulet-show.js?v=20250710-export-view');
        mod.startCreateAnotherFromExportPage();
      } catch (err) {
        console.error('[export-view] create another failed', err);
      }
    });
  }
}

async function bootExportView() {
  const answers = loadAnswers();
  if (!allAnswered(answers)) {
    window.location.replace('index.html?create=1');
    return;
  }

  try {
    sessionStorage.setItem(EXPORT_VIEW_KEY, '1');
  } catch (_) {}

  document.body.classList.add('is-export-view-open');
  exportBoot.start();

  const fogPromise = bootExportViewFog()
    .catch(function (err) {
      console.warn('[export-view] fog boot failed', err);
      return null;
    })
    .finally(function () {
      exportBoot.done('fog');
    });

  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch (_) {}

  populateExportFields(answers);
  bindChrome();

  await fogPromise;

  const slot = document.getElementById('exportAmulet3D');
  let presentMod = null;
  if (slot) {
    try {
      presentMod = await mountExportAmulet(slot);
    } catch (err) {
      console.error('[export-view] amulet mount failed', err);
    }
  }
  exportBoot.done('amulet');

  try {
    await renderExportCardVectors(answers);
  } catch (err) {
    console.warn('[export-view] vectors failed', err);
  } finally {
    exportBoot.done('vectors');
  }

  fitExportCardTypography();
  bootExportAmuletHover();
  bindExportActions(presentMod, answers);

  refreshExportBarcode(presentMod).catch(function (err) {
    console.warn('[export-view] barcode init failed', err);
  });

  window.addEventListener('resize', function () {
    resizeExportViewFog();
    fitExportCardTypography();
  });
}

window.addEventListener('pagehide', function () {
  stopExportViewFog();
  document.body.classList.remove('is-export-view-open');
});

bootExportView();
