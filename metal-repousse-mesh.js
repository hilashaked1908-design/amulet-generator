/**
 * Unified repoussé metal sheet — positive-only relief from wish glyph paths.
 * One continuous displaced surface (not wireframe tubes).
 */
import * as THREE from 'https://esm.sh/three@0.160.0';
import { yieldToMainThread } from './render-yield.js';

const MASK_SCALE = 2;

/** Shared repoussé height-field tuning — emboss relief + flat halo plate. */
export const REPOUSSE_FIELD_DEFAULTS = {
  maxReliefHeight: 11,
  reliefStroke: 18,
  sheetStroke: 56,
  blurRadius: 4,
  reliefGridBlur: 2,
  baseThickness: 2.4,
  domePower: 0.36,
  rimHeight: 0,
  /** Fraction of maxRelief kept at emboss outer edge (creates step above flat halo). */
  edgeReliefFrac: 0.88,
  /** Softer blur when flat halo — preserves emboss/halo height step. */
  haloBlurRadius: 2,
};

/** GPU displacement tessellation — moderate subdivisions; detail from 512² height/normal maps. */
export const REPOUSSE_MESH_SEGMENTS = 80;
/** Upsampled height/normal texture resolution (GPU linear filtering = smooth relief). */
export const METAL_HEIGHT_TEX_SIZE = 512;

function buildEmbossSegments(polylines, maxPts = 64) {
  const segments = [];
  for (const { pts, closed } of polylines) {
    if (pts.length < 2) continue;
    let draw = pts;
    if (pts.length > maxPts) {
      draw = [];
      const step = (pts.length - 1) / (maxPts - 1);
      for (let i = 0; i < maxPts; i++) draw.push(pts[Math.round(i * step)]);
    }
    const n = closed ? draw.length : draw.length - 1;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % draw.length;
      segments.push({ ax: draw[i].x, ay: draw[i].y, bx: draw[j].x, by: draw[j].y });
    }
  }
  return segments;
}

function buildSegmentSpatialIndex(segments, cellSize) {
  let minX = Infinity;
  let minY = Infinity;
  for (const seg of segments) {
    minX = Math.min(minX, seg.ax, seg.bx);
    minY = Math.min(minY, seg.ay, seg.by);
  }
  const buckets = new Map();
  const add = (cx, cy, si) => {
    const k = cx + ',' + cy;
    let list = buckets.get(k);
    if (!list) {
      list = [];
      buckets.set(k, list);
    }
    list.push(si);
  };
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const c0 = Math.floor((Math.min(seg.ax, seg.bx) - minX) / cellSize);
    const c1 = Math.floor((Math.max(seg.ax, seg.bx) - minX) / cellSize);
    const r0 = Math.floor((Math.min(seg.ay, seg.by) - minY) / cellSize);
    const r1 = Math.floor((Math.max(seg.ay, seg.by) - minY) / cellSize);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) add(c, r, si);
    }
  }
  return { buckets, minX, minY, cellSize };
}

function nearestTubeDist(x, y, segments, segmentIndex) {
  if (!segments.length) return Infinity;
  if (!segmentIndex) {
    let best = Infinity;
    for (const seg of segments) {
      best = Math.min(best, distPointToSegment(x, y, seg.ax, seg.ay, seg.bx, seg.by));
    }
    return best;
  }
  const { buckets, minX, minY, cellSize } = segmentIndex;
  const cx = Math.floor((x - minX) / cellSize);
  const cy = Math.floor((y - minY) / cellSize);
  let best = Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const list = buckets.get(cx + dc + ',' + (cy + dr));
      if (!list) continue;
      for (const si of list) {
        const seg = segments[si];
        best = Math.min(best, distPointToSegment(x, y, seg.ax, seg.ay, seg.bx, seg.by));
      }
    }
  }
  return best;
}

function dilateMaskGrid1px(grid, w, h) {
  const out = new Uint8Array(grid.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let on = grid[y * w + x];
      if (!on) {
        for (let dy = -1; dy <= 1 && !on; dy++) {
          for (let dx = -1; dx <= 1 && !on; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && grid[ny * w + nx]) on = 1;
          }
        }
      }
      out[y * w + x] = on;
    }
  }
  return out;
}

function dilateMaskGridBlur(grid, w, h, radiusPx) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < grid.length; i++) {
    const v = grid[i] ? 255 : 0;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const blur = Math.max(1, radiusPx * 0.52);
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = 'none';
  const out = ctx.getImageData(0, 0, w, h);
  const result = new Uint8Array(w * h);
  for (let i = 0; i < result.length; i++) result[i] = out.data[i * 4] > 120 ? 1 : 0;
  return result;
}

function dilateMaskGrid(grid, w, h, radiusPx) {
  const r = Math.max(1, Math.round(radiusPx));
  if (r > 22) return dilateMaskGridBlur(grid, w, h, r);
  let cur = grid;
  for (let i = 0; i < r; i++) cur = dilateMaskGrid1px(cur, w, h);
  return cur;
}

function erodeMaskGrid(grid, w, h, radiusPx) {
  const inv = new Uint8Array(grid.length);
  for (let i = 0; i < grid.length; i++) inv[i] = grid[i] ? 0 : 1;
  const dil = dilateMaskGrid(inv, w, h, radiusPx);
  const out = new Uint8Array(grid.length);
  for (let i = 0; i < grid.length; i++) out[i] = dil[i] ? 0 : 1;
  return out;
}

function closeStrokeMaskGrid(grid, w, h, dilatePx, erodePx) {
  let g = dilateMaskGrid(grid, w, h, dilatePx);
  if (erodePx > 0) g = erodeMaskGrid(g, w, h, erodePx);
  return g;
}

function fillMaskInteriorHoles(grid, w, h) {
  const outside = new Uint8Array(grid.length);
  const queue = [];
  const seed = (x, y) => {
    const i = y * w + x;
    if (outside[i] || grid[i]) return;
    outside[i] = 1;
    queue.push(i);
  };
  for (let x = 0; x < w; x++) {
    seed(x, 0);
    seed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seed(0, y);
    seed(w - 1, y);
  }
  while (queue.length) {
    const i = queue.pop();
    const x = i % w;
    const y = (i / w) | 0;
    const visit = (ni) => {
      if (ni < 0 || ni >= grid.length || outside[ni] || grid[ni]) return;
      outside[ni] = 1;
      queue.push(ni);
    };
    if (x > 0) visit(i - 1);
    if (x < w - 1) visit(i + 1);
    if (y > 0) visit(i - w);
    if (y < h - 1) visit(i + w);
  }
  const out = new Uint8Array(grid.length);
  for (let i = 0; i < grid.length; i++) out[i] = grid[i] || !outside[i] ? 1 : 0;
  return out;
}

function distanceTransform(grid, w, h) {
  const INF = 1e7;
  const dist = new Float32Array(w * h);
  for (let i = 0; i < grid.length; i++) dist[i] = grid[i] ? INF : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!grid[i]) continue;
      let m = dist[i];
      if (x > 0) m = Math.min(m, dist[i - 1] + 1);
      if (y > 0) m = Math.min(m, dist[i - w] + 1);
      if (x > 0 && y > 0) m = Math.min(m, dist[i - w - 1] + 1.414213562);
      if (x < w - 1 && y > 0) m = Math.min(m, dist[i - w + 1] + 1.414213562);
      dist[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!grid[i]) continue;
      let m = dist[i];
      if (x < w - 1) m = Math.min(m, dist[i + 1] + 1);
      if (y < h - 1) m = Math.min(m, dist[i + w] + 1);
      if (x < w - 1 && y < h - 1) m = Math.min(m, dist[i + w + 1] + 1.414213562);
      if (x > 0 && y < h - 1) m = Math.min(m, dist[i + w - 1] + 1.414213562);
      dist[i] = m;
    }
  }
  return dist;
}

function maskBoundsFromPolylines(polylines, margin = 24) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { pts } of polylines) {
    for (const pt of pts) {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }
  }
  if (!isFinite(minX)) return null;
  return { minX: minX - margin, maxX: maxX + margin, minY: minY - margin, maxY: maxY + margin };
}

function drawPolylinesMask(ctx, polylines, maskOrigin, strokeW) {
  const toCanvas = (v) => ({
    x: (v.x - maskOrigin.minX) * MASK_SCALE,
    y: (maskOrigin.maxY - v.y) * MASK_SCALE,
  });
  for (const { pts, closed } of polylines) {
    const r = strokeW / 2;
    for (const pt of pts) {
      const p = toCanvas(pt);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    const p0 = toCanvas(pts[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = toCanvas(pts[i]);
      ctx.lineTo(p.x, p.y);
    }
    if (closed) ctx.closePath();
    ctx.stroke();
  }
}

function rasterizePolylinesToGrid(polylines, strokeScene, maskOrigin) {
  const strokeW = strokeScene * MASK_SCALE;
  const w = Math.max(64, Math.ceil((maskOrigin.maxX - maskOrigin.minX) * MASK_SCALE));
  const h = Math.max(64, Math.ceil((maskOrigin.maxY - maskOrigin.minY) * MASK_SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = strokeW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawPolylinesMask(ctx, polylines, maskOrigin, strokeW);
  const data = ctx.getImageData(0, 0, w, h).data;
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      grid[y * w + x] = data[i + 3] > 24 || data[i] > 24 ? 1 : 0;
    }
  }
  return { grid, w, h };
}

function blurFloatHeights(heights, w, h, radiusPx) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  let maxH = 0;
  for (let i = 0; i < heights.length; i++) maxH = Math.max(maxH, heights[i]);
  const inv = maxH > 1e-6 ? 1 / maxH : 1;
  for (let i = 0; i < heights.length; i++) {
    const v = Math.round(Math.min(255, heights[i] * inv * 255));
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const blur = Math.max(1, radiusPx * 0.55);
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = 'none';
  const out = ctx.getImageData(0, 0, w, h);
  const blurred = new Float32Array(w * h);
  for (let i = 0; i < blurred.length; i++) {
    blurred[i] = (out.data[i * 4] / 255) * maxH;
  }
  return blurred;
}

function sampleHeightNearest(heights, w, h, px, py) {
  const ix = Math.max(0, Math.min(w - 1, Math.round(px)));
  const iy = Math.max(0, Math.min(h - 1, Math.round(py)));
  return heights[iy * w + ix];
}

function sampleHeightBilinear(heights, w, h, px, py) {
  const x = Math.max(0, Math.min(w - 1.001, px));
  const y = Math.max(0, Math.min(h - 1.001, py));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const h00 = heights[y0 * w + x0];
  const h10 = heights[y0 * w + x1];
  const h01 = heights[y1 * w + x0];
  const h11 = heights[y1 * w + x1];
  return (
    h00 * (1 - tx) * (1 - ty) + h10 * tx * (1 - ty) + h01 * (1 - tx) * ty + h11 * tx * ty
  );
}

function distPointToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  if (len2 < 1e-8) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * abx + (py - ay) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
}

function nearestPolylineDist(sx, sy, polylines) {
  let best = Infinity;
  for (const { pts, closed } of polylines) {
    if (pts.length < 2) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      best = Math.min(
        best,
        distPointToSegment(sx, sy, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y)
      );
    }
    if (closed) {
      const last = pts.length - 1;
      best = Math.min(
        best,
        distPointToSegment(sx, sy, pts[last].x, pts[last].y, pts[0].x, pts[0].y)
      );
    }
  }
  return best;
}

function sampleMaskBilinear(grid, w, h, px, py) {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(px)));
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(py)));
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = px - x0;
  const ty = py - y0;
  const v00 = grid[y0 * w + x0];
  const v10 = grid[y0 * w + x1];
  const v01 = grid[y1 * w + x0];
  const v11 = grid[y1 * w + x1];
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

/** Continuous tube-dome height from emboss centerlines (smooth 3D letter ribbons). */
function repousseHeightAtScene(sx, sy, field) {
  const { px, py } = sceneToMaskPx(sx, sy, field.maskOrigin);
  if (px < -0.5 || py < -0.5 || px > field.w || py > field.h) return 0;
  if (sampleMaskBilinear(field.sheetMask, field.w, field.h, px, py) < 0.35) return 0;

  if (field.usePolylineRelief && field.embossPolylines?.length) {
    const dist = nearestPolylineDist(sx, sy, field.embossPolylines);
    const tubeR = field.reliefTubeR;
    if (dist <= tubeR) {
      const dome = Math.cos((dist / tubeR) * Math.PI * 0.5);
      const profile = field.edgeReliefFrac + (1 - field.edgeReliefFrac) * dome;
      return field.baseThickness + profile * field.maxRelief;
    }
    return field.baseThickness;
  }

  return sampleHeightBilinear(field.heights, field.w, field.h, px, py);
}

function sceneToMaskPx(x, y, maskOrigin) {
  return {
    px: (x - maskOrigin.minX) * MASK_SCALE,
    py: (maskOrigin.maxY - y) * MASK_SCALE,
  };
}

/**
 * Height field: raised emboss (inner) + completely flat halo plate (outer ring).
 * Center → emboss dome on base; halo ring → constant baseThickness only.
 */
export async function buildRepousseHeightField(shapePolylines, embossPolylines, maskOrigin, options = {}) {
  const onProgress = options.onProgress;
  const embossMul = options.embossHeightMul ?? 1;
  const maxRelief = (options.maxReliefHeight ?? REPOUSSE_FIELD_DEFAULTS.maxReliefHeight) * embossMul;
  const sheetStroke = options.sheetStroke ?? 52;
  const reliefStroke = options.reliefStroke ?? REPOUSSE_FIELD_DEFAULTS.reliefStroke ?? 20;
  const flatHalo = options.flatHalo !== false && !!options.stoneSheetMask?.fromEmboss;
  const baseTh = options.baseThickness ?? REPOUSSE_FIELD_DEFAULTS.baseThickness ?? 2.4;

  let sheetGrid;
  let reliefGrid;
  let w;
  let h;
  const bounds =
    maskOrigin ??
    maskBoundsFromPolylines([...shapePolylines, ...embossPolylines], options.margin ?? 28);
  if (!bounds) throw new Error('repousse: empty polylines');

  if (options.stoneSheetMask?.fromEmboss && options.stoneSheetMask?.reliefGrid) {
    const sg = options.stoneSheetMask;
    w = sg.w;
    h = sg.h;
    sheetGrid = new Uint8Array(sg.grid);
    reliefGrid = new Uint8Array(sg.reliefGrid);
    for (let i = 0; i < reliefGrid.length; i++) {
      if (reliefGrid[i] && !sheetGrid[i]) reliefGrid[i] = 0;
    }
  } else if (options.stoneSheetMask?.grid) {
    const sg = options.stoneSheetMask;
    w = sg.w;
    h = sg.h;
    if (sg.fromEmboss) {
      sheetGrid = new Uint8Array(sg.grid);
    } else {
      const insetPx = Math.round((options.metalInsetPx ?? 14) * MASK_SCALE);
      sheetGrid =
        insetPx > 0 ? erodeMaskGrid(sg.grid, w, h, insetPx) : new Uint8Array(sg.grid);
      sheetGrid = dilateMaskGridBlur(sheetGrid, w, h, 2);
    }
    let { grid: rg } = rasterizePolylinesToGrid(embossPolylines, reliefStroke, bounds);
    const reliefBlur = options.reliefGridBlur ?? REPOUSSE_FIELD_DEFAULTS.reliefGridBlur ?? 3;
    if (reliefBlur > 0) rg = dilateMaskGridBlur(rg, w, h, reliefBlur);
    if (options.stoneSheetMask?.fromEmboss) {
      reliefGrid = closeStrokeMaskGrid(
        rg,
        w,
        h,
        Math.round(4 * MASK_SCALE),
        Math.round(2 * MASK_SCALE)
      );
      for (let i = 0; i < reliefGrid.length; i++) {
        if (reliefGrid[i] && !sheetGrid[i]) reliefGrid[i] = 0;
      }
    } else {
      reliefGrid = rg;
      for (let i = 0; i < reliefGrid.length; i++) reliefGrid[i] = reliefGrid[i] && sheetGrid[i] ? 1 : 0;
    }
  } else {
    const raster = rasterizePolylinesToGrid(shapePolylines, sheetStroke, bounds);
    sheetGrid = raster.grid;
    w = raster.w;
    h = raster.h;
    sheetGrid = closeStrokeMaskGrid(sheetGrid, w, h, Math.round(14 * MASK_SCALE), Math.round(10 * MASK_SCALE));
    sheetGrid = fillMaskInteriorHoles(sheetGrid, w, h);
    sheetGrid = dilateMaskGridBlur(sheetGrid, w, h, 3);
    let { grid: rg } = rasterizePolylinesToGrid(embossPolylines, reliefStroke, bounds);
    const reliefBlur = options.reliefGridBlur ?? REPOUSSE_FIELD_DEFAULTS.reliefGridBlur ?? 3;
    if (reliefBlur > 0) rg = dilateMaskGridBlur(rg, w, h, reliefBlur);
    reliefGrid = rg;
    for (let i = 0; i < reliefGrid.length; i++) reliefGrid[i] = reliefGrid[i] && sheetGrid[i] ? 1 : 0;
  }

  const reliefDist = distanceTransform(reliefGrid, w, h);
  let maxReliefDist = 1;
  for (let i = 0; i < reliefDist.length; i++) {
    if (reliefGrid[i] && reliefDist[i] < 1e6) maxReliefDist = Math.max(maxReliefDist, reliefDist[i]);
  }

  const edgeFrac = options.edgeReliefFrac ?? REPOUSSE_FIELD_DEFAULTS.edgeReliefFrac ?? 0.82;
  const reliefTubeR = reliefStroke * 0.5;
  const usePolylineRelief =
    (options.usePolylineRelief === true || flatHalo) && embossPolylines?.length > 0;
  const heights = new Float32Array(w * h);

  if (usePolylineRelief) {
    const segments = buildEmbossSegments(embossPolylines, 64);
    const segmentIndex = buildSegmentSpatialIndex(segments, Math.max(reliefTubeR * 0.9, 3));
    for (let y = 0; y < h; y++) {
      const sy = bounds.maxY - (y + 0.5) / MASK_SCALE;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!sheetGrid[i]) continue;
        const sx = bounds.minX + (x + 0.5) / MASK_SCALE;
        const dist = nearestTubeDist(sx, sy, segments, segmentIndex);
        if (dist <= reliefTubeR) {
          const dome = Math.cos((dist / reliefTubeR) * Math.PI * 0.5);
          const profile = edgeFrac + (1 - edgeFrac) * dome;
          heights[i] = baseTh + profile * maxRelief;
        } else {
          heights[i] = baseTh;
        }
      }
      if (y % 6 === 0) {
        onProgress?.((y + 1) / h);
        await yieldToMainThread();
      }
    }
  } else {
    for (let i = 0; i < heights.length; i++) {
      if (!sheetGrid[i]) continue;
      const isEmboss = !!reliefGrid[i];
      if (isEmboss && reliefDist[i] < 1e6) {
        const t = Math.min(1, reliefDist[i] / maxReliefDist);
        const dome = Math.sin(t * Math.PI * 0.5);
        const profile = edgeFrac + (1 - edgeFrac) * dome;
        heights[i] = baseTh + profile * maxRelief;
      } else if (flatHalo || !isEmboss) {
        heights[i] = baseTh;
      }
      if (i % 16384 === 0) {
        onProgress?.(i / heights.length);
        await yieldToMainThread();
      }
    }
  }

  onProgress?.(1);
  await yieldToMainThread();

  const blurR = flatHalo
    ? (options.haloBlurRadius ?? REPOUSSE_FIELD_DEFAULTS.haloBlurRadius ?? 2)
    : (options.blurRadius ?? REPOUSSE_FIELD_DEFAULTS.blurRadius ?? 4);
  let smoothed = blurFloatHeights(heights, w, h, blurR);
  const edgeFloor = baseTh + edgeFrac * maxRelief;
  for (let i = 0; i < smoothed.length; i++) {
    if (!sheetGrid[i]) {
      smoothed[i] = 0;
    } else if (usePolylineRelief) {
      if (heights[i] > baseTh + 0.01) {
        smoothed[i] = Math.max(smoothed[i], heights[i], edgeFloor);
      } else {
        smoothed[i] = baseTh;
      }
    } else if (reliefGrid[i]) {
      smoothed[i] = Math.max(smoothed[i], heights[i], edgeFloor);
    } else if (flatHalo) {
      smoothed[i] = baseTh;
    }
  }

  const haloMask = new Uint8Array(w * h);
  for (let i = 0; i < haloMask.length; i++) {
    haloMask[i] = sheetGrid[i] && !reliefGrid[i] ? 1 : 0;
  }

  const distInSheet = distanceTransform(sheetGrid, w, h);

  return {
    heights: smoothed,
    w,
    h,
    maskOrigin: bounds,
    sheetMask: sheetGrid,
    reliefMask: reliefGrid,
    haloMask,
    distIn: distInSheet,
    maxHeight: baseTh + maxRelief,
    baseThickness: baseTh,
  };
}

/** Tight scene bounds around the metal sheet (not the full stone mask). */
export function computeSheetTightMaskOrigin(field, padScene = 3) {
  const { sheetMask, w, h, maskOrigin } = field;
  const padPx = Math.max(1, Math.round(padScene * MASK_SCALE));
  let minPx = w;
  let maxPx = -1;
  let minPy = h;
  let maxPy = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!sheetMask[y * w + x]) continue;
      minPx = Math.min(minPx, x);
      maxPx = Math.max(maxPx, x);
      minPy = Math.min(minPy, y);
      maxPy = Math.max(maxPy, y);
    }
  }
  if (maxPx < 0) return { ...maskOrigin };
  minPx = Math.max(0, minPx - padPx);
  maxPx = Math.min(w - 1, maxPx + padPx);
  minPy = Math.max(0, minPy - padPx);
  maxPy = Math.min(h - 1, maxPy + padPx);
  return {
    minX: maskOrigin.minX + minPx / MASK_SCALE,
    maxX: maskOrigin.minX + (maxPx + 1) / MASK_SCALE,
    minY: maskOrigin.maxY - (maxPy + 1) / MASK_SCALE,
    maxY: maskOrigin.maxY - minPy / MASK_SCALE,
  };
}

/** Drop triangles outside the sheet mask so opaque metal needs no alphaMap. */
export function trimRepousseGeometryToMask(geom, field) {
  const { sheetMask, w, h, maskOrigin } = field;
  const pos = geom.attributes.position;
  const inside = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const { px, py } = sceneToMaskPx(pos.getX(i), pos.getY(i), maskOrigin);
    inside[i] =
      px >= 0 && py >= 0 && px < w && py < h && sheetMask[Math.round(py) * w + Math.round(px)] ? 1 : 0;
  }
  const src = geom.index;
  if (!src) return geom;
  const kept = [];
  for (let f = 0; f < src.count; f += 3) {
    const a = src.getX(f);
    const b = src.getX(f + 1);
    const c = src.getX(f + 2);
    if (inside[a] || inside[b] || inside[c]) kept.push(a, b, c);
  }
  if (kept.length) geom.setIndex(kept);
  return geom;
}

export async function buildRepousseMeshFromHeightField(field, options = {}) {
  const { heights, w, h, maskOrigin, sheetMask } = field;
  const onProgress = options.onProgress;
  const planeOrigin =
    options.tightBounds === false ? maskOrigin : computeSheetTightMaskOrigin(field, options.padScene ?? 3);
  const spanX = planeOrigin.maxX - planeOrigin.minX;
  const spanY = planeOrigin.maxY - planeOrigin.minY;
  const segX = options.segmentsX ?? REPOUSSE_MESH_SEGMENTS;
  const segY = options.segmentsY ?? REPOUSSE_MESH_SEGMENTS;
  const zScale = options.zScale ?? 1;
  const gpuDisplacement = options.gpuDisplacement !== false;
  const sampleHeight = options.sharpHeights ? sampleHeightNearest : sampleHeightBilinear;

  const geom = new THREE.PlaneGeometry(spanX, spanY, segX, segY);
  const pos = geom.attributes.position;
  const uvs = geom.attributes.uv;

  const vertCount = pos.count;
  for (let i = 0; i < vertCount; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const sx = planeOrigin.minX + (lx / spanX + 0.5) * spanX;
    const sy = planeOrigin.minY + (ly / spanY + 0.5) * spanY;
    const { px, py } = sceneToMaskPx(sx, sy, maskOrigin);
    if (options.sceneCoords !== false) {
      pos.setX(i, sx);
      pos.setY(i, sy);
    }
    uvs.setXY(i, px / w, py / h);
    if (gpuDisplacement) {
      pos.setZ(i, 0);
    } else {
      const inside =
        px >= 0 && py >= 0 && px < w && py < h && sheetMask[Math.round(py) * w + Math.round(px)];
      pos.setZ(i, inside ? sampleHeight(heights, w, h, px, py) * zScale : 0);
    }
    if (i % 512 === 0) {
      onProgress?.(i / vertCount);
      await yieldToMainThread();
    }
  }

  geom.computeVertexNormals();
  trimRepousseGeometryToMask(geom, field);
  geom.computeVertexNormals();
  return geom;
}

function upsampleHeights(heights, w, h, outW, outH) {
  const out = new Float32Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const py = outH > 1 ? (y / (outH - 1)) * (h - 1) : 0;
    for (let x = 0; x < outW; x++) {
      const px = outW > 1 ? (x / (outW - 1)) * (w - 1) : 0;
      out[y * outW + x] = sampleHeightBilinear(heights, w, h, px, py);
    }
  }
  return out;
}

function upsampleMask(sheetMask, w, h, outW, outH) {
  const out = new Uint8Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const py = outH > 1 ? (y / (outH - 1)) * (h - 1) : 0;
    for (let x = 0; x < outW; x++) {
      const px = outW > 1 ? (x / (outW - 1)) * (w - 1) : 0;
      out[y * outW + x] = sampleMaskBilinear(sheetMask, w, h, px, py) >= 0.5 ? 1 : 0;
    }
  }
  return out;
}

/** Isotropic satin micro-normal — kept for satin pewter variant. */
function sampleSatinBrushNormal(x, y, strength = 0.11) {
  const a = Math.sin(x * 0.81 + y * 0.57) * Math.cos(x * 0.23 - y * 0.69);
  const b = Math.sin(x * 0.47 - y * 0.83) * Math.cos(x * 0.61 + y * 0.31);
  const dx = (a * 0.81 + b * 0.47) * strength;
  const dy = (a * 0.57 - b * 0.83) * strength;
  let nx = -dx;
  let ny = -dy;
  let nz = 1;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function buildNormalMapFromHeights(heights, w, h, sheetMask, options = {}) {
  const strength = options.strength ?? 5.5;
  const baseTh = options.baseThickness ?? REPOUSSE_FIELD_DEFAULTS.baseThickness ?? 2.4;
  const flatEps = options.flatEps ?? 0.06;
  const img = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const o = i * 4;
      if (!sheetMask[i] || heights[i] <= 0) {
        img[o] = 128;
        img[o + 1] = 128;
        img[o + 2] = 255;
        img[o + 3] = 255;
        continue;
      }
      const isEmboss = heights[i] > baseTh + 0.35;
      let nx;
      let ny;
      let nz;
      const l = x > 0 ? heights[i - 1] : heights[i];
      const r = x < w - 1 ? heights[i + 1] : heights[i];
      const u = y > 0 ? heights[i - w] : heights[i];
      const d = y < h - 1 ? heights[i + w] : heights[i];
      nx = -(r - l) * (isEmboss ? strength : strength * 0.65);
      ny = -(d - u) * (isEmboss ? strength : strength * 0.65);
      nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      img[o] = Math.round((nx * 0.5 + 0.5) * 255);
      img[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      img[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      img[o + 3] = 255;
    }
  }
  return img;
}

export function buildHeightTextures(field, options = {}) {
  const { heights, w, h, sheetMask, distIn, baseThickness } = field;
  const texSize = options.texSize ?? METAL_HEIGHT_TEX_SIZE;
  const aspect = w / h;
  let outW = texSize;
  let outH = texSize;
  if (aspect >= 1) {
    outH = Math.max(64, Math.round(texSize / aspect));
  } else {
    outW = Math.max(64, Math.round(texSize * aspect));
  }

  const hiHeights = upsampleHeights(heights, w, h, outW, outH);
  const hiMask = upsampleMask(sheetMask, w, h, outW, outH);

  let maxH = 0;
  for (let i = 0; i < hiHeights.length; i++) {
    if (hiMask[i]) maxH = Math.max(maxH, hiHeights[i]);
  }
  const inv = maxH > 1e-6 ? 1 / maxH : 1;
  const edgeSoft = 3.2;

  const dispCanvas = document.createElement('canvas');
  dispCanvas.width = outW;
  dispCanvas.height = outH;
  const ctx = dispCanvas.getContext('2d');
  const img = ctx.createImageData(outW, outH);
  for (let i = 0; i < hiHeights.length; i++) {
    const on = hiMask[i];
    const v = on ? Math.round(Math.min(255, hiHeights[i] * inv * 255)) : 0;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = on ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);

  const dispMap = new THREE.CanvasTexture(dispCanvas);
  dispMap.wrapS = dispMap.wrapT = THREE.ClampToEdgeWrapping;
  dispMap.colorSpace = THREE.NoColorSpace;
  dispMap.minFilter = THREE.LinearFilter;
  dispMap.magFilter = THREE.LinearFilter;

  const normalImg = buildNormalMapFromHeights(hiHeights, outW, outH, hiMask, {
    baseThickness: baseThickness ?? REPOUSSE_FIELD_DEFAULTS.baseThickness,
    brushStrength: options.brushStrength ?? 0.11,
  });
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = outW;
  normalCanvas.height = outH;
  normalCanvas.getContext('2d').putImageData(new ImageData(normalImg, outW, outH), 0, 0);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.ClampToEdgeWrapping;
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.minFilter = THREE.LinearFilter;
  normalMap.magFilter = THREE.LinearFilter;

  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = outW;
  alphaCanvas.height = outH;
  const actx = alphaCanvas.getContext('2d');
  const aimg = actx.createImageData(outW, outH);
  for (let i = 0; i < hiMask.length; i++) {
    if (!hiMask[i]) continue;
    aimg.data[i * 4] = 255;
    aimg.data[i * 4 + 1] = 255;
    aimg.data[i * 4 + 2] = 255;
    aimg.data[i * 4 + 3] = 255;
  }
  actx.putImageData(aimg, 0, 0);
  const alphaMap = new THREE.CanvasTexture(alphaCanvas);
  alphaMap.wrapS = alphaMap.wrapT = THREE.ClampToEdgeWrapping;
  alphaMap.colorSpace = THREE.NoColorSpace;
  alphaMap.minFilter = THREE.LinearFilter;
  alphaMap.magFilter = THREE.LinearFilter;

  return { dispMap, normalMap, alphaMap, maxH };
}

let brushedMetalBumpCache = null;

/** Fine horizontal brush grain — satin pewter / hand-worked silver plate. */
export function createBrushedMetalBumpTexture() {
  if (brushedMetalBumpCache) return brushedMetalBumpCache;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const wave = Math.sin(x * 0.42 + Math.sin(y * 0.09) * 1.8) * 0.5 + 0.5;
      const streak = ((y * 3 + Math.floor(wave * 2)) % 5) < 1.15 ? 1 : 0;
      const micro = (Math.sin(x * 2.1) * Math.sin(y * 0.55) * 0.5 + 0.5) * 0.18;
      const v = 118 + streak * 22 + wave * 14 + micro * 40;
      const clamped = Math.max(96, Math.min(168, v));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = clamped;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.2, 3.2);
  brushedMetalBumpCache = tex;
  return tex;
}

/** Opaque unified metal (prototype-v2-unified.html) — relief from geometry only. */
export function buildRepoussePewterMaterial(envMap = null, options = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(options.color ?? 0xd0d0d8),
    metalness: 1.0,
    roughness: options.roughness ?? 0.1,
    envMap,
    envMapIntensity: options.envMapIntensity ?? 3.0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.06,
    reflectivity: 1.0,
    transmission: 0,
    transparent: false,
    opacity: 1,
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
  });
}

/** Hand-worked pewter plate — satin, soft highlights (not mirror polish). */
export function buildSatinPewterMaterial(field, envMap = null, options = {}) {
  const { alphaMap } = buildHeightTextures(field);
  const brush = createBrushedMetalBumpTexture();
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(options.color ?? 0xa6abb4),
    metalness: 1.0,
    roughness: options.roughness ?? 0.54,
    clearcoat: 0.06,
    clearcoatRoughness: 0.42,
    bumpMap: brush,
    bumpScale: options.bumpScale ?? 0.2,
    alphaMap,
    transparent: true,
    alphaTest: 0.32,
    flatShading: !!options.flatShading,
    envMap,
    envMapIntensity: envMap ? (options.envMapIntensity ?? 1.05) : 0.55,
    side: THREE.FrontSide,
    depthWrite: true,
  });
}

/** Burnished silver — geometry carries relief; no height-as-bump (avoids sticker look). */
export function buildPolishedSilverMaterial(field, envMap = null, options = {}) {
  const { alphaMap } = buildHeightTextures(field);
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(options.color ?? 0x9aa3b0),
    metalness: 1.0,
    roughness: options.roughness ?? 0.088,
    clearcoat: 0.38,
    clearcoatRoughness: 0.06,
    alphaMap,
    transparent: true,
    alphaTest: 0.32,
    envMap,
    envMapIntensity: envMap ? (options.envMapIntensity ?? 3.4) : 1.2,
    side: THREE.FrontSide,
    depthWrite: true,
  });
}
