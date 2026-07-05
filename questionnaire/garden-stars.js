/**
 * Floating star dots — Oobe-XR style drift only (https://oobexr.zerotredici.app).
 */
(function () {
  'use strict';

  if (
    !document.body.classList.contains('pagmar-index') &&
    !document.body.classList.contains('pagmar-create')
  ) {
    return;
  }

  const STAR_COUNT = 96;

  const canvas = document.createElement('canvas');
  canvas.id = 'garden-stars';
  canvas.className = 'pagmar__stars';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100dvh;pointer-events:none;z-index:0;opacity:0;transition:opacity 520ms ease;';

  const atmosphere = document.getElementById('garden-atmosphere-back');
  if (atmosphere) atmosphere.after(canvas);
  else document.body.insertBefore(canvas, document.body.firstChild);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let W = 1;
  let H = 1;
  let fade = 0;
  const stars = [];

  function isQuestionnaireBgMode() {
    const body = document.body;
    return body.classList.contains('is-create-mode') || body.classList.contains('pagmar-create');
  }

  function isOn() {
    const body = document.body;
    return (
      !body.classList.contains('is-site-intro-open') &&
      !body.classList.contains('is-amulet-ready') &&
      !body.classList.contains('is-spec-panel-open') &&
      (isQuestionnaireBgMode() || !body.classList.contains('is-panel-open'))
    );
  }

  function initStars() {
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random(),
        y: Math.random(),
        depth: Math.random(),
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        phaseZ: Math.random() * Math.PI * 2,
        speed: 0.12 + Math.random() * 0.38,
        ampX: 0.012 + Math.random() * 0.042,
        ampY: 0.01 + Math.random() * 0.036,
        size:
          Math.random() > 0.78
            ? 1.55 + Math.random() * 1.35
            : 0.35 + Math.random() * 1.0,
        twinkle: 0.35 + Math.random() * 0.65,
        twinkleSpeed: 0.3 + Math.random() * 0.9,
      });
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function draw(timeSec) {
    ctx.clearRect(0, 0, W, H);
    if (fade < 0.02) return;

    const scale = W / 1920;

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const depth = 0.3 + s.depth * 0.7;
      const driftX = Math.sin(timeSec * s.speed + s.phaseX) * s.ampX * depth;
      const driftY = Math.cos(timeSec * s.speed * 0.81 + s.phaseY) * s.ampY * depth;
      const x = ((s.x + driftX) % 1 + 1) % 1;
      const y = ((s.y + driftY * 0.92 + Math.sin(timeSec * 0.05 + s.phaseZ) * 0.004) % 1 + 1) % 1;
      const px = x * W;
      const py = y * H;

      const twinkle = 0.42 + 0.58 * (0.5 + 0.5 * Math.sin(timeSec * s.twinkleSpeed + s.phaseZ));
      const alpha = fade * s.twinkle * twinkle * (0.12 + s.depth * 0.38);
      const radius = s.size * scale * (0.65 + depth * 0.55);

      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
      ctx.fill();
    }
  }

  let last = performance.now();
  let timeSec = 0;

  function tick(now) {
    const dt = Math.min(32, now - last);
    last = now;
    timeSec += dt * 0.001;

    const want = isOn() ? 1 : 0;
    fade += (want - fade) * (1 - Math.exp(-dt / 520));
    canvas.style.opacity = String(fade);

    draw(timeSec);
    requestAnimationFrame(tick);
  }

  initStars();
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(tick);
})();
