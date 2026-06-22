/**
 * Hebrew typography → filled silhouette → binary mask grid.
 * Used for stone emboss (Q1) / engrave (Q2); sigil pipeline unchanged.
 */

const DEFAULT_FONT_FAMILY = 'Frank Ruhl Libre';

/**
 * @param {HTMLCanvasElement} canvas — black glyphs on white background
 * @returns {{ grid: Uint8Array, w: number, h: number }}
 */
export function readMaskGridFromTextCanvas(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      grid[y * w + x] = lum < 232 ? 1 : 0;
    }
  }
  return { grid, w, h };
}

/**
 * Visualize a binary mask grid on a canvas (filled pixels = black).
 * @param {Uint8Array} grid
 * @param {number} w
 * @param {number} h
 * @returns {HTMLCanvasElement}
 */
export function maskGridToCanvas(grid, w, h) {
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = grid[y * w + x];
      const i = (y * w + x) * 4;
      const v = on ? 0 : 255;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/**
 * Render Hebrew text as a high-res filled silhouette (black on white).
 * @param {string} text
 * @param {{
 *   fontFamily?: string,
 *   fontWeight?: string|number,
 *   fontSize?: number,
 *   padding?: number,
 *   pixelRatio?: number,
 *   maxCanvasWidth?: number,
 *   maxCanvasHeight?: number,
 *   wrapWidth?: number|null
 * }} [options]
 */
export async function buildHebrewTextMaskCanvas(text, options = {}) {
  const trimmed = String(text || '').trim();
  if (!trimmed) throw new Error('empty text');

  const fontFamily = options.fontFamily || DEFAULT_FONT_FAMILY;
  const fontWeight = options.fontWeight ?? '700';
  const fontSize = options.fontSize ?? 160;
  const padding = options.padding ?? 48;
  const pixelRatio = options.pixelRatio ?? 4;
  const maxCanvasWidth = options.maxCanvasWidth ?? 1600;
  const maxCanvasHeight = options.maxCanvasHeight ?? 900;
  const wrapWidth = options.wrapWidth ?? null;

  const fontSpec = `${fontWeight} ${fontSize}px "${fontFamily}"`;
  await document.fonts.load(fontSpec);

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  measureCtx.font = `${fontSpec}, serif`;
  measureCtx.direction = 'rtl';

  let lines = [trimmed];
  if (wrapWidth) {
    lines = wrapHebrewLines(measureCtx, trimmed, wrapWidth);
  }

  let maxLineW = 0;
  let totalH = 0;
  const lineHeight = fontSize * 1.22;
  for (const line of lines) {
    const m = measureCtx.measureText(line);
    const lw =
      (m.actualBoundingBoxLeft ?? 0) +
      (m.actualBoundingBoxRight ?? m.width ?? fontSize * line.length * 0.55);
    maxLineW = Math.max(maxLineW, lw);
    totalH += lineHeight;
  }
  totalH -= lineHeight * 0.22;

  const cssW = Math.min(maxCanvasWidth, Math.ceil(maxLineW + padding * 2));
  const cssH = Math.min(maxCanvasHeight, Math.ceil(totalH + padding * 2));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cssW * pixelRatio));
  canvas.height = Math.max(1, Math.round(cssH * pixelRatio));
  const ctx = canvas.getContext('2d');
  ctx.scale(pixelRatio, pixelRatio);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.fillStyle = '#000000';
  ctx.font = `${fontSpec}, serif`;
  ctx.direction = 'rtl';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const startY = cssH / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, idx) => {
    ctx.fillText(line, cssW / 2, startY + idx * lineHeight);
  });

  const { grid, w, h } = readMaskGridFromTextCanvas(canvas);
  return {
    canvas,
    grid,
    w,
    h,
    cssW,
    cssH,
    pixelRatio,
    lines,
    filledPx: countGridFilled(grid)
  };
}

/** @param {string} text @param {object} options @returns {Promise<ReturnType<typeof buildHebrewTextMaskCanvas>>} */
export async function buildHebrewTextMaskGrid(text, options) {
  return buildHebrewTextMaskCanvas(text, options);
}

function countGridFilled(grid) {
  let n = 0;
  for (let i = 0; i < grid.length; i++) n += grid[i];
  return n;
}

function wrapHebrewLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = words[0];
  for (let i = 1; i < words.length; i++) {
    const trial = current + ' ' + words[i];
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}
