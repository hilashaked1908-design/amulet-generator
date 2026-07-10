/**
 * Glass question tooltip on result overlay criteria ([שייכות], [תזמון]).
 * Reuses the index garden hover markup/classes for a pixel-identical look.
 */
const CRITERIA_TARGETS = [
  { selector: '.pagmar__result-timing', key: 'q3WhyNow' },
  { selector: '.pagmar__result-belonging', key: 'q2Name' },
];

const OFFSET_X = 20;
const OFFSET_Y = -12;
const SMOOTH = 0.32;
const MAX_TIP_WIDTH = 400;
const VIEWPORT_PAD = 16;

let tip = null;
let surface = null;
let tagEl = null;
let textEl = null;
let targetX = -9999;
let targetY = -9999;
let sx = -9999;
let sy = -9999;
let visible = false;
let fade = 0;
let booted = false;
let rafId = 0;

function questionByKey(key) {
  const qs = window.AMULET_QUESTIONS || [];
  for (let i = 0; i < qs.length; i++) {
    if (qs[i].key === key) return qs[i];
  }
  return null;
}

function measureTipWidth() {
  if (!surface) return MAX_TIP_WIDTH;
  const width = surface.getBoundingClientRect().width;
  return width > 1 ? width : MAX_TIP_WIDTH;
}

function resolvePlacement(clientX, tipWidth) {
  const left = VIEWPORT_PAD;
  const right = window.innerWidth - VIEWPORT_PAD;
  const fitsRight = clientX + OFFSET_X + tipWidth <= right;
  const fitsLeft = clientX - OFFSET_X - tipWidth >= left;

  if (fitsRight) return 'right';
  if (fitsLeft) return 'left';

  const spaceRight = right - clientX;
  const spaceLeft = clientX - left;
  return spaceRight >= spaceLeft ? 'right' : 'left';
}

function setActive(detail) {
  if (!tip) return;

  if (!detail || !detail.active || !detail.key) {
    visible = false;
    tip.classList.remove('is-visible', 'is-anchor-left', 'has-request');
    return;
  }

  const q = questionByKey(detail.key);
  if (!q) {
    visible = false;
    tip.classList.remove('is-visible', 'is-anchor-left', 'has-request');
    return;
  }

  const questionText = String(q.text || '').trim();
  visible = true;
  tagEl.textContent = q.tag || '';
  textEl.textContent = questionText;
  textEl.hidden = !questionText;
  tip.classList.toggle('has-request', !!questionText);

  const placement = resolvePlacement(detail.x, measureTipWidth());
  const anchorLeft = placement === 'left';
  tip.classList.toggle('is-anchor-left', anchorLeft);
  targetX = anchorLeft ? detail.x - OFFSET_X : detail.x + OFFSET_X;
  targetY = detail.y + OFFSET_Y;
  tip.classList.add('is-visible');
}

function onEnter(e) {
  if (e.pointerType === 'touch') return;
  const key = e.currentTarget.getAttribute('data-question-key');
  if (!key) return;
  setActive({
    active: true,
    key,
    x: e.clientX,
    y: e.clientY,
    target: e.currentTarget,
  });
}

function onMove(e) {
  if (e.pointerType === 'touch' || !visible) return;
  const key = e.currentTarget.getAttribute('data-question-key');
  if (!key) return;
  const placement = resolvePlacement(e.clientX, measureTipWidth());
  const anchorLeft = placement === 'left';
  tip.classList.toggle('is-anchor-left', anchorLeft);
  targetX = anchorLeft ? e.clientX - OFFSET_X : e.clientX + OFFSET_X;
  targetY = e.clientY + OFFSET_Y;
}

function onLeave() {
  setActive(null);
}

function bindTarget(el, key) {
  if (!el || el.dataset.questionHoverBound === '1') return;
  el.dataset.questionHoverBound = '1';
  el.setAttribute('data-question-key', key);
  el.classList.add('pagmar__detail-question-target');
  el.addEventListener('pointerenter', onEnter);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerleave', onLeave);
}

function bindCriteriaTargets() {
  CRITERIA_TARGETS.forEach(function (item) {
    const el = document.querySelector(item.selector);
    if (el) bindTarget(el, item.key);
  });
}

function ensureTip() {
  if (tip) return;

  tip = document.createElement('div');
  tip.className = 'pagmar__garden-amulet-hover pagmar__result-question-hover';
  tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML =
    '<div class="pagmar__garden-amulet-hover__surface glass-tooltip glass-lens" data-glass-source="result-fog">' +
    '<div class="glass-lens__backdrop" aria-hidden="true">' +
    '<div class="glass-clone" aria-hidden="true">' +
    '<canvas class="glass-clone__capture" aria-hidden="true"></canvas>' +
    '</div>' +
    '<div class="glass-lens__tint" aria-hidden="true"></div>' +
    '<div class="glass-chrome" aria-hidden="true"></div>' +
    '</div>' +
    '<div class="pagmar__garden-amulet-hover__head">' +
    '<span class="pagmar__glass-pill__arrow" aria-hidden="true"></span>' +
    '<span class="pagmar__garden-amulet-hover__index"></span>' +
    '</div>' +
    '<p class="pagmar__garden-amulet-hover__request"></p>' +
    '</div>';
  const host =
    document.querySelector('.pagmar__result-main') ||
    document.getElementById('resultOverlay') ||
    document.body;
  host.appendChild(tip);

  surface = tip.querySelector('.pagmar__garden-amulet-hover__surface');
  if (window.pagmarGlassLens && surface) {
    window.pagmarGlassLens.register(surface);
  }

  tagEl = tip.querySelector('.pagmar__garden-amulet-hover__index');
  textEl = tip.querySelector('.pagmar__garden-amulet-hover__request');
}

function tick() {
  if (!tip) return;

  if (visible) {
    sx += (targetX - sx) * SMOOTH;
    sy += (targetY - sy) * SMOOTH;
    tip.style.transform = 'translate3d(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px,0)';
  }
  fade += ((visible ? 1 : 0) - fade) * 0.22;
  tip.style.opacity = String(fade);
  rafId = requestAnimationFrame(tick);
}

export function bootResultQuestionHover() {
  if (!document.getElementById('resultOverlay')) return;

  ensureTip();
  bindCriteriaTargets();

  if (booted) return;
  booted = true;
  rafId = requestAnimationFrame(tick);
}
