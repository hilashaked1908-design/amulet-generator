/**
 * Fit export card text to its box using canvas metrics (content-aware font scaling).
 */

export const EXPORT_CARD_LAYOUT = {
  cardSize: 800,
  pagePadding: 50,
  cardOffsetY: -23.33,
  leftInset: 30,
  rightInset: 30,
  nameTop: 27,
  vectorTop: 30,
  vectorLeft: 30,
  amuletWidth: 700,
  amuletHeight: 695,
  amuletTop: 82,
  amuletDrawFit: 0.98,
  barcodeLeft: 153.45,
  barcodeTop: 405,
  barcodeSize: 220,
  barcodeGlassPad: 16,
  barcodeGlassRadius: 40,
  barcodeSpace: 'page',
  wishLeft: 30,
  wishTop: 700.33,
  wishWidth: 739,
  wishHeight: 70,
  actionsWidth: 546,
  actionsGap: 30,
};

const EXPORT_TEXT_SPECS = {
  wish: {
    family: '"Lava Pro HL", serif',
    weight: '100',
    maxSize: 90,
    minSize: 16,
    lineHeight: 70 / 90,
    letterSpacingEm: -0.02,
  },
  body: {
    family: '"TheBasics", sans-serif',
    weight: '400',
    maxSize: 27,
    minSize: 14,
    lineHeight: 1.1,
    letterSpacingEm: 0,
  },
};

let measureCanvas = null;

function getMeasureContext() {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  return measureCanvas.getContext('2d');
}

function buildFont(size, spec) {
  return spec.weight + ' ' + size + 'px ' + spec.family;
}

function applyTextStyle(ctx, size, spec, unitScale) {
  const scale = unitScale || 1;
  ctx.font = buildFont(size, spec);
  if (typeof ctx.letterSpacing === 'string' && spec.letterSpacingEm) {
    ctx.letterSpacing = size * spec.letterSpacingEm + 'px';
  } else if (typeof ctx.letterSpacing === 'string') {
    ctx.letterSpacing = '0px';
  }
}

function pushLongToken(ctx, token, maxWidth, lines) {
  let chunk = '';
  for (let i = 0; i < token.length; i++) {
    const next = chunk + token[i];
    if (chunk && ctx.measureText(next).width > maxWidth) {
      lines.push(chunk);
      chunk = token[i];
    } else {
      chunk = next;
    }
  }
  return chunk;
}

export function wrapExportTextLines(ctx, text, maxWidth) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const words = raw.split(/\s+/);
  const lines = [];
  let line = '';

  words.forEach(function (word, index) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = pushLongToken(ctx, word, maxWidth, lines);
    } else if (ctx.measureText(test).width > maxWidth) {
      line = pushLongToken(ctx, word, maxWidth, lines);
    } else {
      line = test;
    }
    if (index === words.length - 1 && line) lines.push(line);
  });

  return lines;
}

function measureBlockHeight(lines, lineHeight, ctx) {
  if (!lines.length) return 0;
  if (!ctx) return lines.length * lineHeight;

  let total = 0;
  lines.forEach(function (line, index) {
    const metrics = ctx.measureText(line);
    const ascent = metrics.actualBoundingBoxAscent || lineHeight * 0.82;
    const descent = metrics.actualBoundingBoxDescent || lineHeight * 0.18;
    if (index === 0) {
      total += ascent + descent;
    } else {
      total += lineHeight;
    }
  });
  return total;
}

export function fitExportText(text, maxWidth, maxHeight, specKey, unitScale) {
  const spec = EXPORT_TEXT_SPECS[specKey] || EXPORT_TEXT_SPECS.body;
  const scale = unitScale || 1;
  const ctx = getMeasureContext();
  const minSize = spec.minSize * scale;
  const maxSize = spec.maxSize * scale;

  let lo = minSize;
  let hi = maxSize;
  let best = null;

  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const lineHeight = mid * spec.lineHeight;
    applyTextStyle(ctx, mid, spec, scale);
    const lines = wrapExportTextLines(ctx, text, maxWidth);
    const height = measureBlockHeight(lines, lineHeight, ctx);
    const fits =
      lines.length > 0 &&
      height <= maxHeight + 0.5 &&
      lines.every(function (line) {
        return ctx.measureText(line).width <= maxWidth + 0.5;
      });

    if (fits) {
      best = { fontSize: mid, lines: lines, lineHeight: lineHeight, totalHeight: height };
      lo = mid;
    } else {
      hi = mid;
    }
  }

  if (!best) {
    const lineHeight = minSize * spec.lineHeight;
    applyTextStyle(ctx, minSize, spec, scale);
    const lines = wrapExportTextLines(ctx, text, maxWidth);
    best = {
      fontSize: minSize,
      lines: lines,
      lineHeight: lineHeight,
      totalHeight: measureBlockHeight(lines, lineHeight, ctx),
    };
  }

  return best;
}

export function applyFittedTextToElement(el, fit, specKey) {
  if (!el || !fit) return;
  const spec = EXPORT_TEXT_SPECS[specKey] || EXPORT_TEXT_SPECS.body;
  el.style.fontSize = fit.fontSize + 'px';
  el.style.lineHeight = String(spec.lineHeight);
}

export function drawFittedTextBlock(ctx, fit, x, boxBottom, alignRight) {
  if (!fit?.lines?.length) return;

  ctx.textAlign = alignRight ? 'right' : 'left';
  ctx.direction = 'rtl';

  const blockTop = boxBottom - fit.totalHeight;
  let baselineY = blockTop;
  fit.lines.forEach(function (line, index) {
    const metrics = ctx.measureText(line);
    const ascent = metrics.actualBoundingBoxAscent || fit.lineHeight * 0.82;
    if (index === 0) {
      baselineY += ascent;
    } else {
      baselineY += fit.lineHeight;
    }
    ctx.fillText(line, x, baselineY);
  });
}

export function getExportTextSpec(specKey) {
  return EXPORT_TEXT_SPECS[specKey] || EXPORT_TEXT_SPECS.body;
}
