const gridCanvas = document.createElement('canvas');
gridCanvas.id = 'grid-bg';
gridCanvas.style.cssText = 'position:fixed;inset:0;z-index:0;width:100%;height:100%;';
document.body.prepend(gridCanvas);

const gc = gridCanvas.getContext('2d');
const lineCanvas = document.createElement('canvas');
const lc = lineCanvas.getContext('2d');

/** Figma @ 1920×1080 — centre band: flat background only. */
const DESIGN_W = 1920;
const DESIGN_H = 1080;
const CLEAR_Y_START = 358.18;
const CLEAR_Y_END = 743;
const EDGE_FADE_DESIGN = 96;
const PAGE_BG = '#F8F8F7';
const PAGE_BG_DARK = '#000000';
const GRID_LINE_LIGHT = '#B5B0AB';
const GRID_LINE_DARK = '#CCC8C0';
const GRID_LINE_ALPHA_LIGHT = 0.82;
const H_LINE_COUNT = 8;
const V_LINE_COUNT = 12;
const GRID_TRANSITION_MS = 520;
const GRID_PHASE_PER_Z = 1.0;
const GRID_SMOOTH = 0.2;

let gridTravelTarget = 0;
let gridTravelDisplay = 0;
let lastDrawnTravel = NaN;
let cachedW = 0;
let cachedH = 0;

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const BG_LIGHT = hexToRgb(PAGE_BG);
const BG_DARK = hexToRgb(PAGE_BG_DARK);
const LINE_LIGHT = hexToRgb(GRID_LINE_LIGHT);
const LINE_DARK = hexToRgb(GRID_LINE_DARK);

function lerpRgb(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function rgbStr(c) {
  return 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')';
}

function rgbaStr(c, alpha) {
  return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + alpha + ')';
}

let gridBlend = 0;
let drawingBlend = 0;
let gridAnimFrame = null;

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function isDarkGridTarget() {
  if (document.body.classList.contains('is-create-exiting')) return false;
  return (
    document.body.classList.contains('pagmar-create') ||
    document.body.classList.contains('is-create-mode')
  );
}

function getTargetGridBlend() {
  return isDarkGridTarget() ? 1 : 0;
}

function designToScreenY(y, H) {
  return y * (H / DESIGN_H);
}

function clearBandScreen(H) {
  return {
    y1: designToScreenY(CLEAR_Y_START, H),
    y2: designToScreenY(CLEAR_Y_END, H),
  };
}

function pageBgAlpha(alpha) {
  return rgbaStr(lerpRgb(BG_LIGHT, BG_DARK, drawingBlend), alpha);
}

function gridLineColor() {
  return rgbStr(lerpRgb(LINE_LIGHT, LINE_DARK, drawingBlend));
}

function drawGridLine(ctx, x1, y1, x2, y2) {
  ctx.strokeStyle = gridLineColor();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawHorizontalLine(ctx, y, W) {
  ctx.strokeStyle = gridLineColor();
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(W, y);
  ctx.stroke();
}

function gridInvMetrics(yTop, yBoundary, vy, count) {
  const invTop = 1 / (vy - yTop);
  const invBound = 1 / (vy - yBoundary);
  const invStep = (invBound - invTop) / count;
  return { invTop, invBound, invStep };
}

/** Even perspective spacing toward horizon at vy (plane above VP). */
function topHorizontals(yTop, yBoundary, vy, count) {
  const invTop = 1 / (vy - yTop);
  const invBound = 1 / (vy - yBoundary);
  const ys = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const inv = invTop + t * (invBound - invTop);
    ys.push(vy - 1 / inv);
  }
  ys[0] = yTop;
  ys[ys.length - 1] = yBoundary;
  return ys;
}

function scrollInvFromTravel(y1, vy) {
  const { invStep } = gridInvMetrics(0, y1, vy, H_LINE_COUNT);
  return gridTravelDisplay * GRID_PHASE_PER_Z * invStep;
}

/** Same lattice as topHorizontals at rest; slides continuously when scrolling. */
function horizontalsForPhase(yTop, yBoundary, vy, count, scrollInv) {
  const { invTop, invBound, invStep } = gridInvMetrics(
    yTop,
    yBoundary,
    vy,
    count
  );
  const extra = 8 + Math.ceil(Math.abs(scrollInv / invStep));
  const ys = new Set();

  for (let i = -extra; i <= count + extra; i++) {
    const inv = invTop + i * invStep + scrollInv;
    if (inv <= invTop + 1e-8 || inv >= invBound - 1e-8) continue;
    const y = vy - 1 / inv;
    if (y >= yTop - 0.001 && y <= yBoundary + 0.001) {
      ys.add(Math.round(y * 1000) / 1000);
    }
  }

  return Array.from(ys).sort((a, b) => a - b);
}

/** Segment of ray from VP through (px, py), clipped to y in [yMin, yMax]. */
function drawVPThroughPoint(ctx, vx, vy, px, py, yMin, yMax) {
  const dy = py - vy;
  if (Math.abs(dy) < 1e-6) return;
  const tMin = (yMin - vy) / dy;
  const tMax = (yMax - vy) / dy;
  const t0 = Math.min(tMin, tMax);
  const t1 = Math.max(tMin, tMax);
  const dx = px - vx;
  drawGridLine(
    ctx,
    vx + t0 * dx,
    vy + t0 * dy,
    vx + t1 * dx,
    vy + t1 * dy
  );
}

/** Original grid geometry — clip optional (bottom mirror supplies its own). */
function drawTopGridLines(ctx, W, y1, vx, vy, scrollInv, clip) {
  const horizontals =
    scrollInv === 0
      ? topHorizontals(0, y1, vy, H_LINE_COUNT)
      : horizontalsForPhase(0, y1, vy, H_LINE_COUNT, scrollInv);
  const yStop =
    horizontals.length >= 2 ? horizontals[horizontals.length - 2] : y1 * 0.85;

  ctx.save();
  if (clip) {
    ctx.beginPath();
    ctx.rect(0, 0, W, y1);
    ctx.clip();
  }

  for (let i = 0; i <= V_LINE_COUNT; i++) {
    const x = (i / V_LINE_COUNT) * W;
    drawVPThroughPoint(ctx, vx, vy, x, 0, 0, yStop);
  }

  for (let i = 1; i < horizontals.length - 1; i++) {
    const y = horizontals[i];
    drawVPThroughPoint(ctx, vx, vy, 0, y, 0, yStop);
    drawVPThroughPoint(ctx, vx, vy, W, y, 0, yStop);
  }

  for (const y of horizontals) {
    drawHorizontalLine(ctx, y, W);
  }

  ctx.restore();
}

function drawTopGrid(ctx, W, y1, vx, vy, scrollInv) {
  drawTopGridLines(ctx, W, y1, vx, vy, scrollInv, true);
}

/** Bottom grid — exact vertical mirror of the top grid raster. */
function drawBottomGridFromTop(ctx, W, H, y1, y2, vx, vy, scrollInv) {
  const bottomH = H - y2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, y2, W, bottomH);
  ctx.clip();
  ctx.translate(0, y2 + bottomH);
  ctx.scale(1, -bottomH / y1);
  drawTopGridLines(ctx, W, y1, vx, vy, scrollInv, false);
  ctx.restore();
}

function applyGridEdgeFades(W, H, y1, y2, fade) {
  let grad = gc.createLinearGradient(0, y1 - fade, 0, y1);
  grad.addColorStop(0, pageBgAlpha(0.18));
  grad.addColorStop(0.45, pageBgAlpha(0.62));
  grad.addColorStop(0.78, pageBgAlpha(0.9));
  grad.addColorStop(1, pageBgAlpha(1));
  gc.fillStyle = grad;
  gc.fillRect(0, y1 - fade, W, fade);

  grad = gc.createLinearGradient(0, y2, 0, y2 + fade);
  grad.addColorStop(0, pageBgAlpha(1));
  grad.addColorStop(0.22, pageBgAlpha(0.9));
  grad.addColorStop(0.55, pageBgAlpha(0.62));
  grad.addColorStop(1, pageBgAlpha(0.18));
  gc.fillStyle = grad;
  gc.fillRect(0, y2, W, fade);
}

function drawPerspectiveGridAtBlend(blend) {
  gridBlend = blend;
  drawingBlend = blend;

  const W = window.innerWidth;
  const H = window.innerHeight;

  if (W !== cachedW || H !== cachedH) {
    cachedW = W;
    cachedH = H;
    gridCanvas.width = W;
    gridCanvas.height = H;
    lineCanvas.width = W;
    lineCanvas.height = H;
  }

  gc.clearRect(0, 0, W, H);
  gc.fillStyle = rgbStr(lerpRgb(BG_LIGHT, BG_DARK, blend));
  gc.fillRect(0, 0, W, H);

  lc.clearRect(0, 0, W, H);
  lc.lineWidth = 0.5;

  const { y1, y2 } = clearBandScreen(H);
  const fade = designToScreenY(EDGE_FADE_DESIGN, H);
  const vx = W / 2;
  const vy = H / 2;
  const scrollInv = scrollInvFromTravel(y1, vy);

  drawTopGrid(lc, W, y1, vx, vy, scrollInv);
  drawBottomGridFromTop(lc, W, H, y1, y2, vx, vy, scrollInv);

  gc.globalAlpha = GRID_LINE_ALPHA_LIGHT + (1 - GRID_LINE_ALPHA_LIGHT) * blend;
  gc.drawImage(lineCanvas, 0, 0);
  gc.globalAlpha = 1;
  applyGridEdgeFades(W, H, y1, y2, fade);
}

function animateGridTransition() {
  const target = getTargetGridBlend();
  cancelAnimationFrame(gridAnimFrame);

  if (
    prefersReducedMotion() ||
    Math.abs(gridBlend - target) < 0.002 ||
    (target === 1 && isDarkGridTarget())
  ) {
    drawPerspectiveGridAtBlend(target);
    return;
  }

  const start = gridBlend;
  const startTime = performance.now();

  function step(now) {
    const raw = Math.min(1, (now - startTime) / GRID_TRANSITION_MS);
    const t = 1 - Math.pow(1 - raw, 3);
    drawPerspectiveGridAtBlend(start + (target - start) * t);
    if (raw < 1) {
      gridAnimFrame = requestAnimationFrame(step);
    }
  }

  gridAnimFrame = requestAnimationFrame(step);
}

function gridScrollFrame() {
  const diff = gridTravelTarget - gridTravelDisplay;

  if (Math.abs(diff) > 0.0002) {
    gridTravelDisplay += diff * GRID_SMOOTH;
  } else if (gridTravelDisplay !== gridTravelTarget) {
    gridTravelDisplay = gridTravelTarget;
  }

  if (gridTravelDisplay !== lastDrawnTravel) {
    lastDrawnTravel = gridTravelDisplay;
    drawPerspectiveGridAtBlend(gridBlend);
  }

  requestAnimationFrame(gridScrollFrame);
}

drawPerspectiveGridAtBlend(getTargetGridBlend());
gridScrollFrame();

window.addEventListener('resize', function () {
  cachedW = 0;
  cachedH = 0;
  drawPerspectiveGridAtBlend(gridBlend);
});

window.addEventListener('questionnaire:camera-move', function (evt) {
  const detail = evt.detail || {};
  if (typeof detail.travel !== 'number') return;
  gridTravelTarget = detail.travel;
  if (detail.sync === 'pan') {
    gridTravelDisplay = detail.travel;
    lastDrawnTravel = NaN;
  }
});

new MutationObserver(animateGridTransition).observe(document.body, {
  attributes: true,
  attributeFilter: ['class'],
});

window.addEventListener('questionnaire:create-open', function () {
  drawPerspectiveGridAtBlend(1);
});

window.addEventListener('questionnaire:create-close', function () {
  animateGridTransition();
});
