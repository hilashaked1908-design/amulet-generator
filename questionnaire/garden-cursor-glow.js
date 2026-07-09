/**
 * White cursor marker for the garden.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  const SMOOTH = 0.35;
  const CORE_RADIUS = 2.2;
  const GLOW_RADIUS = 22;

  const canvas = document.createElement('canvas');
  canvas.id = 'garden-cursor-glow';
  canvas.className = 'pagmar__cursor-glow';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100dvh;pointer-events:none;z-index:2;opacity:0;transition:opacity 420ms ease;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let W = 1;
  let H = 1;
  let fade = 0;
  let targetX = -9999;
  let targetY = -9999;
  let sx = -9999;
  let sy = -9999;
  let onScreen = false;

  function isOn() {
    return (
      !document.body.classList.contains('is-site-intro-open') &&
      !document.body.classList.contains('is-create-mode') &&
      !document.body.classList.contains('pagmar-create') &&
      !document.body.classList.contains('is-amulet-ready') &&
      !document.body.classList.contains('is-panel-open') &&
      !document.body.classList.contains('is-spec-panel-open')
    );
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const YELLOW_WHITE_RGB = '244, 244, 232';

  function drawGlowDot(x, y, radius, alpha) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, 'rgba(' + YELLOW_WHITE_RGB + ',' + alpha + ')');
    g.addColorStop(0.4, 'rgba(' + YELLOW_WHITE_RGB + ',' + alpha * 0.22 + ')');
    g.addColorStop(1, 'rgba(' + YELLOW_WHITE_RGB + ',0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (fade < 0.02 || !onScreen || sx < -1000) return;

    ctx.globalCompositeOperation = 'screen';
    drawGlowDot(sx, sy, GLOW_RADIUS, fade * 0.38);
    drawGlowDot(sx, sy, CORE_RADIUS * 3.2, fade * 0.72);

    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.arc(sx, sy, CORE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(' + YELLOW_WHITE_RGB + ',' + fade * 0.96 + ')';
    ctx.fill();
  }

  function onPointerMove(e) {
    if (!isOn()) return;
    onScreen = true;
    targetX = e.clientX;
    targetY = e.clientY;
  }

  function onPointerLeave() {
    onScreen = false;
  }

  let last = performance.now();
  function tick(now) {
    const dt = Math.min(32, now - last);
    last = now;

    const want = isOn() ? 1 : 0;
    fade += (want - fade) * (1 - Math.exp(-dt / 520));
    canvas.style.opacity = String(fade);

    if (want && onScreen) {
      sx += (targetX - sx) * SMOOTH;
      sy += (targetY - sy) * SMOOTH;
    }

    draw();
    requestAnimationFrame(tick);
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
  window.addEventListener('pointerleave', onPointerLeave, { passive: true, capture: true });
  window.addEventListener('resize', resize);

  resize();
  requestAnimationFrame(tick);
})();
