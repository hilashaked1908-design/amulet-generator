/**
 * Unified repoussé metal sheet — positive-only relief from wish glyph paths.
 * One continuous displaced surface (not wireframe tubes).
 */
import * as THREE from 'https://esm.sh/three@0.160.0';

const MASK_SCALE = 2;

/** Shared repoussé height-field tuning — stone-derived sheet + sharp emboss relief. */
export const REPOUSSE_FIELD_DEFAULTS = {
  maxReliefHeight: 11,
  reliefStroke: 18,
  sheetStroke: 56,
  blurRadius: 5,
  reliefGridBlur: 2,
  baseThickness: 3.2,
  domePower: 0.36,
  rimHeight: 2.0,
};

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

function sceneToMaskPx(x, y, maskOrigin) {
  return {
    px: (x - maskOrigin.minX) * MASK_SCALE,
    py: (maskOrigin.maxY - y) * MASK_SCALE,
  };
}

/**
 * Positive-only height field: sheet silhouette + puffy relief from emboss paths.
 */
export function buildRepousseHeightField(shapePolylines, embossPolylines, maskOrigin, options = {}) {
  const embossMul = options.embossHeightMul ?? 1;
  const maxRelief = (options.maxReliefHeight ?? REPOUSSE_FIELD_DEFAULTS.maxReliefHeight) * embossMul;
  const domePower = options.domePower ?? REPOUSSE_FIELD_DEFAULTS.domePower;
  const rimHeight = (options.rimHeight ?? REPOUSSE_FIELD_DEFAULTS.rimHeight) * embossMul;
  const sheetStroke = options.sheetStroke ?? 52;
  const reliefStroke = options.reliefStroke ?? 20;

  let sheetGrid;
  let w;
  let h;
  const bounds =
    maskOrigin ??
    maskBoundsFromPolylines([...shapePolylines, ...embossPolylines], options.margin ?? 28);
  if (!bounds) throw new Error('repousse: empty polylines');

  if (options.stoneSheetMask?.grid) {
    const sg = options.stoneSheetMask;
    w = sg.w;
    h = sg.h;
    const insetPx = Math.round((options.metalInsetPx ?? 14) * MASK_SCALE);
    sheetGrid = erodeMaskGrid(sg.grid, w, h, insetPx);
    sheetGrid = dilateMaskGridBlur(sheetGrid, w, h, 2);
  } else {
    const raster = rasterizePolylinesToGrid(shapePolylines, sheetStroke, bounds);
    sheetGrid = raster.grid;
    w = raster.w;
    h = raster.h;
    sheetGrid = closeStrokeMaskGrid(sheetGrid, w, h, Math.round(14 * MASK_SCALE), Math.round(10 * MASK_SCALE));
    sheetGrid = fillMaskInteriorHoles(sheetGrid, w, h);
    sheetGrid = dilateMaskGridBlur(sheetGrid, w, h, 3);
  }

  let { grid: reliefGrid } = rasterizePolylinesToGrid(embossPolylines, reliefStroke, bounds);
  const reliefBlur = options.reliefGridBlur ?? REPOUSSE_FIELD_DEFAULTS.reliefGridBlur ?? 3;
  if (reliefBlur > 0) reliefGrid = dilateMaskGridBlur(reliefGrid, w, h, reliefBlur);
  for (let i = 0; i < reliefGrid.length; i++) reliefGrid[i] = reliefGrid[i] && sheetGrid[i] ? 1 : 0;

  const reliefDist = distanceTransform(reliefGrid, w, h);
  const edgeDist = distanceTransform(sheetGrid, w, h);
  let maxReliefDist = 1;
  for (let i = 0; i < reliefDist.length; i++) {
    if (reliefGrid[i] && reliefDist[i] < 1e6) maxReliefDist = Math.max(maxReliefDist, reliefDist[i]);
  }

  const heights = new Float32Array(w * h);
  const rimPx = Math.round(10 * MASK_SCALE);
  for (let i = 0; i < heights.length; i++) {
    if (!sheetGrid[i]) continue;
    let hVal = options.baseThickness ?? 1.2;

    if (reliefGrid[i] && reliefDist[i] < 1e6) {
      const t = Math.min(1, reliefDist[i] / maxReliefDist);
      // Sinusoidal dome — rounded puffy peak, no flat plateau (avoids white sticker highlights)
      const profile = Math.sin(t * Math.PI * 0.5);
      hVal += profile * maxRelief;
    }

    if (edgeDist[i] < rimPx) {
      const t = edgeDist[i] / rimPx;
      hVal += (1 - t * t) * rimHeight;
    }

    heights[i] = hVal;
  }

  const smoothed = blurFloatHeights(heights, w, h, options.blurRadius ?? 7);
  for (let i = 0; i < smoothed.length; i++) {
    if (!sheetGrid[i]) smoothed[i] = 0;
  }

  return {
    heights: smoothed,
    w,
    h,
    maskOrigin: bounds,
    sheetMask: sheetGrid,
    maxHeight: maxRelief + rimHeight + (options.baseThickness ?? 1.2),
    baseThickness: options.baseThickness ?? 1.2,
  };
}

export function buildRepousseMeshFromHeightField(field, options = {}) {
  const { heights, w, h, maskOrigin, sheetMask } = field;
  const spanX = maskOrigin.maxX - maskOrigin.minX;
  const spanY = maskOrigin.maxY - maskOrigin.minY;
  const segX = Math.min(options.segmentsX ?? 160, w);
  const segY = Math.min(options.segmentsY ?? 160, h);
  const zScale = options.zScale ?? 1;
  const dropVerts = options.cullOutside !== false;

  const geom = new THREE.PlaneGeometry(spanX, spanY, segX, segY);
  const pos = geom.attributes.position;
  const uvs = geom.attributes.uv;
  const kept = [];

  for (let i = 0; i < pos.count; i++) {
    const lx = pos.getX(i);
    const ly = pos.getY(i);
    const sx = maskOrigin.minX + (lx / spanX + 0.5) * spanX;
    const sy = maskOrigin.minY + (ly / spanY + 0.5) * spanY;
    const { px, py } = sceneToMaskPx(sx, sy, maskOrigin);
    const inside = px >= 0 && py >= 0 && px < w && py < h && sheetMask[Math.round(py) * w + Math.round(px)];
    const hz = inside ? sampleHeightBilinear(heights, w, h, px, py) * zScale : 0;
    if (options.sceneCoords !== false) {
      pos.setX(i, sx);
      pos.setY(i, sy);
    }
    pos.setZ(i, hz);
    uvs.setXY(i, px / w, py / h);
  }

  geom.computeVertexNormals();
  return geom;
}

export function buildHeightTextures(field) {
  const { heights, w, h, sheetMask } = field;
  let maxH = 0;
  for (let i = 0; i < heights.length; i++) maxH = Math.max(maxH, heights[i]);
  const inv = maxH > 1e-6 ? 1 / maxH : 1;

  const dispCanvas = document.createElement('canvas');
  dispCanvas.width = w;
  dispCanvas.height = h;
  const ctx = dispCanvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < heights.length; i++) {
    const on = sheetMask[i];
    const v = on ? Math.round(Math.min(255, heights[i] * inv * 255)) : 0;
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

  const alphaCanvas = document.createElement('canvas');
  alphaCanvas.width = w;
  alphaCanvas.height = h;
  const actx = alphaCanvas.getContext('2d');
  const aimg = actx.createImageData(w, h);
  for (let i = 0; i < sheetMask.length; i++) {
    const a = sheetMask[i] ? 255 : 0;
    aimg.data[i * 4] = a;
    aimg.data[i * 4 + 1] = a;
    aimg.data[i * 4 + 2] = a;
    aimg.data[i * 4 + 3] = 255;
  }
  actx.putImageData(aimg, 0, 0);
  const alphaMap = new THREE.CanvasTexture(alphaCanvas);
  alphaMap.wrapS = alphaMap.wrapT = THREE.ClampToEdgeWrapping;
  alphaMap.colorSpace = THREE.NoColorSpace;
  alphaMap.minFilter = THREE.LinearFilter;
  alphaMap.magFilter = THREE.LinearFilter;

  return { dispMap, alphaMap, maxH };
}

let brushedMetalBumpCache = null;

/** Fine horizontal brush grain — satin pewter / hand-worked silver plate. */
function createBrushedMetalBumpTexture() {
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
