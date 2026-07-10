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
  const main = document.querySelector('.pagmar__export-main');
  if (!main) return 1;
  const w = main.clientWidth / 1920;
  const h = main.clientHeight / 1080;
  return Math.min(w, h) || 1;
}

function fitExportWishTypography() {
  const wishEl = document.getElementById('exportWish');
  const card = document.getElementById('exportCard');
  if (!wishEl || !card) return;

  const u = getExportUnitPx();
  const maxH = 280 * u;
  const maxW = 360 * u;
  let sizePx = 90 * u;
  const minPx = 28 * u;

  wishEl.style.fontSize = sizePx + 'px';
  wishEl.style.lineHeight = '1';

  let guard = 0;
  while (
    (wishEl.scrollHeight > maxH + 1 || wishEl.scrollWidth > maxW + 1) &&
    sizePx > minPx &&
    guard < 100
  ) {
    sizePx -= 1;
    wishEl.style.fontSize = sizePx + 'px';
    guard += 1;
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

  fitExportWishTypography();
}

async function mountExportAmulet(slot) {
  const present = await import('./amulet-detail-present.js?v=20250710-export-view');
  await present.mountDetailStyleAmulet(slot, 'user-amulet', { useDetailPresentation: true });
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

  fitExportWishTypography();
  bootExportAmuletHover();
  bindExportButton(presentMod);

  window.addEventListener('resize', function () {
    resizeExportViewFog();
    fitExportWishTypography();
  });
}

window.addEventListener('pagehide', function () {
  stopExportViewFog();
  document.body.classList.remove('is-export-view-open');
});

bootExportView();
