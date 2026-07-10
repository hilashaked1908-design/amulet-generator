/**
 * About overlay - glass tooltip with [014] + request on amulet hover.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  const AMULET_LABEL = '[014]';
  const AMULET_REQUEST = 'בית גדול בתאילנד עם גינה';

  const OFFSET_X = 20;
  const OFFSET_Y = -12;
  const SMOOTH = 0.32;
  const MAX_TIP_WIDTH = 400;
  const VIEWPORT_PAD = 16;

  const tip = document.createElement('div');
  tip.className = 'pagmar__about-amulet-hover pagmar__garden-amulet-hover';
  tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML =
    '<div class="pagmar__garden-amulet-hover__surface glass-tooltip glass-lens" data-glass-source="about-amulet">' +
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
  document.body.appendChild(tip);

  const surface = tip.querySelector('.pagmar__garden-amulet-hover__surface');
  if (window.pagmarGlassLens && surface) {
    window.pagmarGlassLens.register(surface);
  }

  const indexEl = tip.querySelector('.pagmar__garden-amulet-hover__index');
  const requestEl = tip.querySelector('.pagmar__garden-amulet-hover__request');
  indexEl.textContent = AMULET_LABEL;
  requestEl.textContent = AMULET_REQUEST;
  tip.classList.add('has-request');

  let media = null;
  let targetX = -9999;
  let targetY = -9999;
  let sx = -9999;
  let sy = -9999;
  let visible = false;
  let fade = 0;
  let pointerDown = false;
  let pointerMoved = false;

  function bindMedia() {
    media = document.getElementById('aboutAmulet3D');
  }

  function canShow() {
    return (
      document.body.classList.contains('is-about-overlay-open') &&
      media &&
      media.querySelector('canvas') &&
      !pointerDown &&
      !pointerMoved
    );
  }

  function measureTipWidth() {
    const width = surface.getBoundingClientRect().width;
    return width > 1 ? width : MAX_TIP_WIDTH;
  }

  function resolvePlacement(clientX) {
    const fitsRight = clientX + OFFSET_X + measureTipWidth() <= window.innerWidth - VIEWPORT_PAD;
    const fitsLeft = clientX - OFFSET_X - measureTipWidth() >= VIEWPORT_PAD;
    if (fitsRight) return 'right';
    if (fitsLeft) return 'left';
    const spaceRight = window.innerWidth - VIEWPORT_PAD - clientX;
    const spaceLeft = clientX - VIEWPORT_PAD;
    return spaceRight >= spaceLeft ? 'right' : 'left';
  }

  function setVisible(on, x, y) {
    if (!on || !canShow()) {
      visible = false;
      tip.classList.remove('is-visible', 'is-anchor-left');
      return;
    }

    visible = true;
    const anchorLeft = resolvePlacement(x) === 'left';
    tip.classList.toggle('is-anchor-left', anchorLeft);
    targetX = anchorLeft ? x - OFFSET_X : x + OFFSET_X;
    targetY = y + OFFSET_Y;
    tip.classList.add('is-visible');
  }

  function isOverMedia(clientX, clientY) {
    if (!media) return false;
    const el = document.elementFromPoint(clientX, clientY);
    return !!(el && media.contains(el));
  }

  function onPointerEnter(e) {
    if (e.pointerType === 'touch') return;
    setVisible(true, e.clientX, e.clientY);
  }

  function onPointerLeave() {
    setVisible(false);
    pointerMoved = false;
  }

  function onPointerMove(e) {
    if (e.pointerType === 'touch') return;
    if (pointerDown) {
      pointerMoved = true;
      setVisible(false);
      return;
    }
    setVisible(true, e.clientX, e.clientY);
  }

  function onPointerDown() {
    pointerDown = true;
    pointerMoved = false;
    setVisible(false);
  }

  function onPointerUp(e) {
    pointerDown = false;
    if (isOverMedia(e.clientX, e.clientY) && !pointerMoved) {
      setVisible(true, e.clientX, e.clientY);
    }
    pointerMoved = false;
  }

  function attachMediaListeners() {
    if (!media || media.dataset.aboutHoverBound === '1') return;
    media.dataset.aboutHoverBound = '1';
    media.addEventListener('pointerenter', onPointerEnter);
    media.addEventListener('pointerleave', onPointerLeave);
    media.addEventListener('pointermove', onPointerMove);
    media.addEventListener('pointerdown', onPointerDown);
  }

  window.addEventListener('pointerup', onPointerUp);

  window.addEventListener('questionnaire:about-opened', function () {
    bindMedia();
    attachMediaListeners();
  });

  window.addEventListener('questionnaire:about-closed', function () {
    setVisible(false);
    pointerDown = false;
    pointerMoved = false;
  });

  function tick() {
    if (visible) {
      sx += (targetX - sx) * SMOOTH;
      sy += (targetY - sy) * SMOOTH;
      tip.style.transform = 'translate3d(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px,0)';
    }
    fade += ((visible ? 1 : 0) - fade) * 0.22;
    tip.style.opacity = String(fade);
    requestAnimationFrame(tick);
  }

  bindMedia();
  requestAnimationFrame(tick);
})();
