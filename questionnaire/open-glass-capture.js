/**
 * Open page - garden mirror canvas; glass-clone samples + blurs this layer.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-open')) return;

  var garden = document.getElementById('openGlassGarden');
  if (!garden) return;

  var canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  garden.appendChild(canvas);

  function paintFog(ctx) {
    var fogCanvas = document.querySelector('#openFogHost .pagmar__detail-fog-canvas');
    if (!fogCanvas || fogCanvas.width <= 0 || fogCanvas.height <= 0) return;
    var rect = fogCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    ctx.save();
    try {
      ctx.drawImage(
        fogCanvas,
        0,
        0,
        fogCanvas.width,
        fogCanvas.height,
        rect.left,
        rect.top,
        rect.width,
        rect.height
      );
    } catch (_) {}
    ctx.restore();
  }

  function paintAmulet3D(ctx) {
    var amuletCanvas = document.querySelector('.pagmar-open__amulet-3d canvas');
    if (!amuletCanvas || amuletCanvas.width <= 0 || amuletCanvas.height <= 0) return;
    var rect = amuletCanvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
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
    }

    var ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);
    paintFog(ctx);
    paintAmulet3D(ctx);

    if (window.pagmarGlassLens) {
      window.pagmarGlassLens.tick();
    }
  }

  function tick() {
    if (!document.hidden) paintOpenCapture();
    requestAnimationFrame(tick);
  }

  window.addEventListener('resize', paintOpenCapture, { passive: true });
  window.addEventListener('pagmar-open:amulet-ready', paintOpenCapture, { passive: true });

  requestAnimationFrame(tick);
})();
