(function () {
  'use strict';

  const stage = document.getElementById('questionStage');
  const star = document.getElementById('questionStar');
  if (!stage || !star) return;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const state = {
    w: 0,
    h: 0,
    starSize: 62,
    margin: 14,
    x: 0,
    y: 0,
    anchorX: 0,
    anchorY: 0,
    phaseX: Math.random() * Math.PI * 2,
    phaseY: Math.random() * Math.PI * 2,
    freqX: 0.28 + Math.random() * 0.12,
    freqY: 0.24 + Math.random() * 0.1,
    ampX: 18,
    ampY: 14,
    rafId: 0,
    paused: false,
  };

  function readStarSize() {
    const rect = star.getBoundingClientRect();
    state.starSize = rect.width || 28;
  }

  function bounds() {
    const half = state.starSize / 2;
    const pad = state.margin;
    return {
      minX: pad + half,
      maxX: Math.max(pad + half, state.w - pad - half),
      minY: pad + half,
      maxY: Math.max(pad + half, state.h - pad - half),
    };
  }

  function clamp(val, min, max) {
    return Math.min(max, Math.max(min, val));
  }

  function placeAtCenter() {
    const b = bounds();
    state.anchorX = (b.minX + b.maxX) / 2;
    state.anchorY = (b.minY + b.maxY) / 2;
    state.x = state.anchorX;
    state.y = state.anchorY;
    applyPosition();
  }

  function applyPosition() {
    star.style.left = state.x + 'px';
    star.style.top = state.y + 'px';
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    state.w = rect.width;
    state.h = rect.height;
    readStarSize();

    const b = bounds();
    state.anchorX = clamp(state.anchorX || state.x, b.minX, b.maxX);
    state.anchorY = clamp(state.anchorY || state.y, b.minY, b.maxY);
    state.x = clamp(state.x, b.minX, b.maxX);
    state.y = clamp(state.y, b.minY, b.maxY);
    applyPosition();
  }

  function tick(time) {
    if (!state.paused && !prefersReducedMotion) {
      const t = time * 0.001;
      const b = bounds();
      const driftX = Math.sin(t * state.freqX + state.phaseX) * state.ampX;
      const driftY = Math.sin(t * state.freqY + state.phaseY) * state.ampY;
      const swayX = Math.sin(t * 0.17 + state.phaseY) * 3;
      state.x = clamp(state.anchorX + driftX + swayX, b.minX, b.maxX);
      state.y = clamp(state.anchorY + driftY, b.minY, b.maxY);
      applyPosition();
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function pauseFloat() {
    state.paused = true;
    star.classList.add('is-paused');
  }

  function resumeFloat() {
    state.paused = false;
    star.classList.remove('is-paused');
    const b = bounds();
    state.anchorX = clamp(state.x, b.minX, b.maxX);
    state.anchorY = clamp(state.y, b.minY, b.maxY);
  }

  function getAnchorCanvasPoint() {
    const stageRect = stage.getBoundingClientRect();
    const canvas = stage.closest('.pagmar-canvas');
    const canvasRect = canvas.getBoundingClientRect();
    return {
      x: stageRect.left - canvasRect.left + state.x,
      y: stageRect.top - canvasRect.top + state.y,
    };
  }

  star.addEventListener('click', function () {
    const frame = document.getElementById('questionFrame');
    if (frame && !frame.hidden && frame.classList.contains('is-open')) {
      const closeBtn = document.getElementById('questionFrameStar');
      if (closeBtn) closeBtn.click();
      return;
    }
    window.dispatchEvent(
      new CustomEvent('questionnaire:star-click', {
        detail: { anchor: getAnchorCanvasPoint() },
      })
    );
  });

  window.questionnaireStar = {
    getAnchorCanvasPoint,
    pauseFloat,
    resumeFloat,
    placeAtCenter,
  };

  resize();
  placeAtCenter();
  window.addEventListener('resize', resize);

  if (!prefersReducedMotion) {
    state.rafId = requestAnimationFrame(tick);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      cancelAnimationFrame(state.rafId);
    } else if (!prefersReducedMotion) {
      state.rafId = requestAnimationFrame(tick);
    }
  });
})();
