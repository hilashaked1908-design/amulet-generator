/**
 * PHQ-style spotlight veil — dramatic black + visible film grain (https://phq.nz).
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  const garden = document.getElementById('questionGarden');
  if (!garden) return;

  const SMOOTH_TAU = 0.4;
  const IDLE_DELAY_MS = 2500;
  const RADIUS_INNER = 0.042;
  const RADIUS_OUTER = 0.34;
  /** Lower internal resolution = smoother (less GPU), grain reads better when scaled up */
  const RENDER_SCALE = 0.72;

  const overlay = document.createElement('div');
  overlay.className = 'pagmar__spotlight-vignette';
  overlay.setAttribute('aria-hidden', 'true');

  const veilCanvas = document.createElement('canvas');
  veilCanvas.className = 'pagmar__spotlight-veil';
  veilCanvas.setAttribute('aria-hidden', 'true');
  overlay.appendChild(veilCanvas);

  function pinOverlayOnTop() {
    if (garden.lastElementChild !== overlay) {
      garden.appendChild(overlay);
    }
  }

  pinOverlayOnTop();
  new MutationObserver(pinOverlayOnTop).observe(garden, { childList: true });

  overlay.style.pointerEvents = 'none';
  veilCanvas.style.pointerEvents = 'none';

  document.addEventListener(
    'wheel',
    function (e) {
      if (!isEnabled()) return;
      if (
        e.target instanceof Element &&
        e.target.closest(
          '.pagmar__index-filter-sidebar, .pagmar__choice-panel, .pagmar__text-panel, ' +
            '.pagmar__spec-panel, .pagmar__index-create'
        )
      ) {
        return;
      }
      if (typeof window.__gardenHandleWheel === 'function') {
        window.__gardenHandleWheel(e);
      }
    },
    { passive: false, capture: true }
  );

  const gl = veilCanvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });

  if (!gl) return;

  const vertSrc =
    'attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}';

  const fragSrc = `
precision mediump float;
uniform vec2 iResolution;
uniform vec2 iMouse;
uniform float iTime;
uniform float uStrength;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 res = max(iResolution, vec2(1.0));
  vec2 uv = frag / res;
  vec2 mouse = vec2(iMouse.x, iResolution.y - iMouse.y) / res;
  float dist = length((uv - mouse) * vec2(res.x / res.y, 1.0));

  float light = smoothstep(${RADIUS_OUTER.toFixed(3)}, ${RADIUS_INNER.toFixed(3)}, dist);
  float darkness = clamp(1.0 - light, 0.0, 1.0);
  darkness = pow(darkness, 0.62);

  float edgeV = length((uv - 0.5) * vec2(res.x / res.y, 1.0));
  darkness = max(darkness, smoothstep(0.5, 0.95, edgeV) * 0.38);

  float t = floor(iTime * 22.0);
  float g1 = hash(floor(frag * 1.35) + vec2(t, 0.0));
  float g2 = hash(floor(frag * 0.52) + vec2(0.0, t * 1.37));
  float g3 = hash(floor(frag * 2.8) + vec2(t * 0.71, t * 0.53));
  float grain = (g1 * 0.45 + g2 * 0.35 + g3 * 0.2 - 0.5) * 2.0;

  float alpha = clamp(darkness * uStrength, 0.0, 1.0);
  vec3 baseCol = vec3(0.008, 0.007, 0.009);
  vec3 col = baseCol + grain * 0.16 * alpha;
  gl_FragColor = vec4(col * alpha, alpha);
}
`;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[garden-spotlight]', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  const vs = compile(gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) return;

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[garden-spotlight]', gl.getProgramInfoLog(program));
    return;
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(program, 'aPos');
  const uResolution = gl.getUniformLocation(program, 'iResolution');
  const uMouse = gl.getUniformLocation(program, 'iMouse');
  const uTime = gl.getUniformLocation(program, 'iTime');
  const uStrength = gl.getUniformLocation(program, 'uStrength');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  let targetX = 0.5;
  let targetY = 0.5;
  let displayX = 0.5;
  let displayY = 0.5;
  let fade = 0;
  let lastMove = performance.now();
  let idlePhase = 0;
  let width = 0;
  let height = 0;
  let lastOpacity = -1;
  let lastPubX = -1;
  let lastPubY = -1;
  let grainTime = 0;

  function isEnabled() {
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
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * RENDER_SCALE;
    width = Math.max(1, Math.floor(window.innerWidth * dpr));
    height = Math.max(1, Math.floor(window.innerHeight * dpr));
    veilCanvas.width = width;
    veilCanvas.height = height;
    gl.viewport(0, 0, width, height);
  }

  function setTargetFromClient(clientX, clientY) {
    targetX = clientX / window.innerWidth;
    targetY = clientY / window.innerHeight;
    lastMove = performance.now();
  }

  function publishMouseIfMoved() {
    if (Math.abs(displayX - lastPubX) < 0.0015 && Math.abs(displayY - lastPubY) < 0.0015) {
      return;
    }
    lastPubX = displayX;
    lastPubY = displayY;
    window.dispatchEvent(
      new CustomEvent('questionnaire:spotlight-move', {
        detail: {
          normX: displayX,
          normY: displayY,
          clientX: displayX * window.innerWidth,
          clientY: displayY * window.innerHeight,
        },
      })
    );
  }

  function drawVeil() {
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform2f(uResolution, width, height);
    gl.uniform2f(uMouse, displayX * width, displayY * height);
    gl.uniform1f(uTime, grainTime);
    gl.uniform1f(uStrength, 1.0);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function tick(now, dt) {
    const enabled = isEnabled();
    const targetFade = enabled ? 1 : 0;
    fade += (targetFade - fade) * (1 - Math.exp(-dt / 520));

    const visible = fade > 0.03;
    overlay.classList.toggle('is-visible', visible);
    if (Math.abs(fade - lastOpacity) > 0.008) {
      lastOpacity = fade;
      overlay.style.opacity = String(fade);
    }

    if (!visible) return;

    grainTime += dt * 0.001;

    if (performance.now() - lastMove > IDLE_DELAY_MS) {
      idlePhase += dt * 0.00065;
      targetX = 0.5 + Math.cos(idlePhase) * 0.2;
      targetY = 0.5 + Math.sin(idlePhase * 0.67) * 0.14;
    }

    const smooth = 1 - Math.exp(-dt / (SMOOTH_TAU * 1000));
    displayX += (targetX - displayX) * smooth;
    displayY += (targetY - displayY) * smooth;
    publishMouseIfMoved();

    drawVeil();
  }

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(32, now - lastT);
    lastT = now;
    tick(now, dt);
    requestAnimationFrame(frame);
  }

  window.addEventListener('pointermove', (e) => {
    if (!isEnabled()) return;
    setTargetFromClient(e.clientX, e.clientY);
  });

  window.addEventListener('resize', resize);
  resize();
  setTargetFromClient(window.innerWidth * 0.5, window.innerHeight * 0.5);
  requestAnimationFrame(frame);

  window.gardenSpotlight = { isEnabled };
})();
