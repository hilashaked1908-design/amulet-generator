/**
 * Shared fit layout for questionnaire vector thumbnails (Q1–Q8 grid under question copy).
 * Letter-derived contours and choice presets must use the same box, bleed, and anchor.
 * Box size follows --figma-q-vector-thumb-w/h in request-flow-figma.css.
 */
const THUMB_PAD = 8;
const THUMB_STROKE = 1.5;
const THUMB_STROKE_MARGIN = 6;
const THUMB_MIN_BLEED = 6;
const FALLBACK_THUMB_BOX_W = 131.067;
const FALLBACK_THUMB_BOX_H = 130.361;

function readThumbBoxSize() {
  if (typeof document === 'undefined') {
    return { boxW: FALLBACK_THUMB_BOX_W, boxH: FALLBACK_THUMB_BOX_H };
  }
  const el = document.body || document.documentElement;
  const styles = getComputedStyle(el);
  const boxW = parseFloat(styles.getPropertyValue('--figma-q-vector-thumb-w'));
  const boxH = parseFloat(styles.getPropertyValue('--figma-q-vector-thumb-h'));
  return {
    boxW: Number.isFinite(boxW) ? boxW : FALLBACK_THUMB_BOX_W,
    boxH: Number.isFinite(boxH) ? boxH : FALLBACK_THUMB_BOX_H,
  };
}

function thumbStrokeBleed(bounds, boxW, boxH) {
  const cw = Math.max(bounds.maxX - bounds.minX, 1);
  const ch = Math.max(bounds.maxY - bounds.minY, 1);
  const innerW = boxW - THUMB_PAD * 2;
  const innerH = boxH - THUMB_PAD * 2;
  const scale = Math.min(innerW / cw, innerH / ch);
  const screenBleed = THUMB_STROKE * 2 + THUMB_STROKE_MARGIN * 2 + 6;
  return Math.max(THUMB_MIN_BLEED, screenBleed / Math.max(scale, 0.05));
}

/**
 * @param {{ minX: number, minY: number, maxX: number, maxY: number }} bounds
 */
export function questionnaireThumbFitLayout(bounds) {
  const { boxW, boxH } = readThumbBoxSize();
  const bleed = thumbStrokeBleed(bounds, boxW, boxH);
  const minX = bounds.minX - bleed;
  const minY = bounds.minY - bleed;
  const maxX = bounds.maxX + bleed;
  const maxY = bounds.maxY + bleed;
  const innerW = boxW - THUMB_PAD * 2;
  const innerH = boxH - THUMB_PAD * 2;
  const scale = Math.min(innerW / Math.max(maxX - minX, 1), innerH / Math.max(maxY - minY, 1));
  const tx = boxW - THUMB_PAD - maxX * scale;
  const ty = boxH - THUMB_PAD - maxY * scale;
  return {
    viewBox: '0 0 ' + boxW + ' ' + boxH,
    transform: 'translate(' + tx + ',' + ty + ') scale(' + scale + ')',
    preserveAspectRatio: 'xMaxYMax meet',
  };
}
