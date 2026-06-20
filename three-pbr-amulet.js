/**
 * SVG stroke paths → Three.js PBR (metal tubes L2, SDF sculptural stone / inflated opal L3).
 * RoomEnvironment IBL + dramatic directional lights.
 */
import * as THREE from 'https://esm.sh/three@0.160.0';
import { RoomEnvironment } from 'https://esm.sh/three@0.160.0/examples/jsm/environments/RoomEnvironment.js';
import { buildStoneSculptureMeshFromMask, prepareTextOverlayFromGrid } from './stone-sdf-mesh.js';
import { deriveAmuletShapeParams, METAL_ELLIPSE_BY_BELIEF } from './amulet-shape-from-text.js';
import {
  buildRepousseHeightField,
  buildRepousseMeshFromHeightField,
  buildPolishedSilverMaterial,
  buildSatinPewterMaterial,
  REPOUSSE_FIELD_DEFAULTS,
} from './metal-repousse-mesh.js';
const W = 680;
const H = 680;
const CX = 340;
const CY = 340;
const TUBE_RADIUS = 6;
const PATH_STEP = 0.8;
/** תואם ל-PATH_MAIN_STROKE ב-prototype-v2 */
const L3_STROKE_WIDTH = 45;

function effectiveL3StrokeWidth(style3) {
  const scale = style3?.l3MassScale ?? 1;
  return L3_STROKE_WIDTH * scale;
}
/** תואם ל-prototype-v2 */
const FRAME_PAD = 40;
const MASK_SCALE = 2;
const MASK_MESH_STEP = 2;
/** z — L2 מלפנים, מסגרת קדימה; אבן L3 ממוקמת דינמית מאחור לפי bbox */
const L2_SURFACE_Z = 8;
const FRAME_SURFACE_Z = 10;
/** רווח בין חזית האבן לשכבת L2 */
const L3_STONE_BACK_GAP = 5;

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

/** Raking sculptural stone — low grazing key, deep crevice shadow, minimal fill. */
function addStoneSculptureLights(scene) {
  scene.add(new THREE.AmbientLight(0xc4c2be, 0.16));
  scene.add(new THREE.HemisphereLight(0xe2e0dc, 0x50504e, 0.1));
  const key = new THREE.DirectionalLight(0xf8f8f4, 4.5);
  key.position.set(0.8, 2.6, 1.2);
  const fill = new THREE.DirectionalLight(0xaaa8a4, 0.15);
  fill.position.set(-0.45, 0.9, 1.3);
  scene.add(key, fill);
}

/** Reference stone — same sage sculptural rig */
function addStoneRefLights(scene) {
  addStoneSculptureLights(scene);
}

/** Museum product lighting — cool sage celadon hemisphere */
function addStoneLights(scene, warm = false) {
  if (warm) {
    scene.add(new THREE.AmbientLight(0xf5f0e8, 0.38));
    scene.add(new THREE.HemisphereLight(0xfaf6f0, 0xd8ccb8, 0.32));
    const key = new THREE.DirectionalLight(0xfff8ee, 2.6);
    key.position.set(1.6, 0.55, 2.4);
    const fill = new THREE.DirectionalLight(0xf0ebe4, 0.55);
    fill.position.set(-1.2, 0.8, 3.2);
    scene.add(key, fill);
    return;
  }
  addStoneSculptureLights(scene);
}

/** Stone base + specular highlights for repoussé metal on top. */
function addAmuletSlabLights(scene) {
  scene.add(new THREE.AmbientLight(0xf2eee6, 0.42));
  scene.add(new THREE.HemisphereLight(0xfaf6f0, 0xc8c0b0, 0.38));
  const key = new THREE.DirectionalLight(0xfff8ee, 3.0);
  key.position.set(1.4, 3.2, 2.4);
  const fill = new THREE.DirectionalLight(0xe8e4dc, 0.55);
  fill.position.set(-1.0, 0.8, 3.5);
  const metalKey = new THREE.DirectionalLight(0xffffff, 4.5);
  metalKey.position.set(0.4, 2.6, 2.8);
  const metalRim = new THREE.DirectionalLight(0xe8eef8, 2.2);
  metalRim.position.set(-2.0, 1.2, -1.0);
  scene.add(key, fill, metalKey, metalRim);
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
  if (style2?.occupationSmoothness != null) {
    return 1 - style2.occupationSmoothness;
  }
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

  const size = 256;
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
      mat.bumpScale = rough * rough * 0.5 + rough * 0.18;
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

/** שכבה 3 — אבן/זכוכית אורגנית; כתום = תבנית גרדיאנט אופל (S/L לכל stop) */
const L3_OPAL_AMBER = {
  base: 0xe8c49a,
  center: 0xfdf0d5,
  mid: 0xe8b98a,
  edge: 0xc47840,
  milkBase: 0xe8c49a,
  opacity: 1
};

/** גוון בסיס לכל תחום — גרדיאנט אופל: center 70% white, mid 25% white, edge 30% black */
const L3_DOMAIN_HUES = {
  housing: 0x7cb342,
  livelihood: 0xff8f00,
  love: 0xf48fb1,
  meaning: 0x4fc3f7,
  family: 0x6d4c28,
  health: 0x7e57c2
};

const L3_OPAL_WHITE = new THREE.Color(0xffffff);
const L3_OPAL_BLACK = new THREE.Color(0x000000);

function lerpOpalStop(hueHex, toward, amount) {
  return new THREE.Color(hueHex).lerp(toward, amount).getHex();
}

function buildL3OpalPalette(domainKey) {
  const hue = L3_DOMAIN_HUES[domainKey] ?? L3_DOMAIN_HUES.love;
  const mid = lerpOpalStop(hue, L3_OPAL_WHITE, 0.25);
  return {
    base: mid,
    mid,
    milkBase: mid,
    center: lerpOpalStop(hue, L3_OPAL_WHITE, 0.7),
    edge: lerpOpalStop(hue, L3_OPAL_BLACK, 0.3),
    opacity: L3_OPAL_AMBER.opacity
  };
}

function buildL3MilkBaseMaterial(palette) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.milkBase),
    metalness: 0,
    roughness: 0.45,
    transparent: false,
    opacity: 1,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true
  });
}

let opalBumpTexture = null;

function createOpalBumpTexture(size = 256) {
  if (opalBumpTexture) return opalBumpTexture;
  initStoneNoisePerm();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const fine = stoneFbm2(u * 14 + 1.7, v * 14 + 2.3, 4);
      const coarse = stoneFbm2(u * 5.5 + 0.4, v * 5.5 + 0.9, 3);
      const n = fine * 0.55 + coarse * 0.45;
      const gray = Math.round(128 + n * 42);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = gray;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  opalBumpTexture = tex;
  return opalBumpTexture;
}

function buildOpalGlassMaterial(palette) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(palette.base),
    metalness: 0,
    roughness: 0.35,
    bumpMap: createOpalBumpTexture(),
    bumpScale: 0.15,
    transmission: 0.15,
    thickness: 12,
    ior: 1.48,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 2.2,
    transparent: false,
    opacity: L3_OPAL_AMBER.opacity,
    vertexColors: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
}

/** גרדיאנט + feSpecularLighting — בהיר בראש הבליטה, כהה בשפה */
function applyL3VertexColors(geom, maskOrigin, tubeRadius, distToL2 = null, maskW = 0, maskH = 0, palette = L3_OPAL_AMBER) {
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cBase = new THREE.Color(palette.base);
  const cCenter = new THREE.Color(palette.center);
  const cMid = new THREE.Color(palette.mid);
  const cEdge = new THREE.Color(palette.edge);
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
  return buildOpalGlassMaterial(buildL3OpalPalette(style3?.domainKey));
}

/** שכבה 3 — אבן מאט: אפור-sage בהיר וניטרלי (רמז ירוק עדין) */
const L3_STONE = {
  base: 0xc6c4c0,
  raised: 0xd8d6d2,
  crevice: 0x6a6a66,
  edge: 0x969492,
  floor: 0x545250
};

const STONE_MIN_COLOR = new THREE.Color(L3_STONE.floor);

function clampWarmStoneColor(c) {
  c.r = Math.max(c.r, STONE_MIN_COLOR.r);
  c.g = Math.max(c.g, STONE_MIN_COLOR.g);
  c.b = Math.max(c.b, STONE_MIN_COLOR.b);
}

const STONE_PROC_GEN = 59;

let stoneProcTextures = null;
let stoneProcGen = 0;
let stoneProcWarm = false;
let stoneNoisePerm = null;

function stoneHash(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function initStoneNoisePerm() {
  if (stoneNoisePerm) return stoneNoisePerm;
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(stoneHash(i, i * 1.37) * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  stoneNoisePerm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) stoneNoisePerm[i] = p[i & 255];
  return stoneNoisePerm;
}

function stoneNoiseFade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function stoneNoiseGrad2(hash, x, y) {
  const h = hash & 3;
  const u = h < 2 ? x : y;
  const v = h < 2 ? y : x;
  return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
}

function stonePerlin2(x, y) {
  const perm = initStoneNoisePerm();
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = stoneNoiseFade(xf);
  const v = stoneNoiseFade(yf);
  const aa = perm[perm[xi] + yi];
  const ab = perm[perm[xi] + yi + 1];
  const ba = perm[perm[xi + 1] + yi];
  const bb = perm[perm[xi + 1] + yi + 1];
  const x1 = stoneNoiseGrad2(aa, xf, yf);
  const x2 = stoneNoiseGrad2(ba, xf - 1, yf);
  const y1 = stoneNoiseGrad2(ab, xf, yf - 1);
  const y2 = stoneNoiseGrad2(bb, xf - 1, yf - 1);
  return (1 - v) * ((1 - u) * x1 + u * x2) + v * ((1 - u) * y1 + u * y2);
}

function stoneFbm2(x, y, octaves = 4) {
  let amp = 0.55;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += stonePerlin2(x * freq + i * 17.3, y * freq + i * 9.1) * amp;
    norm += amp;
    amp *= 0.48;
    freq *= 2.03;
  }
  return sum / norm;
}

/** מרחק מנקודה לקטע — לציר מסלול L3 */
function pointToSegmentDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 1e-8) t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const qx = ax + dx * t;
  const qy = ay + dy * t;
  return { dist: Math.hypot(px - qx, py - qy), t, px: qx, py: qy };
}

/** בניית קטעי מסלול (מדוללים) לשיידינג פנאומטי */
function buildStrokeSegments(polylines, maxPts = 96) {
  const segments = [];
  const downsample = (pts, max = maxPts) => {
    if (pts.length <= max) return pts;
    const out = [];
    const step = (pts.length - 1) / (max - 1);
    for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
    return out;
  };

  for (const { pts, closed } of polylines) {
    if (pts.length < 2) continue;
    const draw = downsample(pts);
    const arcLengths = [0];
    for (let i = 1; i < draw.length; i++) {
      arcLengths.push(
        arcLengths[i - 1] + Math.hypot(draw[i].x - draw[i - 1].x, draw[i].y - draw[i - 1].y)
      );
    }
    const segCount = closed ? draw.length : draw.length - 1;
    const closing =
      closed && draw.length > 2
        ? Math.hypot(draw[0].x - draw[draw.length - 1].x, draw[0].y - draw[draw.length - 1].y)
        : 0;
    const total = (arcLengths[arcLengths.length - 1] || 0) + closing || 1;

    for (let i = 0; i < segCount; i++) {
      const j = (i + 1) % draw.length;
      const ax = draw[i].x;
      const ay = draw[i].y;
      const bx = draw[j].x;
      const by = draw[j].y;
      const segLen = Math.hypot(bx - ax, by - ay);
      const arcStart = arcLengths[i] / total;
      segments.push({ ax, ay, bx, by, arcStart, arcEnd: arcStart + segLen / total });
    }
  }
  return segments;
}

function buildSegmentSpatialIndex(segments, minX, minY, cellSize) {
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

function nearestStrokeHit(px, py, segments, index) {
  if (!segments.length) return { arc: -1, cross: 0, dist: -1 };
  const cellSize = index.cellSize;
  const cx = Math.floor((px - index.minX) / cellSize);
  const cy = Math.floor((py - index.minY) / cellSize);
  let bestD = Infinity;
  let bestArc = -1;
  let bestCross = 0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const list = index.buckets.get(cx + dx + ',' + (cy + dy));
      if (!list) continue;
      for (let li = 0; li < list.length; li++) {
        const seg = segments[list[li]];
        const hit = pointToSegmentDist(px, py, seg.ax, seg.ay, seg.bx, seg.by);
        if (hit.dist >= bestD) continue;
        bestD = hit.dist;
        bestArc = seg.arcStart + (seg.arcEnd - seg.arcStart) * hit.t;
        const tx = seg.bx - seg.ax;
        const ty = seg.by - seg.ay;
        const tl = Math.hypot(tx, ty) || 1;
        bestCross = (px - hit.px) * (-ty / tl) + (py - hit.py) * (tx / tl);
      }
    }
  }
  return { arc: bestArc, cross: bestCross, dist: bestD === Infinity ? -1 : bestD };
}

/** סימני אזמל/פטיש — שכבת Perlin אקראית, בלי תאי/רשת */
function sampleCarvingToolMarks(x, y) {
  const scar = stoneFbm2(x * 4.7 + 13.2, y * 4.3 + 9.8, 3);
  const pit = stoneFbm2(x * 7.1 + 27.4, y * 6.8 + 19.3, 2);
  const relief = Math.min(0, scar * 0.045) + (pit < -0.55 ? (pit + 0.55) * 0.06 : 0);
  return { scar: relief, pit: 0, relief };
}

/** Fine grain — low-frequency, sparse (not sprayed stipple). */
function sampleFilmGrain(u, v) {
  const px = u * 380 + v * 240;
  const py = v * 380 - u * 165;
  const g1 = stoneHash(px, py);
  const g2 = stoneHash(px * 1.45 + 23, py * 1.45 + 37);
  return (g1 + g2 * 0.5) / 1.5 - 0.5;
}

/** Micro pits — sparse, blended into mineral bed (not uniform sand spray). */
function sampleSandPits(u, v) {
  const px = u * 620 + v * 340;
  const py = v * 620 - u * 280;
  const p1 = stoneHash(px, py);
  const p2 = stoneHash(px * 2.2 + 17, py * 2.2 + 29);
  const p3 = stoneHash(px * 4.1 + 41, py * 4.1 + 53);
  return (p1 + p2 * 0.45 + p3 * 0.2) / 1.65 - 0.5;
}

/** רעש אורגני + גרגר חולי מיקרו */
function sampleOrganicStoneNoise(u, v) {
  const x = u * 6.71 + 0.317;
  const y = v * 5.93 + 0.173;

  const film = sampleFilmGrain(u, v);
  const sand = sampleSandPits(u, v);
  const blob = stoneFbm2(x * 1.27 + 2.11, y * 1.09 + 4.73, 3);
  const mineral = stoneFbm2(x * 2.63 + 11.37, y * 2.29 + 7.91, 2);
  const drift = stoneFbm2(x * 0.87 + 1.43, y * 0.79 + 2.67, 2);
  const pits = stoneFbm2(x * 9.4 + 5.2, y * 8.6 + 3.8, 4);

  const combined = film * 0.08 + sand * 0.07 + blob * 0.28 + mineral * 0.22 + drift * 0.35;
  const height =
    0.5 +
    blob * 0.16 +
    drift * 0.18 +
    mineral * 0.11 +
    sand * 0.06 +
    film * 0.04 +
    combined * 0.1 +
    Math.max(0, -pits) * 0.04;

  return { combined, film, sand, drift, blob, pits, height };
}

function sampleHeightAt(heights, size, x, y) {
  const cx = Math.max(0, Math.min(size - 1, x));
  const cy = Math.max(0, Math.min(size - 1, y));
  return heights[cy * size + cx];
}

function buildNormalMapFromHeights(heights, size, strength = 18) {
  const normalImg = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const hL = sampleHeightAt(heights, size, x - 1, y);
      const hR = sampleHeightAt(heights, size, x + 1, y);
      const hD = sampleHeightAt(heights, size, x, y - 1);
      const hU = sampleHeightAt(heights, size, x, y + 1);
      let nx = -(hR - hL) * strength;
      let ny = -(hU - hD) * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      normalImg[i] = Math.round((nx * 0.5 + 0.5) * 255);
      normalImg[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normalImg[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normalImg[i + 3] = 255;
    }
  }
  return normalImg;
}

function buildProceduralStoneTextures(warm = false) {
  if (stoneProcTextures && stoneProcGen === STONE_PROC_GEN && stoneProcWarm === warm) return stoneProcTextures;
  stoneProcGen = STONE_PROC_GEN;
  stoneProcWarm = warm;
  stoneProcTextures = null;
  initStoneNoisePerm();
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  colorCanvas.width = bumpCanvas.width = normalCanvas.width = roughCanvas.width = size;
  colorCanvas.height = bumpCanvas.height = normalCanvas.height = roughCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');
  const normalCtx = normalCanvas.getContext('2d');
  const roughCtx = roughCanvas.getContext('2d');
  const colorImg = colorCtx.createImageData(size, size);
  const bumpImg = bumpCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const heights = new Float32Array(size * size);

  const baseR = warm ? 204 : 198;
  const baseG = warm ? 202 : 194;
  const baseB = warm ? 200 : 192;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;
      const s = sampleOrganicStoneNoise(u, v);
      heights[y * size + x] = s.height;

      const mott = warm ? 5.0 : 5.0;
      const r = Math.round(
        Math.max(0, Math.min(255, baseR + s.combined * mott + s.drift * 3 + s.blob * 2))
      );
      const g = Math.round(
        Math.max(0, Math.min(255, baseG + s.combined * mott + s.drift * 3.2 + s.blob * 2.2))
      );
      const b = Math.round(
        Math.max(0, Math.min(255, baseB + s.combined * mott + s.drift * 2.8 + s.blob * 1.8))
      );
      const bumpV = Math.round(
        Math.max(0, Math.min(255, (0.42 + s.height * 0.48) * 255))
      );
      const roughV = Math.round(
        Math.max(228, Math.min(255, 244 + s.sand * 4 + s.combined * 6))
      );

      colorImg.data[i] = r;
      colorImg.data[i + 1] = g;
      colorImg.data[i + 2] = b;
      colorImg.data[i + 3] = 255;
      bumpImg.data[i] = bumpImg.data[i + 1] = bumpImg.data[i + 2] = bumpV;
      bumpImg.data[i + 3] = 255;
      roughImg.data[i] = roughImg.data[i + 1] = roughImg.data[i + 2] = roughV;
      roughImg.data[i + 3] = 255;
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  normalCtx.putImageData(
    new ImageData(buildNormalMapFromHeights(heights, size, warm ? 8.5 : 9), size, size),
    0,
    0
  );

  const texRepeat = warm ? 1.0 : 1.0;

  const map = new THREE.CanvasTexture(colorCanvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(texRepeat, texRepeat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  map.magFilter = THREE.LinearFilter;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(texRepeat, texRepeat);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.generateMipmaps = false;
  bumpMap.minFilter = THREE.LinearFilter;
  bumpMap.magFilter = THREE.LinearFilter;

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(texRepeat, texRepeat);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.generateMipmaps = false;
  normalMap.minFilter = THREE.LinearFilter;
  normalMap.magFilter = THREE.LinearFilter;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(texRepeat, texRepeat);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.generateMipmaps = false;
  roughnessMap.minFilter = THREE.LinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter;

  stoneProcTextures = { map, bumpMap, normalMap, roughnessMap };
  return stoneProcTextures;
}

function buildStoneMaterial(style2 = null) {
  const proc = buildProceduralStoneTextures(false);
  const rough = style2 ? occupationRoughness(style2) : 0.55;
  const bumpScale = 0.76 + rough * 0.18;
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0xc8c6c0),
    map: proc.map,
    bumpMap: proc.bumpMap,
    bumpScale,
    normalMap: proc.normalMap,
    normalScale: new THREE.Vector2(0.46, 0.46),
    roughnessMap: proc.roughnessMap,
    roughness: 0.96,
    metalness: 0,
    flatShading: false,
    vertexColors: false,
    side: THREE.FrontSide,
    depthWrite: true,
    envMap: null,
    envMapIntensity: 0
  });
  return { material, textured: true };
}

/** Flat slab — same tuned sage maps as sculptural stone. */
function buildSlabStoneMaterial(stoneTone) {
  const { material } = buildStoneMaterial(stoneTone);
  return material;
}

/** גוון sage לפי גובה הכיפה — מכפיל בהירות עם נטייה ירקרקה */
function applyStoneVertexColors(
  geom,
  maskOrigin,
  tubeRadius,
  distToL2 = null,
  maskW = 0,
  maskH = 0,
  distField = null,
  strokeGuide = null
) {
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const zMax = tubeRadius * 1.12 + 0.01;

  for (let i = 0; i < pos.count; i++) {
    const pz = pos.getZ(i);
    const brightness = 0.7 + (pz / zMax) * 0.5;
    colors[i * 3] = brightness * 0.94;
    colors[i * 3 + 1] = brightness * 0.98;
    colors[i * 3 + 2] = brightness * 0.88;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
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
/** Extra dilation so touching glyph strokes fuse into one sculptural mass */
const STONE_FUSE_DILATE_PX = 16 * MASK_SCALE;
/** Stone L3 — הכי תחתון, גדול יותר */
const STONE_L3_THICKNESS = 1.45;
/** Name-connection stone tubes — chunky sculptural volume (reference look). */
const STONE_L3_NAME_TUBE_THICKNESS = 1.92;
const STONE_L3_EXTRA_DILATE_PX = 14 * MASK_SCALE;
const STONE_L3_XY_SCALE = 1.12;
/** Stone + metal share center; metal frame slightly larger, wire-thin tubes on stone surface. */
const SLAB_STONE_XY_SCALE = 1.48;
const SLAB_METAL_XY_SCALE = 1.12;
const SLAB_METAL_RADIUS_SCALE = 0.7;
const SLAB_METAL_TYPO_SKIP_MARGIN = 22;
/** Metal wraps above stone/emboss — tubes in emboss zone are skipped. */
const SLAB_METAL_WRAP_Z_LIFT = 0.38;
/** Metal frame around stone slab — distance from stone bbox edge (scene units). */
const SLAB_STONE_FRAME_MARGIN = 16;
const SLAB_STONE_FRAME_RADIUS_SCALE = 0.88;
/** Contour trace resolution — 2 = half mask pixels (faster frame build). */
const SLAB_FRAME_CONTOUR_DOWNSAMPLE = 2;
const SLAB_WRAP_MARGIN_SCENE = 30;
const SLAB_WRAP_STROKE_MUL = 1.48;
const SLAB_WRAP_EXTRA_DILATE_PX = 14 * MASK_SCALE;
/** Morphological close — bridge gaps between L3 lobes into one continuous stone plate. */
const SLAB_PLATE_BRIDGE_SCENE = 22;
/** Dev: hide metal sigils — set true to focus on stone emboss/engrave only. */
const STONE_SLAB_HIDE_METAL = false;
/** Q4 metal fringe — connected letters behind stone slab. */
const METAL_FRINGE_RADIUS_SCALE = 1.38;
const METAL_FRINGE_Z_BEHIND = 0.75;
const METAL_FRINGE_RENDER_ORDER = 6;
/** Q1 metal wrap — outer shape over stone (derived from wish text). */
const SLAB_METAL_WRAP_PLACEMENT = { cxFrac: 0.5, cyFrac: 0.5, widthFrac: 0.92, heightFrac: 0.92, fit: 0.94 };
/** Q1 metal emboss — raised pattern inside the metal layer. */
const SLAB_METAL_EMBOSS_PLACEMENT = { cxFrac: 0.5, cyFrac: 0.48, widthFrac: 0.62, heightFrac: 0.54, fit: 0.88 };
/** @deprecated alias — kept for any cached references */
const SLAB_Q1_PLACEMENT = SLAB_METAL_EMBOSS_PLACEMENT;
/** Q2 name glyphs — preserve editor connection layout; gentle scale only if oversized. */
const SLAB_NAME_SHAPE_MAX_RADIUS = 268;
const SLAB_NAME_SHAPE_FIT = 0.97;
const SLAB_Q3_ENGRAVE_PLACEMENT = { cxFrac: 0.5, cyFrac: 0.68, widthFrac: 0.78, heightFrac: 0.36, fit: 0.9 };
/** @deprecated alias */
const SLAB_Q2_PLACEMENT = SLAB_Q3_ENGRAVE_PLACEMENT;
const SLAB_Q_SHARED_PLACEMENT = SLAB_Q3_ENGRAVE_PLACEMENT;
/** Test: flat stone slab filling frame interior (slabMode SDF, no letter bumps). */
const STONE_L3_SLAB_MODE = true;

function sceneToMaskCanvas(v, maskOrigin) {
  return {
    x: (v.x - maskOrigin.minX) * MASK_SCALE,
    y: (maskOrigin.maxY - v.y) * MASK_SCALE,
  };
}

/** Filled interior of .layer-frame — disk or closed path, inset inside metal ring. */
function rasterizeFrameInteriorMask(mount, style3) {
  const frameRoot = mount.querySelector('.layer-frame');
  if (!frameRoot) throw new Error('L3 stone slab: frame layer missing');

  const insetScene = frameTubeBaseRadius(style3) * 2.2 + 6;
  const pathEl = frameRoot.querySelector('path');
  const circleEl = frameRoot.querySelector('circle');

  let contourPts = null;
  let fillDisc = null;

  if (circleEl) {
    const cx = Number(circleEl.getAttribute('cx'));
    const cy = Number(circleEl.getAttribute('cy'));
    const r = Number(circleEl.getAttribute('r'));
    const centerPt = pathPointToRoot(mount, circleEl, cx, cy);
    const rimPt = pathPointToRoot(mount, circleEl, cx + r, cy);
    const rScene = Math.hypot(rimPt.x - centerPt.x, rimPt.y - centerPt.y);
    fillDisc = { cx: centerPt.x, cy: centerPt.y, r: Math.max(24, rScene - insetScene) };
    contourPts = [];
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      contourPts.push(
        new THREE.Vector3(
          centerPt.x + Math.cos(a) * rScene,
          centerPt.y + Math.sin(a) * rScene,
          0
        )
      );
    }
  } else if (pathEl) {
    let pts = sampleGeometryLength(pathEl, mount);
    if (pts.length < 3) pts = samplePath(pathEl, mount);
    if (pts.length < 3) throw new Error('L3 stone slab: frame path empty');
    contourPts = pts;
  } else {
    throw new Error('L3 stone slab: no frame circle or path');
  }

  const maskOrigin = maskBoundsFromPolylines([{ pts: contourPts, closed: true }], insetScene + 12);
  const texW = Math.max(64, Math.ceil((maskOrigin.maxX - maskOrigin.minX) * MASK_SCALE));
  const texH = Math.max(64, Math.ceil((maskOrigin.maxY - maskOrigin.minY) * MASK_SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = texW;
  canvas.height = texH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';

  if (fillDisc) {
    const p = sceneToMaskCanvas(new THREE.Vector3(fillDisc.cx, fillDisc.cy, 0), maskOrigin);
    ctx.beginPath();
    ctx.arc(p.x, p.y, fillDisc.r * MASK_SCALE, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    const p0 = sceneToMaskCanvas(contourPts[0], maskOrigin);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < contourPts.length; i++) {
      const p = sceneToMaskCanvas(contourPts[i], maskOrigin);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fill();
  }

  const { grid, w, h } = readMaskGrid(canvas);
  return { grid, w, h, maskOrigin };
}

/** Union mask grids of equal dimensions (OR). */
function unionMaskGrids(a, b) {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] || b[i] ? 1 : 0;
  return out;
}

/** Fill enclosed holes in a binary mask (letter counters → solid stone). */
function fillMaskInteriorHoles(grid, w, h) {
  const outside = new Uint8Array(grid.length);
  const queue = [];
  const trySeed = (i) => {
    if (grid[i] || outside[i]) return;
    outside[i] = 1;
    queue.push(i);
  };

  for (let x = 0; x < w; x++) {
    trySeed(x);
    trySeed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    trySeed(y * w);
    trySeed(y * w + (w - 1));
  }

  while (queue.length) {
    const i = queue.pop();
    const x = i % w;
    const y = (i / w) | 0;
    if (x > 0) tryPush(i - 1);
    if (x < w - 1) tryPush(i + 1);
    if (y > 0) tryPush(i - w);
    if (y < h - 1) tryPush(i + w);
  }

  function tryPush(ni) {
    if (grid[ni] || outside[ni]) return;
    outside[ni] = 1;
    queue.push(ni);
  }

  const out = new Uint8Array(grid);
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] && !outside[i]) out[i] = 1;
  }
  return out;
}

function keepLargestMaskComponent(grid, w, h) {
  const { labels, componentCount } = labelConnectedComponents(grid, w, h);
  if (componentCount <= 1) return grid;
  const sizes = new Array(componentCount + 1).fill(0);
  for (let i = 0; i < grid.length; i++) {
    if (grid[i]) sizes[labels[i]]++;
  }
  let bestLabel = 1;
  let bestSize = 0;
  for (let c = 1; c <= componentCount; c++) {
    if (sizes[c] > bestSize) {
      bestSize = sizes[c];
      bestLabel = c;
    }
  }
  const out = new Uint8Array(grid.length);
  for (let i = 0; i < grid.length; i++) out[i] = labels[i] === bestLabel ? 1 : 0;
  return out;
}

/** Morphological opening — removes thin scroll/leg spurs from stone silhouette. */
function pruneThinMaskSpurs(grid, w, h, minWidthScene) {
  const erodePx = Math.max(3, Math.round(minWidthScene * MASK_SCALE * 0.58));
  let g = erodeMaskGrid(grid, w, h, erodePx);
  g = keepLargestMaskComponent(g, w, h);
  g = dilateMaskGrid(g, w, h, Math.max(2, erodePx - 3));
  return fillMaskInteriorHoles(g, w, h);
}

function countMaskComponents(grid, w, h) {
  const seen = new Uint8Array(grid.length);
  let comps = 0;
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] || seen[i]) continue;
    comps++;
    const q = [i];
    seen[i] = 1;
    while (q.length) {
      const ci = q.pop();
      const x = ci % w;
      const y = (ci / w) | 0;
      const tryPush = (ni) => {
        if (ni < 0 || ni >= grid.length || seen[ni] || !grid[ni]) return;
        seen[ni] = 1;
        q.push(ni);
      };
      if (x > 0) tryPush(ci - 1);
      if (x < w - 1) tryPush(ci + 1);
      if (y > 0) tryPush(ci - w);
      if (y < h - 1) tryPush(ci + w);
    }
  }
  return comps;
}

/** Dilate until name-letter clusters become one connected stone silhouette. */
function mergeMaskToSingleComponent(grid, w, h, maxSteps = 160) {
  let g = grid;
  for (let step = 0; step < maxSteps; step++) {
    if (countMaskComponents(g, w, h) <= 1) break;
    g = dilateMaskGrid1px(g, w, h);
  }
  if (countMaskComponents(g, w, h) > 1) {
    g = dilateMaskGrid(g, w, h, Math.round(18 * MASK_SCALE));
    g = fillMaskInteriorHoles(g, w, h);
  }
  return g;
}

function convexHullFillFromMask(grid, w, h) {
  const pts = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y * w + x]) pts.push({ x, y });
    }
  }
  if (pts.length < 3) return grid;
  pts.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 3) return grid;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(hull[0].x, hull[0].y);
  for (let i = 1; i < hull.length; i++) ctx.lineTo(hull[i].x, hull[i].y);
  ctx.closePath();
  ctx.fill();
  const { grid: out } = readMaskGrid(canvas);
  for (let i = 0; i < grid.length; i++) out[i] = out[i] || grid[i] ? 1 : 0;
  return out;
}

/** Everything inside the outer boundary of the mask becomes solid (fills letter gaps). */
function solidifyInsideOuterBoundary(grid, w, h) {
  const outside = new Uint8Array(grid.length);
  const queue = [];
  const seedExterior = (i) => {
    if (outside[i]) return;
    outside[i] = 1;
    queue.push(i);
  };

  for (let x = 0; x < w; x++) {
    seedExterior(x);
    seedExterior((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seedExterior(y * w);
    seedExterior(y * w + (w - 1));
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
  for (let i = 0; i < grid.length; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

function expandMaskOrigin(origin, factor) {
  const cx = (origin.minX + origin.maxX) / 2;
  const cy = (origin.minY + origin.maxY) / 2;
  const hw = ((origin.maxX - origin.minX) * 0.5 * factor);
  const hh = ((origin.maxY - origin.minY) * 0.5 * factor);
  return { minX: cx - hw, maxX: cx + hw, minY: cy - hh, maxY: cy + hh };
}

function collectSlabWrapLayerPack(el, kind, rootSvg, style2, style3, placementRef) {
  let pack;
  if (kind === 'l3') {
    pack = collectLayer3Polylines(el, rootSvg, style3);
  } else if (kind === 'q3') {
    pack = collectGlyphLayerPolylines(el, rootSvg, style3);
    const box = sceneTextBox(placementRef, SLAB_Q3_ENGRAVE_PLACEMENT);
    pack.polylines = transformPolylinesToBox(pack.polylines, box, SLAB_Q3_ENGRAVE_PLACEMENT.fit);
  } else {
    pack = collectGlyphLayerPolylines(el, rootSvg, style3);
    const box = sceneTextBox(placementRef, SLAB_METAL_EMBOSS_PLACEMENT);
    pack.polylines = transformPolylinesToBox(pack.polylines, box, SLAB_METAL_EMBOSS_PLACEMENT.fit);
  }
  return pack;
}

/**
 * Organic stone slab silhouette from timingReason seed — deterministic lobed contour.
 */
function buildOrganicStoneContour(stoneShapeParams, cx, cy) {
  const { seed, lobeCount, wobbleAmp, aspectX, aspectY, baseRadius, pinch, noiseFreq } =
    stoneShapeParams;
  const pts = [];
  const n = 96;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const lobe = 1 + wobbleAmp * Math.sin(lobeCount * ang + seed * 0.002);
    const pinchMod = 1 - pinch * 0.22 * (1 - Math.cos(ang * 2));
    const grain =
      Math.sin(ang * noiseFreq + seed * 0.001) * wobbleAmp * 0.15 +
      Math.sin(ang * noiseFreq * 2.3 + seed * 0.003) * wobbleAmp * 0.08;
    const r = baseRadius * lobe * pinchMod * (1 + grain);
    pts.push(
      new THREE.Vector3(cx + Math.cos(ang) * r * aspectX, cy + Math.sin(ang) * r * aspectY, 0)
    );
  }
  return pts;
}

function rasterizeProceduralStoneMask(stoneShapeParams, style3) {
  const pts = buildOrganicStoneContour(stoneShapeParams, CX, CY);
  const pad = stoneShapeParams.baseRadius * 0.35 + SLAB_WRAP_MARGIN_SCENE;
  const maskOrigin = maskBoundsFromPolylines([{ pts, closed: true }], pad);
  const wrapStroke = l3TubeRadius(style3) * SLAB_WRAP_STROKE_MUL * 2.4;
  let { grid: unionGrid, w, h } = rasterizePolylinesToGrid(
    [{ pts, closed: true }],
    wrapStroke,
    maskOrigin
  );

  const dilatePx =
    L3_MORPH_DILATE_PX + STONE_L3_EXTRA_DILATE_PX + STONE_FUSE_DILATE_PX + SLAB_WRAP_EXTRA_DILATE_PX;
  let slabGrid = dilateMaskGrid(unionGrid, w, h, dilatePx);
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);
  const bridgePx = Math.round(SLAB_PLATE_BRIDGE_SCENE * MASK_SCALE);
  slabGrid = closeStrokeMaskGrid(slabGrid, w, h, bridgePx, Math.max(1, bridgePx - 4));
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);
  slabGrid = solidifyInsideOuterBoundary(slabGrid, w, h);
  slabGrid = dilateMaskGrid(slabGrid, w, h, Math.round(5 * MASK_SCALE));
  const spurCut = stoneShapeParams.baseRadius * 0.42;
  slabGrid = pruneThinMaskSpurs(slabGrid, w, h, spurCut);
  return { grid: slabGrid, w, h, maskOrigin };
}

/**
 * Q2 name glyphs → one fused stone silhouette (letters merged into single mass).
 */
function rasterizeNameLettersStoneMask(rootSvg, style2, style3) {
  const l2El = rootSvg.querySelector('.layer-2');
  if (!l2El) return null;

  let polylines = collectLayer2PathPolylines(l2El, rootSvg);
  if (!polylines.length) {
    const pack = collectGlyphLayerPolylines(l2El, rootSvg, style3);
    polylines = pack.polylines;
  }
  if (!polylines.length) return null;

  polylines = fitPolylinesToSceneExtent(polylines);

  const wrapPad = l3TubeRadius(style3) * 3.8 + SLAB_WRAP_MARGIN_SCENE;
  const maskOrigin = maskBoundsFromPolylines(polylines, wrapPad);
  if (!maskOrigin) return null;

  const wrapStroke = l3TubeRadius(style3) * SLAB_WRAP_STROKE_MUL * 3.45;
  let { grid: unionGrid, w, h } = rasterizePolylinesToGrid(polylines, wrapStroke, maskOrigin);

  let filled = 0;
  for (let i = 0; i < unionGrid.length; i++) filled += unionGrid[i];
  if (filled < 40) return null;

  const extraFuse = Math.round(36 * MASK_SCALE);
  const dilatePx =
    L3_MORPH_DILATE_PX +
    STONE_L3_EXTRA_DILATE_PX +
    STONE_FUSE_DILATE_PX +
    SLAB_WRAP_EXTRA_DILATE_PX +
    extraFuse;
  let slabGrid = dilateMaskGrid(unionGrid, w, h, dilatePx);
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);
  const bridgePx = Math.round(SLAB_PLATE_BRIDGE_SCENE * MASK_SCALE * 2.85);
  slabGrid = closeStrokeMaskGrid(slabGrid, w, h, bridgePx, Math.max(1, bridgePx - 8));
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);
  slabGrid = solidifyInsideOuterBoundary(slabGrid, w, h);
  slabGrid = mergeMaskToSingleComponent(slabGrid, w, h);
  if (countMaskComponents(slabGrid, w, h) > 1) {
    slabGrid = convexHullFillFromMask(slabGrid, w, h);
  }
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);
  slabGrid = dilateMaskGridBlur(slabGrid, w, h, 16);
  slabGrid = erodeMaskGrid(slabGrid, w, h, 3);
  slabGrid = pruneThinMaskSpurs(slabGrid, w, h, l3TubeRadius(style3) * 2.6);
  return { grid: slabGrid, w, h, maskOrigin };
}

/**
 * Q2 name letter paths → chunky tube stone SDF (reference sculptural look).
 */
function buildNameTubeStoneGeometry(layer2El, rootSvg, style2, style3) {
  if (!layer2El) return null;

  let polylines = collectLayer2PathPolylines(layer2El, rootSvg);
  if (!polylines.length) {
    const pack = collectGlyphLayerPolylines(layer2El, rootSvg, style3);
    polylines = pack.polylines;
  }
  if (!polylines.length) return null;

  polylines = perturbPolylinesForL2Shadow(polylines, style2, style3);
  polylines = fitPolylinesToSceneExtent(polylines);

  const tubeR = l3TubeRadius(style3) * STONE_L3_NAME_TUBE_THICKNESS;
  const strokeScene = tubeR * 2.58;
  const maskOrigin = maskBoundsFromPolylines(polylines, strokeScene * 1.9);
  if (!maskOrigin) return null;

  const { grid, w, h } = rasterizePolylinesToGrid(polylines, strokeScene, maskOrigin);
  let filled = 0;
  for (let i = 0; i < grid.length; i++) filled += grid[i];
  if (filled < 40) return null;

  const segments = buildStrokeSegments(polylines, 80);
  if (!segments.length) return null;

  return { grid, w, h, maskOrigin, segments, tubeR };
}

function rasterizeMetalEllipseMask(stoneSlabMask, metalPlateParams) {
  if (!stoneSlabMask?.grid) return null;
  const { w, h, maskOrigin } = stoneSlabMask;
  const belief = metalPlateParams?.belief ?? 'signs';
  const tiers = METAL_ELLIPSE_BY_BELIEF[belief] ?? METAL_ELLIPSE_BY_BELIEF.signs;
  const aspectX = metalPlateParams?.aspectX ?? tiers.aspectX;
  const aspectY = metalPlateParams?.aspectY ?? tiers.aspectY;
  const radiusScale = metalPlateParams?.radiusScale ?? tiers.radiusScale;

  const cx = (maskOrigin.minX + maskOrigin.maxX) * 0.5;
  const cy = (maskOrigin.minY + maskOrigin.maxY) * 0.5;
  const spanX = maskOrigin.maxX - maskOrigin.minX;
  const spanY = maskOrigin.maxY - maskOrigin.minY;
  const baseR = Math.min(spanX, spanY) * 0.5 * radiusScale;
  const rx = baseR * aspectX;
  const ry = baseR * aspectY;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  const p = sceneToMaskCanvas(new THREE.Vector3(cx, cy, 0), maskOrigin);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, rx * MASK_SCALE, ry * MASK_SCALE, 0, 0, Math.PI * 2);
  ctx.fill();

  const { grid } = readMaskGrid(canvas);
  return { grid, w, h, maskOrigin };
}

/** Ellipse cradle — stone wraps Q4 metal plate so the disc sits embedded. */
function buildMetalPlateCradleParams(metalPlateMask, metalPlateParams, stoneTubeR) {
  if (!metalPlateMask?.grid) return null;
  const { maskOrigin } = metalPlateMask;
  const belief = metalPlateParams?.belief ?? 'signs';
  const tiers = METAL_ELLIPSE_BY_BELIEF[belief] ?? METAL_ELLIPSE_BY_BELIEF.signs;
  const aspectX = metalPlateParams?.aspectX ?? tiers.aspectX;
  const aspectY = metalPlateParams?.aspectY ?? tiers.aspectY;
  const radiusScale = metalPlateParams?.radiusScale ?? tiers.radiusScale;

  const cx = (maskOrigin.minX + maskOrigin.maxX) * 0.5;
  const cy = (maskOrigin.minY + maskOrigin.maxY) * 0.5;
  const spanX = maskOrigin.maxX - maskOrigin.minX;
  const spanY = maskOrigin.maxY - maskOrigin.minY;
  const baseR = Math.min(spanX, spanY) * 0.5 * radiusScale;
  const roundR = stoneTubeR * 1.02;

  return {
    cx,
    cy,
    rx: baseR * aspectX,
    ry: baseR * aspectY,
    roundR,
    wrapR: roundR * 2.35,
    collarH: stoneTubeR * 0.62,
    seatDepth: roundR * 0.52,
    maxH: stoneTubeR * 1.08,
  };
}

/**
 * Stone slab — Q2 name letters (fused), else procedural fallback from name hash.
 */
function rasterizeSlabWrapMask(rootSvg, style2, style3, stoneShapeParams = null) {
  const nameMask = rasterizeNameLettersStoneMask(rootSvg, style2, style3);
  if (nameMask) return nameMask;
  if (stoneShapeParams) {
    return rasterizeProceduralStoneMask(stoneShapeParams, style3);
  }
  const l3El = rootSvg.querySelector('.layer-3');
  if (!l3El) return rasterizeFrameInteriorMask(rootSvg, style3);

  const l3Pack = collectLayer3Polylines(l3El, rootSvg, style3);
  const wrapPad = l3TubeRadius(style3) * 3.8 + SLAB_WRAP_MARGIN_SCENE;
  const maskOrigin = maskBoundsFromPolylines(l3Pack.polylines, wrapPad);
  if (!maskOrigin) return rasterizeFrameInteriorMask(rootSvg, style3);

  const wrapStroke = l3Pack.strokeScene * SLAB_WRAP_STROKE_MUL;
  const { grid: unionGrid, w, h } = rasterizePolylinesToGrid(l3Pack.polylines, wrapStroke, maskOrigin);

  let filled = 0;
  for (let i = 0; i < unionGrid.length; i++) filled += unionGrid[i];
  if (filled < 40) return rasterizeFrameInteriorMask(rootSvg, style3);

  const dilatePx =
    L3_MORPH_DILATE_PX + STONE_L3_EXTRA_DILATE_PX + STONE_FUSE_DILATE_PX + SLAB_WRAP_EXTRA_DILATE_PX;
  let slabGrid = dilateMaskGrid(unionGrid, w, h, dilatePx);
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);

  const bridgePx = Math.round(SLAB_PLATE_BRIDGE_SCENE * MASK_SCALE);
  slabGrid = closeStrokeMaskGrid(slabGrid, w, h, bridgePx, Math.max(1, bridgePx - 4));
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);
  slabGrid = solidifyInsideOuterBoundary(slabGrid, w, h);
  slabGrid = dilateMaskGrid(slabGrid, w, h, Math.round(5 * MASK_SCALE));

  return { grid: slabGrid, w, h, maskOrigin };
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
  isFrame = false,
  xyScale = 1
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
  const smooth =
    style2?.occupationSmoothness ??
    (occupationKey ? OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5 : 0.5);
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
  if (xyScale !== 1) mesh.scale.set(xyScale, xyScale, 1);
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

/** Closed metal loop following the stone slab silhouette, offset outward. */
function addStoneSlabMetalFrame(slabMask, material, scene, z, renderOrder, style3, ageNum, style2) {
  const pts = buildSlabStoneFrameContour(slabMask);
  if (pts.length < 8) return 0;
  const reduced = downsamplePoints(pts, 140);

  return addTubeFromPoints(
    reduced,
    material,
    scene,
    z,
    renderOrder,
    style3,
    ageNum,
    true,
    SLAB_STONE_FRAME_RADIUS_SCALE,
    style2,
    true
  )
    ? 1
    : 0;
}

function tryFrameTube(pts, material, scene, z, renderOrder, style3, ageNum, style2) {
  if (pts.length < 2) return false;
  const reduced = downsamplePoints(pts, 160);
  return addTubeFromPoints(reduced, material, scene, z, renderOrder, style3, ageNum, true, 1.15, style2, true);
}

function combinedContentStrokePad(style2, style3) {
  const l3 = l3TubeRadius(style3) + effectiveL3StrokeWidth(style3) / 2 + 8;
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

/** Metal tubes from pre-transformed polylines (wish layer positioned on stone). */
function addTubesFromPolylines(polylines, material, scene, z, renderOrder, style3, ageNum, style2, opts = {}) {
  const xyScale = opts.xyScale ?? 1;
  const radiusScale = opts.radiusScale ?? 1;
  let count = 0;
  for (const { pts, closed } of polylines) {
    if (pts.length < 2) continue;
    if (
      addTubeFromPoints(
        pts,
        material,
        scene,
        z,
        renderOrder,
        style3,
        ageNum,
        !!closed,
        radiusScale,
        style2,
        false,
        xyScale
      )
    ) {
      count++;
    }
  }
  return count;
}

/**
 * Metal repoussé pack — Q4 ellipse plate + .layer-metal-emboss relief (Q1).
 */
function buildMetalRepousseLayerPack(rootSvg, stoneSlabMask, metalPlateMask, style3, questionnaire = null) {
  if (!metalPlateMask?.grid) return null;

  const embossEl = rootSvg.querySelector('.layer-metal-emboss');
  if (!embossEl) return null;

  const embossPat = questionnaire?.metalEmbossPattern;
  let { polylines: embossPolylines } = collectGlyphLayerPolylines(embossEl, rootSvg, style3);
  if (!embossPolylines.length) return null;

  const embossPlacement = {
    ...SLAB_METAL_EMBOSS_PLACEMENT,
    fit: SLAB_METAL_EMBOSS_PLACEMENT.fit * (embossPat?.embossScale ?? 1),
  };
  const placementRef = stoneSlabMask?.maskOrigin ?? metalPlateMask.maskOrigin;
  embossPolylines = transformPolylinesToBox(
    embossPolylines,
    sceneTextBox(placementRef, embossPlacement),
    embossPlacement.fit
  );

  return {
    plateMask: metalPlateMask,
    stoneSlabMask,
    embossPolylines,
    embossHeightMul: embossPat?.embossHeightMul ?? 1,
  };
}

/** @deprecated alias */
function buildMetalWishLayerPack(rootSvg, slabMaskOrigin, style3, questionnaire = null) {
  const stoneSlabMask =
    slabMaskOrigin?.grid != null
      ? slabMaskOrigin
      : buildStoneSlabMaskForMetal(rootSvg, null, style3, questionnaire);
  if (!stoneSlabMask) return null;
  const metalPlateMask = rasterizeMetalEllipseMask(
    stoneSlabMask,
    questionnaire?.metalPlateParams
  );
  return buildMetalRepousseLayerPack(
    rootSvg,
    stoneSlabMask,
    metalPlateMask,
    style3,
    questionnaire
  );
}

/** Stone slab mask for metal-only preview (uses fused Q2 letters when present). */
function buildStoneSlabMaskForMetal(rootSvg, style2, style3, questionnaire) {
  if (rootSvg) {
    const mask = rasterizeSlabWrapMask(rootSvg, style2, style3, questionnaire?.stoneShapeParams ?? null);
    if (mask) return mask;
  }
  const stoneShapeParams = questionnaire?.stoneShapeParams ?? null;
  if (!stoneShapeParams) return null;
  return rasterizeProceduralStoneMask(stoneShapeParams, style3);
}

/** Contact-shadow field from metal ellipse plate onto stone beneath. */
function metalSheetContactDist(metalPlateMask) {
  if (!metalPlateMask?.grid) return null;
  const { grid, w, h } = metalPlateMask;
  if (!grid.some((v) => v)) return null;
  return distanceToMaskGrid(grid, w, h);
}

function addMetalRepousseLayer(scene, metalPack, stoneMesh, slabMask, questionnaire, envMap) {
  if (!metalPack || !stoneMesh || !slabMask) return null;

  const field = buildRepousseHeightField(
    [],
    metalPack.embossPolylines,
    metalPack.plateMask.maskOrigin,
    {
      embossHeightMul: metalPack.embossHeightMul,
      ...REPOUSSE_FIELD_DEFAULTS,
      maxReliefHeight: 12,
      stoneSheetMask: metalPack.plateMask,
      metalInsetPx: 0,
    }
  );

  const geom = buildRepousseMeshFromHeightField(field, {
    segmentsX: 148,
    segmentsY: 148,
    sceneCoords: true,
  });
  geom.computeBoundingBox();

  const mat = buildSatinPewterMaterial(field, envMap);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.scale.copy(stoneMesh.scale);

  stoneMesh.geometry.computeBoundingBox();
  const stoneTop = stoneMesh.geometry.boundingBox.max.z * stoneMesh.scale.z;
  mesh.position.z = stoneMesh.position.z + stoneTop - 0.08;
  mesh.renderOrder = 42;
  scene.add(mesh);
  return mesh;
}

/** @deprecated wire tubes — use addMetalRepousseLayer */
function addMetalWishLayer(scene, pack, metalMat, style3, ageNum, style2, questionnaire = null) {
  const z = slabMetalWrapZ(style3);
  const tubeSpread = questionnaire?.metalShapeParams?.tubeSpread ?? 1;
  const embossMul = pack.embossHeightMul ?? 1;

  const tubesShape = addTubesFromPolylines(
    pack.shapePolylines,
    metalMat,
    scene,
    z,
    28,
    style3,
    ageNum,
    style2,
    {
      xyScale: SLAB_METAL_XY_SCALE * tubeSpread,
      radiusScale: SLAB_METAL_RADIUS_SCALE,
    }
  );

  const embossZ = z + 0.18 + embossMul * 0.12;
  const tubesEmboss = addTubesFromPolylines(
    pack.embossPolylines,
    metalMat,
    scene,
    embossZ,
    30,
    style3,
    ageNum,
    style2,
    {
      xyScale: SLAB_METAL_XY_SCALE * tubeSpread * 0.97,
      radiusScale: SLAB_METAL_RADIUS_SCALE * 0.48 * embossMul,
    }
  );

  return { tubesShape, tubesEmboss, total: tubesShape + tubesEmboss };
}

function addTubesFromLayer(layerEl, rootSvg, material, scene, z, renderOrder, style3, ageNum, style2, opts = null) {
  if (!layerEl) return 0;
  const xyScale = opts?.xyScale ?? 1;
  const radiusScale = opts?.radiusScale ?? 1;
  const skipBox = opts?.skipTypoBox ?? null;
  const skipMargin = opts?.skipTypoMargin ?? SLAB_METAL_TYPO_SKIP_MARGIN;
  const skipPath = (pts) => {
    if (opts?.clipBox && pts.length >= 2) {
      const c = polylineCentroid(pts);
      if (!pointInSceneBox(c.x, c.y, opts.clipBox, 0)) return true;
    }
    if (!skipBox || pts.length < 2) return false;
    if (pathMostlyInsideBox(pts, skipBox, skipMargin)) return true;
    const c = polylineCentroid(pts);
    return pointInSceneBox(c.x, c.y, skipBox, skipMargin);
  };
  let count = 0;
  layerEl.querySelectorAll('path').forEach((pathEl) => {
    const pts = samplePath(pathEl, rootSvg);
    if (skipPath(pts)) return;
    if (addTubeFromPoints(pts, material, scene, z, renderOrder, style3, ageNum, false, radiusScale, style2, false, xyScale)) count++;
  });
  layerEl.querySelectorAll('circle').forEach((circleEl) => {
    const pts = sampleCircle(circleEl, rootSvg);
    if (skipPath(pts)) return;
    if (addTubeFromPoints(pts, material, scene, z, renderOrder, style3, ageNum, true, radiusScale, style2, false, xyScale)) count++;
  });
  layerEl.querySelectorAll('ellipse').forEach((ellipseEl) => {
    const pts = sampleEllipse(ellipseEl, rootSvg);
    if (skipPath(pts)) return;
    if (addTubeFromPoints(pts, material, scene, z, renderOrder, style3, ageNum, true, radiusScale, style2, false, xyScale)) count++;
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
  for (let i = 0; i < result.length; i++) {
    result[i] = out.data[i * 4] > 120 ? 1 : 0;
  }
  return result;
}

function erodeMaskGrid(grid, w, h, radiusPx) {
  const inv = new Uint8Array(grid.length);
  for (let i = 0; i < grid.length; i++) inv[i] = grid[i] ? 0 : 1;
  const dil = dilateMaskGrid(inv, w, h, radiusPx);
  const out = new Uint8Array(grid.length);
  for (let i = 0; i < grid.length; i++) out[i] = dil[i] ? 0 : 1;
  return out;
}

/** Morphological close — bridge gaps between stroke fragments while staying thin. */
function closeStrokeMaskGrid(grid, w, h, dilatePx, erodePx) {
  let g = dilateMaskGrid(grid, w, h, dilatePx);
  if (erodePx > 0) g = erodeMaskGrid(g, w, h, erodePx);
  return g;
}

function fuseEngraveOverlayMask(overlay) {
  const bridge = Math.round(3 * MASK_SCALE);
  const shrink = Math.round(2 * MASK_SCALE);
  let fused = closeStrokeMaskGrid(overlay.grid, overlay.w, overlay.h, bridge, shrink);
  fused = dilateMaskGridBlur(fused, overlay.w, overlay.h, 2.2);
  return prepareTextOverlayFromGrid(fused, overlay.w, overlay.h, overlay.maskOrigin, overlay.maskScale);
}

function smoothEmbossOverlayMask(overlay) {
  const smoothed = dilateMaskGridBlur(overlay.grid, overlay.w, overlay.h, 3.6);
  return prepareTextOverlayFromGrid(smoothed, overlay.w, overlay.h, overlay.maskOrigin, overlay.maskScale);
}

function dilateMaskGrid(grid, w, h, radiusPx) {
  const r = Math.max(1, Math.round(radiusPx));
  if (r > 22) return dilateMaskGridBlur(grid, w, h, r);
  let cur = grid;
  for (let i = 0; i < r; i++) cur = dilateMaskGrid1px(cur, w, h);
  return cur;
}

function isMaskBoundaryPixel(grid, w, h, x, y) {
  if (!grid[y * w + x]) return false;
  if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return true;
  return (
    !grid[y * w + (x - 1)] ||
    !grid[y * w + (x + 1)] ||
    !grid[(y - 1) * w + x] ||
    !grid[(y + 1) * w + x]
  );
}

function traceMaskBoundaryLoop(grid, w, h, sx, sy) {
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];
  let x = sx;
  let y = sy;
  let dir = 6;
  const contour = [];
  let guard = 0;
  const maxGuard = Math.min(w + h, 8000) * 4;

  do {
    contour.push({ x: x + 0.5, y: y + 0.5 });
    let found = false;
    for (let i = 0; i < 8; i++) {
      const nd = (dir + i) % 8;
      const nx = x + dx[nd];
      const ny = y + dy[nd];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (grid[ny * w + nx] && isMaskBoundaryPixel(grid, w, h, nx, ny)) {
        x = nx;
        y = ny;
        dir = (nd + 5) % 8;
        found = true;
        break;
      }
    }
    if (!found) break;
    guard++;
  } while ((x !== sx || y !== sy || contour.length < 3) && guard < maxGuard);

  return contour;
}

function traceLargestMaskBoundary(grid, w, h) {
  const visited = new Uint8Array(w * h);
  let best = [];
  let components = 0;
  outer: for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isMaskBoundaryPixel(grid, w, h, x, y) || visited[y * w + x]) continue;
      components++;
      if (components > 12) break outer;
      const contour = traceMaskBoundaryLoop(grid, w, h, x, y);
      for (const p of contour) {
        const px = Math.floor(p.x);
        const py = Math.floor(p.y);
        if (px >= 0 && px < w && py >= 0 && py < h) visited[py * w + px] = 1;
      }
      if (contour.length > best.length) best = contour;
    }
  }
  return best;
}

function subsampleContourPts(pts, minDist) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const last = out[out.length - 1];
    const p = pts[i];
    if (Math.hypot(p.x - last.x, p.y - last.y) >= minDist) out.push(p);
  }
  return out.length >= 3 ? out : pts;
}

function slabMaskPointToScene(px, py, maskOrigin, pixelScale = 1) {
  return new THREE.Vector3(
    maskOrigin.minX + (px * pixelScale) / MASK_SCALE,
    maskOrigin.maxY - (py * pixelScale) / MASK_SCALE,
    0
  );
}

function downsampleMaskGrid(grid, w, h, step) {
  const s = Math.max(1, Math.round(step));
  const nw = Math.max(16, Math.ceil(w / s));
  const nh = Math.max(16, Math.ceil(h / s));
  const out = new Uint8Array(nw * nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(w - 1, x * s);
      const sy = Math.min(h - 1, y * s);
      out[y * nw + x] = grid[sy * w + sx] ? 1 : 0;
    }
  }
  return { grid: out, w: nw, h: nh, step: s };
}

function scalePointsFromCenter(pts, scale) {
  if (Math.abs(scale - 1) < 1e-4) return pts;
  const c = polylineCentroid(pts);
  return pts.map(
    (p) =>
      new THREE.Vector3(c.x + (p.x - c.x) * scale, c.y + (p.y - c.y) * scale, p.z ?? 0)
  );
}

/** Outer contour of stone slab mask, offset by SLAB_STONE_FRAME_MARGIN (uses cached slab mask). */
function buildSlabStoneFrameContour(slabMask) {
  if (!slabMask?.grid) return [];
  const { grid, w, h, maskOrigin } = slabMask;
  const marginPx = Math.max(2, Math.round(SLAB_STONE_FRAME_MARGIN * MASK_SCALE));
  const dilated = dilateMaskGridBlur(grid, w, h, marginPx);
  const ds = downsampleMaskGrid(dilated, w, h, SLAB_FRAME_CONTOUR_DOWNSAMPLE);
  const raw = traceLargestMaskBoundary(ds.grid, ds.w, ds.h);
  if (raw.length < 8) return [];
  let pts = raw.map((p) => slabMaskPointToScene(p.x, p.y, maskOrigin, ds.step));
  pts = scalePointsFromCenter(pts, SLAB_STONE_XY_SCALE);
  return subsampleContourPts(pts, PATH_STEP * 1.4);
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
  const { entries, strokeScene } = collectLayer3ShapeEntries(layerEl, rootSvg, style3);
  return { polylines: entries.map((e) => e.polylines[0]), strokeScene };
}

/** כל path/circle/ellipse — mesh נפרד עם תבליט וצל עצמאי */
function collectLayer3ShapeEntries(layerEl, rootSvg, style3) {
  const strokeW = effectiveL3StrokeWidth(style3);
  const domeR = l3TubeRadius(style3);
  const domePad = domeR + 8;
  const strokeScene = strokeW + domePad;
  const entries = [];
  const add = (pts, closed) => {
    if (pts.length < 2) return;
    const drawPts = closed ? pts : extendOpenPathCaps(pts, domePad * 0.55);
    entries.push({ polylines: [{ pts: drawPts, closed }], strokeScene });
  };
  layerEl.querySelectorAll('path').forEach((el) => add(samplePath(el, rootSvg), false));
  layerEl.querySelectorAll('circle').forEach((el) => add(sampleCircle(el, rootSvg), true));
  layerEl.querySelectorAll('ellipse').forEach((el) => add(sampleEllipse(el, rootSvg), true));
  return { entries, strokeScene };
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
  return readMaskGrid(canvas);
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
  const strokeW = effectiveL3StrokeWidth(style3);
  const gender = style3?.gender || 'female';
  if (gender === 'nonbinary') return strokeW * 0.52;
  if (gender === 'male') return strokeW * 0.42;
  return strokeW * 0.5;
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

function domeHeight(distPx, radiusScene, reliefScale = 0.65) {
  const t = Math.min(1, distPx / MASK_SCALE / Math.max(radiusScene, 0.01));
  const h = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t))) * radiusScene;
  return h * reliefScale;
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
  distToL2 = null,
  opalPalette = L3_OPAL_AMBER,
  l3MaterialMode = 'opal',
  l3StoneTextured = false,
  strokeGuide = null
) {
  const radius = l3TubeRadius(style3);
  const dist = distOverride || distanceTransform(grid, w, h);
  const reliefScale = l3MaterialMode === 'stone' ? 1.14 : 0.95;
  const step = MASK_MESH_STEP;
  const vertMap = new Map();
  const positions = [];

  const vertKey = (x, y) => x + ',' + y;
  const addVertex = (x, y) => {
    const key = vertKey(x, y);
    if (vertMap.has(key)) return vertMap.get(key);
    const i = y * w + x;
    const z = domeHeight(dist[i], radius, reliefScale);
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
  if (l3MaterialMode === 'stone') {
    applyStoneVertexColors(geom, maskOrigin, radius, distToL2, w, h, dist, strokeGuide);
  } else if (l3MaterialMode !== 'stone') {
    applyL3VertexColors(geom, maskOrigin, radius, distToL2, w, h, opalPalette);
  }
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

/** עיקול 2D של מסלולי L2 — תואם ל-buildStrokeCurve כדי שצל המגע ב-L3 יעקוב אחרי הקוצניות */
function perturbPolylinesForL2Shadow(polylines, style2, style3) {
  const occupationKey = style2?.occupationKey;
  if (!occupationKey) return polylines;
  const rough = 1 - (OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5);
  if (rough < 0.08) return polylines;

  const gender = style3?.gender || style2?.gender || 'female';
  const baseAmp = gender === 'female' ? 2.5 : gender === 'male' ? 1.2 : 1.8;
  const pathAmp = baseAmp * (0.08 + rough * 0.55);
  const smoothPasses = Math.max(1, Math.round(6 - rough * 5));

  return polylines.map(({ pts, closed }) => {
    if (pts.length < 2) return { pts, closed };
    let s = pts.map((p) => p.clone());
    for (let pass = 0; pass < smoothPasses; pass++) {
      const next = [s[0].clone()];
      for (let i = 1; i < s.length - 1; i++) {
        next.push(
          new THREE.Vector3(
            (s[i - 1].x + s[i].x * 2 + s[i + 1].x) / 4,
            (s[i - 1].y + s[i].y * 2 + s[i + 1].y) / 4,
            (s[i - 1].z + s[i].z * 2 + s[i + 1].z) / 4
          )
        );
      }
      next.push(s[s.length - 1].clone());
      s = next;
    }
    for (let i = 1; i < s.length - 1; i++) {
      const x = s[i].x;
      const y = s[i].y;
      const n = Math.sin(x * 0.08 + y * 0.13) * Math.cos(y * 0.11 - x * 0.07);
      s[i].x += n * pathAmp;
      s[i].y += n * pathAmp * 0.8;
    }
    return { pts: s, closed };
  });
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
  const shadowPolylines = perturbPolylinesForL2Shadow(polylines, style2, style3);
  const rough = style2 ? occupationRoughness(style2) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = strokeScene * MASK_SCALE;
  ctx.lineCap = rough > 0.35 ? 'square' : 'round';
  ctx.lineJoin = rough > 0.35 ? 'miter' : 'round';
  drawPolylinesMask(ctx, shadowPolylines, maskOrigin, strokeScene * MASK_SCALE);
  return readMaskGrid(canvas).grid;
}

/** Scene-space box on the stone slab (fractions of maskOrigin span). */
function sceneTextBox(maskOrigin, placement) {
  const spanX = maskOrigin.maxX - maskOrigin.minX;
  const spanY = maskOrigin.maxY - maskOrigin.minY;
  const cx = maskOrigin.minX + spanX * placement.cxFrac;
  const cy = maskOrigin.minY + spanY * placement.cyFrac;
  const bw = spanX * placement.widthFrac;
  const bh = spanY * placement.heightFrac;
  return {
    minX: cx - bw / 2,
    maxX: cx + bw / 2,
    minY: cy - bh / 2,
    maxY: cy + bh / 2,
    bw,
    bh
  };
}

function polylineBounds(polylines) {
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
  return { minX, maxX, minY, maxY };
}

function transformPolylinesToBox(polylines, targetBox, fit = 0.88) {
  const src = polylineBounds(polylines);
  if (!src) return polylines;
  const srcW = Math.max(1e-3, src.maxX - src.minX);
  const srcH = Math.max(1e-3, src.maxY - src.minY);
  const tgtW = targetBox.maxX - targetBox.minX;
  const tgtH = targetBox.maxY - targetBox.minY;
  const scale = Math.min(tgtW / srcW, tgtH / srcH) * fit;
  const srcCx = (src.minX + src.maxX) / 2;
  const srcCy = (src.minY + src.maxY) / 2;
  const tgtCx = (targetBox.minX + targetBox.maxX) / 2;
  const tgtCy = (targetBox.minY + targetBox.maxY) / 2;
  return polylines.map(({ pts, closed }) => ({
    closed,
    pts: pts.map(
      (pt) => new THREE.Vector3(tgtCx + (pt.x - srcCx) * scale, tgtCy + (pt.y - srcCy) * scale, 0)
    )
  }));
}

/** Scale name-letter polylines around scene center — keeps editor connection layout. */
function fitPolylinesToSceneExtent(polylines, maxRadius = SLAB_NAME_SHAPE_MAX_RADIUS, fit = SLAB_NAME_SHAPE_FIT) {
  const src = polylineBounds(polylines);
  if (!src) return polylines;
  const cx = (src.minX + src.maxX) / 2;
  const cy = (src.minY + src.maxY) / 2;
  const extent = Math.max((src.maxX - src.minX) / 2, (src.maxY - src.minY) / 2, 1e-3);
  const scale = extent > maxRadius ? (maxRadius / extent) * fit : 1;
  if (Math.abs(scale - 1) < 0.015) return polylines;
  return polylines.map(({ pts, closed }) => ({
    closed,
    pts: pts.map(
      (pt) => new THREE.Vector3(0 + (pt.x - cx) * scale, 0 + (pt.y - cy) * scale, 0)
    )
  }));
}

/** Hand-authored glyph SVG paths — same stroke model as L3 stone mask rasterization. */
function collectGlyphLayerPolylines(layerEl, rootSvg, style3) {
  const raw = collectLayer2PathPolylines(layerEl, rootSvg);
  const strokeW = effectiveL3StrokeWidth(style3);
  const domeR = l3TubeRadius(style3);
  const domePad = domeR + 8;
  const strokeScene = strokeW + domePad;
  const polylines = raw.map(({ pts, closed }) => ({
    closed,
    pts: closed ? pts : extendOpenPathCaps(pts, domePad * 0.55),
  }));
  return { polylines, strokeScene };
}

/**
 * Glyph layer → binary mask on slab using L3 rasterizeLayerMaskCanvas pipeline
 * (discs + round stroke on glyph SVG paths, not canvas font / hebrew-text-mask).
 */
function rasterizeGlyphLayerMaskCanvas(layerEl, rootSvg, style3, slabMaskOrigin, placement, strokeScale = 1) {
  let { polylines, strokeScene } = collectGlyphLayerPolylines(layerEl, rootSvg, style3);
  if (!polylines.length) return null;

  const targetBox = sceneTextBox(slabMaskOrigin, placement);
  polylines = transformPolylinesToBox(polylines, targetBox, placement.fit ?? 0.9);
  strokeScene *= strokeScale;

  const strokeW = strokeScene * MASK_SCALE;
  const w = Math.max(64, Math.ceil((slabMaskOrigin.maxX - slabMaskOrigin.minX) * MASK_SCALE));
  const h = Math.max(64, Math.ceil((slabMaskOrigin.maxY - slabMaskOrigin.minY) * MASK_SCALE));
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
  drawPolylinesMask(ctx, polylines, slabMaskOrigin, strokeW);

  const { grid } = readMaskGrid(canvas);
  let filled = 0;
  for (let i = 0; i < grid.length; i++) filled += grid[i];
  if (filled < 16) return null;

  return prepareTextOverlayFromGrid(grid, w, h, slabMaskOrigin, MASK_SCALE);
}

function slabMetalTubeRadius(style3) {
  const gender = style3?.gender || 'female';
  const base =
    gender === 'nonbinary'
      ? TUBE_RADIUS * 2.2
      : gender === 'male'
        ? TUBE_RADIUS * 1.4
        : TUBE_RADIUS * 0.7;
  return base * SLAB_METAL_RADIUS_SCALE;
}

function slabMetalWrapZ(style3) {
  const stoneFrontZ = L2_SURFACE_Z - L3_STONE_BACK_GAP;
  return stoneFrontZ + slabMetalTubeRadius(style3) * SLAB_METAL_WRAP_Z_LIFT;
}

/** Q4 metal fringe — connected letter tubes behind stone slab. */
function addMetalFringeTubes(mount, stoneMesh, metalMat, scene, style3, ageNum, style2) {
  const fringeEl = mount.querySelector('.layer-metal-fringe');
  if (!fringeEl || !stoneMesh) return 0;

  stoneMesh.geometry.computeBoundingBox();
  const bb = stoneMesh.geometry.boundingBox;
  const zMid =
    stoneMesh.position.z +
    (bb.min.z + bb.max.z) * 0.5 * stoneMesh.scale.z -
    METAL_FRINGE_Z_BEHIND;

  const fringeMat = metalMat.clone();
  if (fringeMat.envMap) fringeMat.envMapIntensity = (fringeMat.envMapIntensity || 1.2) * 2.8;
  fringeMat.color = fringeMat.color.clone().lerp(new THREE.Color(0xb4b8c4), 0.18);

  return addTubesFromLayer(
    fringeEl,
    mount,
    fringeMat,
    scene,
    zMid,
    METAL_FRINGE_RENDER_ORDER,
    style3,
    ageNum,
    style2,
    {
      xyScale: SLAB_STONE_XY_SCALE,
      radiusScale: METAL_FRINGE_RADIUS_SCALE
    }
  );
}

function pathMostlyInsideBox(pts, box, margin = 0, threshold = 0.38) {
  if (!box || pts.length < 2) return false;
  let inside = 0;
  for (const p of pts) {
    if (pointInSceneBox(p.x, p.y, box, margin)) inside++;
  }
  return inside / pts.length >= threshold;
}

function polylineCentroid(pts) {
  let sx = 0;
  let sy = 0;
  for (const p of pts) sx += p.x;
  for (const p of pts) sy += p.y;
  const n = Math.max(1, pts.length);
  return { x: sx / n, y: sy / n };
}

function pointInSceneBox(x, y, box, margin = 0) {
  return (
    x >= box.minX - margin &&
    x <= box.maxX + margin &&
    y >= box.minY - margin &&
    y <= box.maxY + margin
  );
}

/** L3/L2 tube paths → shallow stone beds + contact-shadow distance field. */
function buildSlabMetalIntegration(rootSvg, maskOrigin, w, h, style2, style3, stoneTubeR) {
  const roundR = stoneTubeR * 1.25;
  const bedTubeR = slabMetalTubeRadius(style3);
  let segments = [];

  const l3El = rootSvg.querySelector('.layer-3');
  if (l3El) {
    segments.push(...buildStrokeSegments(collectLayer3Polylines(l3El, rootSvg, style3).polylines, 72));
  }
  const l2El = rootSvg.querySelector('.layer-2');
  if (l2El && style2) {
    segments.push(...buildStrokeSegments(collectLayer2PathPolylines(l2El, rootSvg), 72));
  }

  let contactGrid = new Uint8Array(w * h);
  const strokeScene = bedTubeR * 2.45 * SLAB_METAL_XY_SCALE;
  if (l3El) {
    const { polylines } = collectLayer3Polylines(l3El, rootSvg, style3);
    const g = rasterizePolylinesToGrid(polylines, strokeScene, maskOrigin).grid;
    contactGrid = unionMaskGrids(contactGrid, g);
  }
  if (l2El && style2) {
    const polylines = collectLayer2PathPolylines(l2El, rootSvg);
    const g = rasterizePolylinesToGrid(polylines, strokeScene, maskOrigin).grid;
    contactGrid = unionMaskGrids(contactGrid, g);
  }

  return {
    metalBedSegments: segments.length ? segments : null,
    metalBedTubeR: bedTubeR,
    metalBedDepth: roundR * 0.52,
    metalBedShoulder: roundR * 0.32,
    distToMetal: contactGrid.some((v) => v) ? distanceToMaskGrid(contactGrid, w, h) : null,
  };
}

/**
 * Stone-only relief: name engravings (Q2). Emboss belongs to the metal layer (Q1).
 */
function buildSlabStoneEngraveRelief(rootSvg, slabMaskOrigin, style2, style3, stoneTubeR, questionnaire = null) {
  const roundR = stoneTubeR * 1.25;
  const domeR = l3TubeRadius(style3);
  const engravePat = questionnaire?.stoneEngravingPattern;

  let engraveSegments = null;
  let engraveOverlays = [];

  const q3El =
    rootSvg.querySelector('.layer-q3-engrave') ?? rootSvg.querySelector('.layer-q2-engrave');
  if (q3El) {
    let { polylines } = collectGlyphLayerPolylines(q3El, rootSvg, style3);
    if (polylines.length) {
      const box = sceneTextBox(slabMaskOrigin, SLAB_Q3_ENGRAVE_PLACEMENT);
      const fit = SLAB_Q3_ENGRAVE_PLACEMENT.fit * (engravePat?.decorativeScale ?? 1);
      polylines = transformPolylinesToBox(polylines, box, fit);
      engraveSegments = buildStrokeSegments(polylines, 80);
    }
    const mask = rasterizeGlyphLayerMaskCanvas(
      q3El,
      rootSvg,
      style3,
      slabMaskOrigin,
      SLAB_Q3_ENGRAVE_PLACEMENT,
      0.82
    );
    if (mask) {
      engraveOverlays.push({
        ...prepareTextOverlayFromGrid(mask.grid, mask.w, mask.h, mask.maskOrigin, MASK_SCALE),
        depth: roundR * 1.35 * (engravePat?.grooveDepthMul ?? 1),
        edgeWidth: roundR * 0.54,
      });
    }
  }

  const engraveDepthMul = engravePat?.grooveDepthMul ?? 1;

  return {
    engraveSegments,
    engraveOverlays,
    engraveTubeR: domeR * 1.08,
    engraveDepth: roundR * 2.05 * engraveDepthMul,
    maxEngraveSink: roundR * 1.85,
    maxEngraveSinkFrac: 0.98,
    basePlateHeight: roundR * 0.4,
  };
}

/** @deprecated — use buildSlabStoneEngraveRelief */
function buildSlabGlyphRelief(rootSvg, slabMaskOrigin, style2, style3, stoneTubeR, questionnaire = null) {
  return buildSlabStoneEngraveRelief(rootSvg, slabMaskOrigin, style2, style3, stoneTubeR, questionnaire);
}

/**
 * Q2 stone typography overlays (legacy mask path).
 * Expects `.layer-q2-engrave` in the composed SVG.
 */
function buildSlabGlyphOverlays(rootSvg, slabMaskOrigin, style2, style3, stoneTubeR) {
  const engraveOverlays = [];
  const embossOverlays = [];
  const roundR = stoneTubeR * 1.25;

  const q2El = rootSvg.querySelector('.layer-q2-engrave');
  if (q2El && style2) {
    const mask = rasterizeGlyphLayerMaskCanvas(
      q2El,
      rootSvg,
      style3,
      slabMaskOrigin,
      SLAB_Q_SHARED_PLACEMENT,
      0.68
    );
    if (mask) {
      const fused = fuseEngraveOverlayMask(mask);
      engraveOverlays.push({
        ...fused,
        depth: roundR * 0.62,
        edgeWidth: roundR * 0.3,
      });
    }
  }

  return { engraveOverlays, embossOverlays: [] };
}

async function buildUnifiedLayer3Geometry(
  layerEl,
  rootSvg,
  style3,
  ageNum,
  layer2El = null,
  style2 = null,
  opalPalette = L3_OPAL_AMBER,
  l3MaterialMode = 'opal',
  l3StoneTextured = false,
  questionnaire = null,
  previewMode = null
) {
  // 1. Rasterize L3 as its own mask
  const { canvas, maskOrigin } = rasterizeLayerMaskCanvas(layerEl, rootSvg, style3);
  const { grid: l3Grid, w, h } = readMaskGrid(canvas);
  const l3Mask = dilateMaskGrid(
    l3Grid,
    w,
    h,
    l3MaterialMode === 'stone' ? L3_MORPH_DILATE_PX + STONE_L3_EXTRA_DILATE_PX : L3_MORPH_DILATE_PX
  );

  let filled = 0;
  for (let i = 0; i < l3Mask.length; i++) filled += l3Mask[i];
  if (filled < 80) throw new Error('L3 union mask empty (' + filled + ' px)');

  let meshGrid = l3Mask;
  let distOverride = null;
  let distToL2 = null;
  let strokeGuide = null;

  if (l3MaterialMode === 'stone') {
    if (STONE_L3_SLAB_MODE) {
      const stoneShapeParams = questionnaire?.stoneShapeParams ?? null;
      const { grid: slabGrid, w, h, maskOrigin } = rasterizeSlabWrapMask(
        rootSvg,
        style2,
        style3,
        stoneShapeParams
      );
      let filled = 0;
      for (let i = 0; i < slabGrid.length; i++) filled += slabGrid[i];
      if (filled < 80) throw new Error('L3 stone slab mask empty (' + filled + ' px)');

      const stoneTubeR = l3TubeRadius(style3) * STONE_L3_NAME_TUBE_THICKNESS;
      const skipMetal = previewMode === 'stone';
      const slabMask = { grid: slabGrid, w, h, maskOrigin };
      const metalPlateMask = skipMetal
        ? null
        : rasterizeMetalEllipseMask(slabMask, questionnaire?.metalPlateParams);
      const metalPack = skipMetal
        ? null
        : buildMetalRepousseLayerPack(
            rootSvg,
            slabMask,
            metalPlateMask,
            style3,
            questionnaire
          );
      const glyphRelief = buildSlabStoneEngraveRelief(
        rootSvg,
        maskOrigin,
        style2,
        style3,
        stoneTubeR,
        questionnaire
      );
      const distToMetal = metalPlateMask ? metalSheetContactDist(metalPlateMask) : null;
      const plateCradle =
        metalPlateMask && !skipMetal
          ? buildMetalPlateCradleParams(metalPlateMask, questionnaire?.metalPlateParams, stoneTubeR)
          : null;

      const nameTube = layer2El && style2
        ? buildNameTubeStoneGeometry(layer2El, rootSvg, style2, style3)
        : null;
      let geom;
      if (nameTube) {
        geom = buildStoneSculptureMeshFromMask(
          slabGrid,
          w,
          h,
          maskOrigin,
          stoneTubeR,
          MASK_SCALE,
          distToMetal,
          nameTube.segments,
          {
            slabMode: true,
            basePlateHeight: stoneTubeR * 1.35 * 0.36,
            metalPlateCradle: plateCradle,
            ...glyphRelief,
          }
        );
      } else {
        geom = buildStoneSculptureMeshFromMask(
          slabGrid,
          w,
          h,
          maskOrigin,
          stoneTubeR,
          MASK_SCALE,
          distToMetal,
          null,
          {
            slabMode: true,
            basePlateHeight: stoneTubeR * 1.35 * 0.36,
            ...glyphRelief,
          }
        );
      }
      return {
        geom,
        maskOrigin,
        slabMask: { grid: slabGrid, w, h, maskOrigin },
        metalPack,
      };
    }

    let distToL2Stone = null;
    if (layer2El && style2) {
      const l2ShadowMask = rasterizeLayer2MaskGrid(layer2El, rootSvg, style2, style3, maskOrigin, w, h);
      distToL2Stone = distanceToMaskGrid(l2ShadowMask, w, h);
    }

    const { polylines } = collectLayer3Polylines(layerEl, rootSvg, style3);
    const segments = buildStrokeSegments(polylines);
    if (!segments.length) throw new Error('L3 stone stroke segments empty');

    const stoneTubeR = l3TubeRadius(style3) * STONE_L3_THICKNESS;
    const geom = buildStoneSculptureMeshFromMask(
      l3Mask,
      w,
      h,
      maskOrigin,
      stoneTubeR,
      MASK_SCALE,
      distToL2Stone,
      segments
    );
    return { geom, maskOrigin };
  }

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
        if (!distOverride) distOverride = new Float32Array(w * h);
        for (let i = 0; i < l3Mask.length; i++) {
          if (gapGrid[i]) distOverride[i] = gapDist[i];
          else if (l3Mask[i] && l3MaterialMode !== 'stone') distOverride[i] = 0;
        }
        meshGrid = l3Mask;
      }
    }
  }

  const geom = buildInflatedMeshFromMask(
    meshGrid,
    w,
    h,
    style3,
    ageNum,
    maskOrigin,
    distOverride,
    distToL2,
    opalPalette,
    l3MaterialMode,
    l3StoneTextured,
    strokeGuide
  );
  return { geom, maskOrigin };
}

/** אבן — mesh נפרד לכל צורה, צללים בין שכבות */
function buildSeparateStoneLayer3Geometries(
  layerEl,
  rootSvg,
  style3,
  ageNum,
  layer2El = null,
  style2 = null
) {
  const { entries, strokeScene } = collectLayer3ShapeEntries(layerEl, rootSvg, style3);
  if (!entries.length) throw new Error('L3 shape entries empty');

  const allPolylines = entries.map((e) => e.polylines[0]);
  const maskOrigin = maskBoundsFromPolylines(allPolylines, strokeScene);
  if (!maskOrigin) throw new Error('L3 mask bounds empty');

  const refW = Math.max(64, Math.ceil((maskOrigin.maxX - maskOrigin.minX) * MASK_SCALE));
  const refH = Math.max(64, Math.ceil((maskOrigin.maxY - maskOrigin.minY) * MASK_SCALE));

  let distToL2 = null;
  if (layer2El && style2) {
    const l2ShadowMask = rasterizeLayer2MaskGrid(
      layer2El,
      rootSvg,
      style2,
      style3,
      maskOrigin,
      refW,
      refH
    );
    distToL2 = distanceToMaskGrid(l2ShadowMask, refW, refH);
  }

  const geoms = [];
  const cellSize = Math.max(l3TubeRadius(style3) * 1.4, 8);

  for (const entry of entries) {
    const { grid, w, h } = rasterizePolylinesToGrid(entry.polylines, strokeScene, maskOrigin);
    const pieceMask = dilateMaskGrid(grid, w, h, L3_MORPH_DILATE_PX);

    let filled = 0;
    for (let i = 0; i < pieceMask.length; i++) filled += pieceMask[i];
    if (filled < 20) continue;

    const dist = distanceTransform(pieceMask, w, h);
    const segments = buildStrokeSegments(entry.polylines);
    const strokeGuide = {
      segments,
      index: buildSegmentSpatialIndex(segments, maskOrigin.minX, maskOrigin.minY, cellSize)
    };

    try {
      const geom = buildInflatedMeshFromMask(
        pieceMask,
        w,
        h,
        style3,
        ageNum,
        maskOrigin,
        dist,
        distToL2,
        L3_OPAL_AMBER,
        'stone',
        false,
        strokeGuide
      );
      geoms.push(geom);
    } catch (_) {}
  }

  if (!geoms.length) throw new Error('L3 separate stone meshes empty');
  return geoms;
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

async function addUnifiedSolidFromLayer(
  layerEl,
  rootSvg,
  material,
  scene,
  z,
  renderOrder,
  style3,
  ageNum,
  layer2El = null,
  style2 = null,
  opalPalette = L3_OPAL_AMBER,
  l3MaterialMode = 'opal',
  l3StoneTextured = false,
  questionnaire = null
) {
  if (l3MaterialMode === 'stone') {
    const { geom, slabMask, metalPack } = await buildUnifiedLayer3Geometry(
      layerEl,
      rootSvg,
      style3,
      ageNum,
      layer2El,
      style2,
      opalPalette,
      l3MaterialMode,
      l3StoneTextured,
      questionnaire
    );
    const stoneMesh = new THREE.Mesh(geom, material);
    geom.computeBoundingBox();
    const zFront = geom.boundingBox.max.z;
    stoneMesh.position.z = L2_SURFACE_Z - zFront - L3_STONE_BACK_GAP;
    stoneMesh.scale.set(SLAB_STONE_XY_SCALE, SLAB_STONE_XY_SCALE, 1);
    stoneMesh.renderOrder = renderOrder + 12;
    scene.add(stoneMesh);
    return { count: 1, stoneMesh, slabMask: slabMask ?? null, metalPack: metalPack ?? null };
  }

  const { geom, maskOrigin } = await buildUnifiedLayer3Geometry(
    layerEl,
    rootSvg,
    style3,
    ageNum,
    layer2El,
    style2,
    opalPalette,
    l3MaterialMode,
    l3StoneTextured,
    questionnaire
  );

  const milkMat = buildL3MilkBaseMaterial(opalPalette);
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
  if (opts.questionnaire && !opts.questionnaire.stoneShapeParams) {
    const q = opts.questionnaire;
    const derived = deriveAmuletShapeParams(
      q.wishText ?? q.embossedText ?? '',
      q.requesterName ?? q.engravedText ?? '',
      q.timingReason ?? q.l3Text ?? '',
      q.q4Belief ?? q.metalPlateParams?.belief ?? 'signs'
    );
    opts.questionnaire = { ...q, ...derived };
  }
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
  const l3MaterialMode = opts.l3MaterialMode === 'stone' ? 'stone' : 'opal';
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const l3AgeFactorVal = l3AgeFactor(style3, opts.ageNum);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = l3MaterialMode === 'stone' ? 1.12 : 1.5;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  active.renderer = renderer;

  const scene = new THREE.Scene();
  active.envMap = setupEnvironment(renderer, scene);
  if (l3MaterialMode === 'stone') {
    addStoneLights(scene);
  } else {
    addLights(scene, 0);
  }

  renderer.sortObjects = true;

  const metalRough = style2 ? metalRoughnessFromStyle2(style2) : 0;
  const metalMat = buildMetalMaterial(style2);
  if (l3MaterialMode === 'stone') metalMat.envMapIntensity = 2.35;
  const opalPalette = buildL3OpalPalette(style3?.domainKey);
  let l3Mat;
  let l3StoneTextured = false;
  if (l3MaterialMode === 'stone') {
    const stone = buildStoneMaterial(style2);
    l3Mat = stone.material;
    l3StoneTextured = stone.textured;
  } else {
    l3Mat = buildOpalGlassMaterial(opalPalette);
  }

  const l3Solid = await addUnifiedSolidFromLayer(
    layer3,
    mount,
    l3Mat,
    scene,
    0,
    0,
    style3,
    opts.ageNum,
    layer2,
    style2,
    opalPalette,
    l3MaterialMode,
    l3StoneTextured,
    opts.questionnaire
  );
  const tubesL3 = l3Solid?.count ?? l3Solid ?? 0;
  const stoneMesh = l3Solid?.stoneMesh ?? null;
  const slabMask = l3Solid?.slabMask ?? null;
  const metalPack = l3Solid?.metalPack ?? null;
  if (!tubesL3) throw new Error('no L3 paths');

  let tubesMetalFringe = 0;
  if (l3MaterialMode === 'stone' && stoneMesh) {
    tubesMetalFringe = addMetalFringeTubes(
      mount,
      stoneMesh,
      metalMat,
      scene,
      style3,
      opts.ageNum,
      style2
    );
  }

  let tubesL3Metal = 0;
  let tubesMetalEmboss = 0;
  let metalRepousseMesh = null;

  if (
    l3MaterialMode === 'stone' &&
    STONE_L3_SLAB_MODE &&
    !STONE_SLAB_HIDE_METAL &&
    metalPack &&
    stoneMesh &&
    slabMask
  ) {
    metalRepousseMesh = addMetalRepousseLayer(
      scene,
      metalPack,
      stoneMesh,
      slabMask,
      opts.questionnaire,
      active.envMap
    );
  } else if (l3MaterialMode === 'stone' && STONE_L3_SLAB_MODE && !STONE_SLAB_HIDE_METAL && metalPack) {
    const metalResult = addMetalWishLayer(
      scene,
      metalPack,
      metalMat,
      style3,
      opts.ageNum,
      style2,
      opts.questionnaire
    );
    tubesL3Metal = metalResult.tubesShape;
    tubesMetalEmboss = metalResult.tubesEmboss;
  } else if (!(l3MaterialMode === 'stone' && STONE_L3_SLAB_MODE)) {
    tubesL3Metal = addTubesFromLayer(
      layer3,
      mount,
      metalMat,
      scene,
      L2_SURFACE_Z,
      28,
      style3,
      opts.ageNum,
      style2
    );
  }

  let tubesL2 = 0;
  if (layer2 && style2 && !(l3MaterialMode === 'stone' && STONE_L3_SLAB_MODE)) {
    tubesL2 = addTubesFromLayer(
      layer2,
      mount,
      metalMat,
      scene,
      l3MaterialMode === 'stone' && STONE_L3_SLAB_MODE ? slabMetalWrapZ(style3) : L2_SURFACE_Z,
      l3MaterialMode === 'stone' && STONE_L3_SLAB_MODE ? 28 : 20,
      style3,
      opts.ageNum,
      style2
    );
  }

  let tubesFrame = 0;
  const hideFrameRing = l3MaterialMode === 'stone' && STONE_L3_SLAB_MODE;
  if (!hideFrameRing) {
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
    tubesFrame = addFrameRing(mount, frameMat, scene, FRAME_SURFACE_Z, 12, style3, opts.ageNum, style2);
    if (!tubesFrame) console.warn('[pbr] frame ring failed');
  }

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
    tubesL3: tubesL3 + tubesL3Metal + tubesMetalEmboss + tubesMetalFringe,
    tubesL3Slab: tubesL3,
    tubesL3Metal,
    tubesMetalEmboss,
    tubesMetalFringe,
    tubesFrame,
    metalRough,
    l3Rough: l3Mat.roughness,
    l3AgeFactor: l3AgeFactorVal,
    l3SurfaceScale: style3?.surfaceScale ?? 0,
    l3MaterialMode,
    l3StoneTextured
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
      tubesMetalFringe: core.tubesMetalFringe,
      tubesFrame: core.tubesFrame,
      metalRough: core.metalRough,
      l3Rough: core.l3Rough,
      l3AgeFactor: core.l3AgeFactor,
      l3SurfaceScale: core.l3SurfaceScale,
      l3MaterialMode: core.l3MaterialMode,
      l3StoneTextured: core.l3StoneTextured,
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

function addMetalPreviewLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.28));
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 5.8);
  key.position.set(0.5, 1.6, 2.8);
  const rim = new THREE.DirectionalLight(0xd8e4ff, 3.6);
  rim.position.set(-2.4, 0.6, -1.2);
  const fill = new THREE.DirectionalLight(0xfff4e8, 2.8);
  fill.position.set(2.0, -0.3, 1.6);
  const spec = new THREE.DirectionalLight(0xffffff, 3.0);
  spec.position.set(-0.6, 2.2, 2.2);
  const fringe = new THREE.DirectionalLight(0xe8f0ff, 4.2);
  fringe.position.set(0.2, -2.8, 2.4);
  scene.add(key, rim, fill, spec, fringe);
}

function createLayerPreviewRenderer(bgHex = 0xffffff, exposure = 1.12) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: false,
  });
  renderer.setClearColor(bgHex, 1);
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

function centerMeshAtOrigin(mesh) {
  mesh.geometry.computeBoundingBox();
  const bb = mesh.geometry.boundingBox;
  const cx = (bb.min.x + bb.max.x) * 0.5;
  const cy = (bb.min.y + bb.max.y) * 0.5;
  mesh.position.set(-cx, -cy, -bb.min.z);
  const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
  return { bb, span };
}

function centerGroupAtOrigin(group) {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return { span: 120 };
  const cx = (box.min.x + box.max.x) * 0.5;
  const cy = (box.min.y + box.max.y) * 0.5;
  group.position.set(-cx, -cy, -box.min.z);
  const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  return { span };
}

function orthoCameraForSpan(span, fill = 0.84) {
  const half = (span * 0.5) / fill;
  const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 5000);
  cam.position.set(0, 0, 1000);
  cam.lookAt(0, 0, 0);
  return cam;
}

function mountLayerPreviewCanvas(renderer, container) {
  container.innerHTML = '';
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);
}

function slabOriginForPreview(questionnaire) {
  const stoneShapeParams = questionnaire?.stoneShapeParams;
  if (stoneShapeParams) {
    const pts = buildOrganicStoneContour(stoneShapeParams, CX, CY);
    return maskBoundsFromPolylines([{ pts, closed: true }], stoneShapeParams.baseRadius * 0.12 + 18);
  }
  return { minX: CX - 130, maxX: CX + 130, minY: CY - 130, maxY: CY + 130 };
}

/**
 * Close-up render of the stone slab alone (no metal) — sage texture + name engravings.
 */
export async function renderStoneLayerPreview(opts) {
  const { svg, style2, style3, questionnaire, container } = opts;
  const mount = mountSvg(svg);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const layer3 = mount.querySelector('.layer-3');
  if (!layer3) throw new Error('stone preview: layer 3 missing');
  const layer2 = mount.querySelector('.layer-2');

  const { geom } = await buildUnifiedLayer3Geometry(
    layer3,
    mount,
    style3,
    opts.ageNum ?? 0,
    layer2,
    style2,
    L3_OPAL_AMBER,
    'stone',
    true,
    questionnaire,
    'stone'
  );
  geom.computeBoundingBox();

  const renderer = createLayerPreviewRenderer(0x080808, 1.12);
  const scene = new THREE.Scene();
  scene.environment = null;
  addStoneSculptureLights(scene);

  const mat = buildStoneMaterial(style2).material;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.scale.set(SLAB_STONE_XY_SCALE, SLAB_STONE_XY_SCALE, 1);
  geom.computeBoundingBox();
  const zFront = geom.boundingBox.max.z;
  mesh.position.z = L2_SURFACE_Z - zFront - L3_STONE_BACK_GAP;
  mesh.renderOrder = 12;

  const group = new THREE.Group();
  group.add(mesh);

  const { span } = centerGroupAtOrigin(group);
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 5000);
  const dist = span * 0.88;
  camera.position.set(span * 0.14, span * 0.1, dist);
  camera.lookAt(0, -span * 0.03, span * 0.01);
  renderer.render(scene, camera);
  mountLayerPreviewCanvas(renderer, container);

  disposeScene(scene);
  renderer.dispose();
  if (mount.parentNode) mount.parentNode.removeChild(mount);

  return { ok: true, span, fringeCount: 0 };
}

/**
 * Close-up render of the repoussé metal layer alone (no stone).
 * @param {{ svg: string, style3: object, questionnaire: object, container: HTMLElement }} opts
 */
export async function renderMetalLayerPreview(opts) {
  const { svg, style2, style3, questionnaire, container, ageNum } = opts;
  const mount = mountSvg(svg);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const stoneSlabMask = buildStoneSlabMaskForMetal(mount, style2, style3, questionnaire);
  if (!stoneSlabMask) throw new Error('metal preview: no stone shape (Q2)');

  const metalPlateMask = rasterizeMetalEllipseMask(
    stoneSlabMask,
    questionnaire?.metalPlateParams
  );
  if (!metalPlateMask) throw new Error('metal preview: ellipse plate failed');

  const metalPack = buildMetalRepousseLayerPack(
    mount,
    stoneSlabMask,
    metalPlateMask,
    style3,
    questionnaire
  );
  if (!metalPack) throw new Error('metal preview: no .layer-metal-emboss paths');

  const field = buildRepousseHeightField(
    [],
    metalPack.embossPolylines,
    metalPlateMask.maskOrigin,
    {
      embossHeightMul: metalPack.embossHeightMul,
      ...REPOUSSE_FIELD_DEFAULTS,
      stoneSheetMask: metalPlateMask,
      metalInsetPx: 0,
    }
  );

  const geom = buildRepousseMeshFromHeightField(field, { segmentsX: 180, segmentsY: 180 });
  geom.computeBoundingBox();

  const renderer = createLayerPreviewRenderer(0xffffff, 1.05);
  const scene = new THREE.Scene();
  const envMap = setupEnvironment(renderer, scene);
  addMetalPreviewLights(scene);

  const mat = buildSatinPewterMaterial(field, envMap, {
    color: 0x9299a4,
    roughness: 0.58,
    bumpScale: 0.28,
    envMapIntensity: 1.35
  });
  const mesh = new THREE.Mesh(geom, mat);
  const group = new THREE.Group();
  group.add(mesh);

  const { span } = centerGroupAtOrigin(group);
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 8000);
  const dist = span * 1.22;
  camera.position.set(span * 0.07, -span * 0.09, dist);
  camera.lookAt(0, 0, span * 0.38);

  renderer.render(scene, camera);
  mountLayerPreviewCanvas(renderer, container);

  disposeScene(scene);
  renderer.dispose();
  envMap.dispose();
  if (mount.parentNode) mount.parentNode.removeChild(mount);

  return { ok: true, maxHeight: field.maxHeight };
}

export { buildStoneMaterial, addStoneLights, addStoneRefLights, addStoneSculptureLights, buildProceduralStoneTextures, deriveAmuletShapeParams, METAL_ELLIPSE_BY_BELIEF };
