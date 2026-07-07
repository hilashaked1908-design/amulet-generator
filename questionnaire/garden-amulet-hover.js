/**
 * K95-style glass pill — amulet number follows cursor on garden hover.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  const OFFSET_X = 20;
  const OFFSET_Y = -32;
  const SMOOTH = 0.32;

  const tip = document.createElement('div');
  tip.className = 'pagmar__garden-amulet-hover pagmar__glass-pill';
  tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML =
    '<span class="pagmar__glass-pill__arrow" aria-hidden="true"></span>' +
    '<span class="pagmar__glass-pill__text"></span>';
  document.body.appendChild(tip);

  const numEl = tip.querySelector('.pagmar__glass-pill__text');
  let targetX = -9999;
  let targetY = -9999;
  let sx = -9999;
  let sy = -9999;
  let visible = false;
  let fade = 0;

  function setActive(detail) {
    if (!detail || !detail.active || !detail.label) {
      visible = false;
      tip.classList.remove('is-visible');
      return;
    }
    visible = true;
    numEl.textContent = detail.label;
    targetX = detail.x + OFFSET_X;
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
