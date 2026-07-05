(function () {
  'use strict';

  const canvas = document.getElementById('introParticles');
  if (!canvas) return;

  const questions = window.AMULET_QUESTIONS || [];
  const ctx = canvas.getContext('2d', { alpha: true });

  const PARTICLE_SIZE = 45;
  const MARGIN = 50;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sprite = new Image();
  sprite.src = 'assets/particle@4x.png';
  let spriteReady = false;
  sprite.onload = function () {
    spriteReady = true;
  };

  function drawParticleShape(size) {
    if (spriteReady) {
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      return;
    }
    ctx.strokeStyle = '#e8e8e8';
    ctx.lineWidth = 1;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
  }

  let particles = [];
  let width = 0;
  let height = 0;
  let rafId = 0;
  let pointerX = -1;
  let pointerY = -1;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function bounds() {
    const half = PARTICLE_SIZE / 2;
    return {
      minX: MARGIN + half,
      maxX: Math.max(MARGIN + half, width - MARGIN - half),
      minY: MARGIN + half,
      maxY: Math.max(MARGIN + half, height - MARGIN - half),
    };
  }

  function createParticle(index) {
    const b = bounds();
    const anchorX = rand(b.minX, b.maxX);
    const anchorY = rand(b.minY, b.maxY);

    return {
      index,
      anchorX,
      anchorY,
      x: anchorX,
      y: anchorY,
      opacity: rand(0.28, 0.52),
      opacityBase: rand(0.28, 0.52),
      ampY: rand(3, 7),
      freq: rand(0.35, 0.55),
      phase: rand(0, Math.PI * 2),
      opacityPhase: rand(0, Math.PI * 2),
      answered: false,
    };
  }

  function initParticles() {
    particles = questions.map(function (_, i) {
      return createParticle(i);
    });
    markAnsweredFromStorage();
  }

  function markAnsweredFromStorage() {
    try {
      const answers = JSON.parse(sessionStorage.getItem('amuletQuestionnaire') || '{}');
      questions.forEach(function (q, i) {
        if (answers[q.key] && particles[i]) {
          particles[i].answered = true;
        }
      });
    } catch {
      /* ignore */
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) {
      ctx.imageSmoothingQuality = 'high';
    }
    initParticles();
  }

  function floatParticle(p, time) {
    const t = time * 0.001;
    const bob = Math.sin(t * p.freq + p.phase) * p.ampY;
    p.x = p.anchorX;
    p.y = p.anchorY + bob;
    p.opacity = p.opacityBase + Math.sin(t * p.freq * 0.85 + p.opacityPhase) * 0.04;
  }

  function drawParticle(p, time) {
    if (p.answered) return;

    const hover =
      pointerX >= 0 &&
      Math.hypot(pointerX - p.x, pointerY - p.y) < PARTICLE_SIZE * 0.55;

    ctx.save();
    ctx.globalAlpha = Math.min(0.85, p.opacity + (hover ? 0.2 : 0));
    ctx.translate(p.x, p.y);

    drawParticleShape(PARTICLE_SIZE);

    ctx.restore();
  }

  function hitTest(x, y) {
    let hit = null;
    let best = Infinity;
    const radius = PARTICLE_SIZE * 0.5;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.answered) continue;
      const d = Math.hypot(x - p.x, y - p.y);
      if (d <= radius && d < best) {
        best = d;
        hit = p;
      }
    }
    return hit;
  }

  function tick(time) {
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!p.answered && !prefersReducedMotion) {
        floatParticle(p, time);
      }
      drawParticle(p, time);
    }

    rafId = requestAnimationFrame(tick);
  }

  function canvasPoint(evt) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
    };
  }

  function openFromPoint(pt) {
    const p = hitTest(pt.x, pt.y);
    if (!p) return;
    window.dispatchEvent(
      new CustomEvent('questionnaire:open', { detail: { index: p.index } })
    );
  }

  canvas.addEventListener('mousemove', function (evt) {
    const pt = canvasPoint(evt);
    pointerX = pt.x;
    pointerY = pt.y;
    canvas.style.cursor = hitTest(pt.x, pt.y) ? 'pointer' : 'default';
  });

  canvas.addEventListener('mouseleave', function () {
    pointerX = -1;
    pointerY = -1;
    canvas.style.cursor = 'default';
  });

  canvas.addEventListener('click', function (evt) {
    openFromPoint(canvasPoint(evt));
  });

  canvas.addEventListener(
    'touchstart',
    function (evt) {
      if (!evt.touches.length) return;
      const t = evt.touches[0];
      const rect = canvas.getBoundingClientRect();
      const pt = { x: t.clientX - rect.left, y: t.clientY - rect.top };
      if (hitTest(pt.x, pt.y)) evt.preventDefault();
    },
    { passive: false }
  );

  canvas.addEventListener('touchend', function (evt) {
    if (!evt.changedTouches.length) return;
    const t = evt.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    openFromPoint({ x: t.clientX - rect.left, y: t.clientY - rect.top });
  });

  window.addEventListener('questionnaire:answered', function (evt) {
    const index = evt.detail && evt.detail.index;
    if (typeof index !== 'number' || !particles[index]) return;
    particles[index].answered = true;
  });

  resize();
  window.addEventListener('resize', resize);

  if (!prefersReducedMotion) {
    rafId = requestAnimationFrame(tick);
  } else {
    tick(0);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      cancelAnimationFrame(rafId);
    } else if (!prefersReducedMotion) {
      rafId = requestAnimationFrame(tick);
    }
  });
})();
