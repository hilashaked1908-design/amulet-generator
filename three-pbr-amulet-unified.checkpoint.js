/**
 * SVG stroke paths → Three.js PBR (metal tubes L2, unified inflated ceramic L3).
 * RoomEnvironment IBL + dramatic directional lights.
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
/** z — L3 מתחת, L2 מעל; renderOrder שומר סדר הציור */
const L3_SURFACE_Z = 7;
const L2_SURFACE_Z = 8;

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

function addLights(scene, ageFactor = 0) {
  const key = 1 - ageFactor * 0.24;
  const cool = 1 - ageFactor * 0.22;
  const warm = 1 - ageFactor * 0.18;
  const dir1 = new THREE.DirectionalLight(0xffffff, 5.0 * key);
  dir1.position.set(1, 2, 3);
  const dir2 = new THREE.DirectionalLight(0x4488ff, 2.0 * cool);
  dir2.position.set(-2, -1, 1);
  const dir3 = new THREE.DirectionalLight(0xffdd88, 1.5 * warm);
  dir3.position.set(0, -3, -1);
  scene.add(dir1, dir2, dir3);
}

/** 1 = חלק, 0 = קוצני — תואם ל-prototype-v2 */
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

/** תקרת עוצמת גיאומטריה 3D — כמו עכשיו; רק טקסטורה עולה */
function l3BumpStrength(style3) {
  const s = style3?.surfaceScale ?? 10;
  return Math.max(0.35, Math.min(1.15, 0.38 + s / 15.5));
}

/** מכפיל טקסטורה (bump map / SVG) — גיל 25=120 לעומת בסיס 70 */
function l3TextureBoost(style3) {
  const s = style3?.surfaceScale ?? 10;
  const oldScale = 48 + s * 2.2;
  const newScale = Math.round(120 + Math.max(0, s - 10) * (2.2 * (120 / 70)));
  return oldScale > 0 ? newScale / oldScale : 1;
}

function l3AgeFactor(style3, ageNum) {
  return Math.min(1.15, l3BumpStrength(style3));
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

const ageBumpTextureCache = {};

function createAgeBumpTexture(ageFactor) {
  if (ageFactor < 0.08) return null;
  const bucket = Math.round(ageFactor * 32);
  if (ageBumpTextureCache[bucket]) return ageBumpTextureCache[bucket];

  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const cellW = Math.max(12, Math.round(20 - ageFactor * 6));
  const cellH = Math.max(16, Math.round(28 - ageFactor * 8));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const ux = ((x % cellW) + cellW) % cellW;
      const uy = ((y % cellH) + cellH) % cellH;
      const ex = (ux / cellW - 0.5) / 0.42;
      const ey = (uy / cellH - 0.5) / 0.34;
      const pill = Math.max(0, 1 - (ex * ex + ey * ey));
      const bump = pill * pill * pill;
      const v = 128 + (bump - 0.38) * ageFactor * 240;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.max(0, Math.min(255, v));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  ageBumpTextureCache[bucket] = tex;
  return tex;
}

/** שכבה 3 — אבן/זכוכית אורגנית גדולה, רקע האמולט */
const L3_OPAL = {
  base: 0xe8c49a,
  center: 0xfdf0d5,
  mid: 0xe8b98a,
  edge: 0xc47840,
  milkBase: 0xe8c49a,
  opacity: 1
};

function buildL3MilkBaseMaterial() {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(L3_OPAL.milkBase),
    metalness: 0,
    roughness: 0.45,
    transparent: false,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true
  });
}

function buildOpalGlassMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(L3_OPAL.base),
    metalness: 0,
    roughness: 0.35,
    transmission: 0.15,
    thickness: 12,
    ior: 1.48,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 2.2,
    transparent: false,
    opacity: L3_OPAL.opacity,
    vertexColors: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
}

/** גרדיאנט + feSpecularLighting — בהיר בראש הבליטה, כהה בשפה */
function applyL3VertexColors(geom, maskOrigin, tubeRadius, distToL2 = null, maskW = 0, maskH = 0) {
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cBase = new THREE.Color(L3_OPAL.base);
  const cCenter = new THREE.Color(L3_OPAL.center);
  const cMid = new THREE.Color(L3_OPAL.mid);
  const cEdge = new THREE.Color(L3_OPAL.edge);
  const cWhite = new THREE.Color(0xffffff);

  const minX = maskOrigin.minX;
  const minY = maskOrigin.minY;
  const maxX = maskOrigin.maxX;
  const maxY = maskOrigin.maxY;
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const extent = Math.max(maxX - minX, maxY - minY, 1) * 0.5;
  const zMax = tubeRadius * 0.95 + 0.01;
  const lightX = minX + (maxX - minX) * 0.35;
  const lightY = maxY - (maxY - minY) * 0.2;

  const tmp = new THREE.Color();
  const grad = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);

    const radialT = Math.min(1, Math.hypot(px - cx, py - cy) / extent);
    const topLeft =
      (1 - (px - minX) / (maxX - minX + 1)) * ((maxY - py) / (maxY - minY + 1));
    const domeT = Math.min(1, pz / zMax);

    if (radialT < 0.5) {
      grad.copy(cCenter).lerp(cMid, radialT / 0.5);
    } else {
      grad.copy(cMid).lerp(cEdge, (radialT - 0.5) / 0.5);
    }
    tmp.copy(cBase).lerp(grad, 0.78);
    tmp.lerp(cCenter, topLeft * 0.22 * (1 - radialT * 0.35));

    const lightDist = Math.hypot(px - lightX, py - lightY) / (extent * 1.15);
    const specMask = Math.exp(-lightDist * lightDist * 2.8) * Math.pow(domeT, 1.8);
    const specular = Math.min(1, specMask * 1.2);
    const mx = Math.round((px - minX) * MASK_SCALE);
    const my = Math.round((maxY - py) * MASK_SCALE);
    const nearMetal = distToL2 && distToL2[my * maskW + mx] < 20;
    const specularFinal = nearMetal ? 0 : specular;
    const screen = 1 - (1 - tmp.r) * (1 - specularFinal * 0.62);
    tmp.r = screen;
    const screenG = 1 - (1 - tmp.g) * (1 - specularFinal * 0.62);
    tmp.g = screenG;
    const screenB = 1 - (1 - tmp.b) * (1 - specularFinal * 0.58);
    tmp.b = screenB;
    tmp.lerp(cWhite, specular * 0.18 * domeT);

    if (distToL2) {
      if (mx >= 0 && mx < maskW && my >= 0 && my < maskH) {
        const distToMetal = distToL2[my * maskW + mx];
        const aoRadius = 18;
        const ao = Math.exp(-distToMetal / aoRadius);
        tmp.r *= 1 - ao * 0.35;
        tmp.g *= 1 - ao * 0.3;
        tmp.b *= 1 - ao * 0.2;
      }
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function buildCeramicMaterial(hexColor, style3, ageNum) {
  return buildOpalGlassMaterial();
}

/** Distance in mask pixels from each pixel to the nearest on-pixel in maskGrid. */
function distanceToMaskGrid(maskGrid, w, h) {
  const INF = 1e7;
  const dist = new Float32Array(w * h);
  for (let i = 0; i < maskGrid.length; i++) dist[i] = maskGrid[i] ? 0 : INF;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (dist[i] === 0) continue;
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
      if (dist[i] === 0) continue;
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

/** feMorphology operator='dilate' radius='12' על צורת L3 */
const L3_MORPH_DILATE_PX = 8 * MASK_SCALE;

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

function applyMassivePillDisplacement(geom, style3, ageNum, domeRadius) {
  const strength = l3BumpStrength(style3);
  if (strength < 0.2) return;

  const pos = geom.attributes.position;
  const normal = geom.attributes.normal;
  const cellW = 8.8 - strength * 0.9;
  const cellH = 12.5 - strength * 1.4;
  const amp = domeRadius * (0.58 + strength * 1.05);
  const gender = style3?.gender || 'female';
  const genderMul = gender === 'female' ? 1.0 : gender === 'male' ? 0.9 : 0.96;

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);

    const ux = ((x % cellW) + cellW) % cellW;
    const uy = ((y % cellH) + cellH) % cellH;
    const ex = (ux / cellW - 0.5) / 0.43;
    const ey = (uy / cellH - 0.5) / 0.35;
    const dist2 = ex * ex + ey * ey;
    const pill = Math.max(0, 1 - dist2);
    const bump = pill * pill * pill * amp * genderMul;

    pos.setXYZ(i, x + nx * bump * 0.58, y + ny * bump * 0.58, z + nz * bump);
  }
  pos.needsUpdate = true;
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
    const ageFactor =
      surfaceScale != null && surfaceScale > 0 ? Math.min(1, surfaceScale / 22) : l3AgeFactor(null, ageNum);
    if (ageFactor < 0.03) return;
    const genderMul =
      gender === 'female' ? 0.9 : gender === 'male' ? 0.75 : gender === 'nonbinary' ? 1.0 : 0.9;
    const disp = 0.04 + ageFactor * 0.16 + ageFactor * ageFactor * 0.1;
    amp = Math.min(tubeRadius * 0.11, disp * 3.0 * genderMul);
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
      : isFrame
        ? gender === 'nonbinary'
          ? 10
          : gender === 'male'
            ? 4
            : 26
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

function combinedContentStrokePad(style2, style3) {
  const l3 = l3TubeRadius(style3) + L3_STROKE_WIDTH / 2 + 8;
  if (!style2) return l3;
  const gender = style2.gender || style3?.gender || 'female';
  const l2Tube =
    gender === 'nonbinary'
      ? TUBE_RADIUS * 2.2
      : gender === 'male'
        ? TUBE_RADIUS * 1.4
        : TUBE_RADIUS * 0.7;
  const l2 = l2Tube * 1.2 + 14;
  return Math.max(l3, l2);
}

/** מסגרת מ-SVG — מעגל (הגנה) או נתיב מותאם (זימון), עם fallback מ-bbox של L2+L3 */
function addFrameRing(mount, material, scene, z, renderOrder, style3, ageNum, style2) {
  const strokePad = combinedContentStrokePad(style2, style3);
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
  const r = Math.max(bb.halfW, bb.halfH) + strokePad + FRAME_PAD + 12;
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

/** מרחיב מסכה ב-1 פיקסל (שלב בודד) */
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

function isGlassEdgePixel(x, y, glassGrid, w, h) {
  if (!glassGrid[y * w + x]) return false;
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const [dx, dy] of neighbors) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) return true;
    if (!glassGrid[ny * w + nx]) return true;
  }
  return false;
}

/** כל פיקסל קצה של הזכוכית צמוד למסכת מתכת (או לקצה הקנבס) */
function allGlassEdgesTouchMetal(glassGrid, metalGrid, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isGlassEdgePixel(x, y, glassGrid, w, h)) continue;

      let touchesMetal = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h && metalGrid[ny * w + nx]) {
            touchesMetal = true;
            break;
          }
        }
        if (touchesMetal) break;
      }

      const onCanvasEdge = x === 0 || x === w - 1 || y === 0 || y === h - 1;
      if (!touchesMetal && !onCanvasEdge) return false;
    }
  }
  return true;
}

/** מרחיב את מסכת L3 פיקסל-פיקסל עד שכל קצה נוגע במתכת */
function dilateL3UntilMetalContact(l3Grid, metalGrid, w, h, maxSteps = 512) {
  let glass = new Uint8Array(l3Grid);
  if (allGlassEdgesTouchMetal(glass, metalGrid, w, h)) return glass;

  for (let step = 0; step < maxSteps; step++) {
    glass = dilateMaskGrid1px(glass, w, h);
    if (allGlassEdgesTouchMetal(glass, metalGrid, w, h)) return glass;
  }
  return glass;
}

/** מרחיב את מסכת L3 — O(r·w·h) במקום O(r²·w·h) */
function dilateMaskGrid(grid, w, h, radiusPx) {
  const r = Math.max(1, Math.round(radiusPx));
  let cur = grid;
  for (let i = 0; i < r; i++) cur = dilateMaskGrid1px(cur, w, h);
  return cur;
}

function extendOpenPathCaps(pts, extendScene) {
  if (pts.length < 2 || extendScene <= 0) return pts;
  const ext = extendScene;
  const a = pts[0];
  const b = pts[1];
  const ux = a.x - b.x;
  const uy = a.y - b.y;
  const ul = Math.hypot(ux, uy) || 1;
  const start = new THREE.Vector3(a.x + (ux / ul) * ext, a.y + (uy / ul) * ext, a.z || 0);

  const n = pts.length;
  const c = pts[n - 1];
  const d = pts[n - 2];
  const vx = c.x - d.x;
  const vy = c.y - d.y;
  const vl = Math.hypot(vx, vy) || 1;
  const end = new THREE.Vector3(c.x + (vx / vl) * ext, c.y + (vy / vl) * ext, c.z || 0);

  return [start, ...pts, end];
}

function collectLayer3Polylines(layerEl, rootSvg, style3) {
  const domeR = l3TubeRadius(style3);
  const domePad = domeR + 8;
  const strokeScene = L3_STROKE_WIDTH + domePad;
  const polylines = [];
  const add = (pts, closed) => {
    if (pts.length < 2) return;
    const drawPts = closed ? pts : extendOpenPathCaps(pts, domePad * 0.55);
    polylines.push({ pts: drawPts, closed });
  };
  layerEl.querySelectorAll('path').forEach((el) => add(samplePath(el, rootSvg), false));
  layerEl.querySelectorAll('circle').forEach((el) => add(sampleCircle(el, rootSvg), true));
  layerEl.querySelectorAll('ellipse').forEach((el) => add(sampleEllipse(el, rootSvg), true));
  return { polylines, strokeScene };
}

function maskBoundsFromPolylines(polylines, strokeScene) {
  const margin = strokeScene * 0.7 + 16;
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
  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minY: minY - margin,
    maxY: maxY + margin,
  };
}

/** Raster union mask — קנבס לפי bbox אמיתי של L3 (בלי חיתוך בצדדים/למעלה) */
function rasterizeLayerMaskCanvas(layerEl, rootSvg, style3) {
  const { polylines, strokeScene } = collectLayer3Polylines(layerEl, rootSvg, style3);
  const maskOrigin = maskBoundsFromPolylines(polylines, strokeScene);
  if (!maskOrigin) throw new Error('L3 mask bounds empty');

  const strokeW = strokeScene * MASK_SCALE;
  const texW = Math.max(64, Math.ceil((maskOrigin.maxX - maskOrigin.minX) * MASK_SCALE));
  const texH = Math.max(64, Math.ceil((maskOrigin.maxY - maskOrigin.minY) * MASK_SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = texW;
  canvas.height = texH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, texW, texH);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = strokeW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const toCanvas = (v) => ({
    x: (v.x - maskOrigin.minX) * MASK_SCALE,
    y: (maskOrigin.maxY - v.y) * MASK_SCALE,
  });

  const drawDiscs = (pts) => {
    const r = strokeW / 2;
    for (const pt of pts) {
      const p = toCanvas(pt);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  for (const { pts, closed } of polylines) {
    drawDiscs(pts);
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

  return { canvas, maskOrigin };
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

function subtractMaskGrid(a, b) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] && !b[i] ? 1 : 0;
  return out;
}

/** Flood-fill labels — each connected gap region gets its own id (1..n). */
function labelConnectedComponents(grid, w, h) {
  const labels = new Int32Array(grid.length);
  let nextLabel = 1;
  const queue = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!grid[i] || labels[i]) continue;
      labels[i] = nextLabel;
      queue.push(i);
      while (queue.length) {
        const ci = queue.pop();
        const cx = ci % w;
        const cy = (ci / w) | 0;
        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (grid[ni] && !labels[ni]) {
            labels[ni] = nextLabel;
            queue.push(ni);
          }
        }
      }
      nextLabel++;
    }
  }
  return { labels, componentCount: nextLabel - 1 };
}

/** distanceTransform per isolated region — each gap peaks independently. */
function distanceTransformPerComponent(grid, labels, componentCount, w, h) {
  const dist = new Float32Array(grid.length);
  for (let label = 1; label <= componentCount; label++) {
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (labels[y * w + x] !== label) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX) continue;

    const pw = maxX - minX + 1;
    const ph = maxY - minY + 1;
    const compGrid = new Uint8Array(pw * ph);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (labels[y * w + x] === label) compGrid[(y - minY) * pw + (x - minX)] = 1;
      }
    }
    const compDist = distanceTransform(compGrid, pw, ph);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (labels[y * w + x] === label) {
          dist[y * w + x] = compDist[(y - minY) * pw + (x - minX)];
        }
      }
    }
  }
  return dist;
}

function domeHeight(distPx, radiusScene) {
  const d = distPx / MASK_SCALE;
  const dd = Math.min(d, radiusScene);
  const h = Math.sqrt(Math.max(0, radiusScene * radiusScene - (radiusScene - dd) * (radiusScene - dd)));
  return h * 0.65;
}

/**
 * Union mask → inflated volume; optional per-pixel distance field (e.g. per-gap domes).
 */
function buildInflatedMeshFromMask(
  grid,
  w,
  h,
  style3,
  ageNum,
  maskOrigin,
  distOverride = null,
  distToL2 = null
) {
  const radius = l3TubeRadius(style3);
  const dist = distOverride || distanceTransform(grid, w, h);
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
    positions.push(
      x / MASK_SCALE + maskOrigin.minX,
      maskOrigin.maxY - y / MASK_SCALE,
      z
    );
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
  applyL3VertexColors(geom, maskOrigin, radius, distToL2, w, h);
  const spanX = maskOrigin.maxX - maskOrigin.minX || 1;
  const spanY = maskOrigin.maxY - maskOrigin.minY || 1;
  const vertCount = positions.length / 3;
  const uvs = new Float32Array(vertCount * 2);
  for (let i = 0; i < vertCount; i++) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];
    uvs[i * 2] = (px - maskOrigin.minX) / spanX;
    uvs[i * 2 + 1] = (maskOrigin.maxY - py) / spanY;
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return geom;
}

/** תואם ל-layer2LetterBumpProfile ב-prototype-v2 */
function layer2LetterBumpScale(style2) {
  const key = style2?.occupationKey || 'care_health';
  const smooth = OCCUPATION_SMOOTHNESS[key] ?? 0.5;
  const rough = 1 - smooth;
  return rough * rough * 6 + rough * 2;
}

function pbrL2TubeRadius(style2, style3) {
  const gender = style3?.gender || style2?.gender || 'female';
  const base =
    gender === 'nonbinary' ? TUBE_RADIUS * 2.2 : gender === 'male' ? TUBE_RADIUS * 1.4 : TUBE_RADIUS * 0.7;
  return base * (style2?.amuletScale || 1);
}

/** רוחב מסכת L2 כולל organic — לטקסטורת gap mask */
function pbrL2MaskStrokeScene(style2, style3) {
  const tubeR = pbrL2TubeRadius(style2, style3);
  const bump2 = style2 ? layer2LetterBumpScale(style2) : 0;
  const rough = style2 ? occupationRoughness(style2) : 0;
  const organic = 10 + bump2 * 0.85 + rough * 14;
  return 2 * (tubeR * 1.2 + organic) * (style2?.amuletScale || 1);
}

/** רוחב ליבת צינור L2 — למסכת רווחים בלבד (בלי organic, כדי לא לבלוע את הבועות) */
function pbrL2CoreStrokeScene(style2, style3) {
  const tubeR = pbrL2TubeRadius(style2, style3);
  const scale = style2?.amuletScale || style3?.amuletScale || 1;
  return 2 * tubeR * 1.2 * scale;
}

function collectLayer2PathPolylines(layer2El, rootSvg) {
  const polylines = [];
  const add = (pts, closed) => {
    if (pts.length < 2) return;
    polylines.push({ pts, closed });
  };
  layer2El.querySelectorAll('path').forEach((el) => add(samplePath(el, rootSvg), false));
  layer2El.querySelectorAll('circle').forEach((el) => add(sampleCircle(el, rootSvg), true));
  layer2El.querySelectorAll('ellipse').forEach((el) => add(sampleEllipse(el, rootSvg), true));
  return polylines;
}

function rasterizeLayer2StrokeGrid(layer2El, rootSvg, style2, style3, maskOrigin, w, h, strokeScene) {
  const polylines = collectLayer2PathPolylines(layer2El, rootSvg);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = strokeScene * MASK_SCALE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawPolylinesMask(ctx, polylines, maskOrigin, strokeScene * MASK_SCALE);
  return readMaskGrid(canvas).grid;
}

/** מסכת L2 לחישוב רווחים — ליבת מתכת בלבד, לא כולל קוצניות organic */
function rasterizeLayer2GapMaskGrid(layer2El, rootSvg, style2, style3, maskOrigin, w, h) {
  return rasterizeLayer2StrokeGrid(
    layer2El,
    rootSvg,
    style2,
    style3,
    maskOrigin,
    w,
    h,
    pbrL2CoreStrokeScene(style2, style3)
  );
}

function collectLayer2Polylines(layer2El, rootSvg, style2, style3) {
  const strokeScene = pbrL2MaskStrokeScene(style2, style3);
  const polylines = collectLayer2PathPolylines(layer2El, rootSvg);
  return { polylines, strokeScene };
}

function rasterizeLayer2MaskGrid(layer2El, rootSvg, style2, style3, maskOrigin, w, h) {
  const { polylines, strokeScene } = collectLayer2Polylines(layer2El, rootSvg, style2, style3);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = strokeScene * MASK_SCALE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawPolylinesMask(ctx, polylines, maskOrigin, strokeScene * MASK_SCALE);
  return readMaskGrid(canvas).grid;
}

function buildUnifiedLayer3Geometry(layerEl, rootSvg, style3, ageNum, layer2El = null, style2 = null) {
  // 1. Rasterize L3 as its own mask
  const { canvas, maskOrigin } = rasterizeLayerMaskCanvas(layerEl, rootSvg, style3);
  const { grid: l3Grid, w, h } = readMaskGrid(canvas);
  const l3Mask = dilateMaskGrid(l3Grid, w, h, L3_MORPH_DILATE_PX);

  let filled = 0;
  for (let i = 0; i < l3Mask.length; i++) filled += l3Mask[i];
  if (filled < 80) throw new Error('L3 union mask empty (' + filled + ' px)');

  let meshGrid = l3Mask;
  let distOverride = null;
  let distToL2 = null;

  if (layer2El && style2) {
    const l2ShadowMask = rasterizeLayer2MaskGrid(layer2El, rootSvg, style2, style3, maskOrigin, w, h);
    distToL2 = distanceToMaskGrid(l2ShadowMask, w, h);

    // ליבת מתכת בלבד לחיתוך gaps — מסכה מלאה מפצלת לאלפי אזורים ותוקעת
    const l2GapMask = rasterizeLayer2GapMaskGrid(layer2El, rootSvg, style2, style3, maskOrigin, w, h);
    const gapGrid = subtractMaskGrid(l3Mask, l2GapMask);

    let gapFilled = 0;
    for (let i = 0; i < gapGrid.length; i++) gapFilled += gapGrid[i];

    if (gapFilled >= 20) {
      const { labels, componentCount } = labelConnectedComponents(gapGrid, w, h);
      if (componentCount > 0) {
        const gapDist = distanceTransformPerComponent(gapGrid, labels, componentCount, w, h);
        // מסכה מלאה של L3 — שטוח מתחת למתכת, כיפות נפרדות ברווחים
        distOverride = new Float32Array(w * h);
        for (let i = 0; i < l3Mask.length; i++) {
          if (gapGrid[i]) distOverride[i] = gapDist[i];
          else if (l3Mask[i]) distOverride[i] = 0;
        }
        meshGrid = l3Mask;
      }
    }
  }

  const geom = buildInflatedMeshFromMask(meshGrid, w, h, style3, ageNum, maskOrigin, distOverride, distToL2);
  return { geom, maskOrigin };
}

function drawPolylinesMask(ctx, polylines, maskOrigin, strokeW) {
  const toCanvas = (v) => ({
    x: (v.x - maskOrigin.minX) * MASK_SCALE,
    y: (maskOrigin.maxY - v.y) * MASK_SCALE,
  });
  const drawDiscs = (pts) => {
    const r = strokeW / 2;
    for (const pt of pts) {
      const p = toCanvas(pt);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  for (const { pts, closed } of polylines) {
    drawDiscs(pts);
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

/** מסכת רווחים בין קווי L2 — לבן=רווח (זכוכית נראית), שחור=מתכת */
function buildMetalGapMask(layer2El, rootSvg, style2, style3, maskOrigin) {
  if (!layer2El || !maskOrigin) return null;
  const { polylines, strokeScene } = collectLayer2Polylines(layer2El, rootSvg, style2, style3);
  if (!polylines.length) return null;

  const strokeW = strokeScene * MASK_SCALE;
  const texW = Math.max(64, Math.ceil((maskOrigin.maxX - maskOrigin.minX) * MASK_SCALE));
  const texH = Math.max(64, Math.ceil((maskOrigin.maxY - maskOrigin.minY) * MASK_SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = texW;
  canvas.height = texH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, texW, texH);
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = '#000000';
  ctx.lineWidth = strokeW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawPolylinesMask(ctx, polylines, maskOrigin, strokeW);

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function addUnifiedSolidFromLayer(layerEl, rootSvg, material, scene, z, renderOrder, style3, ageNum, layer2El = null, style2 = null) {
  const { geom, maskOrigin } = buildUnifiedLayer3Geometry(layerEl, rootSvg, style3, ageNum, layer2El, style2);
  const milkMat = buildL3MilkBaseMaterial();
  const milkMesh = new THREE.Mesh(geom, milkMat);
  milkMesh.position.z = L2_SURFACE_Z;
  milkMesh.renderOrder = renderOrder;
  scene.add(milkMesh);

  const glassMesh = new THREE.Mesh(geom, material);
  glassMesh.position.z = L2_SURFACE_Z;
  glassMesh.renderOrder = renderOrder;
  scene.add(glassMesh);

  return 1;
}

/** Small margin so tubes are not clipped at canvas edges. */
const CANVAS_BLEED = 1.05;

function sceneExtentHalf(scene) {
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return 0;
  return Math.max(
    Math.max(box.max.x, -box.min.x),
    Math.max(box.max.y, -box.min.y)
  );
}

/** מרווח מהמסגרת (פנימה) ומהקנבס (חוצה) */
const FRAME_INSET_PX = 20;

function frameTubeBaseRadius(style3) {
  const gender = style3?.gender || 'female';
  if (gender === 'nonbinary') return TUBE_RADIUS * 1.4;
  if (gender === 'male') return TUBE_RADIUS * 2.2;
  return TUBE_RADIUS * 0.7;
}

function tubeBaseRadius(style3) {
  const gender = style3?.gender || 'female';
  if (gender === 'nonbinary') return TUBE_RADIUS * 2.2;
  if (gender === 'male') return TUBE_RADIUS * 1.4;
  return TUBE_RADIUS * 0.7;
}

function frameTubeRadius(style3) {
  return frameTubeBaseRadius(style3) * 1.15;
}

function svgLayerExtentHalf(mount, selector, pad) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const collect = (el) => {
    try {
      const b = el.getBBox();
      if (!isFinite(b.width) || b.width <= 0) return;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    } catch (_) {}
  };
  mount.querySelectorAll(selector).forEach(collect);
  if (!isFinite(minX)) return null;
  const halfX = Math.max(maxX - CX, CX - minX) + pad;
  const halfY = Math.max(maxY - CY, CY - minY) + pad;
  return Math.max(halfX, halfY);
}

function centerSceneOnCanvas(scene) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  if (box.isEmpty()) return;
  const center = new THREE.Vector3();
  box.getCenter(center);
  scene.position.x -= center.x;
  scene.position.y -= center.y;
  scene.updateMatrixWorld(true);
}

/**
 * ממרכז, מקטין רק אם התוכן בורח מהפריים, ומקרב מצלמה לפריים+20px (גודל טוב).
 * @returns {number} חצי-קנבס למצלמה
 */
function fitSceneInsideFrame(scene, mount, style2, style3) {
  const canvasHalf = W / 2;
  const rough = style2 ? occupationRoughness(style2) : 0.35;
  const l3R = l3TubeRadius(style3);
  const frameTube = frameTubeRadius(style3);
  const contentPad = combinedContentStrokePad(style2, style3) + rough * 5;

  scene.updateMatrixWorld(true);
  centerSceneOnCanvas(scene);

  let frameHalf =
    svgLayerExtentHalf(mount, '.layer-frame path, .layer-frame circle', frameTube + 4) ??
    sceneExtentHalf(scene);
  const contentHalf =
    svgLayerExtentHalf(
      mount,
      '.layer-2 path, .layer-2 circle, .layer-3 path, .layer-3 circle',
      contentPad
    ) ?? frameHalf;

  const maxFrame = canvasHalf - FRAME_INSET_PX;
  const maxContent = Math.max(60, frameHalf - FRAME_INSET_PX);

  let scale = 1;
  if (frameHalf > maxFrame) scale = Math.min(scale, maxFrame / frameHalf);
  if (contentHalf > maxContent) scale = Math.min(scale, maxContent / contentHalf);

  if (scale < 0.999) {
    scene.scale.multiplyScalar(scale);
    scene.updateMatrixWorld(true);
    centerSceneOnCanvas(scene);
    frameHalf *= scale;
  }

  const sceneExt = sceneExtentHalf(scene);
  const spikePad = 12 + rough * 14 + tubeBaseRadius(style3) * 0.4 + l3R * 0.55;

  if (frameHalf <= 0) {
    return Math.min(canvasHalf, sceneExt > 0 ? sceneExt + spikePad : canvasHalf);
  }

  const viewHalf = Math.max(frameHalf + FRAME_INSET_PX, sceneExt + spikePad);
  return Math.min(canvasHalf, viewHalf);
}

function makeCanvasCamera(half) {
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 3000);
  cam.position.set(0, 0, 1000);
  cam.lookAt(0, 0, 0);
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
  const l3AgeFactorVal = l3AgeFactor(style3, opts.ageNum);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  active.renderer = renderer;

  const scene = new THREE.Scene();
  active.envMap = setupEnvironment(renderer, scene);
  addLights(scene, 0);

  renderer.sortObjects = true;

  const metalRough = style2 ? metalRoughnessFromStyle2(style2) : 0;
  const metalMat = buildMetalMaterial(style2);
  const ceramicMat = buildOpalGlassMaterial();

  const tubesL3 = addUnifiedSolidFromLayer(layer3, mount, ceramicMat, scene, L3_SURFACE_Z, 10, style3, opts.ageNum, layer2, style2);
  if (!tubesL3) throw new Error('no L3 paths');

  let tubesL2 = 0;
  if (layer2 && style2) {
    tubesL2 = addTubesFromLayer(layer2, mount, metalMat, scene, L2_SURFACE_Z, 20, style3, opts.ageNum, style2);
  }

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

  const age = Math.max(1, Math.min(120, Number(opts.ageNum) || 25));
  const rotationY = ((age - 1) / 119) * 0.25 - 0.125;
  scene.rotation.y = rotationY;
  scene.updateMatrixWorld(true);
  const cameraHalf = fitSceneInsideFrame(scene, mount, style2, style3);
  const camera = makeCanvasCamera(cameraHalf);
  renderer.render(scene, camera);

  return {
    mount,
    renderer,
    scene,
    tubesL2,
    tubesL3,
    tubesFrame,
    metalRough,
    l3Rough: ceramicMat.roughness,
    l3AgeFactor: l3AgeFactorVal,
    l3SurfaceScale: style3?.surfaceScale ?? 0
  };
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
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    opts.container.appendChild(canvas);

    return {
      tubesL2: core.tubesL2,
      tubesL3: core.tubesL3,
      tubesFrame: core.tubesFrame,
      metalRough: core.metalRough,
      l3Rough: core.l3Rough,
      l3AgeFactor: core.l3AgeFactor,
      l3SurfaceScale: core.l3SurfaceScale,
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
