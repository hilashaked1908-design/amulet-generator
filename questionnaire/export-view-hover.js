/**
 * K95-style glass pill - "360°" follows cursor on export view amulet hover.
 */
export function bootExportAmuletHover() {
  if (window.__pagmarExportHoverBooted) return;

  const media = document.querySelector('.pagmar__export-amulet-frame');
  if (!media) return;

  window.__pagmarExportHoverBooted = true;

  const OFFSET_X = 20;
  const OFFSET_Y = -32;
  const SMOOTH = 0.32;

  const tip = document.createElement('div');
  tip.className = 'pagmar__export-amulet-hover';
  tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML =
    '<div class="pagmar__export-amulet-hover__surface glass-lens" data-glass-source="export-amulet">' +
    '<div class="glass-lens__backdrop" aria-hidden="true">' +
    '<div class="glass-clone" aria-hidden="true">' +
    '<canvas class="glass-clone__capture" aria-hidden="true"></canvas>' +
    '</div>' +
    '<div class="glass-lens__tint" aria-hidden="true"></div>' +
    '<div class="glass-chrome" aria-hidden="true"></div>' +
    '</div>' +
    '<span class="pagmar__glass-pill__text">' +
    '360<span class="pagmar__glass-pill__deg" aria-hidden="true"></span>' +
    '</span>' +
    '</div>';
  document.body.appendChild(tip);

  const surface = tip.querySelector('.pagmar__export-amulet-hover__surface');
  if (window.pagmarGlassLens && surface) {
    window.pagmarGlassLens.register(surface);
  }

  let targetX = -9999;
  let targetY = -9999;
  let sx = -9999;
  let sy = -9999;
  let visible = false;
  let fade = 0;
  let pointerDown = false;
  let pointerMoved = false;

  function canShow() {
    return document.body.classList.contains('is-export-view-open') && !pointerDown && !pointerMoved;
  }

  function setVisible(on, x, y) {
    if (!on || !canShow()) {
      visible = false;
      tip.classList.remove('is-visible');
      return;
    }
    visible = true;
    targetX = x + OFFSET_X;
    targetY = y + OFFSET_Y;
    tip.classList.add('is-visible');
  }

  media.addEventListener('pointerenter', function (e) {
    if (!canShow()) return;
    setVisible(true, e.clientX, e.clientY);
    sx = targetX;
    sy = targetY;
  });

  media.addEventListener('pointerleave', function () {
    setVisible(false);
  });

  media.addEventListener('pointerdown', function () {
    pointerDown = true;
    pointerMoved = false;
    setVisible(false);
  });

  media.addEventListener('pointermove', function (e) {
    if (pointerDown) pointerMoved = true;
    if (!visible || !canShow()) return;
    targetX = e.clientX + OFFSET_X;
    targetY = e.clientY + OFFSET_Y;
  });

  window.addEventListener('pointerup', function () {
    pointerDown = false;
    window.setTimeout(function () {
      pointerMoved = false;
    }, 120);
  });

  function tick() {
    if (visible) {
      sx += (targetX - sx) * SMOOTH;
      sy += (targetY - sy) * SMOOTH;
      fade = Math.min(1, fade + 0.12);
    } else {
      fade = Math.max(0, fade - 0.1);
    }
    tip.style.opacity = String(fade);
    tip.style.transform = 'translate3d(' + sx + 'px,' + sy + 'px,0)';
    requestAnimationFrame(tick);
  }
  tick();
}
