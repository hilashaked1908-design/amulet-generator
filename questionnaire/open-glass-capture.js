/**
 * Open page - full-viewport capture for glass-lens (black + amulet only).
 * Same sampling model as garden: one canvas behind the bubble, clone + CSS filter.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-open')) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'openGlassCapture';
  canvas.className = 'pagmar-open__glass-capture';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  function paintAmulet3D(ctx) {
    var amuletCanvas = document.querySelector('.pagmar-open__amulet-3d canvas');
    if (amuletCanvas && amuletCanvas.width > 0 && amuletCanvas.height > 0) {
      var rect = amuletCanvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        ctx.save();
        try {
          ctx.drawImage(
            amuletCanvas,
            0,
            0,
            amuletCanvas.width,
            amuletCanvas.height,
            rect.left,
            rect.top,
            rect.width,
            rect.height
          );
        } catch (_) {}
        ctx.restore();
        return;
      }
    }

    var placeholder = document.querySelector('.pagmar-open__amulet-placeholder');
    if (!placeholder || !placeholder.complete || !placeholder.naturalWidth) return;
    var phRect = placeholder.getBoundingClientRect();
    if (phRect.width < 1 || phRect.height < 1) return;
    ctx.save();
    try {
      ctx.drawImage(
        placeholder,
        0,
        0,
        placeholder.naturalWidth,
        placeholder.naturalHeight,
        phRect.left,
        phRect.top,
        phRect.width,
        phRect.height
      );
    } catch (_) {}
    ctx.restore();
  }

  function paintOpenCapture() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = window.innerWidth;
    var h = window.innerHeight;
    var pxW = Math.max(1, Math.floor(w * dpr));
    var pxH = Math.max(1, Math.floor(h * dpr));

    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    paintAmulet3D(ctx);
  }

  function tick() {
    if (!document.hidden) paintOpenCapture();
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', paintOpenCapture, { passive: true });
  window.addEventListener('pagmar-open:amulet-ready', paintOpenCapture, { passive: true });

  var placeholder = document.querySelector('.pagmar-open__amulet-placeholder');
  if (placeholder) {
    if (placeholder.complete) paintOpenCapture();
    else placeholder.addEventListener('load', paintOpenCapture, { once: true, passive: true });
  }

  requestAnimationFrame(tick);
})();
