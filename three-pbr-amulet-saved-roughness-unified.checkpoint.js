/**
 * גרסה שמורה — עם חספוס (SVG bump + PBR displacement לפי עיסוק).
 * L3: גוש אחיד (ללא בועות gap). להשוואה מול three-pbr-amulet.js.
 * מקור: three-pbr-amulet-checkpoint.js (commit checkpoint יציב).
 */
import * as THREE from 'https://esm.sh/three@0.160.0';
import { RoomEnvironment } from 'https://esm.sh/three@0.160.0/examples/jsm/environments/RoomEnvironment.js';
const W = 680;
const H = 680;
const CX = 340;
const CY = 340;
const TUBE_RADIUS = 6;
const PATH_STEP = 0.8;
/** תואם ל-PATH_MAIN_STROKE ב-prototype-v2 */
const L3_STROKE_WIDTH = 45;
/** תואם ל-prototype-v2 */
const FRAME_PAD = 40;
const MASK_SCALE = 2;
const MASK_MESH_STEP = 2;

let active = { renderer: null, envMap: null };

function disposeActive() {
  if (active.envMap) {
    active.envMap.dispose();
    active.envMap = null;
  }
  if (active.renderer) {
    active.renderer.dispose();
    active.renderer = null;
  }
}

function disposeScene(scene) {
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

function setupEnvironment(renderer, scene) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment(renderer);
  const envMap = pmremGenerator.fromScene(room, 0.04).texture;
  scene.background = null;
  scene.environment = envMap;
  pmremGenerator.dispose();
  return envMap;
}

function addLights(scene) {
  const dir1 = new THREE.DirectionalLight(0xffffff, 5.0);
  dir1.position.set(1, 2, 3);
  const dir2 = new THREE.DirectionalLight(0x4488ff, 2.0);
  dir2.position.set(-2, -1, 1);
  const dir3 = new THREE.DirectionalLight(0xffdd88, 1.5);
  dir3.position.set(0, -3, -1);
  scene.add(dir1, dir2, dir3);
}

/** 1 = חלק, 0 = קוצני — תואם ל-prototype-v2-saved-roughness.html */
const OCCUPATION_SMOOTHNESS = {
  tech_finance: 1,
  governance_security: 0.82,
  knowledge_teaching: 0.62,
  care_health: 0.42,
  agriculture: 0.22,
  creation_spirit: 0
};

function occupationRoughness(style2) {
  const key = style2?.occupationKey || 'care_health';
  const smooth = OCCUPATION_SMOOTHNESS[key] ?? 0.5;
  return 1 - smooth;
}

function metalRoughnessFromStyle2(style2) {
  const key = style2?.occupationKey || 'care_health';
  if (key === 'tech_finance') return 0.002;
  const rough = occupationRoughness(style2);
  return Math.min(0.25, 0.01 + rough * rough * 0.14 + rough * 0.1);
}

const bumpTextureCache = {};

function createOccupationBumpTexture(occupationKey) {
  if (occupationKey === 'tech_finance') return null;
  const rough = 1 - (OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5);
  if (rough < 0.1) return null;
  if (bumpTextureCache[occupationKey]) return bumpTextureCache[occupationKey];

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n =
        Math.sin(x * 0.31 + y * 0.17) * 0.35 +
        Math.sin(x * 0.71 - y * 0.43) * 0.25 +
        Math.random() * 0.4;
      const v = 128 + n * rough * 110;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  bumpTextureCache[occupationKey] = tex;
  return tex;
}

function buildMetalMaterial(style2, forFrame = false) {
  const key = style2?.occupationKey || 'care_health';
  const rough = occupationRoughness(style2);
  const polished = key === 'tech_finance';
  const mat = polished
    ? new THREE.MeshPhysicalMaterial({
        color: 0x9a9aa8,
        metalness: 1.0,
        roughness: 0.002,
        clearcoat: 1.0,
        clearcoatRoughness: 0.01,
        envMapIntensity: 2.5
      })
    : new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 1.0,
        roughness: forFrame
          ? Math.min(0.06, 0.025 + rough * 0.025)
          : metalRoughnessFromStyle2(style2),
        envMapIntensity: 1.5
      });
  if (!forFrame && !polished) {
    const bumpTex = createOccupationBumpTexture(key);
    if (bumpTex) {
      mat.bumpMap = bumpTex;
      mat.bumpScale = rough * rough * 0.24 + rough * 0.09;
    }
  }
  return mat;
}

function buildCeramicMaterial(hexColor, style3, ageNum) {
  const age = Math.max(1, Math.min(120, Number(ageNum) || 25));
  const ageFactor = (age - 1) / 119;
  const roughness = 0.02 + ageFactor * 0.18;
  const thickness = 4 + ageFactor * 10;
  const transmission = 0.5 - ageFactor * 0.15;

  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hexColor || '#D7A2B4'),
    metalness: 0.0,
    roughness,
    transmission,
    thickness,
    ior: 1.8,
    clearcoat: 1.0,
    clearcoatRoughness: roughness * 0.4,
    envMapIntensity: 3.0,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
}

function mountSvg(svgString) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('SVG parse error');
  const svg = doc.documentElement;
  svg.style.cssText =
    'position:fixed;left:0;top:0;width:' +
    W +
    'px;height:' +
    H +
    'px;opacity:0;pointer-events:none;z-index:-1';
  document.body.appendChild(svg);
  return svg;
}

function parseViewBox(svg) {
  const p = (svg.getAttribute('viewBox') || '0 0 680 680').trim().split(/\s+/).map(Number);
  return { x: p[0] || 0, y: p[1] || 0, w: p[2] || W, h: p[3] || H };
}

function pathPointToRoot(rootSvg, pathEl, x, y) {
  const pt = pathEl.ownerSVGElement.createSVGPoint();
  pt.x = x;
  pt.y = y;
  let gx;
  let gy;
  if (typeof pathEl.getTransformToElement === 'function') {
    const g = pt.matrixTransform(pathEl.getTransformToElement(rootSvg));
    gx = g.x;
    gy = g.y;
  } else {
    const scrCtm = pathEl.getScreenCTM();
    const rootCtm = rootSvg.getScreenCTM();
    if (!scrCtm || !rootCtm) {
      return new THREE.Vector3(x - CX, -(y - CY), 0);
    }
    const scr = pt.matrixTransform(scrCtm);
    const g = scr.matrixTransform(rootCtm.inverse());
    gx = g.x;
    gy = g.y;
  }
  return new THREE.Vector3(gx - CX, -(gy - CY), 0);
}

function sampleGeometryLength(el, rootSvg) {
  if (!el || typeof el.getTotalLength !== 'function' || typeof el.getPointAtLength !== 'function') {
    return [];
  }
  const len = el.getTotalLength();
  if (!isFinite(len) || len < 4) return [];
  const steps = Math.max(48, Math.ceil(len / PATH_STEP));
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = steps <= 1 ? 0 : i / (steps - 1);
    const p = el.getPointAtLength(len * t);
    pts.push(pathPointToRoot(rootSvg, el, p.x, p.y));
  }
  return pts;
}

function samplePath(pathEl, rootSvg) {
  const len = pathEl.getTotalLength();
  if (!isFinite(len) || len < 4) return [];
  const steps = Math.max(4, Math.ceil(len / PATH_STEP));
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = steps <= 1 ? 0 : i / (steps - 1);
    const p = pathEl.getPointAtLength(len * t);
    pts.push(pathPointToRoot(rootSvg, pathEl, p.x, p.y));
  }
  return pts;
}

function sampleCircle(circleEl, rootSvg) {
  const geomPts = sampleGeometryLength(circleEl, rootSvg);
  if (geomPts.length >= 2) return geomPts;
  const cx = Number(circleEl.getAttribute('cx')) || 0;
  const cy = Number(circleEl.getAttribute('cy')) || 0;
  const r = Number(circleEl.getAttribute('r')) || 0;
  if (r < 1) return [];
  const steps = Math.max(48, Math.ceil((2 * Math.PI * r) / PATH_STEP));
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push(pathPointToRoot(rootSvg, circleEl, cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

function sampleEllipse(ellipseEl, rootSvg) {
  const geomPts = sampleGeometryLength(ellipseEl, rootSvg);
  if (geomPts.length >= 2) return geomPts;
  const cx = Number(ellipseEl.getAttribute('cx')) || 0;
  const cy = Number(ellipseEl.getAttribute('cy')) || 0;
  const rx = Number(ellipseEl.getAttribute('rx')) || 0;
  const ry = Number(ellipseEl.getAttribute('ry')) || 0;
  if (rx < 1 || ry < 1) return [];
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const steps = Math.max(48, Math.ceil(perimeter / PATH_STEP));
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push(pathPointToRoot(rootSvg, ellipseEl, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return pts;
}

function metalRadialSegs(style2, style3, isFrame = false) {
  const key = style2?.occupationKey;
  if (key === 'tech_finance') return 40;
  const smooth = OCCUPATION_SMOOTHNESS[key] ?? 0.5;
  const rough = 1 - smooth;
  if (!isFrame) {
    if (rough >= 0.95) return 6;
    if (rough >= 0.7) return 8;
    if (rough >= 0.5) return 10;
    if (rough >= 0.3) return 16;
    return 22;
  }
  return 32;
}

function frameTubeBaseRadius(style3) {
  const gender = style3?.gender || 'female';
  if (gender === 'nonbinary') return TUBE_RADIUS * 1.4;
  if (gender === 'male') return TUBE_RADIUS * 2.2;
  return TUBE_RADIUS * 0.7;
}

function buildStrokeCurve(pts, style3, straight, occupationKey, isFrame = false) {
  if (pts.length < 2) return null;
  const unique = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].distanceTo(pts[i - 1]) > 0.05) unique.push(pts[i]);
  }
  if (unique.length < 2) return null;

  if (straight) {
    return new THREE.CatmullRomCurve3(unique, false, 'centripetal', 0.02);
  }

  const rough = occupationKey != null ? 1 - (OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5) : 0;
  const smoothPasses = isFrame
    ? Math.max(0, Math.round(2 - rough * 2))
    : Math.max(1, Math.round(6 - rough * 5));
  let s = unique;
  for (let pass = 0; pass < smoothPasses; pass++) {
    const next = [s[0]];
    for (let i = 1; i < s.length - 1; i++) {
      next.push(
        new THREE.Vector3(
          (s[i - 1].x + s[i].x * 2 + s[i + 1].x) / 4,
          (s[i - 1].y + s[i].y * 2 + s[i + 1].y) / 4,
          (s[i - 1].z + s[i].z * 2 + s[i + 1].z) / 4
        )
      );
    }
    next.push(s[s.length - 1]);
    s = next;
  }
  const gender = style3?.gender || 'female';
  const baseAmp = gender === 'female' ? 2.5 : gender === 'male' ? 1.2 : 1.8;
  const nPts = s.length;
  const pathAmp =
    !isFrame && occupationKey != null ? baseAmp * (0.08 + rough * 0.55) : !isFrame ? baseAmp * 0.5 : 0;
  for (let i = 1; i < nPts - 1; i++) {
    const t = i / (nPts - 1);
    const x = s[i].x;
    const y = s[i].y;
    let dx = 0;
    let dy = 0;
    if (!isFrame) {
      const n = Math.sin(x * 0.08 + y * 0.13) * Math.cos(y * 0.11 - x * 0.07);
      dx = n * pathAmp;
      dy = n * pathAmp * 0.8;
    } else if (rough > 0.08) {
      const twistAmp = baseAmp * (0.04 + rough * 0.12);
      const curl =
        Math.sin(t * Math.PI * 2 * (0.9 + rough * 1.1)) *
        Math.cos(t * Math.PI * (1.8 + rough * 1.8) + rough * 1.1);
      dx = curl * twistAmp;
      dy = Math.sin(t * Math.PI * 2.5 + rough * 0.6) * twistAmp * 0.48;
    }
    s[i].x += dx;
    s[i].y += dy;
  }
  const tension = isFrame
    ? 0.28
    : occupationKey != null
      ? 0.02 + rough * 0.46
      : 0.5;
  return new THREE.CatmullRomCurve3(s, false, 'catmullrom', tension);
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  return len;
}

function applyOrganicDisplacement(
  geom,
  gender,
  tubeRadius,
  ageNum,
  occupationKey,
  metalLayer,
  surfaceScale,
  isFrame = false
) {
  const pos = geom.attributes.position;
  const normal = geom.attributes.normal;
  if (!occupationKey && metalLayer) return;
  if (occupationKey === 'tech_finance') return;

  const smooth = OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5;
  if (smooth >= 0.95) return;
  const rough = 1 - smooth;
  const age = Math.max(1, Math.min(120, Number(ageNum) || 25));
  const ageAmp = 0.1 + (age / 120) * 4.0;
  let amp;
  let freq;

  if (isFrame) {
    amp = tubeRadius * (rough * 0.45 + 0.08);
    freq = 0.018 + rough * 0.14;
  } else if (metalLayer) {
    const occMul = rough * 2.8;
    amp =
      (gender === 'female' ? tubeRadius * 0.3 : gender === 'male' ? tubeRadius * 0.2 : tubeRadius * 0.25) *
      ageAmp *
      occMul;
    freq = 0.015 + rough * 0.2 + (age / 120) * 0.08;
  } else {
    if (surfaceScale != null && surfaceScale <= 0) return;
    const ageFactor = surfaceScale != null && surfaceScale > 0 ? Math.min(1, surfaceScale / 22) : ageAmp / 4;
    if (ageFactor < 0.03) return;
    amp = tubeRadius * ageFactor * rough * 0.5;
    freq = 0.04 + ageFactor * 0.16;
  }

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    const s = Math.sin(x * freq * 1.7 + y * freq * 3.1) * 0.5 + 0.5;
    const t = Math.cos(y * freq * 2.3 - z * freq * 1.9) * 0.5 + 0.5;
    const u = Math.sin(z * freq * 2.7 + x * freq * 1.3) * 0.5 + 0.5;
    const n = (s * t * u - 0.125) * 2.0;
    let dx = nx * n * amp;
    let dy = ny * n * amp;
    let dz = nz * n * amp;
    if (metalLayer && !isFrame) {
      const maxLocalZ = 3.2;
      if (z + dz > maxLocalZ) dz = maxLocalZ - z;
    }
    pos.setXYZ(i, x + dx, y + dy, z + dz);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
}

function downsamplePoints(pts, maxPts) {
  if (pts.length <= maxPts) return pts;
  const step = pts.length / maxPts;
  const out = [];
  for (let i = 0; i < maxPts; i++) out.push(pts[Math.floor(i * step)]);
  return out;
}

function addTubeFromPoints(
  pts,
  material,
  scene,
  z,
  renderOrder,
  style3,
  ageNum,
  closed,
  radiusScale = 1,
  style2 = null,
  isFrame = false
) {
  if (pts.length < 2) return false;
  const occupationKey = style2?.occupationKey ?? null;
  const isL2Metal = !!style2 && !isFrame;
  const polishedL2 = isL2Metal && occupationKey === 'tech_finance';
  const curve = buildStrokeCurve(
    pts,
    style3,
    polishedL2,
    occupationKey,
    isFrame
  );
  if (!curve) return false;
  if (closed) curve.closed = true;
  const pathLen = polylineLength(pts);
  const tubularSegs = Math.min(400, Math.max(48, Math.ceil(pathLen / 2)));
  const gender = style3?.gender || 'female';
  const base = isFrame
    ? frameTubeBaseRadius(style3)
    : gender === 'nonbinary'
      ? TUBE_RADIUS * 2.2
      : gender === 'male'
        ? TUBE_RADIUS * 1.4
        : TUBE_RADIUS * 0.7;
  const radius = base * radiusScale;
  const radialSegs = style2
    ? metalRadialSegs(style2, style3, isFrame)
    : polishedL2
      ? 40
      : gender === 'nonbinary'
        ? 4
        : gender === 'male'
          ? 10
          : 26;
  const geom = new THREE.TubeGeometry(curve, tubularSegs, radius, radialSegs, closed);
  const smooth = occupationKey ? OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5 : 0.5;
  const skipDisp = polishedL2 || smooth >= 0.95;
  if (!skipDisp && occupationKey) {
    applyOrganicDisplacement(
      geom,
      gender,
      radius,
      ageNum,
      occupationKey,
      isL2Metal || isFrame,
      style3?.surfaceScale,
      isFrame
    );
  }
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.z = z;
  mesh.renderOrder = renderOrder;
  scene.add(mesh);
  return true;
}

function unionLayersBBox(mount) {
  const els = [mount.querySelector('.layer-2'), mount.querySelector('.layer-3')].filter(Boolean);
  if (!els.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of els) {
    const b = el.getBBox();
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (!isFinite(minX)) return null;
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    halfW: (maxX - minX) / 2,
    halfH: (maxY - minY) / 2
  };
}

function scenePointsOnEllipse(mount, anchorEl, cx, cy, rx, ry) {
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const steps = Math.max(64, Math.ceil(perimeter / PATH_STEP));
  const pts = [];
  const el = anchorEl || mount;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push(pathPointToRoot(mount, el, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return pts;
}

function scenePointsOnCircle(mount, anchorEl, cx, cy, r) {
  return scenePointsOnEllipse(mount, anchorEl, cx, cy, r, r);
}

function tryFrameTube(pts, material, scene, z, renderOrder, style3, ageNum, style2) {
  if (pts.length < 2) return false;
  const reduced = downsamplePoints(pts, 160);
  return addTubeFromPoints(reduced, material, scene, z, renderOrder, style3, ageNum, true, 1.15, style2, true);
}

/** מסגרת מ-SVG — מעגל (הגנה) או נתיב מותאם (זימון), עם fallback מ-bbox של L2+L3 */
function addFrameRing(mount, material, scene, z, renderOrder, style3, ageNum, style2) {
  const strokePad = L3_STROKE_WIDTH / 2;
  const frameRoot = mount.querySelector('.layer-frame');
  const intent = frameRoot?.getAttribute('data-intent') || style3?.intent || 'protection';
  const anchorEl = mount.querySelector('.layer-2') || mount.querySelector('.layer-3');

  const pathEl = mount.querySelector('.layer-frame path');
  if (pathEl) {
    let pts = sampleGeometryLength(pathEl, mount);
    if (pts.length < 2) pts = samplePath(pathEl, mount);
    if (tryFrameTube(pts, material, scene, z, renderOrder, style3, ageNum, style2)) return 1;
  }

  const circleEl = mount.querySelector('.layer-frame circle');
  if (circleEl) {
    let pts = sampleGeometryLength(circleEl, mount);
    if (pts.length < 2) pts = sampleCircle(circleEl, mount);
    if (tryFrameTube(pts, material, scene, z, renderOrder, style3, ageNum, style2)) return 1;
  }

  if (intent === 'summoning') {
    console.warn('[pbr] summoning frame path missing or invalid');
    return 0;
  }
  const bb = unionLayersBBox(mount);
  if (!bb) return 0;
  const r = Math.max(bb.halfW, bb.halfH) + strokePad + FRAME_PAD;
  const pts = scenePointsOnCircle(mount, anchorEl, bb.cx, bb.cy, r);
  return tryFrameTube(pts, material, scene, z, renderOrder, style3, ageNum, style2) ? 1 : 0;
}

function addTubesFromLayer(layerEl, rootSvg, material, scene, z, renderOrder, style3, ageNum, style2) {
  if (!layerEl) return 0;
  let count = 0;
  layerEl.querySelectorAll('path').forEach((pathEl) => {
    const pts = samplePath(pathEl, rootSvg);
    if (addTubeFromPoints(pts, material, scene, z, renderOrder, style3, ageNum, false, 1, style2)) count++;
  });
  layerEl.querySelectorAll('circle').forEach((circleEl) => {
    const pts = sampleCircle(circleEl, rootSvg);
    if (addTubeFromPoints(pts, material, scene, z, renderOrder, style3, ageNum, true, 1, style2)) count++;
  });
  layerEl.querySelectorAll('ellipse').forEach((ellipseEl) => {
    const pts = sampleEllipse(ellipseEl, rootSvg);
    if (addTubeFromPoints(pts, material, scene, z, renderOrder, style3, ageNum, true, 1, style2)) count++;
  });
  return count;
}

function scenePointToCanvas(v) {
  return { x: (v.x + CX) * MASK_SCALE, y: (CY - v.y) * MASK_SCALE };
}

/** Raster union mask by drawing sampled strokes directly — ignores SVG filters/groups. */
function rasterizeLayerMaskCanvas(layerEl, rootSvg) {
  const texW = W * MASK_SCALE;
  const texH = H * MASK_SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = texW;
  canvas.height = texH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, texW, texH);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = L3_STROKE_WIDTH * MASK_SCALE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawPolyline = (pts, closed) => {
    if (pts.length < 2) return;
    ctx.beginPath();
    const p0 = scenePointToCanvas(pts[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = scenePointToCanvas(pts[i]);
      ctx.lineTo(p.x, p.y);
    }
    if (closed) ctx.closePath();
    ctx.stroke();
  };

  layerEl.querySelectorAll('path').forEach((el) => drawPolyline(samplePath(el, rootSvg), false));
  layerEl.querySelectorAll('circle').forEach((el) => drawPolyline(sampleCircle(el, rootSvg), true));
  layerEl.querySelectorAll('ellipse').forEach((el) => drawPolyline(sampleEllipse(el, rootSvg), true));
  return canvas;
}

function readMaskGrid(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      grid[y * w + x] = data[i + 3] > 24 || data[i] > 24 ? 1 : 0;
    }
  }
  return { grid, w, h };
}

function l3TubeRadius(style3) {
  const gender = style3?.gender || 'female';
  if (gender === 'nonbinary') return L3_STROKE_WIDTH * 0.52;
  if (gender === 'male') return L3_STROKE_WIDTH * 0.42;
  return L3_STROKE_WIDTH * 0.5;
}

/** Chamfer distance transform — distance in px to nearest empty pixel. */
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

function domeHeight(distPx, radiusScene) {
  const d = distPx / MASK_SCALE;
  const dd = Math.min(d, radiusScene);
  const h = Math.sqrt(Math.max(0, radiusScene * radiusScene - (radiusScene - dd) * (radiusScene - dd)));
  return h * 0.92;
}

/**
 * Union mask → one inflated volume (rounded tube cross-section) + organic displacement.
 */
function buildInflatedMeshFromMask(grid, w, h, style3, ageNum) {
  const radius = l3TubeRadius(style3);
  const dist = distanceTransform(grid, w, h);
  const step = MASK_MESH_STEP;
  const vertMap = new Map();
  const positions = [];

  const vertKey = (x, y) => x + ',' + y;
  const addVertex = (x, y) => {
    const key = vertKey(x, y);
    if (vertMap.has(key)) return vertMap.get(key);
    const i = y * w + x;
    const z = domeHeight(dist[i], radius);
    const idx = positions.length / 3;
    positions.push((x / MASK_SCALE) - CX, CY - y / MASK_SCALE, z);
    vertMap.set(key, idx);
    return idx;
  };

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (grid[y * w + x]) addVertex(x, y);
    }
  }

  const indices = [];
  for (let y = 0; y < h - step; y += step) {
    for (let x = 0; x < w - step; x += step) {
      const k00 = vertKey(x, y);
      const k10 = vertKey(x + step, y);
      const k01 = vertKey(x, y + step);
      const k11 = vertKey(x + step, y + step);
      if (!vertMap.has(k00) || !vertMap.has(k10) || !vertMap.has(k01) || !vertMap.has(k11)) continue;
      const v00 = vertMap.get(k00);
      const v10 = vertMap.get(k10);
      const v01 = vertMap.get(k01);
      const v11 = vertMap.get(k11);
      indices.push(v00, v10, v01, v10, v11, v01);
    }
  }

  if (positions.length < 9 || indices.length < 3) throw new Error('L3 inflated mesh empty');

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const gender = style3?.gender || 'female';
  applyOrganicDisplacement(geom, gender, radius, ageNum);
  geom.computeVertexNormals();
  return geom;
}

function buildUnifiedLayer3Geometry(layerEl, rootSvg, style3, ageNum) {
  const canvas = rasterizeLayerMaskCanvas(layerEl, rootSvg);
  const { grid, w, h } = readMaskGrid(canvas);
  let filled = 0;
  for (let i = 0; i < grid.length; i++) filled += grid[i];
  if (filled < 80) throw new Error('L3 union mask empty (' + filled + ' px)');
  return buildInflatedMeshFromMask(grid, w, h, style3, ageNum);
}

function addUnifiedSolidFromLayer(layerEl, rootSvg, material, scene, z, renderOrder, style3, ageNum) {
  const geom = buildUnifiedLayer3Geometry(layerEl, rootSvg, style3, ageNum);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.z = z;
  mesh.renderOrder = renderOrder;
  scene.add(mesh);
  return 1;
}

/** Small margin so tubes are not clipped at canvas edges. */
const CANVAS_BLEED = 1.05;

function createCameraFromViewBox(vb) {
  const midX = vb.x + vb.w / 2 - CX;
  const midY = CY - (vb.y + vb.h / 2);
  const half = (Math.max(vb.w, vb.h) / 2) * CANVAS_BLEED;
  const cam = new THREE.OrthographicCamera(
    midX - half,
    midX + half,
    midY + half,
    midY - half,
    0.1,
    3000
  );
  cam.position.set(midX, midY, 1000);
  cam.lookAt(midX, midY, 0);
  return cam;
}

function createCameraFromScene(scene, fallbackVb) {
  const box = new THREE.Box3();
  let meshCount = 0;
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    const meshBox = obj.geometry.boundingBox.clone();
    meshBox.applyMatrix4(obj.matrixWorld);
    box.union(meshBox);
    meshCount++;
  });
  const vbHalf = (Math.max(fallbackVb.w, fallbackVb.h) / 2) * CANVAS_BLEED;
  if (meshCount === 0 || box.isEmpty()) return createCameraFromViewBox(fallbackVb);

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = box.getSize(new THREE.Vector3());
  const half = Math.max((Math.max(size.x, size.y) / 2) * CANVAS_BLEED, vbHalf);
  const cam = new THREE.OrthographicCamera(
    center.x - half,
    center.x + half,
    center.y + half,
    center.y - half,
    0.1,
    3000
  );
  cam.position.set(center.x, center.y, 1000);
  cam.lookAt(center);
  return cam;
}

async function renderPbrCore(svg, opts) {
  const { style2, style3, domainHex } = opts;
  const mount = mountSvg(svg);

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const layer3 = mount.querySelector('.layer-3');
  if (!layer3) throw new Error('layer 3 missing');
  const layer2 = mount.querySelector('.layer-2');
  const vb = parseViewBox(mount);

  disposeActive();

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  active.renderer = renderer;

  const scene = new THREE.Scene();
  active.envMap = setupEnvironment(renderer, scene);
  addLights(scene);

  renderer.sortObjects = true;

  const metalRough = style2 ? metalRoughnessFromStyle2(style2) : 0;
  const metalMat = buildMetalMaterial(style2);
  const ceramicMat = buildCeramicMaterial(domainHex, style3, opts.ageNum);

  let tubesL2 = 0;
  if (layer2 && style2) {
    tubesL2 = addTubesFromLayer(layer2, mount, metalMat, scene, -2, 0, style3, opts.ageNum, style2);
  }

  const tubesL3 = addUnifiedSolidFromLayer(layer3, mount, ceramicMat, scene, 2, 1, style3, opts.ageNum);
  if (!tubesL3) throw new Error('no L3 paths');

  const frameMat = style2
    ? buildMetalMaterial(style2, true)
    : new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 1.0,
        roughness: 0.15,
        envMapIntensity: 1.5,
        transparent: true,
        opacity: 1,
        depthWrite: true
      });
  const tubesFrame = addFrameRing(mount, frameMat, scene, 10, 12, style3, opts.ageNum, style2);
  if (!tubesFrame) console.warn('[pbr] frame ring failed');

  scene.updateMatrixWorld(true);
  const camera = createCameraFromScene(scene, vb);
  const age = Math.max(1, Math.min(120, Number(opts.ageNum) || 25));
  const rotationY = ((age - 1) / 119) * 0.25 - 0.125;
  scene.rotation.y = rotationY;
  renderer.render(scene, camera);

  return { mount, renderer, scene, tubesL2, tubesL3, tubesFrame, metalRough };
}

/**
 * @param {{ svg: string, style2: object|null, style3: object, container: HTMLElement }} opts
 */
export async function renderThreePbrAmulet(opts) {
  console.log('ageNum:', opts.ageNum, 'domainHex:', opts.domainHex);
  let mount = null;
  try {
    const core = await renderPbrCore(opts.svg, opts);
    mount = core.mount;
    disposeScene(core.scene);

    opts.container.innerHTML = '';
    const canvas = core.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    opts.container.appendChild(canvas);

    return {
      tubesL2: core.tubesL2,
      tubesL3: core.tubesL3,
      tubesFrame: core.tubesFrame,
      metalRough: core.metalRough,
      pbr: true
    };
  } finally {
    if (mount?.parentNode) mount.parentNode.removeChild(mount);
  }
}

/** רינדור PBR חד-פעמי לייצוא PNG עם רקע שקוף */
export async function exportPbrAmuletPng(opts) {
  let mount = null;
  let scene = null;
  try {
    const core = await renderPbrCore(opts.svg, opts);
    mount = core.mount;
    scene = core.scene;
    return core.renderer.domElement.toDataURL('image/png');
  } finally {
    if (scene) disposeScene(scene);
    if (mount?.parentNode) mount.parentNode.removeChild(mount);
    disposeActive();
  }
}

export function disposeThreePbr() {
  disposeActive();
}
