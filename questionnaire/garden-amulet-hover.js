/**
 * Figma 2625:44380 - glass amulet hover card: [001] + request text.
 * Clone layer samples garden canvas; CSS filter distorts the clone in place.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  const OFFSET_X = 20;
  const OFFSET_Y = -12;
  const SMOOTH = 0.32;
  const MAX_TIP_WIDTH = 400;
  const VIEWPORT_PAD = 16;

  const tip = document.createElement('div');
  tip.className = 'pagmar__garden-amulet-hover';
  tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML =
    '<div class="pagmar__garden-amulet-hover__surface glass-tooltip glass-lens" data-glass-source="garden">' +
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
  let targetX = -9999;
  let targetY = -9999;
  let sx = -9999;
  let sy = -9999;
  let visible = false;
  let fade = 0;

  function measureTipWidth() {
    const width = surface.getBoundingClientRect().width;
    return width > 1 ? width : MAX_TIP_WIDTH;
  }

  function getSafeBounds() {
    let right = window.innerWidth - VIEWPORT_PAD;
    const sidebar = document.querySelector('.pagmar__index-filter-sidebar');
    if (sidebar) {
      const rect = sidebar.getBoundingClientRect();
      if (rect.width > 0 && rect.left < window.innerWidth) {
        right = Math.min(rect.left - VIEWPORT_PAD, right);
      }
    }
    return { left: VIEWPORT_PAD, right: right };
  }

  function resolvePlacement(clientX, tipWidth) {
    const bounds = getSafeBounds();
    const fitsRight = clientX + OFFSET_X + tipWidth <= bounds.right;
    const fitsLeft = clientX - OFFSET_X - tipWidth >= bounds.left;

    if (fitsRight) return 'right';
    if (fitsLeft) return 'left';

    const spaceRight = bounds.right - clientX;
    const spaceLeft = clientX - bounds.left;
    return spaceRight >= spaceLeft ? 'right' : 'left';
  }

  function setActive(detail) {
    if (!detail || !detail.active || !detail.label) {
      visible = false;
      tip.classList.remove('is-visible', 'is-anchor-left');
      return;
    }

    const request = (
      window.pagmarNormalizeDashes
        ? window.pagmarNormalizeDashes(detail.request)
        : detail.request || ''
    ).trim();
    visible = true;
    indexEl.textContent = detail.label;
    requestEl.textContent = request;
    requestEl.hidden = !request;
    tip.classList.toggle('has-request', !!request);

    const placement = resolvePlacement(detail.x, measureTipWidth());
    const anchorLeft = placement === 'left';
    tip.classList.toggle('is-anchor-left', anchorLeft);
    targetX = anchorLeft ? detail.x - OFFSET_X : detail.x + OFFSET_X;
    targetY = detail.y + OFFSET_Y;
    tip.classList.add('is-visible');
  }

  window.addEventListener('questionnaire:amulet-hover', function (e) {
    setActive(e.detail);
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

  requestAnimationFrame(tick);
})();
