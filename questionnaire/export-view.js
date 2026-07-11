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
import { composeExportCardPng } from './export-card-compose.js?v=20250710-export-view';
import {
  applyFittedTextToElement,
  EXPORT_CARD_LAYOUT,
  fitExportText,
} from './export-text-fit.js?v=20250711-export-text-fit';

const STORAGE_KEY = 'amuletQuestionnaire';
const EXPORT_VIEW_KEY = 'pagmarExportViewActive';

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
}

function bindExportButton(presentMod) {
  const btn = document.getElementById('exportImageBtn');
  if (!btn) return;

  btn.addEventListener('click', async function () {
    btn.disabled = true;
    try {
      let snap = null;
      if (presentMod?.capturePresentedAmuletSnapshot) {
        snap = presentMod.capturePresentedAmuletSnapshot({ targetPx: 2048 });
      }
      await composeExportCardPng({
        amuletSnapshot: snap,
        filename: 'amulet-card',
      });
    } catch (err) {
      console.error('[export-view] image export failed', err);
    } finally {
      btn.disabled = false;
    }
  });
}

function bindExportActions(presentMod, answers) {
  bindExportButton(presentMod);

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
        window.location.href = 'index.html?create=1';
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

  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch (_) {}

  populateExportFields(answers);
  bindChrome();

  try {
    await bootExportViewFog();
  } catch (err) {
    console.warn('[export-view] fog boot failed', err);
  }

  const slot = document.getElementById('exportAmulet3D');
  let presentMod = null;
  if (slot) {
    try {
      presentMod = await mountExportAmulet(slot);
    } catch (err) {
      console.error('[export-view] amulet mount failed', err);
    }
  }

  try {
    await renderExportCardVectors(answers);
  } catch (err) {
    console.warn('[export-view] vectors failed', err);
  }

  fitExportCardTypography();
  bootExportAmuletHover();
  bindExportActions(presentMod, answers);

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
