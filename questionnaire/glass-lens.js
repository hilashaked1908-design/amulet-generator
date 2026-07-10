/**
 * Liquid glass - backdrop layer samples a WebGL canvas; CSS filter distorts the clone.
 * Layer stack: page bg → glass-lens__backdrop (clone + tint + chrome) → content.
 */
(function () {
  'use strict';

  const lenses = new Set();
  function directGlassLayers(lensEl) {
    return Array.from(lensEl.children).filter(function (child) {
      return (
        child.classList.contains('glass-clone') ||
        child.classList.contains('glass-lens__tint') ||
        child.classList.contains('glass-chrome')
      );
    });
  }

  function ensureBackdrop(lensEl) {
    if (!lensEl) return;

    const hasBackdrop = Array.from(lensEl.children).some(function (child) {
      return child.classList.contains('glass-lens__backdrop');
    });
    if (hasBackdrop) return;

    const layers = directGlassLayers(lensEl);
    if (!layers.length) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'glass-lens__backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    lensEl.insertBefore(backdrop, layers[0]);
    layers.forEach(function (layer) {
      backdrop.appendChild(layer);
    });
  }

  function getCaptureSource(lensEl) {
    const mode = lensEl.getAttribute('data-glass-source') || 'garden';

    if (mode === 'result-fog') {
      const fogHost = document.getElementById('resultFogHost');
      return fogHost ? fogHost.querySelector('.pagmar__detail-fog-canvas') : null;
    }

    if (mode === 'detail-fog') {
      return document.querySelector('.pagmar__detail-fog-canvas');
    }

    if (mode === 'request-fog') {
      const fogHost = document.getElementById('requestFogHost');
      const fogCanvas = fogHost
        ? fogHost.querySelector('.pagmar__detail-fog-canvas')
        : null;
      if (fogCanvas && fogCanvas.width > 0) return fogCanvas;

      const amuletCanvas = document.querySelector(
        '#amuletContainer canvas, .pagmar__index-create-amulet-view canvas, .pagmar__create-amulet-view canvas'
      );
      if (amuletCanvas && amuletCanvas.width > 0) return amuletCanvas;

      return null;
    }

    if (mode === 'detail-amulet') {
      const amuletCanvas = document.querySelector('.pagmar__detail-amulet-3d canvas');
      if (amuletCanvas && amuletCanvas.offsetWidth > 0) return amuletCanvas;
      return document.querySelector('.pagmar__detail-fog-canvas');
    }

    if (mode === 'result-amulet') {
      const amuletCanvas = document.querySelector('.pagmar__result-amulet-3d canvas');
      if (amuletCanvas && amuletCanvas.offsetWidth > 0) return amuletCanvas;

      const fogHost = document.getElementById('resultFogHost');
      return fogHost ? fogHost.querySelector('.pagmar__detail-fog-canvas') : null;
    }

    if (mode === 'export-amulet') {
      const amuletCanvas = document.querySelector('.pagmar__export-amulet-slot canvas');
      if (amuletCanvas && amuletCanvas.offsetWidth > 0) return amuletCanvas;

      const fogHost = document.getElementById('exportFogHost');
      return fogHost ? fogHost.querySelector('.pagmar__detail-fog-canvas') : null;
    }

    if (mode === 'about-amulet') {
      const amuletCanvas = document.querySelector('.pagmar__about-amulet-3d canvas');
      if (amuletCanvas && amuletCanvas.offsetWidth > 0) return amuletCanvas;

      const fogHost = document.getElementById('aboutFogHost');
      return fogHost ? fogHost.querySelector('.pagmar__detail-fog-canvas') : null;
    }

    if (mode === 'export-fog') {
      const fogHost = document.getElementById('exportFogHost');
      return fogHost ? fogHost.querySelector('.pagmar__detail-fog-canvas') : null;
    }

    const garden = document.querySelector('.pagmar__garden');
    return garden ? garden.querySelector('canvas') : null;
  }

  function shouldPaint(lensEl) {
    if (!lensEl || !lensEl.isConnected) return false;

    const sidebar = lensEl.closest('.pagmar__index-filter-sidebar');
    if (sidebar && !sidebar.classList.contains('is-expanded')) return false;

    const hover = lensEl.closest('.pagmar__garden-amulet-hover');
    if (hover && parseFloat(hover.style.opacity || '0') < 0.04) return false;

    const detailHover = lensEl.closest('.pagmar__detail-amulet-hover');
    if (detailHover && parseFloat(detailHover.style.opacity || '0') < 0.04) return false;

    const resultHover = lensEl.closest('.pagmar__result-amulet-hover');
    if (resultHover && parseFloat(resultHover.style.opacity || '0') < 0.04) return false;

    const exportHover = lensEl.closest('.pagmar__export-amulet-hover');
    if (exportHover && parseFloat(exportHover.style.opacity || '0') < 0.04) return false;

    const aboutHover = lensEl.closest('.pagmar__about-amulet-hover');
    if (aboutHover && parseFloat(aboutHover.style.opacity || '0') < 0.04) return false;

    if (document.body.classList.contains('is-detail-loading')) {
      const detailNum = lensEl.closest('.pagmar__detail-num');
      if (!detailNum) return false;
    }

    const rect = lensEl.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1;
  }

  function paintGlassClone(lensEl) {
    const source = getCaptureSource(lensEl);
    const capture = lensEl.querySelector('.glass-clone__capture');
    if (!source || !capture || capture.tagName !== 'CANVAS' || !shouldPaint(lensEl)) return;

    const lensRect = lensEl.getBoundingClientRect();
    const srcRect = source.getBoundingClientRect();
    if (srcRect.width < 1 || srcRect.height < 1) return;

    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(lensRect.width * dpr));
    const h = Math.max(1, Math.round(lensRect.height * dpr));

    if (capture.width !== w || capture.height !== h) {
      capture.width = w;
      capture.height = h;
      capture.style.width = lensRect.width + 'px';
      capture.style.height = lensRect.height + 'px';
    }

    const scaleX = source.width / srcRect.width;
    const scaleY = source.height / srcRect.height;
    const sx = (lensRect.left - srcRect.left) * scaleX;
    const sy = (lensRect.top - srcRect.top) * scaleY;
    const sw = lensRect.width * scaleX;
    const sh = lensRect.height * scaleY;

    const ctx = capture.getContext('2d');
    if (!ctx) return;

    try {
      ctx.clearRect(0, 0, w, h);
      ctx.filter = 'none';
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
    } catch (_err) {
      ctx.clearRect(0, 0, w, h);
    }
  }

  function tick() {
    if (!lenses.size) return;
    lenses.forEach(function (lensEl) {
      if (!lensEl.isConnected) {
        lenses.delete(lensEl);
        return;
      }
      paintGlassClone(lensEl);
    });
  }

  function register(lensEl) {
    if (!lensEl) return;
    ensureBackdrop(lensEl);
    lenses.add(lensEl);
    paintGlassClone(lensEl);
  }

  function init() {
    document.querySelectorAll('.glass-lens').forEach(register);
  }

  function startPaintLoop() {
    function frame() {
      requestAnimationFrame(frame);
      if (document.hidden) return;
      tick();
    }
    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  startPaintLoop();

  window.pagmarGlassLens = {
    register: register,
    ensureBackdrop: ensureBackdrop,
    unregister: function (lensEl) {
      if (lensEl) lenses.delete(lensEl);
    },
    paint: paintGlassClone,
    tick: tick,
  };
})();
