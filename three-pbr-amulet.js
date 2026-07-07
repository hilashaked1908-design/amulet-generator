/**
 * SVG stroke paths → Three.js PBR (metal tubes L2, SDF sculptural stone / inflated opal L3).
 * RoomEnvironment IBL + dramatic directional lights.
 */
import * as THREE from 'https://esm.sh/three@0.170.0';
import { RoomEnvironment } from 'https://esm.sh/three@0.170.0/examples/jsm/environments/RoomEnvironment.js';
import { buildStoneSculptureMeshFromMaskAsync, prepareTextOverlayFromGrid } from './stone-sdf-mesh.js';
import { yieldToMainThread } from './render-yield.js';
import {
  PREMIUM_MATERIAL_IDS,
  PREMIUM_MATERIAL_LIBRARY,
  getPremiumMaterialSpec,
  normalizePremiumMaterialId,
  isSharpReliefStonePreset,
  stoneProceduralVariant,
} from './amulet-material-presets.js';
import { deriveAmuletShapeParams, METAL_ELLIPSE_BY_BELIEF } from './amulet-shape-from-text.js';
import { REPOUSSE_FIELD_DEFAULTS } from './metal-repousse-mesh.js';
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
/** תואם ל-prototype-v2-unified.html — מרווח מסגרת בהגנה */
const SUMMONING_FRAME_PAD = 30;
const PATH_MAIN_W = L3_STROKE_WIDTH;
const MASK_SCALE = 2;
const MASK_MESH_STEP = 2;
/** z — L2 מלפנים; אבן L3 מאחור; מסגרת שכבה תחתונה (מאחורי הכל). */
const L2_SURFACE_Z = 8;
/** @deprecated — use slabFrameBackZ(); kept for non-slab fallback only */
const FRAME_SURFACE_Z = 10;
/** רווח בין חזית האבן לשכבת L2 */
const L3_STONE_BACK_GAP = 5;
/** Back → front render stack */
const FRAME_RENDER_ORDER = 0;
const STONE_RENDER_ORDER = 12;

let active = {
  renderer: null,
  envMap: null,
  scene: null,
  camera: null,
  ceramicMeshes: null,
  q5MaterialMeshes: null,
  ceramicQ1Material: null,
  ceramicQ5Feeling: null,
  q5AccentLights: null,
  stoneMesh: null,
  interactive: null,
};

const loaderPark = {
  scene: null,
  camera: null,
  renderer: null,
  interactive: null,
  baseRotY: 0,
  isDemo: false,
};
let sharedEnvMap = null;
let sharedStudioEnvMap = null;
let envMapRenderer = null;

function disposeSharedEnvMaps() {
  if (sharedEnvMap) {
    sharedEnvMap.dispose();
    sharedEnvMap = null;
  }
  if (sharedStudioEnvMap) {
    sharedStudioEnvMap.dispose();
    sharedStudioEnvMap = null;
  }
  envMapRenderer = null;
}

function disposeInteractive() {
  if (active.interactive) {
    active.interactive.dispose();
    active.interactive = null;
  }
}

function disposeActiveScene() {
  if (active.scene) {
    disposeScene(active.scene);
    active.scene = null;
    active.camera = null;
    active.ceramicMeshes = null;
    active.q5MaterialMeshes = null;
    if (active.ceramicQ1Material) {
      active.ceramicQ1Material.dispose();
      active.ceramicQ1Material = null;
    }
    active.ceramicQ5Feeling = null;
    active.stoneMesh = null;
    active.q5AccentLights = null;
  }
  active.envMap = null;
}

function disposeActive() {
  disposeInteractive();
  disposeActiveScene();
  if (active.renderer) {
    active.renderer.dispose();
    active.renderer = null;
  }
  disposeSharedEnvMaps();
  clearSlabStoneGeomCache();
  active.envMap = null;
}

function getOrCreateRenderer() {
  if (active.renderer) return active.renderer;
  active.renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true,
  });
  return active.renderer;
}

function disposeScene(scene) {
  scene.traverse((obj) => {
    if (obj.geometry && !isSlabStoneGeometryCached(obj.geometry)) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

function setupEnvironment(renderer, scene) {
  if (sharedEnvMap && envMapRenderer !== renderer) {
    disposeSharedEnvMaps();
  }
  if (!sharedEnvMap) {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    sharedEnvMap = pmremGenerator.fromScene(room, 0.04).texture;
    pmremGenerator.dispose();
    envMapRenderer = renderer;
  }
  scene.background = null;
  scene.environment = sharedEnvMap;
  active.envMap = sharedEnvMap;
  return sharedEnvMap;
}

/** Studio IBL — same as prototype-v2-unified.html createStudioEnvMap (L2 metal tubes). */
function getStudioEnvMap(renderer) {
  if (!renderer) return sharedStudioEnvMap;
  if (sharedStudioEnvMap && envMapRenderer === renderer) return sharedStudioEnvMap;
  if (sharedStudioEnvMap) {
    sharedStudioEnvMap.dispose();
    sharedStudioEnvMap = null;
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x888890);
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xc8c8d0,
      metalness: 0,
      roughness: 0.85,
      side: THREE.BackSide,
    })
  );
  room.scale.setScalar(80);
  envScene.add(room);
  const key = new THREE.DirectionalLight(0xffffff, 5);
  key.position.set(4, 8, 6);
  envScene.add(key);
  const fill = new THREE.DirectionalLight(0xe8eeff, 2.5);
  fill.position.set(-6, 2, 4);
  envScene.add(fill);
  const rim = new THREE.DirectionalLight(0xffeedd, 1.8);
  rim.position.set(0, -4, -6);
  envScene.add(rim);
  sharedStudioEnvMap = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  if (!envMapRenderer) envMapRenderer = renderer;
  return sharedStudioEnvMap;
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
  scene.add(new THREE.AmbientLight(0xd0cec8, 0.17));
  scene.add(new THREE.HemisphereLight(0xe8e6e0, 0x585650, 0.09));
  const key = new THREE.DirectionalLight(0xf0f0ec, 4.6);
  key.position.set(0.8, 2.6, 1.2);
  const fill = new THREE.DirectionalLight(0x9a9894, 0.07);
  fill.position.set(-0.45, 0.9, 1.3);
  scene.add(key, fill);
}

/** Balanced dual raking keys — softer bottom, stronger right-top read. */
function addMeteoriteStoneLights(scene) {
  scene.add(new THREE.AmbientLight(0x5c5854, 0.006));
  const hemi = new THREE.HemisphereLight(0xc8c4bc, 0x030302, 0.11);
  scene.add(hemi);

  const keyLeft = new THREE.DirectionalLight(0xffffff, 12);
  keyLeft.position.set(-1.55, 1.35, 3.9);

  const keyRight = new THREE.DirectionalLight(0xffffff, 17.5);
  keyRight.position.set(1.55, 1.55, 3.65);

  const keyRightRake = new THREE.DirectionalLight(0xf0ece6, 7.5);
  keyRightRake.position.set(2.05, 0.95, 2.35);

  const fillBottom = new THREE.DirectionalLight(0xe8e4dc, 2.6);
  fillBottom.position.set(0.05, -0.35, 2.35);

  const rimLow = new THREE.DirectionalLight(0xe6e0d8, 0.55);
  rimLow.position.set(0.1, -1.6, -2.1);

  const rimBackL = new THREE.DirectionalLight(0xdcd6ce, 0.68);
  rimBackL.position.set(-0.55, 0.15, -2.6);

  const rimBackR = new THREE.DirectionalLight(0xdcd6ce, 0.82);
  rimBackR.position.set(0.55, 0.22, -2.55);

  scene.add(keyLeft, keyRight, keyRightRake, fillBottom, rimLow, rimBackL, rimBackR);
}

function isMeteoriteQ4Belief(q4Belief) {
  return q4StonePreset(q4Belief) === PREMIUM_MATERIAL_IDS.METEORITE_STONE;
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

function resolveStoneRoughness(style2 = null, questionnaire = null) {
  if (questionnaire?.stoneRoughness != null) {
    return Math.max(0, Math.min(1, Number(questionnaire.stoneRoughness)));
  }
  if (questionnaire?.l3Spike != null) {
    return Math.max(0, Math.min(1, Number(questionnaire.l3Spike)));
  }
  return 0;
}

/** Q6 difficulty → slab thorn intensity (0 = smooth, 1 = spiky) — matches prototype L3_SPIKE_BY_DIFFICULTY. */
const Q6_SLAB_THORN_BY_DIFFICULTY = {
  uncertainty: 0.08,
  waiting: 0.28,
  letting_go: 0.48,
  failure: 0.62,
  no_control: 0.78,
  decision: 0.92,
};

function resolveSlabThornIntensity(questionnaire = null) {
  if (questionnaire?.l3Spike != null) {
    return Math.max(0, Math.min(1, Number(questionnaire.l3Spike)));
  }
  const q6 = questionnaire?.q6Difficulty;
  if (q6 && Q6_SLAB_THORN_BY_DIFFICULTY[q6] != null) {
    return Q6_SLAB_THORN_BY_DIFFICULTY[q6];
  }
  return Q6_SLAB_THORN_BY_DIFFICULTY.uncertainty;
}

function slabThornSeedFromQ6(q6Key) {
  let h = 0x9e3779b9;
  const s = String(q6Key || 'uncertainty');
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x85ebca6b);
  return h >>> 0;
}

function occupationRoughness(style2) {
  if (style2?.occupationSmoothness != null) {
    return 1 - style2.occupationSmoothness;
  }
  const key = style2?.occupationKey || 'care_health';
  const smooth = OCCUPATION_SMOOTHNESS[key] ?? 0.5;
  return 1 - smooth;
}

function frameSmoothnessFromStyle2(style2) {
  if (style2?.frameSmoothness != null) return style2.frameSmoothness;
  return 1.0;
}

function frameRoughnessFromStyle2(style2) {
  return 1 - frameSmoothnessFromStyle2(style2);
}

/** Frame tube radius — uniform; Q4 belief no longer changes thickness. */
function frameRadiusScaleFromStyle2(_style2) {
  return 1.0;
}

/** Frame + Q3 + Q1 solid — prototype-v2-unified.html buildMetalMaterial. */
function buildUnifiedFrameMetalMaterial(envMap, ageNum = 25) {
  return buildSavedRoughnessMetalMaterial(envMap, unifiedMetalRoughnessFromAge(ageNum));
}

function buildFrameMetalMaterial(_style2, envMap = null, ageNum = 25) {
  const map = envMap ?? active?.envMap ?? getStudioEnvMap(active?.renderer);
  return buildUnifiedFrameMetalMaterial(map, ageNum);
}

function metalRoughnessFromStyle2(style2) {
  const key = style2?.occupationKey || 'care_health';
  if (key === 'tech_finance') return 0.002;
  const rough = occupationRoughness(style2);
  return Math.min(0.25, 0.01 + rough * rough * 0.14 + rough * 0.1);
}

/** Same age curve as prototype-v2-saved-roughness.html ageToMetalRoughness. */
function unifiedMetalRoughnessFromAge(ageNum) {
  const a = Math.max(1, Math.min(120, Number(ageNum) || 25));
  return 0.06 + (a / 120) * 0.1;
}

/**
 * Exact copy of prototype-v2-saved-roughness.html buildMetalMaterial —
 * MeshPhysicalMaterial used for L2/L3 metal tubes in that build.
 */
function buildSavedRoughnessMetalMaterial(envMap, roughness) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xa8a8b0,
    metalness: 1.0,
    roughness,
    envMap,
    envMapIntensity: 2.75,
    clearcoat: 0.9,
    clearcoatRoughness: 0.06,
    reflectivity: 1.0,
  });
}

/** Q1 ceramic tubes — darker base, high-contrast specular (base color unchanged). */
function buildCeramicQ1TubeMaterial(envMap, ageNum) {
  const ageRough = unifiedMetalRoughnessFromAge(ageNum);
  const roughness = Math.min(0.065, ageRough * 0.38);
  return new THREE.MeshPhysicalMaterial({
    color: 0x9898a0,
    metalness: 1.0,
    roughness,
    envMap,
    envMapIntensity: 3.65,
    clearcoat: 0.97,
    clearcoatRoughness: 0.028,
    reflectivity: 1.0,
    specularIntensity: 1.15,
    specularColor: new THREE.Color(0xffffff),
  });
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

function buildMetalMaterial(style2, forFrame = false, envMap = null) {
  const map = envMap ?? active?.envMap ?? getStudioEnvMap(active?.renderer);
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
        envMap: map,
        envMapIntensity: 2.5
      })
    : new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 1.0,
        roughness: forFrame
          ? Math.min(0.06, 0.025 + rough * 0.025)
          : metalRoughnessFromStyle2(style2),
        envMap: map,
        envMapIntensity: 1.5
      });
  if (!polished) {
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

/**
 * Q1 front layer — DragonDispersion glTF optical glass (Three.js r165+ `dispersion`).
 * RoomEnvironment PMREM (setupEnvironment) supplies internal reflections.
 */
const DRAGON_GLASS_PRESET = PREMIUM_MATERIAL_LIBRARY[PREMIUM_MATERIAL_IDS.DRAGON_GLASS].dragonGlass;

const CHROME_METAL_PRESET = PREMIUM_MATERIAL_LIBRARY[PREMIUM_MATERIAL_IDS.CHROME_METAL];

const MATTE_POLYMER_PRESET = PREMIUM_MATERIAL_LIBRARY[PREMIUM_MATERIAL_IDS.MATTE_POLYMER];

const BRONZE_METAL_PRESET = {
  color: 0x6b4428,
  metalness: 1.0,
  roughness: 0.32,
  envMapIntensity: 2.1,
  clearcoat: 0.28,
  clearcoatRoughness: 0.18,
};

/** FastHDR materials example — MeshStandardMaterial spheres (02–05). */
const FASTHDR_MATTE_WHITE = {
  color: 0xf5f5f5,
  metalness: 0.0,
  roughness: 1.0,
  envMapIntensity: 0.1,
};
const FASTHDR_MATTE_BLACK = {
  color: 0x101012,
  metalness: 0.0,
  roughness: 1.0,
  envMapIntensity: 0.1,
};
const FASTHDR_CHROME = {
  color: 0xffffff,
  metalness: 1.0,
  roughness: 0.0,
  envMapIntensity: 1.0,
};
const FASTHDR_BLACK_CHROME = {
  color: 0x0a0a0c,
  metalness: 1.0,
  roughness: 0.0,
  envMapIntensity: 1.0,
};
const FASTHDR_BRUSHED_METAL = {
  color: 0x888888,
  metalness: 1.0,
  roughness: 0.5,
  envMapIntensity: 1.0,
};
const FASTHDR_GLOSSY_POLYMER = {
  color: 0x6ab440,
  metalness: 0.0,
  roughness: 0.0,
  envMapIntensity: 1.0,
};

function buildFastHdrStandardMaterial(envMap, spec) {
  const map = envMap ?? active?.envMap ?? null;
  return new THREE.MeshStandardMaterial({
    color: spec.color,
    metalness: spec.metalness,
    roughness: spec.roughness,
    envMap: map,
    envMapIntensity: spec.envMapIntensity,
    side: THREE.DoubleSide,
  });
}

/** Q5 → Q1 ceramic + slab frame material preset + tint. */
const Q5_CERAMIC_MATERIAL = {
  hope: { preset: 'fasthdr_matte_white', color: 0xaeaeb4, roughness: 1.0, envMapIntensity: 0.05 },
  excitement: { preset: 'chrome', color: 0xd0d0d6, roughness: 0.05, envMapIntensity: 2.05 },
  fear: { preset: 'fasthdr_black_chrome', color: 0x505058, roughness: 0.07 },
  confusion: { preset: 'fasthdr_brushed_metal' },
  impatience: { preset: 'fasthdr_matte_black' },
  longing: { preset: 'dragon', attenuationColor: [0.75, 0.8, 0.82] },
};

function q5CeramicPresetSpec(q5Feeling) {
  return Q5_CERAMIC_MATERIAL[q5Feeling] ?? Q5_CERAMIC_MATERIAL.hope;
}

/** Stone slab lighting — fixed dark rig; never tied to Q5 ceramic preset. */
const CERAMIC_LIGHT_LAYER = 1;
const STONE_SCENE_EXPOSURE = 1.12;
const STONE_SCENE_ENV_INTENSITY = 0.42;

function tuneStoneSceneDark(renderer, scene) {
  if (renderer) renderer.toneMappingExposure = STONE_SCENE_EXPOSURE;
  if (scene && 'environmentIntensity' in scene) {
    scene.environmentIntensity = STONE_SCENE_ENV_INTENSITY;
  }
}

function tuneMeteoriteStoneScene(renderer, scene) {
  if (renderer) renderer.toneMappingExposure = 1.38;
  if (scene && 'environmentIntensity' in scene) {
    scene.environmentIntensity = 0.12;
  }
}

function tuneRendererExposureForQ5(renderer, q5Feeling) {
  if (!renderer) return;
  if (q5Feeling === 'hope') {
    renderer.toneMappingExposure = 1.08;
    return;
  }
  if (q5Feeling === 'excitement') {
    renderer.toneMappingExposure = 1.28;
    return;
  }
  const preset = q5CeramicPresetSpec(q5Feeling).preset;
  renderer.toneMappingExposure =
    preset === 'chrome' || preset === 'fasthdr_chrome' || preset === 'fasthdr_black_chrome'
      ? 1.35
      : preset === 'bronze' || preset === 'fasthdr_brushed_metal'
        ? 1.28
        : preset === 'matte' || preset === 'fasthdr_matte_white' || preset === 'fasthdr_matte_black'
          ? 1.2
          : preset === 'fasthdr_glossy_polymer'
            ? 1.22
            : 1.12;
}

function tuneSceneEnvironmentForQ5(scene, q5Feeling) {
  if (!scene) return;
  if ('environmentIntensity' in scene) {
    if (q5Feeling === 'hope') {
      scene.environmentIntensity = 0.28;
      return;
    }
    if (q5Feeling === 'excitement') {
      scene.environmentIntensity = 1.55;
      return;
    }
  }
  const preset = q5CeramicPresetSpec(q5Feeling).preset;
  if ('environmentIntensity' in scene) {
    scene.environmentIntensity =
      preset === 'chrome' || preset === 'fasthdr_chrome' || preset === 'fasthdr_black_chrome'
        ? 1.75
        : preset === 'bronze' || preset === 'fasthdr_brushed_metal'
          ? 1.5
          : preset === 'matte' || preset === 'fasthdr_matte_white' || preset === 'fasthdr_matte_black'
            ? 0.42
            : preset === 'fasthdr_glossy_polymer'
              ? 1.35
              : 1.0;
  }
}

/** Darker crevice read — lighting only; materials unchanged. */
function deepenSceneShadows(scene, renderer) {
  if (scene) {
    scene.traverse((obj) => {
      if (!obj.isLight) return;
      if (obj.isAmbientLight || obj.isHemisphereLight) {
        obj.intensity *= 0.48;
      } else if (obj.isDirectionalLight && obj.intensity < 3.5) {
        obj.intensity *= 0.62;
      }
    });
    if ('environmentIntensity' in scene) {
      scene.environmentIntensity *= 0.72;
    }
  }
  if (renderer) {
    renderer.toneMappingExposure *= 0.93;
  }
}

const ORBIT_ROTATE_SPEED = 0.0055;
const ORBIT_TILT_LIMIT = 0.82;
const AUTO_ROTATE_SPEED = 0.0042;

function disposeLoaderInteractive() {
  if (loaderPark.interactive) {
    loaderPark.interactive.dispose();
    loaderPark.interactive = null;
  }
}

export function disposeLoaderPark() {
  disposeLoaderInteractive();
  if (loaderPark.scene) {
    disposeScene(loaderPark.scene);
    loaderPark.scene = null;
    loaderPark.camera = null;
  }
  if (loaderPark.renderer) {
    loaderPark.renderer.dispose();
    loaderPark.renderer = null;
  }
  loaderPark.baseRotY = 0;
  loaderPark.isDemo = false;
  const slot = document.getElementById('loaderAmuletSlot');
  if (slot) slot.innerHTML = '';
}

function mountParkedCanvas(container) {
  if (!loaderPark.renderer || !container) return;
  const canvas = loaderPark.renderer.domElement;
  container.innerHTML = '';
  container.appendChild(canvas);
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.maxWidth = '100%';
  canvas.style.maxHeight = '100%';
  canvas.style.touchAction = 'none';
}

function createOrbitControls(canvas, { scene, camera, renderer, baseRotY, autoRotate = false }) {
  let userRotX = autoRotate ? 0.24 : 0;
  let userRotY = 0;
  let dragging = false;
  let pointerId = null;
  let lastX = 0;
  let lastY = 0;
  let autoRotating = Boolean(autoRotate);
  let rafId = 0;

  function applyRotation() {
    scene.rotation.x = userRotX;
    scene.rotation.y = baseRotY + userRotY;
    scene.updateMatrixWorld(true);
  }

  function renderFrame() {
    renderer.render(scene, camera);
  }

  function tick() {
    if (autoRotating && !dragging) {
      userRotY += AUTO_ROTATE_SPEED;
      applyRotation();
      renderFrame();
    }
    rafId = window.requestAnimationFrame(tick);
  }

  function setAutoRotate(enabled) {
    autoRotating = Boolean(enabled);
    if (autoRotating) {
      userRotX = 0.24;
      applyRotation();
      renderFrame();
    }
    if (autoRotating && !rafId) {
      rafId = window.requestAnimationFrame(tick);
    } else if (!autoRotating) {
      stopLoop();
    }
  }

  function stopLoop() {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function onPointerDown(e) {
    dragging = true;
    pointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.setPointerCapture(pointerId);
    canvas.style.cursor = 'grabbing';
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    userRotY += (e.clientX - lastX) * ORBIT_ROTATE_SPEED;
    userRotX += (e.clientY - lastY) * ORBIT_ROTATE_SPEED;
    userRotX = Math.max(-ORBIT_TILT_LIMIT, Math.min(ORBIT_TILT_LIMIT, userRotX));
    lastX = e.clientX;
    lastY = e.clientY;
    applyRotation();
    renderFrame();
  }

  function endDrag(e) {
    if (e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    canvas.style.cursor = autoRotating ? 'default' : 'grab';
  }

  canvas.style.cursor = autoRotating ? 'default' : 'grab';
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);

  applyRotation();
  renderFrame();
  if (autoRotating) {
    rafId = window.requestAnimationFrame(tick);
  }

  return {
    reset() {
      userRotX = autoRotating ? 0.24 : 0;
      userRotY = 0;
      applyRotation();
      renderFrame();
    },
    setAutoRotate,
    dispose() {
      stopLoop();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('lostpointercapture', endDrag);
      canvas.style.cursor = '';
      canvas.style.touchAction = '';
    },
  };
}

/** Move the current finished amulet into the loader slot (previous step preview). */
export function parkCurrentAmuletForLoader(container) {
  if (!active.scene || !active.renderer || !active.camera || !container) return false;

  disposeLoaderPark();
  disposeInteractive();

  const canvas = active.renderer.domElement;
  loaderPark.scene = active.scene;
  loaderPark.camera = active.camera;
  loaderPark.renderer = active.renderer;
  loaderPark.baseRotY = active.scene.rotation.y;
  loaderPark.isDemo = false;

  active.scene = null;
  active.camera = null;
  active.renderer = null;
  active.interactive = null;
  active.ceramicMeshes = null;
  active.q5MaterialMeshes = null;
  active.ceramicQ1Material = null;
  active.ceramicQ5Feeling = null;
  active.stoneMesh = null;
  active.q5AccentLights = null;

  mountParkedCanvas(container);
  loaderPark.interactive = createOrbitControls(canvas, {
    scene: loaderPark.scene,
    camera: loaderPark.camera,
    renderer: loaderPark.renderer,
    baseRotY: loaderPark.baseRotY,
    autoRotate: true,
  });

  return true;
}

export function resumeLoaderParkSpin(container) {
  if (!loaderPark.scene || !loaderPark.renderer || !container) return false;
  mountParkedCanvas(container);
  if (!loaderPark.interactive) {
    loaderPark.interactive = createOrbitControls(loaderPark.renderer.domElement, {
      scene: loaderPark.scene,
      camera: loaderPark.camera,
      renderer: loaderPark.renderer,
      baseRotY: loaderPark.baseRotY,
      autoRotate: true,
    });
  } else {
    loaderPark.interactive.setAutoRotate(true);
  }
  return true;
}

export function pauseLoaderParkSpin() {
  loaderPark.interactive?.setAutoRotate?.(false);
}

export function markLoaderParkAsDemo() {
  loaderPark.isDemo = true;
}

export function loaderParkIsReady() {
  return Boolean(loaderPark.scene && loaderPark.renderer);
}

function attachAmuletOrbitControls(canvas, { scene, camera, renderer, baseRotY, autoRotate = false }) {
  disposeInteractive();
  const handle = createOrbitControls(canvas, {
    scene,
    camera,
    renderer,
    baseRotY,
    autoRotate,
  });
  active.interactive = handle;
  return handle;
}

export function setAmuletAutoRotate(enabled) {
  active.interactive?.setAutoRotate?.(Boolean(enabled));
}

/** Extra rig so chrome reads mirror-polished, matte reads flat white. */
function clearQ5CeramicAccentLights(scene) {
  for (const light of active.q5AccentLights ?? []) scene.remove(light);
  active.q5AccentLights = [];
}

function addQ5CeramicAccentLights(scene, q5Feeling) {
  clearQ5CeramicAccentLights(scene);
  const preset = q5CeramicPresetSpec(q5Feeling).preset;
  const tagLayer = (light) => {
    light.layers.set(CERAMIC_LIGHT_LAYER);
    return light;
  };
  if (preset === 'chrome' || preset === 'fasthdr_black_chrome') {
    const keyStr = q5Feeling === 'excitement' ? 2.5 : 3.2;
    const rimStr = q5Feeling === 'excitement' ? 1.45 : 2.0;
    const key = tagLayer(new THREE.DirectionalLight(q5Feeling === 'excitement' ? 0xe6e6ea : 0xffffff, keyStr));
    key.position.set(1.4, 2.2, 3.8);
    const rim = tagLayer(new THREE.DirectionalLight(0xd8e4ff, rimStr));
    rim.position.set(-2.0, 1.2, 2.6);
    scene.add(key, rim);
    active.q5AccentLights = [key, rim];
  } else if (preset === 'bronze') {
    const key = tagLayer(new THREE.DirectionalLight(0xffe6cc, 2.9));
    key.position.set(1.3, 2.1, 3.6);
    const fill = tagLayer(new THREE.DirectionalLight(0xc49a6c, 1.5));
    fill.position.set(-1.6, 0.9, 2.4);
    scene.add(key, fill);
    active.q5AccentLights = [key, fill];
  } else if (preset === 'matte' || preset === 'fasthdr_matte_white' || preset === 'fasthdr_matte_black') {
    if (q5Feeling === 'hope') {
      const amb = tagLayer(new THREE.AmbientLight(0x8e9094, 0.07));
      const key = tagLayer(new THREE.DirectionalLight(0xb4b6b8, 1.85));
      key.position.set(1.15, 2.6, 3.2);
      const fill = tagLayer(new THREE.DirectionalLight(0x62646a, 0.42));
      fill.position.set(-1.0, 0.35, 2.4);
      const rim = tagLayer(new THREE.DirectionalLight(0x70747a, 0.12));
      rim.position.set(-2.1, 0.45, 1.8);
      scene.add(amb, key, fill, rim);
      active.q5AccentLights = [amb, key, fill, rim];
    } else if (q5Feeling === 'impatience' || preset === 'fasthdr_matte_white' || preset === 'fasthdr_matte_black') {
      const amb = tagLayer(new THREE.AmbientLight(0xb8bab6, 0.12));
      const key = tagLayer(new THREE.DirectionalLight(0xc8cac6, 2.35));
      key.position.set(1.1, 2.5, 3.4);
      const rim = tagLayer(new THREE.DirectionalLight(0x909498, 0.22));
      rim.position.set(-2.2, 0.5, 2.0);
      scene.add(amb, key, rim);
      active.q5AccentLights = [amb, key, rim];
    } else {
      const amb = tagLayer(new THREE.AmbientLight(0xffffff, 0.42));
      const soft = tagLayer(new THREE.DirectionalLight(0xf4f4f4, 1.1));
      soft.position.set(0.6, 1.8, 2.4);
      scene.add(amb, soft);
      active.q5AccentLights = [amb, soft];
    }
  } else if (preset === 'fasthdr_brushed_metal') {
    const key = tagLayer(new THREE.DirectionalLight(0xffffff, 2.4));
    key.position.set(1.3, 2.0, 3.5);
    const fill = tagLayer(new THREE.DirectionalLight(0xc8c8c8, 1.2));
    fill.position.set(-1.5, 0.8, 2.2);
    scene.add(key, fill);
    active.q5AccentLights = [key, fill];
  } else if (preset === 'fasthdr_glossy_polymer') {
    const key = tagLayer(new THREE.DirectionalLight(0xffffff, 2.8));
    key.position.set(1.2, 2.4, 3.6);
    const rim = tagLayer(new THREE.DirectionalLight(0xe8ffe0, 1.4));
    rim.position.set(-1.8, 1.0, 2.8);
    scene.add(key, rim);
    active.q5AccentLights = [key, rim];
  }
}

function buildDragonGlassPresetMaterial(envMap, attenuationColor) {
  const map = envMap ?? active?.envMap ?? null;
  const att =
    attenuationColor instanceof THREE.Color
      ? attenuationColor
      : new THREE.Color(
          attenuationColor?.[0] ?? 0.75,
          attenuationColor?.[1] ?? 0.8,
          attenuationColor?.[2] ?? 0.82
        );
  return new THREE.MeshPhysicalMaterial({
    ...DRAGON_GLASS_PRESET,
    attenuationColor: att,
    transparent: true,
    depthWrite: false,
    envMap: map,
    envMapIntensity: 1.0,
  });
}

function buildChromeMetalPresetMaterial(
  envMap,
  color = CHROME_METAL_PRESET.color,
  roughness,
  envMapIntensity
) {
  const map = envMap ?? active?.envMap ?? null;
  return new THREE.MeshPhysicalMaterial({
    ...CHROME_METAL_PRESET,
    color,
    metalness: 1.0,
    roughness: roughness ?? 0.0,
    transmission: 0,
    transparent: false,
    depthWrite: true,
    envMap: map,
    envMapIntensity: envMapIntensity ?? CHROME_METAL_PRESET.envMapIntensity,
    clearcoat: 1.0,
    clearcoatRoughness: roughness != null ? Math.min(0.12, roughness * 2) : 0.0,
    side: THREE.DoubleSide,
  });
}

function buildMattePolymerPresetMaterial(
  envMap,
  color = MATTE_POLYMER_PRESET.color,
  roughness,
  envMapIntensity
) {
  const map = envMap ?? active?.envMap ?? null;
  return new THREE.MeshPhysicalMaterial({
    ...MATTE_POLYMER_PRESET,
    color,
    roughness: roughness ?? MATTE_POLYMER_PRESET.roughness,
    transmission: 0,
    transparent: false,
    depthWrite: true,
    envMap: map,
    envMapIntensity: envMapIntensity ?? MATTE_POLYMER_PRESET.envMapIntensity,
    side: THREE.DoubleSide,
  });
}

function buildBronzeMetalPresetMaterial(envMap, color = BRONZE_METAL_PRESET.color, roughness) {
  const map = envMap ?? active?.envMap ?? null;
  return new THREE.MeshPhysicalMaterial({
    ...BRONZE_METAL_PRESET,
    color,
    metalness: 1.0,
    roughness: roughness ?? BRONZE_METAL_PRESET.roughness,
    transmission: 0,
    transparent: false,
    depthWrite: true,
    envMap: map,
    envMapIntensity: BRONZE_METAL_PRESET.envMapIntensity,
    clearcoat: BRONZE_METAL_PRESET.clearcoat,
    clearcoatRoughness: BRONZE_METAL_PRESET.clearcoatRoughness,
    side: THREE.DoubleSide,
  });
}

function buildDragonDispersionGlassMaterial(envMap) {
  const map = envMap ?? active?.envMap ?? null;
  return new THREE.MeshPhysicalMaterial({
    ...DRAGON_GLASS_PRESET,
    attenuationColor: new THREE.Color(0.75, 0.8, 0.82),
    transparent: true,
    depthWrite: false,
    envMap: map,
    envMapIntensity: 1.0,
  });
}

function fastHdrMaterialSpec(base, spec) {
  return {
    ...base,
    ...(spec.color != null ? { color: spec.color } : {}),
    ...(spec.roughness != null ? { roughness: spec.roughness } : {}),
    ...(spec.metalness != null ? { metalness: spec.metalness } : {}),
    ...(spec.envMapIntensity != null ? { envMapIntensity: spec.envMapIntensity } : {}),
  };
}

/** Q1 ceramic + slab frame material from Question 5 — shared RoomEnvironment PMREM for all presets. */
function buildCeramicQ1MaterialFromQ5(q5Feeling, envMap) {
  const spec = q5CeramicPresetSpec(q5Feeling);
  const map = envMap ?? active?.envMap ?? null;
  let mat;
  if (spec.preset === 'chrome') {
    mat = buildChromeMetalPresetMaterial(
      map,
      spec.color ?? CHROME_METAL_PRESET.color,
      spec.roughness,
      spec.envMapIntensity
    );
  } else if (spec.preset === 'fasthdr_matte_white') {
    mat = buildFastHdrStandardMaterial(map, fastHdrMaterialSpec(FASTHDR_MATTE_WHITE, spec));
  } else if (spec.preset === 'fasthdr_matte_black') {
    mat = buildFastHdrStandardMaterial(map, fastHdrMaterialSpec(FASTHDR_MATTE_BLACK, spec));
  } else if (spec.preset === 'fasthdr_chrome') {
    mat = buildFastHdrStandardMaterial(map, fastHdrMaterialSpec(FASTHDR_CHROME, spec));
  } else if (spec.preset === 'fasthdr_black_chrome') {
    mat = buildFastHdrStandardMaterial(map, fastHdrMaterialSpec(FASTHDR_BLACK_CHROME, spec));
  } else if (spec.preset === 'fasthdr_brushed_metal') {
    mat = buildFastHdrStandardMaterial(map, fastHdrMaterialSpec(FASTHDR_BRUSHED_METAL, spec));
  } else if (spec.preset === 'fasthdr_glossy_polymer') {
    mat = buildFastHdrStandardMaterial(map, fastHdrMaterialSpec(FASTHDR_GLOSSY_POLYMER, spec));
  } else if (spec.preset === 'bronze') {
    mat = buildBronzeMetalPresetMaterial(map, spec.color ?? BRONZE_METAL_PRESET.color, spec.roughness);
  } else if (spec.preset === 'matte') {
    mat = buildMattePolymerPresetMaterial(
      map,
      spec.color ?? MATTE_POLYMER_PRESET.color,
      spec.roughness,
      spec.envMapIntensity
    );
  } else {
    mat = buildDragonGlassPresetMaterial(map, spec.attenuationColor);
  }
  mat.userData.q5Preset = spec.preset;
  mat.userData.q5Feeling = q5Feeling;
  return mat;
}

/**
 * Transmission + dispersion need a dedicated render pass; full resolution keeps refraction sharp.
 * Does not alter tone mapping, lights, camera, or scene hierarchy.
 */
function configureDragonGlassRenderer(renderer) {
  if (!renderer) return;
  if ('transmissionResolutionScale' in renderer) {
    renderer.transmissionResolutionScale = 1.0;
  }
}

/** @deprecated alias — front Q1 layer uses DragonDispersion glass. */
function buildCeramicMaterial(_hexColor, _style3, _ageNum, _l3Spike, envMap = null) {
  return buildDragonDispersionGlassMaterial(envMap);
}

/** Q6 stone spikiness is vector geometry — full rebuild required (no live material swap). */
export function updateStoneRoughnessFromQ6() {
  return false;
}

/** @deprecated — stone uses perturbPolylinesForStoneShape */
function perturbPolylinesForUpperLayers(polylines, style2, style3) {
  return perturbPolylinesForStoneShape(polylines, style2, style3);
}

/**
 * Swap Q1 ceramic + slab frame material when Question 5 changes (no geometry rebuild).
 * @returns {boolean} true when live scene was updated and re-rendered
 */
export function updateCeramicQ5Material(q5Feeling) {
  if (!active.scene || !active.renderer || !active.camera) return false;
  const meshes =
    active.q5MaterialMeshes?.filter((m) => m?.isMesh) ??
    active.ceramicMeshes?.filter((m) => m?.isMesh) ??
    [];
  if (!meshes.length) return false;

  if (active.ceramicQ1Material) active.ceramicQ1Material.dispose();
  const newMat = buildCeramicQ1MaterialFromQ5(q5Feeling, active.envMap);
  for (const mesh of meshes) mesh.material = newMat;
  active.ceramicQ1Material = newMat;
  active.ceramicQ5Feeling = q5Feeling;
  tuneStoneSceneDark(active.renderer, active.scene);
  addQ5CeramicAccentLights(active.scene, q5Feeling);
  active.renderer.render(active.scene, active.camera);
  return true;
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

const STONE_PROC_GEN = 90;
const BASALT_TEX_GEN = 13;

/** Sage-stone grain on basalt — veils macro basalt texture slightly. */
const BASALT_SAGE_GRAIN = {
  normalBlend: 0.38,
  bumpScale: 0.56,
  roughAmp: 4.8,
  albedoVeil: 0.42,
  macroSoften: 0.38,
};

const TERRACOTTA_TEX_GEN = 13;
const GRAVEL_TEX_GEN = 2;
const METEORITE_TEX_GEN = 7;

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(edge1 - edge0, 1e-6)));
  return t * t * (3 - 2 * t);
}

/** Worley F1 — distance to nearest cell feature (small = pore center). */
function stoneWorleyF1(u, v, cellScale) {
  return stoneVoronoiF2F1(u, v, cellScale).f1;
}

let slabStoneGeomCache = { key: '', geom: null };
const SLAB_STONE_CACHE_UID = '__slabStoneCached';

function markSlabStoneGeometryCached(geom) {
  if (geom) geom.userData[SLAB_STONE_CACHE_UID] = true;
}

function isSlabStoneGeometryCached(geom) {
  return !!geom?.userData?.[SLAB_STONE_CACHE_UID];
}

/** Text + relief opts only — grid is deterministic from the same questionnaire. */
function hashSlabStoneInputs(opts, segmentCount = 0, questionnaire = null) {
  let hash = 2166136261;
  const textSig = [
    questionnaire?.requesterName ?? '',
    questionnaire?.timingReason ?? '',
    questionnaire?.wishText ?? '',
    questionnaire?.q4Belief ?? '',
    questionnaire?.q7Change ?? '',
    questionnaire?.q7Letters?.join('') ?? '',
    questionnaire?.fringeLetters?.join('') ?? '',
    questionnaire?.stoneShapeParams ? JSON.stringify(questionnaire.stoneShapeParams) : '',
    questionnaire?.stoneEngravingPattern ? JSON.stringify(questionnaire.stoneEngravingPattern) : '',
    questionnaire?.metalEmbossPattern ? JSON.stringify(questionnaire.metalEmbossPattern) : '',
    questionnaire?.metalPlateParams ? JSON.stringify(questionnaire.metalPlateParams) : '',
    Math.round((resolveStoneRoughness(null, questionnaire) || 0) * 100),
    Math.round((resolveSlabThornIntensity(questionnaire) || 0) * 100),
    questionnaire?.q6Difficulty ?? '',
    questionnaire?.occupationKey ?? '',
    questionnaire?.q4Belief === 'signs'
      ? 'meteorite-shade-v16-interior'
      : questionnaire?.q4Belief === 'gut'
        ? 'seafoam-jade-gut-v4-q3metal'
        : questionnaire?.q4Belief === 'support'
          ? 'basalt-pbr-v11-veil'
          : questionnaire?.q4Belief === 'doubt'
            ? 'handmade-terracotta-micro-v2'
            : 'sage-inlay-v2-q3metal',
  ].join('|');
  for (let i = 0; i < textSig.length; i++) hash = Math.imul(hash ^ textSig.charCodeAt(i), 16777619);
  const sig = [
    segmentCount,
    opts?.basePlateHeight ?? 0,
    opts?.letterGapRelief ? 1 : 0,
    opts?.engraveOverlays?.length ?? 0,
    opts?.engraveSegments?.length ?? 0,
    opts?.embossOverlays?.length ?? 0,
    opts?.pierceHoleMask ? 1 : 0,
    opts?.metalHaloWrap ? 1 : 0,
    opts?.metalPlateCradle ? 1 : 0,
    opts?.metalBedSegments?.length ?? 0,
  ].join('|');
  for (let i = 0; i < sig.length; i++) hash = Math.imul(hash ^ sig.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

function takeCachedSlabStoneGeometry(key) {
  if (slabStoneGeomCache.key === key && slabStoneGeomCache.geom) {
    return slabStoneGeomCache.geom;
  }
  return null;
}

function storeCachedSlabStoneGeometry(key, geom) {
  if (slabStoneGeomCache.geom && slabStoneGeomCache.key !== key) {
    slabStoneGeomCache.geom.dispose();
  }
  markSlabStoneGeometryCached(geom);
  slabStoneGeomCache.key = key;
  slabStoneGeomCache.geom = geom;
}

function clearSlabStoneGeomCache() {
  if (slabStoneGeomCache.geom) slabStoneGeomCache.geom.dispose();
  slabStoneGeomCache = { key: '', geom: null };
}
let stoneProcCache = { key: '', textures: null };
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

/** Voronoi F2−F1 — mud-crack / cell boundaries for sedimentary stoneware. */
function stoneVoronoiF2F1(u, v, cellScale = 12) {
  const ix = Math.floor(u * cellScale);
  const iy = Math.floor(v * cellScale);
  let f1 = Infinity;
  let f2 = Infinity;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const cy = iy + dy;
      const seed = stoneHash(cx * 127.1 + cy * 311.7, cx * 269.5 + cy * 183.3);
      const jx = cx + stoneHash(seed, cx) * 0.88 + 0.06;
      const jy = cy + stoneHash(seed + 1.7, cy) * 0.88 + 0.06;
      const du = u * cellScale - jx;
      const dv = v * cellScale - jy;
      const d = Math.hypot(du, dv);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) f2 = d;
    }
  }
  return { f1, f2, gap: f2 - f1, edge: 1 - Math.min(1, f1 * 2.2) };
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

  const combined = film * 0.11 + sand * 0.1 + blob * 0.32 + mineral * 0.26 + drift * 0.38;
  const height =
    0.5 +
    blob * 0.2 +
    drift * 0.22 +
    mineral * 0.14 +
    sand * 0.09 +
    film * 0.06 +
    combined * 0.14 +
    Math.max(0, -pits) * 0.05;

  return { combined, film, sand, drift, blob, pits, height };
}

function samplePowderGrain(u, v) {
  const px = u * 940 + v * 520;
  const py = v * 940 - u * 440;
  const g1 = stoneHash(px, py);
  const g2 = stoneHash(px * 1.85 + 29, py * 1.85 + 43);
  const g3 = stoneHash(px * 3.7 + 71, py * 3.7 + 89);
  return (g1 + g2 * 0.52 + g3 * 0.22) / 1.74 - 0.5;
}

/** Basalt — vesicles, columnar cooling cracks, dense grain, broken micro-bumps. */
function sampleBasaltNoise(u, v) {
  const grain = stoneFbm2(u * 32.0 + 4.6, v * 30.0 + 3.9, 3);
  const micro = stoneFbm2(u * 58.0 + 13.2, v * 54.0 + 11.7, 2);
  const mineral = stoneFbm2(u * 2.8 + 6.8, v * 2.5 + 5.4, 3);

  const vesCell = stoneVoronoiF2F1(u * 19.4 + 0.31, v * 18.2 + 0.27, 24);
  const vesicles = vesCell.gap < 0.044 ? Math.pow((0.044 - vesCell.gap) / 0.044, 0.74) : 0;
  const vesicleRim = vesCell.edge * 0.38;

  const flow = stoneFbm2(u * 0.42 + 1.8, v * 0.38 + 1.4, 2) * Math.PI * 0.5;
  const su = u * Math.cos(flow) - v * Math.sin(flow);
  const colCell = stoneVoronoiF2F1(su * 5.2 + 0.9, v * 2.4 + 0.6, 7);
  const coolingCrack = colCell.gap < 0.052 ? Math.pow((0.052 - colCell.gap) / 0.052, 1.02) : 0;

  const bumpRand = stoneHash(Math.floor(u * 48 + 7.3), Math.floor(v * 48 + 11.1));
  const bumps = bumpRand > 0.982 ? (bumpRand - 0.982) * 42 : 0;

  const spot = stoneFbm2(u * 1.8 + 9.4, v * 1.6 + 8.1, 2);

  let height = 0.5;
  height -= vesicles * 0.044 - vesicleRim * 0.009;
  height -= coolingCrack * 0.058;
  height += bumps * 0.017;
  height += grain * 0.0045 + micro * 0.0022;
  height -= mineral * 0.0012;

  return { vesicles, vesicleRim, coolingCrack, grain, micro, mineral, bumps, spot, height };
}

function paintBasaltTexels(s, edgeWear = 0) {
  const base = 18;
  const grain = s.sageGrain ?? 0.5;
  const grainN = (grain - 0.5) * 2;
  const macroSoft = 1 - Math.abs(grainN) * BASALT_SAGE_GRAIN.macroSoften;
  const greySpot = (s.spot * 5.5 + s.mineral * 4.2 + s.grain * 2.8) * macroSoft;
  const pitDark = (s.vesicles * 24 + s.coolingCrack * 19 + s.micro * 2) * macroSoft;
  const bumpLift = s.bumps * 6 + s.vesicleRim * 3.5;
  const wornLift = edgeWear * 4;
  const veilLift = grainN * BASALT_SAGE_GRAIN.albedoVeil * 3.2;
  let r = Math.round(Math.max(6, Math.min(44, base + greySpot - pitDark + bumpLift * 0.82 + wornLift + veilLift)));
  let g = Math.round(
    Math.max(6, Math.min(44, base + greySpot * 0.98 - pitDark * 0.97 + bumpLift * 0.78 + wornLift * 0.96 + veilLift * 0.98))
  );
  let b = Math.round(
    Math.max(6, Math.min(42, base + greySpot * 0.94 - pitDark * 0.93 + bumpLift * 0.74 + wornLift * 0.92 + veilLift * 0.94))
  );
  const avg = (r + g + b) / 3;
  const veilMix = Math.abs(grainN) * BASALT_SAGE_GRAIN.albedoVeil * 0.16;
  r = Math.round(r * (1 - veilMix) + avg * veilMix);
  g = Math.round(g * (1 - veilMix) + avg * veilMix);
  b = Math.round(b * (1 - veilMix) + avg * veilMix);
  const roughVar =
    s.vesicles * 10 +
    s.coolingCrack * 8 +
    s.micro * 4 +
    s.grain * 3 +
    (s.sageGrain ?? 0) * BASALT_SAGE_GRAIN.roughAmp;
  return {
    r,
    g,
    b,
    heightV: 0,
    roughV: Math.round(Math.max(208, Math.min(228, 217 + roughVar - edgeWear * 3))),
    normalStrength: 13.6,
  };
}

/** Nearest gravel pebble cell — stable id, dome height, per-stone color. */
function gravelNearestPebble(u, v, cellScale, seed) {
  const ix = Math.floor(u * cellScale);
  const iy = Math.floor(v * cellScale);
  let f1 = Infinity;
  let f2 = Infinity;
  let nearestCx = 0;
  let nearestCy = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx;
      const cy = iy + dy;
      const h = stoneHash(cx * 127.1 + cy * 311.7 + seed, cx * 269.5 + cy * 183.3 + seed * 1.7);
      const jx = cx + stoneHash(h, cx + seed) * 0.84 + 0.08;
      const jy = cy + stoneHash(h + 1.7, cy + seed) * 0.84 + 0.08;
      const d = Math.hypot(u * cellScale - jx, v * cellScale - jy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        nearestCx = cx;
        nearestCy = cy;
      } else if (d < f2) f2 = d;
    }
  }
  const colorType = stoneHash(nearestCx * 17.3 + seed * 2.1, nearestCy * 23.7 + seed * 3.3);
  const colorShift = stoneHash(nearestCx * 41.9 + seed, nearestCy * 37.2 + seed) * 2 - 1;
  const pebbleLift = 0.68 + stoneHash(nearestCx * 9.1 + seed, nearestCy * 11.3 + seed) * 0.52;
  const pebbleR = 0.15 + stoneHash(nearestCx * 3.7 + seed, nearestCy * 5.1 + seed) * 0.13;
  const dome = f1 < pebbleR ? Math.pow(1 - f1 / pebbleR, 0.68) : 0;
  return { f1, f2, gap: f2 - f1, dome, pebbleR, colorType, colorShift, pebbleLift, cx: nearestCx, cy: nearestCy };
}

/** Gravel — dense sharp pebbles, mixed gray / brown / black, per-stone color. */
function sampleGravelNoise(u, v) {
  const coarse = gravelNearestPebble(u, v, 24, 1.3);
  const medium = gravelNearestPebble(u, v, 40, 4.7);
  const fine = gravelNearestPebble(u, v, 62, 9.2);

  const pebble = Math.max(coarse.dome * coarse.pebbleLift, medium.dome * medium.pebbleLift * 0.72, fine.dome * 0.48);
  const rim = (coarse.dome * 0.62 + medium.dome * 0.28) * (1 - Math.min(1, coarse.f1 * 4.2));
  const crevice = Math.max(0, 1 - pebble * 2.4) * 0.62 + coarse.gap * 11 + medium.gap * 8 + fine.gap * 5;
  const powder = samplePowderGrain(u, v);
  const grit = stoneFbm2(u * 72.0 + 8.1, v * 68.0 + 7.4, 2);

  let height = 0.5;
  height += coarse.dome * coarse.pebbleLift * 0.22;
  height += medium.dome * medium.pebbleLift * 0.14;
  height += fine.dome * 0.06;
  height += rim * 0.028 - crevice * 0.042;
  height += powder * 0.005 + grit * 0.004;
  height -= (1 - pebble) * Math.max(0, -grit) * 0.012;

  return {
    pebble,
    rim,
    crevice,
    powder,
    grit,
    colorType: coarse.colorType,
    colorShift: coarse.colorShift,
    pebbleLift: coarse.pebbleLift,
    height,
  };
}

function paintGravelTexels(s, edgeWear = 0) {
  const ct = s.colorType ?? 0.5;
  const shift = s.colorShift ?? 0;
  const lift = s.pebble * (0.55 + (s.pebbleLift ?? 1) * 0.45);

  let baseR;
  let baseG;
  let baseB;
  if (ct < 0.34) {
    baseR = 22 + shift * 8;
    baseG = 22 + shift * 6;
    baseB = 24 + shift * 5;
  } else if (ct < 0.68) {
    baseR = 88 + shift * 14;
    baseG = 84 + shift * 12;
    baseB = 80 + shift * 10;
  } else {
    baseR = 104 + shift * 16;
    baseG = 72 + shift * 10;
    baseB = 44 + shift * 8;
  }

  baseR += lift * (ct < 0.34 ? 20 : ct < 0.68 ? 38 : 46);
  baseG += lift * (ct < 0.34 ? 18 : ct < 0.68 ? 34 : 28);
  baseB += lift * (ct < 0.34 ? 16 : ct < 0.68 ? 30 : 16);

  const creviceDark = (1 - s.pebble) * 32 + s.crevice * 18;
  const facetLift = s.pebble * s.pebble * 18 + s.rim * 11;
  const wornLift = edgeWear * 5;
  const r = Math.round(
    Math.max(0, Math.min(255, baseR + facetLift - creviceDark + s.powder * 5 + wornLift))
  );
  const g = Math.round(
    Math.max(0, Math.min(255, baseG + facetLift * 0.96 - creviceDark * 0.97 + s.powder * 4.8 + wornLift * 0.96))
  );
  const b = Math.round(
    Math.max(0, Math.min(255, baseB + facetLift * 0.9 - creviceDark * 0.94 + s.powder * 4.4 + wornLift * 0.92))
  );
  const roughVar = (1 - s.pebble) * 10 + s.grit * 6 + s.crevice * 4;
  return {
    r,
    g,
    b,
    roughV: Math.round(Math.max(218, Math.min(242, 230 + roughVar - edgeWear * 4))),
    normalStrength: 31.5,
  };
}

/** Iron meteorite — impact craters, fusion crust, breccia gravel, rust & metal hints. */
function sampleMeteoriteNoise(u, v) {
  const mega = stoneVoronoiF2F1(u * 3.8 + 0.4, v * 3.4 + 0.6, 5);
  const med = stoneVoronoiF2F1(u * 9.5 + 1.1, v * 8.8 + 0.7, 10);
  const megaCrater = mega.f1 < 0.22 ? Math.pow((0.22 - mega.f1) / 0.22, 0.92) : 0;
  const medCrater = med.f1 < 0.12 ? Math.pow((0.12 - med.f1) / 0.12, 1.02) : 0;
  const megaRim = mega.gap < 0.055 ? Math.pow((0.055 - mega.gap) / 0.055, 0.75) * Math.max(megaCrater, 0.18) : 0;
  const medRim = med.gap < 0.042 ? Math.pow((0.042 - med.gap) / 0.042, 0.82) * Math.max(medCrater, 0.12) : 0;

  const coarse = gravelNearestPebble(u, v, 28, 1.9);
  const fine = gravelNearestPebble(u, v, 52, 5.4);
  const micro = gravelNearestPebble(u, v, 78, 11.7);
  const breccia = Math.max(
    coarse.dome * coarse.pebbleLift * 0.92,
    fine.dome * fine.pebbleLift * 0.78,
    micro.dome * 0.52
  );

  const flow = stoneFbm2(u * 1.1 + 3.2, v * 0.95 + 2.8, 3);
  const crustSheen = stoneFbm2(u * 4.5 + 6.1, v * 4.1 + 5.2, 2);
  const grit = stoneFbm2(u * 38.0 + 9.4, v * 35.0 + 8.1, 3);
  const crevice = mega.gap * 8 + med.gap * 6 + coarse.gap * 4 + (1 - breccia) * 0.42;

  let height = 0.5;
  height -= megaCrater * 0.292 + medCrater * 0.172;
  height += megaRim * 0.102 + medRim * 0.076;
  height += coarse.dome * coarse.pebbleLift * 0.3;
  height += fine.dome * fine.pebbleLift * 0.205;
  height += micro.dome * 0.098;
  height += crustSheen * 0.022 + flow * 0.015 + grit * 0.009;

  const rustSeed = stoneHash(coarse.cx * 13.1 + 2.4, coarse.cy * 17.9 + 1.8);
  const metalSeed = stoneHash(med.f1 * 41.0 + 2.2, mega.f1 * 37.0 + 5.1);
  const crustMask = Math.max(megaRim, medRim) * 0.72 + crustSheen * 0.34 + breccia * 0.38;

  return {
    megaCrater,
    medCrater,
    megaRim,
    medRim,
    breccia,
    crevice,
    crustMask,
    crustSheen,
    flow,
    grit,
    rustSeed,
    metalSeed,
    coarse,
    fine,
    height,
  };
}

function paintMeteoriteTexels(s, edgeWear = 0) {
  let r = 182;
  let g = 175;
  let b = 165;

  const craterDeep = s.megaCrater * 38 + s.medCrater * 28 + s.crevice * 7;
  r -= craterDeep;
  g -= craterDeep * 0.94;
  b -= craterDeep * 0.82;

  const ct = s.coarse?.colorType ?? 0.5;
  const shift = s.coarse?.colorShift ?? 0;
  const brecciaLift = s.breccia * (0.68 + (s.coarse?.pebbleLift ?? 1) * 0.42);
  if (ct < 0.34) {
    r += brecciaLift * (6 + shift * 3);
    g += brecciaLift * (5 + shift * 2);
    b += brecciaLift * (4 + shift * 2);
  } else if (ct < 0.68) {
    r += brecciaLift * (14 + shift * 5);
    g += brecciaLift * (12 + shift * 4);
    b += brecciaLift * (9 + shift * 3);
  } else {
    r += brecciaLift * (16 + shift * 5);
    g += brecciaLift * (13 + shift * 4);
    b += brecciaLift * (9 + shift * 3);
  }

  if (s.rustSeed > 0.82) {
    const rustT = Math.pow((s.rustSeed - 0.82) / 0.18, 0.9) * 0.22;
    const rustR = 178 + rustT * 22;
    const rustG = 132 + rustT * 16;
    const rustB = 88 + rustT * 10;
    r = r * (1 - rustT) + rustR * rustT;
    g = g * (1 - rustT) + rustG * rustT;
    b = b * (1 - rustT) + rustB * rustT;
  }

  const crust = s.crustMask * (0.58 + s.crustSheen * 0.28);
  r += crust * 48;
  g += crust * 44;
  b += crust * 38;

  if (s.metalSeed > 0.52) {
    const metalT = Math.pow((s.metalSeed - 0.52) / 0.48, 0.9) * s.breccia;
    r = r * (1 - metalT * 0.1) + (196 + metalT * 18) * metalT * 0.2;
    g = g * (1 - metalT * 0.08) + (186 + metalT * 16) * metalT * 0.2;
    b = b * (1 - metalT * 0.06) + (168 + metalT * 14) * metalT * 0.18;
  }

  const facetLift = s.megaRim * 26 + s.medRim * 19 + s.breccia * s.breccia * 30;
  const wornLift = edgeWear * 6;
  r = Math.round(Math.max(144, Math.min(255, r + facetLift + wornLift + s.grit * 4)));
  g = Math.round(Math.max(142, Math.min(255, g + facetLift * 0.94 + wornLift * 0.93 + s.grit * 3.6)));
  b = Math.round(Math.max(132, Math.min(255, b + facetLift * 0.86 + wornLift * 0.88 + s.grit * 3.2)));

  let roughV = 153;
  roughV -= s.metalSeed > 0.55 ? (s.metalSeed - 0.55) * 48 * s.breccia : 0;
  roughV += s.megaCrater * 28 + s.medCrater * 18 + (1 - s.breccia) * 8;
  roughV += s.rustSeed > 0.85 ? 4 : 0;

  return {
    r,
    g,
    b,
    roughV: Math.round(Math.max(128, Math.min(212, roughV - edgeWear * 5))),
    normalStrength: 54.5,
  };
}

/** Premium carved marble — cloudy body, domain-warped veins, no pores/craters/gravel. */
function sampleMarbleNoise(u, v) {
  const warp1 = stoneDomainWarp(u, v, 2.8);
  const px = warp1.x * 3.2 + 1.4;
  const py = warp1.y * 3.2 + 0.8;

  const cloud1 = stoneFbm2(px * 1.5, py * 1.5, 4) * 0.5 + 0.5;
  const cloud2 = stoneFbm2(px * 4.0, py * 4.0, 3) * 0.5 + 0.5;
  const warp = stoneFbm2(px * 2.0, py * 2.0, 3) * 2.0;

  const qx = px + warp;
  const qy = py + warp * 0.5;
  const qWarp = stoneFbm2(qx * 1.8 + 3.1, qy * 1.6 + 2.4, 2) * 0.65;
  const qx2 = qx + qWarp;
  const qy2 = qy + qWarp * 0.42;

  let veins = Math.sin(qx2 * 7.2 + stoneFbm2(qx2 * 4.8, qy2 * 4.8, 3) * 3.8);
  veins = Math.abs(veins);
  veins = Math.pow(Math.max(0, 1 - veins), 4.2);

  let medVeins = Math.abs(Math.sin(qx2 * 13.5 + stoneFbm2(qx2 * 7.5, qy2 * 7.5, 3) * 2.8));
  medVeins = Math.pow(Math.max(0, 1 - medVeins), 4.8);

  let microVeins = Math.abs(Math.sin(qx2 * 22.0 + stoneFbm2(qx2 * 18.0, qy2 * 18.0, 2)));
  microVeins = Math.pow(Math.max(0, 1 - microVeins), 8.5);

  const crystal = stoneFbm2(qx2 * 38.0 + 11.2, qy2 * 36.0 + 9.8, 2) * 0.5 + 0.5;
  const crystalline = Math.pow(crystal, 2.4) * 0.22;

  const marble =
    (cloud1 - 0.5) * 0.5 +
    (cloud2 - 0.5) * 0.28 +
    veins * 0.42 +
    medVeins * 0.24 +
    microVeins * 0.06 +
    crystalline * 0.1;

  const height =
    0.5 +
    (cloud1 - 0.5) * 0.01 +
    (cloud2 - 0.5) * 0.006 +
    veins * 0.014 +
    medVeins * 0.009 +
    microVeins * 0.003 +
    crystalline * 0.004;

  return { cloud1, cloud2, veins, medVeins, microVeins, crystalline, marble, height };
}

function paintMarbleTexels(s, edgeWear = 0) {
  let r = 150;
  let g = 140;
  let b = 128;

  const c1 = (s.cloud1 ?? 0.5) - 0.5;
  const c2 = (s.cloud2 ?? 0.5) - 0.5;
  r += c1 * 7 + c2 * 4.5 - Math.abs(c1 + c2) * 3.2;
  g += c1 * 6.2 + c2 * 3.8 - Math.abs(c1 + c2) * 2.8;
  b += c1 * 5.2 + c2 * 3.2 - Math.abs(c1 + c2) * 2.2;

  const veinBody = Math.max(s.veins ?? 0, (s.medVeins ?? 0) * 0.72);
  const veinMix = Math.min(1, veinBody * 0.78);
  const veinR = 92;
  const veinG = 84;
  const veinB = 74;
  r = r * (1 - veinMix) + veinR * veinMix;
  g = g * (1 - veinMix) + veinG * veinMix;
  b = b * (1 - veinMix) + veinB * veinMix;

  const microMix = Math.min(1, (s.microVeins ?? 0) * 0.34);
  r = r * (1 - microMix) + 80 * microMix;
  g = g * (1 - microMix) + 72 * microMix;
  b = b * (1 - microMix) + 62 * microMix;

  const translucency = Math.max(0, (s.marble ?? 0) * 0.14 - veinMix * 0.1);
  r += translucency * 2.8;
  g += translucency * 2.4;
  b += translucency * 1.9;

  const crystal = (s.crystalline ?? 0) * 0.28;
  r += crystal * 4.2;
  g += crystal * 3.8;
  b += crystal * 3.2;

  const polish = edgeWear * 1.6;
  r = Math.round(Math.min(184, r + polish));
  g = Math.round(Math.min(178, g + polish * 0.96));
  b = Math.round(Math.min(168, b + polish * 0.9));

  r = Math.round(Math.max(104, Math.min(184, r)));
  g = Math.round(Math.max(98, Math.min(178, g)));
  b = Math.round(Math.max(88, Math.min(168, b)));

  const cloudVar = Math.abs(c1) + Math.abs(c2) * 0.7;
  const roughV = Math.round(Math.max(58, Math.min(98, 72 + cloudVar * 18 - veinMix * 12 + polish * 2)));

  return {
    r,
    g,
    b,
    roughV,
    normalStrength: 9.5,
  };
}

/** Handmade terracotta — dense micro-pores, clay grain, no rock features. */
function sampleHandmadeTerracottaNoise(u, v) {
  const p18 = stoneWorleyF1(u * 18.2 + 0.21, v * 17.6 + 0.17, 30);
  const p24 = stoneWorleyF1(u * 24.8 + 3.4, v * 23.5 + 2.9, 34);
  const p32 = stoneWorleyF1(u * 31.6 + 7.1, v * 30.2 + 6.4, 38);
  const microPores =
    (1 - smoothstep(0, 0.11, p18)) * 0.52 +
    (1 - smoothstep(0, 0.095, p24)) * 0.38 +
    (1 - smoothstep(0, 0.085, p32)) * 0.28;

  const clayGrain = stoneFbm2(u * 8.6 + 4.4, v * 8.1 + 3.8, 2) * 0.5 + 0.5;
  const clayNoise = stoneFbm2(u * 19.4 + 10.2, v * 18.1 + 9.4, 2) * 0.5 + 0.5;
  const powderGrain = samplePowderGrain(u, v) * 0.5 + 0.5;

  const fireSpeck = stoneHash(u * 760 + 14.2, v * 710 + 11.8);
  const firingImperfection = fireSpeck > 0.965 ? (fireSpeck - 0.965) * 22 : 0;

  const height =
    0.5 -
    microPores * 0.011 +
    clayGrain * 0.0012 +
    clayNoise * 0.0009 +
    powderGrain * 0.0007 -
    firingImperfection * 0.0014;

  return { microPores, clayGrain, clayNoise, powderGrain, firingImperfection, height };
}

function paintHandmadeTerracottaTexels(s, edgeWear = 0) {
  const clayR = 198;
  const clayG = 93;
  const clayB = 58;
  const burntR = 212;
  const burntG = 118;
  const burntB = 68;
  const dustyR = 220;
  const dustyG = 168;
  const dustyB = 138;

  const burntMix = s.clayGrain * 0.35 + s.clayNoise * 0.25;
  let r = clayR * (1 - burntMix) + burntR * burntMix;
  let g = clayG * (1 - burntMix) + burntG * burntMix;
  let b = clayB * (1 - burntMix) + burntB * burntMix;

  const poreDark = s.microPores * 14 + s.firingImperfection * 8;
  const grainLift = s.powderGrain * 5 + s.clayNoise * 3;
  const dustVeil = s.clayGrain * 0.22;
  const edgeChalk = edgeWear * 6;

  r = Math.round(
    Math.max(
      0,
      Math.min(
        255,
        r * (1 - dustVeil) +
          dustyR * dustVeil * 0.12 -
          poreDark * 0.55 +
          grainLift * 0.28 +
          edgeChalk * 0.18
      )
    )
  );
  g = Math.round(
    Math.max(
      0,
      Math.min(
        255,
        g * (1 - dustVeil) +
          dustyG * dustVeil * 0.1 -
          poreDark * 0.5 +
          grainLift * 0.24 +
          edgeChalk * 0.15
      )
    )
  );
  b = Math.round(
    Math.max(
      0,
      Math.min(
        255,
        b * (1 - dustVeil) +
          dustyB * dustVeil * 0.08 -
          poreDark * 0.42 +
          grainLift * 0.18 +
          edgeChalk * 0.12
      )
    )
  );

  const roughBase = 191;
  const roughVar = s.microPores * 6 + s.powderGrain * 4 + edgeWear * 3;
  return {
    r,
    g,
    b,
    roughV: Math.round(Math.max(178, Math.min(212, roughBase + roughVar))),
    normalStrength: 7.6,
  };
}

/** Volcanic stone — fine burnished basalt porosity and mineral grain. */
function sampleVolcanicStoneNoise(u, v) {
  const fine = samplePowderGrain(u, v);
  const mineral = stoneFbm2(u * 13.8 + 19.4, v * 12.6 + 17.1, 2);
  const pore = stoneFbm2(u * 26.2 + 34.8, v * 24.1 + 31.5, 3);
  const burnish = stoneFbm2(u * 3.1 + 8.2, v * 2.7 + 10.4, 2);
  const combined = fine * 0.26 + mineral * 0.34 + pore * 0.22 + burnish * 0.18;
  const height =
    0.5 + fine * 0.026 + Math.max(0, -pore) * 0.015 + mineral * 0.009 + burnish * 0.006;
  return { combined, fine, mineral, pore, burnish, height };
}

/** Dry chalky pigmented clay — powder, weathering, no gloss. */
function sampleDryTerracottaNoise(u, v) {
  const powder = samplePowderGrain(u, v);
  const chalk = stoneFbm2(u * 28.4 + 9.1, v * 25.8 + 11.6, 2);
  const pigment = stoneFbm2(u * 4.8 + 18.2, v * 4.2 + 14.9, 3);
  const pore = stoneFbm2(u * 22.6 + 31.4, v * 20.8 + 27.2, 3);
  const weather = stoneFbm2(u * 1.2 + 7.4, v * 1.05 + 9.8, 2);
  const combined = powder * 0.3 + chalk * 0.22 + pigment * 0.24 + pore * 0.14 + weather * 0.1;
  const height =
    0.5 + powder * 0.032 + Math.max(0, -pore) * 0.02 + chalk * 0.014 + pigment * 0.01;
  return { combined, powder, chalk, pigment, pore, weather, height };
}

/** Aged fired terracotta — large localized wear patches, no uniform micro grain. */
function sampleAgedFiredTerracottaNoise(u, v) {
  const region = stoneFbm2(u * 0.82 + 2.3, v * 0.76 + 1.7, 3);
  const regionNorm = region * 0.5 + 0.5;
  const erosionMask = regionNorm > 0.4 ? Math.pow((regionNorm - 0.4) / 0.6, 0.72) : 0;

  const erosionField = stoneFbm2(u * 1.35 + 8.1, v * 1.18 + 6.4, 2);
  const wornRecess =
    erosionMask * Math.pow(Math.max(0, 0.58 - erosionField * 0.5 - 0.22), 1.15) * 0.9;

  const flowAngle = stoneFbm2(u * 0.2 + 14.2, v * 0.18 + 11.8, 2) * Math.PI;
  const su = u * Math.cos(flowAngle) - v * Math.sin(flowAngle);
  const streakField = stoneFbm2(su * 2.6 + 5.1, v * 1.45 + 3.2, 2);
  const compressMask = erosionMask * (regionNorm > 0.32 ? 1 : 0);
  const compression = compressMask * Math.pow(Math.max(0, streakField * 0.5 + 0.5), 2.1) * 0.52;
  const compressedGroove =
    compressMask * Math.pow(Math.max(0, 0.5 - streakField * 0.5), 2.4) * 0.38;

  const crackV = stoneVoronoiF2F1(u * 1.75 + 3.4, v * 1.55 + 2.9, 4);
  const crackSeed = stoneHash(Math.floor(u * 4.2), Math.floor(v * 4.2));
  const crack =
    crackSeed > 0.74 && crackV.gap < 0.085
      ? Math.pow((0.085 - crackV.gap) / 0.085, 1.05) * erosionMask * 0.95
      : 0;

  const chipZone = stoneVoronoiF2F1(u * 2.1 + 21, v * 1.9 + 18, 5);
  const chipped =
    chipZone.f1 < 0.13 && stoneHash(chipZone.f2 * 97, chipZone.f1 * 83) > 0.84
      ? Math.pow((0.13 - chipZone.f1) / 0.13, 0.88) * 0.68
      : 0;

  const mineralBlob = stoneFbm2(u * 0.46 + 16.4, v * 0.42 + 13.8, 3);
  const mineralDeposit = mineralBlob > 0.36 ? Math.pow((mineralBlob - 0.36) / 0.64, 0.62) : 0;

  const fireIdx = Math.floor(u * 5.5) + Math.floor(v * 5.5) * 17;
  const fireHash = stoneHash(fireIdx * 0.41, fireIdx * 0.29);
  const fireCell = stoneVoronoiF2F1(u * 2.9 + 7.2, v * 2.6 + 5.6, 5);
  const fireBlemish =
    fireHash > 0.8 && fireCell.gap > 0.22 ? (fireHash - 0.8) * 3.1 * (1 - crack * 0.45) : 0;

  const combined =
    wornRecess * 0.34 +
    crack * 0.22 +
    chipped * 0.16 +
    compression * 0.12 +
    mineralDeposit * 0.1 +
    fireBlemish * 0.06;
  const height =
    0.5 -
    wornRecess * 0.026 -
    crack * 0.03 -
    chipped * 0.024 -
    compressedGroove * 0.011 +
    compression * 0.007 -
    fireBlemish * 0.008 +
    mineralDeposit * 0.003;

  return {
    wornRecess,
    compression,
    compressedGroove,
    crack,
    chipped,
    mineralDeposit,
    fireBlemish,
    erosionMask,
    regionNorm,
    combined,
    height,
  };
}

function paintAgedFiredTerracottaTexels(s, edgeWear) {
  const burntR = 198;
  const burntG = 104;
  const burntB = 70;
  const dustyR = 210;
  const dustyG = 126;
  const dustyB = 86;
  const mineralR = 230;
  const mineralG = 202;
  const mineralB = 172;

  const dustyMix = s.regionNorm * 0.28 + s.wornRecess * 0.42;
  const mineralMix = s.mineralDeposit;
  const bodyR = burntR * (1 - dustyMix) + dustyR * dustyMix;
  const bodyG = burntG * (1 - dustyMix) + dustyG * dustyMix;
  const bodyB = burntB * (1 - dustyMix) + dustyB * dustyMix;

  let r = bodyR * (1 - mineralMix * 0.82) + mineralR * mineralMix * 0.82;
  let g = bodyG * (1 - mineralMix * 0.82) + mineralG * mineralMix * 0.82;
  let b = bodyB * (1 - mineralMix * 0.82) + mineralB * mineralMix * 0.82;

  const featureShadow =
    s.wornRecess * 16 + s.crack * 20 + s.chipped * 14 + s.compressedGroove * 9 + s.fireBlemish * 7;
  const chalkLift = edgeWear * 22 + mineralMix * 9 + s.fireBlemish * 5;
  const erosionFade = s.wornRecess * 11;

  r = Math.round(
    Math.max(0, Math.min(255, r + chalkLift * 0.4 - featureShadow * 0.5 + erosionFade * 0.12))
  );
  g = Math.round(
    Math.max(0, Math.min(255, g + chalkLift * 0.34 - featureShadow * 0.44 + erosionFade * 0.1))
  );
  b = Math.round(
    Math.max(0, Math.min(255, b + chalkLift * 0.24 - featureShadow * 0.38 + erosionFade * 0.07))
  );

  const bumpDev =
    -(s.wornRecess + s.crack + s.chipped + s.compressedGroove) * 24 + s.compression * 8;
  const roughBase = 232 + edgeWear * 4 + mineralMix * 3 - s.compression * 2;

  return {
    r,
    g,
    b,
    bumpV: Math.round(Math.max(118, Math.min(138, 128 + bumpDev))),
    roughV: Math.round(Math.max(224, Math.min(245, roughBase))),
    normalStrength: 3.2,
  };
}

/** Domain warp — flowing organic coordinates for marble / jade structure. */
function stoneDomainWarp(u, v, seed = 0) {
  const sx = u * 2.05 + seed * 1.31;
  const sy = v * 1.88 + seed * 1.97;
  const qx = stoneFbm2(sx, sy, 3);
  const qy = stoneFbm2(sx + 4.17, sy + 2.63, 3);
  const wx = u + qx * 0.38;
  const wy = v + qy * 0.38;
  const qx2 = stoneFbm2(wx * 1.55 + 1.08, wy * 1.42 + 0.74, 2);
  const qy2 = stoneFbm2(wx * 1.55 + 3.21, wy * 1.42 + 5.06, 2);
  return { x: wx + qx2 * 0.2, y: wy + qy2 * 0.2 };
}

/**
 * Soft weathered stoneware — cloudy mottling, dusty patches, sparse fine speckle.
 * No marble veins or glossy clearcoat look.
 */
function sampleSoftStonewareNoise(u, v, seed = 19.4) {
  const cu = u * 1.22 + v * 0.41 + seed * 0.11;
  const cv = v * 1.18 - u * 0.33 + seed * 0.19;
  const cloud = stoneFbm2(cu * 0.72 + 3.1, cv * 0.68 + 2.4, 4);
  const cloud2 = stoneFbm2(cu * 0.38 + 8.2, cv * 0.34 + 6.7, 3);
  const mottle = stoneFbm2(cu * 1.05 + cloud * 0.18, cv * 0.98 + cloud2 * 0.14, 3);
  const dust = stoneFbm2(cu * 0.52 + 14.1, cv * 0.48 + 11.3, 2);
  const olive = stoneFbm2(cu * 0.62 + 5.4, cv * 0.58 + 4.1, 2);
  const warm = stoneFbm2(cu * 0.88 + 12.3, cv * 0.82 + 9.7, 2);
  const cool = stoneFbm2(cu * 0.74 + 16.8, cv * 0.7 + 13.2, 2);
  const slate = stoneFbm2(cu * 0.55 + 18.2, cv * 0.51 + 15.4, 3);
  const blueGrey = stoneFbm2(cu * 0.68 + 21.5, cv * 0.64 + 19.8, 2);
  const ash = stoneFbm2(cu * 0.92 + 24.7, cv * 0.86 + 22.1, 2);
  const speckPx = u * 680 + v * 390 + seed * 17;
  const speckPy = v * 680 - u * 360 + seed * 23;
  const speck = stoneHash(speckPx, speckPy);
  const fineSpeck = speck > 0.8 ? (speck - 0.8) * 4.2 : 0;
  const combined = cloud * 0.3 + cloud2 * 0.26 + mottle * 0.18 + dust * 0.1 + olive * 0.06 + slate * 0.1;
  const height = 0.5 + cloud * 0.007 + mottle * 0.005 + fineSpeck * 0.003;
  return { cloud, cloud2, mottle, dust, olive, warm, cool, slate, blueGrey, ash, fineSpeck, combined, height };
}

function sampleSoftStonewareSignsNoise(u, v) {
  const dip = stoneFbm2(u * 0.42 + 2.1, v * 0.38 + 1.4, 2) * 0.18;
  const layerU = u + dip;
  const bandFreq = 18.5 + stoneFbm2(u * 1.8, v * 1.6, 2) * 4;
  const phase = (layerU * bandFreq + v * 2.3) * Math.PI * 2;
  const band = Math.pow(Math.abs(Math.sin(phase)), 0.55);
  const layerVar = stoneFbm2(u * 2.4 + 8.2, v * 2.1 + 6.8, 3);
  const silt = stoneFbm2(u * 9.2 + 14.1, v * 8.4 + 11.3, 2);
  const mudCrack = stoneVoronoiF2F1(u * 2.8, v * 2.6, 9);
  const crackLine = mudCrack.gap < 0.07 ? (0.07 - mudCrack.gap) * 8 : 0;
  const combined = band * 0.38 + layerVar * 0.32 + silt * 0.18 - crackLine * 0.22;
  const height = 0.5 + band * 0.012 + layerVar * 0.009 - crackLine * 0.018 + silt * 0.006;
  return { band, layerVar, silt, crackLine, dip, combined, height };
}

function sampleArchaeologicalTileDoubtNoise(u, v) {
  const body = stoneFbm2(u * 1.35 + 4.2, v * 1.22 + 3.6, 4);
  const ochre = stoneFbm2(u * 2.2 + 12.4, v * 2.0 + 10.1, 3);
  const redClay = stoneFbm2(u * 1.8 + 22.1, v * 1.6 + 19.3, 3);
  const sandOchre = stoneFbm2(u * 2.4 + 31.2, v * 2.1 + 28.4, 3);
  const mineralZone = stoneFbm2(u * 0.72 + 8.4, v * 0.68 + 6.7, 2);
  const coarsePore = stoneFbm2(u * 5.8 + 36, v * 5.2 + 33, 3);
  const pitCluster = stoneFbm2(u * 3.4 + 19.4, v * 3.1 + 17.2, 2);
  const weather = stoneFbm2(u * 0.55 + 6.2, v * 0.5 + 5.4, 2);
  const cellPx = Math.floor(u * 38) + Math.floor(v * 34) * 97;
  const cellPy = Math.floor(v * 38) - Math.floor(u * 34);
  const cell = stoneHash(cellPx * 0.31 + 17, cellPy * 0.27 + 23);
  const cellLocal = stoneHash(
    u * 38 - Math.floor(u * 38) + 0.11,
    v * 34 - Math.floor(v * 34) + 0.09
  );
  const crater =
    cell > 0.76 && cellLocal < 0.38
      ? Math.pow((cell - 0.76) * 4.2, 0.62) * (0.45 + cellLocal * 0.9)
      : 0;
  const speckPx = u * 280 + v * 160 + 67.3;
  const speckPy = v * 280 - u * 150 + 61.8;
  const speck = stoneHash(speckPx, speckPy);
  const darkPit = speck > 0.82 && speck < 0.94 ? Math.pow((speck - 0.82) * 5.5, 0.75) : 0;
  const lightDust = speck > 0.52 && speck < 0.68 ? Math.pow((0.68 - speck) * 4.8, 0.9) : 0;
  const irregularPit =
    pitCluster < -0.28
      ? Math.pow((-pitCluster - 0.28) * 1.8, 0.85)
      : Math.max(0, -coarsePore) * 0.72 + crater * 1.1;
  const combined =
    body * 0.28 +
    ochre * 0.18 +
    mineralZone * 0.2 +
    redClay * 0.14 +
    sandOchre * 0.14 +
    weather * 0.06;
  const height =
    0.5 +
    body * 0.014 +
    Math.max(0, -coarsePore) * 0.055 +
    irregularPit * 0.068 +
    crater * 0.052 +
    darkPit * 0.042 -
    lightDust * 0.022 -
    Math.max(0, weather) * 0.008;
  return {
    body,
    ochre,
    redClay,
    sandOchre,
    sandBeige: sandOchre,
    mineralZone,
    mineralPatch: mineralZone,
    coarsePore,
    pitCluster,
    grit: 0,
    sand: 0,
    darkPit,
    lightDust,
    irregularPit,
    crater,
    weather,
    combined,
    height,
  };
}

function paintArchaeologicalTileDoubtTexels(s, edgeWear) {
  const baseR = 184;
  const baseG = 146;
  const baseB = 106;
  const peak = Math.min(1, Math.pow(edgeWear, 0.78) * 1.65);
  const recess = Math.min(
    1,
    Math.pow(1 - edgeWear, 0.72) * 1.35 + Math.max(0, -s.combined) * 0.78
  );
  const recessMix = Math.min(
    1,
    recess * 0.95 + s.irregularPit * 0.72 + s.darkPit * 0.55 + (s.crater ?? 0) * 0.48
  );
  const dustMix = Math.min(
    1,
    peak * 0.95 + s.lightDust * 0.78 + Math.max(0, s.sandOchre ?? s.sandBeige) * 0.28
  );
  const zone = s.mineralZone ?? s.mineralPatch;
  const redOrangeMix = Math.min(
    1,
    Math.max(0, s.redClay) * 0.85 * (0.35 + Math.max(0, zone) * 0.65)
  );
  const sandOchreMix = Math.min(
    1,
    Math.max(0, s.sandOchre ?? s.sandBeige) * 0.82 * (0.4 + Math.max(0, -zone) * 0.6)
  );
  const clayBody = s.body * 14 + s.ochre * 11;
  const poreShadow =
    Math.max(0, -s.coarsePore) * 22 + s.irregularPit * 20 + (s.crater ?? 0) * 18;
  let r = baseR + clayBody * 0.28 + sandOchreMix * 22 + redOrangeMix * 28 - poreShadow * 0.48;
  let g = baseG + clayBody * 0.32 + sandOchreMix * 20 + redOrangeMix * 8 - poreShadow * 0.54;
  let b = baseB + clayBody * 0.22 + sandOchreMix * 8 + redOrangeMix * -2 - poreShadow * 0.58;
  r = r * (1 - recessMix * 0.78) + 122 * recessMix * 0.78;
  g = g * (1 - recessMix * 0.78) + 62 * recessMix * 0.78;
  b = b * (1 - recessMix * 0.78) + 34 * recessMix * 0.78;
  r = r * (1 - dustMix * 0.48) + 232 * dustMix * 0.48;
  g = g * (1 - dustMix * 0.48) + 216 * dustMix * 0.48;
  b = b * (1 - dustMix * 0.48) + 168 * dustMix * 0.48;
  r = r * (1 - redOrangeMix * 0.42) + 196 * redOrangeMix * 0.42;
  g = g * (1 - redOrangeMix * 0.42) + 120 * redOrangeMix * 0.42;
  b = b * (1 - redOrangeMix * 0.42) + 58 * redOrangeMix * 0.42;
  r = r * (1 - sandOchreMix * 0.36) + 212 * sandOchreMix * 0.36;
  g = g * (1 - sandOchreMix * 0.36) + 188 * sandOchreMix * 0.36;
  b = b * (1 - sandOchreMix * 0.36) + 120 * sandOchreMix * 0.36;
  r = Math.round(Math.max(0, Math.min(255, r)));
  g = Math.round(Math.max(0, Math.min(255, g)));
  b = Math.round(Math.max(0, Math.min(255, b)));
  return {
    r,
    g,
    b,
    bumpV: Math.round(
      Math.max(
        0,
        Math.min(
          255,
          (0.34 +
            s.body * 0.018 +
            s.irregularPit * 0.062 +
            (s.crater ?? 0) * 0.055 +
            s.darkPit * 0.04 -
            s.lightDust * 0.02) *
            255
        )
      )
    ),
    roughV: 255,
    normalStrength: 12.5,
  };
}

function sampleSeafoamJadeGutNoise(u, v) {
  const w = stoneDomainWarp(u * 1.28 + 0.18, v * 1.22 + 0.12, 31.7);
  const cloud = stoneFbm2(w.x * 0.88 + 2.4, w.y * 0.8 + 1.9, 4);
  const cloud2 = stoneFbm2(w.x * 0.46 + 6.8, w.y * 0.42 + 5.4, 3);
  const matrix = stoneFbm2(w.x * 1.08 + cloud * 0.22, w.y * 0.98 + cloud2 * 0.16, 3);
  const mint = stoneFbm2(w.x * 0.64 + 9.4, w.y * 0.6 + 7.8, 2);
  const teal = stoneFbm2(w.x * 0.74 + 13.6, w.y * 0.68 + 11.8, 2);
  const charcoal = stoneFbm2(w.x * 0.4 + 17.4, w.y * 0.36 + 15.1, 2);
  const speckPx = u * 820 + v * 470 + 31.7;
  const speckPy = v * 820 - u * 430 + 27.1;
  const speck = stoneHash(speckPx, speckPy);
  const darkSpeck = speck > 0.83 && speck < 0.93 ? (speck - 0.83) * 7.5 : 0;
  const lightSpeck = speck > 0.72 && speck < 0.81 ? (0.81 - speck) * 5.5 : 0;
  const combined = cloud * 0.28 + cloud2 * 0.24 + matrix * 0.22 + mint * 0.12 + teal * 0.14;
  const height = 0.5 + cloud * 0.008 + matrix * 0.006 + darkSpeck * 0.004 + lightSpeck * 0.003;
  return {
    cloud,
    cloud2,
    matrix,
    mint,
    teal,
    charcoal,
    darkSpeck,
    lightSpeck,
    combined,
    height,
  };
}

function paintSeafoamJadeGutTexels(s, edgeWear) {
  const baseR = 216;
  const baseG = 172;
  const baseB = 137;
  const tintR = 226;
  const tintG = 200;
  const tintB = 179;

  const cloudMix = Math.min(1, s.cloud * 0.52 + s.cloud2 * 0.38 + s.lightSpeck * 0.32);
  const warmVar = Math.max(0, s.mint) * 0.14 + Math.max(0, s.matrix) * 0.1 + s.teal * 0.06;
  const darkMix = Math.min(
    1,
    s.darkSpeck * 0.42 + Math.max(0, -s.combined) * 0.22 + Math.max(0, -s.matrix) * 0.14
  );
  const peak = Math.min(1, edgeWear * 1.1);
  const tintMix = Math.min(1, cloudMix * 0.7 + peak * 0.38 + warmVar);

  let r = baseR + (tintR - baseR) * tintMix;
  let g = baseG + (tintG - baseG) * tintMix;
  let b = baseB + (tintB - baseB) * tintMix;
  r -= darkMix * 26;
  g -= darkMix * 22;
  b -= darkMix * 18;

  r = Math.round(Math.max(178, Math.min(232, r)));
  g = Math.round(Math.max(148, Math.min(208, g)));
  b = Math.round(Math.max(118, Math.min(188, b)));
  return {
    r,
    g,
    b,
    bumpV: Math.round(
      Math.max(0, Math.min(255, (0.47 + s.darkSpeck * 0.012 + s.lightSpeck * 0.008 + s.matrix * 0.005) * 255))
    ),
    roughV: Math.round(Math.max(168, Math.min(228, 192 + s.cloud * 4 + s.darkSpeck * 3 - peak * 28 + darkMix * 6))),
    normalStrength: 4.2,
  };
}

/**
 * Warm moonstone jade — milky waxy interior, soft mineral depth (#B6AFA5).
 * Carved jadeite translucency feel without green tint.
 */
function sampleWarmMoonstoneJadeNoise(u, v) {
  const w = stoneDomainWarp(u * 1.18 + 0.14, v * 1.14 + 0.11, 44.2);
  const cloud = stoneFbm2(w.x * 0.92 + 2.6, w.y * 0.84 + 2.1, 4);
  const cloud2 = stoneFbm2(w.x * 0.48 + 7.2, w.y * 0.44 + 5.8, 3);
  const milky = stoneFbm2(w.x * 0.72 + cloud * 0.24, w.y * 0.68 + cloud2 * 0.18, 3);
  const waxy = stoneFbm2(w.x * 1.12 + 11.4, w.y * 1.02 + 9.6, 2);
  const depth = stoneFbm2(w.x * 0.58 + 15.8, w.y * 0.52 + 13.2, 2);
  const speckPx = u * 760 + v * 440 + 44.2;
  const speckPy = v * 760 - u * 400 + 38.6;
  const speck = stoneHash(speckPx, speckPy);
  const lightSpeck = speck > 0.76 && speck < 0.86 ? (0.86 - speck) * 5 : 0;
  const combined = cloud * 0.32 + cloud2 * 0.28 + milky * 0.24 + waxy * 0.16;
  const height = 0.5 + cloud * 0.007 + milky * 0.005 + lightSpeck * 0.003;
  return { cloud, cloud2, milky, waxy, depth, lightSpeck, combined, height };
}

function paintWarmMoonstoneJadeTexels(s, edgeWear) {
  const baseR = 182;
  const baseG = 175;
  const baseB = 165;
  const peak = Math.min(1, edgeWear * 1.05);
  const recess = Math.min(1, (1 - edgeWear) * 0.82 + Math.max(0, -s.combined) * 0.28);
  const interiorGlow = Math.max(0, s.milky) * 14 + s.cloud * 10 + s.cloud2 * 8 + s.lightSpeck * 9;
  const waxyVar = s.waxy * 7;
  const depthSink = Math.max(0, -s.depth) * 10 + recess * 12;
  const r = Math.round(
    Math.max(
      0,
      Math.min(255, baseR + interiorGlow * 0.38 + waxyVar * 0.32 + peak * 10 - depthSink * 0.42)
    )
  );
  const g = Math.round(
    Math.max(
      0,
      Math.min(255, baseG + interiorGlow * 0.36 + waxyVar * 0.3 + peak * 9 - depthSink * 0.38)
    )
  );
  const b = Math.round(
    Math.max(
      0,
      Math.min(255, baseB + interiorGlow * 0.34 + waxyVar * 0.28 + peak * 8 - depthSink * 0.35)
    )
  );
  return {
    r,
    g,
    b,
    bumpV: Math.round(Math.max(0, Math.min(255, (0.49 + s.lightSpeck * 0.01 + s.milky * 0.006) * 255))),
    roughV: Math.round(Math.max(178, Math.min(228, 198 + s.cloud * 3 - peak * 22 + recess * 5))),
    normalStrength: 3.8,
  };
}

/** Signs / sedimentary stoneware — darker base than default cloud mottle. */
function paintSoftStonewareSignsTexels(s, edgeWear) {
  const baseR = 30;
  const baseG = 38;
  const baseB = 34;
  const bandLift = s.band * 18 + s.layerVar * 12;
  const siltVar = s.silt * 9;
  const crackShadow = s.crackLine * 22;
  const r = Math.round(
    Math.max(0, Math.min(255, baseR + bandLift * 0.38 + siltVar * 0.24 - crackShadow * 0.42 + edgeWear * 3))
  );
  const g = Math.round(
    Math.max(0, Math.min(255, baseG + bandLift * 0.44 + siltVar * 0.28 - crackShadow * 0.44 + edgeWear * 3))
  );
  const b = Math.round(
    Math.max(0, Math.min(255, baseB + bandLift * 0.36 + siltVar * 0.22 - crackShadow * 0.4 + edgeWear * 2.5))
  );
  return {
    r,
    g,
    b,
    bumpV: Math.round(Math.max(0, Math.min(255, (0.48 + s.crackLine * 0.018 + s.band * 0.01) * 255))),
    roughV: Math.round(Math.max(198, Math.min(248, 214 + s.band * 5 + s.crackLine * 4 - edgeWear * 14))),
    normalStrength: 4.0,
  };
}

const SOFT_STONEWARE_PAINT = {
  soft_stoneware_signs: {
    base: [38, 48, 42],
    cloudLift: 18,
    mottleVar: 11,
    dustLift: 13,
    speckLift: 6,
    shadowMul: 12,
    oliveLift: 9,
    warmLift: 7,
    coolLift: 8,
    slateLift: 10,
    blueGreyLift: 12,
    ashLift: 11,
    dustRgb: [0.5, 0.48, 0.44],
    shadowRgb: [0.34, 0.3, 0.26],
    oliveRgb: [0.22, 0.52, 0.28],
    warmRgb: [0.44, 0.36, 0.22],
    coolRgb: [0.16, 0.3, 0.38],
    slateRgb: [0.14, 0.22, 0.28],
    blueGreyRgb: [0.12, 0.28, 0.42],
    ashRgb: [0.46, 0.48, 0.5],
  },
};

function paintSoftStonewareTexels(profile, s, edgeWear) {
  const cloudVar = s.cloud * profile.cloudLift + s.cloud2 * profile.cloudLift * 0.68;
  const mottleVar = s.mottle * profile.mottleVar;
  const dustVar = Math.max(0, s.dust) * profile.dustLift;
  const speckVar = s.fineSpeck * profile.speckLift;
  const shadowVar = Math.max(0, -s.combined) * profile.shadowMul;
  const oliveVar = Math.max(0, s.olive) * profile.oliveLift;
  const warmVar = Math.max(0, s.warm) * profile.warmLift;
  const coolVar = Math.max(0, -s.cool) * profile.coolLift;
  const slateVar = Math.max(0, s.slate) * profile.slateLift + Math.max(0, -s.slate) * profile.slateLift * 0.55;
  const blueGreyVar = Math.max(0, s.blueGrey) * profile.blueGreyLift;
  const ashVar = Math.max(0, s.ash) * profile.ashLift;
  const r = Math.round(
    Math.max(
      0,
      Math.min(
        255,
        profile.base[0] +
          cloudVar * profile.dustRgb[0] +
          mottleVar * 0.38 +
          oliveVar * profile.oliveRgb[0] +
          warmVar * profile.warmRgb[0] +
          slateVar * profile.slateRgb[0] +
          blueGreyVar * profile.blueGreyRgb[0] +
          ashVar * profile.ashRgb[0] -
          coolVar * profile.coolRgb[0] -
          shadowVar * profile.shadowRgb[0] +
          dustVar * profile.dustRgb[0] +
          speckVar +
          edgeWear * 4
      )
    )
  );
  const g = Math.round(
    Math.max(
      0,
      Math.min(
        255,
        profile.base[1] +
          cloudVar * profile.dustRgb[1] +
          mottleVar * 0.44 +
          oliveVar * profile.oliveRgb[1] +
          warmVar * profile.warmRgb[1] +
          slateVar * profile.slateRgb[1] +
          blueGreyVar * profile.blueGreyRgb[1] +
          ashVar * profile.ashRgb[1] -
          coolVar * profile.coolRgb[1] -
          shadowVar * profile.shadowRgb[1] +
          dustVar * profile.dustRgb[1] +
          speckVar * 0.96 +
          edgeWear * 4
      )
    )
  );
  const b = Math.round(
    Math.max(
      0,
      Math.min(
        255,
        profile.base[2] +
          cloudVar * profile.dustRgb[2] +
          mottleVar * 0.36 +
          oliveVar * profile.oliveRgb[2] +
          warmVar * profile.warmRgb[2] +
          slateVar * profile.slateRgb[2] +
          blueGreyVar * profile.blueGreyRgb[2] +
          ashVar * profile.ashRgb[2] -
          coolVar * profile.coolRgb[2] -
          shadowVar * profile.shadowRgb[2] +
          dustVar * profile.dustRgb[2] +
          speckVar * 0.88 +
          edgeWear * 3.5
      )
    )
  );
  return {
    r,
    g,
    b,
    bumpV: Math.round(Math.max(0, Math.min(255, (0.48 + s.fineSpeck * 0.012 + s.mottle * 0.008) * 255))),
    roughV: Math.round(Math.max(198, Math.min(248, 218 + s.cloud * 5 + s.fineSpeck * 2 - edgeWear * 14))),
    normalStrength: 4.0,
  };
}

/**
 * Shared polished marble field — large cloudy structure, soft veins, sparse inclusions.
 * seed offsets pattern per stone variant.
 */
function samplePolishedMarbleNoise(u, v, seed = 12.8) {
  const cu = u * 1.412 + v * 0.318 + seed * 0.17;
  const cv = v * 1.286 - u * 0.241 + seed * 0.23;
  const w = stoneDomainWarp(cu, cv, seed);
  const cloud = stoneFbm2(w.x * 0.82 + 2.31, w.y * 0.74 + 1.87, 4);
  const cloud2 = stoneFbm2(w.x * 0.44 + 7.14, w.y * 0.38 + 4.62, 3);
  const marbleField = stoneFbm2(w.x * 1.55 + cloud * 0.28, w.y * 1.42 + cloud2 * 0.24, 4);
  const veinPhase = w.x * 1.35 + marbleField * 0.72 + cloud * 0.32 + cloud2 * 0.14;
  const veinWave = Math.sin(veinPhase * Math.PI * 1.85);
  const softVein = Math.pow(Math.abs(veinWave), 0.92) * (veinWave >= 0 ? 0.55 : -0.42);
  const inclusionField = stoneFbm2(w.x * 0.36 + 11.24, w.y * 0.32 + 8.73, 3);
  const inclusion = inclusionField < -0.32 ? (-0.32 - inclusionField) * 1.65 : 0;
  const translucent = Math.max(0, cloud * 0.48 + cloud2 * 0.34 + Math.max(0, marbleField) * 0.16);
  const marbling = cloud * 0.42 + cloud2 * 0.34 + softVein * 0.12 + marbleField * 0.12;
  const height = 0.5 + cloud * 0.009 + Math.abs(softVein) * 0.005 + inclusion * 0.004;
  return { cloud, cloud2, marbleField, softVein, inclusion, translucent, marbling, height };
}

function samplePolishedJadeMarbleNoise(u, v) {
  return samplePolishedMarbleNoise(u, v, 12.8);
}

function samplePolishedSlateMarbleNoise(u, v) {
  return samplePolishedMarbleNoise(u, v, 27.3);
}

function samplePolishedWarmMarbleDoubtNoise(u, v) {
  const s = samplePolishedMarbleNoise(u, v, 58.4);
  const w2 = stoneDomainWarp(u * 0.94 + 3.1, v * 0.88 + 2.4, 58.4);
  const veinField = stoneFbm2(w2.x * 2.05 + 4.2, w2.y * 1.88 + 3.6, 3);
  const flowPhase = w2.x * 1.08 + w2.y * 0.92 + veinField * 0.52 + s.marbleField * 0.38;
  const flowVein = Math.sin(flowPhase * Math.PI * 2.35);
  const organicVein = Math.pow(Math.abs(flowVein), 0.82) * (flowVein >= 0 ? 0.78 : -0.62);
  const warmDrift = stoneFbm2(w2.x * 0.62 + 9.8, w2.y * 0.58 + 8.1, 2);
  return {
    ...s,
    softVein: s.softVein * 0.48 + organicVein * 0.52,
    marbling: s.marbling * 0.62 + organicVein * 0.22 + veinField * 0.1 + warmDrift * 0.06,
    translucent: s.translucent + Math.max(0, warmDrift) * 0.08,
    height: s.height + Math.abs(organicVein) * 0.0045,
  };
}

const MARBLE_PAINT_PROFILES = {
  polished_warm_marble_doubt: {
    base: [182, 175, 165],
    milkyScale: 12,
    veinLight: 7,
    veinShadow: 8,
    inclMul: 12,
    marbleMul: 6,
    edgeWear: 5,
    milky: [0.84, 0.82, 0.78],
    shadow: [0.4, 0.38, 0.34],
    incl: [0.36, 0.34, 0.32],
  },
  polished_jade_marble: {
    base: [68, 118, 96],
    milkyScale: 8,
    veinLight: 4,
    veinShadow: 5,
    inclMul: 20,
    marbleMul: 4,
    edgeWear: 3,
    milky: [0.48, 0.54, 0.5],
    shadow: [0.28, 0.26, 0.24],
    incl: [0.72, 0.58, 0.48],
  },
  polished_slate_marble: {
    base: [43, 56, 59],
    milkyScale: 10,
    veinLight: 5,
    veinShadow: 4,
    inclMul: 18,
    marbleMul: 5,
    edgeWear: 2,
    milky: [0.4, 0.46, 0.5],
    shadow: [0.26, 0.28, 0.3],
    incl: [0.62, 0.68, 0.72],
  },
};

function paintPolishedMarbleTexels(profile, s, edgeWear) {
  const milkyLift = s.translucent * profile.milkyScale + Math.max(0, s.softVein) * profile.veinLight;
  const veinShadow = Math.max(0, -s.softVein) * profile.veinShadow;
  const inclDark = s.inclusion * profile.inclMul;
  const marbleDepth = s.marbling * profile.marbleMul;
  const r = Math.round(
    Math.max(
      0,
      Math.min(
        255,
        profile.base[0] +
          milkyLift * profile.milky[0] -
          veinShadow * profile.shadow[0] -
          inclDark * profile.incl[0] +
          marbleDepth * profile.milky[0] * 0.35 +
          edgeWear * profile.edgeWear
      )
    )
  );
  const g = Math.round(
    Math.max(
      0,
      Math.min(
        255,
        profile.base[1] +
          milkyLift * profile.milky[1] -
          veinShadow * profile.shadow[1] -
          inclDark * profile.incl[1] +
          marbleDepth * profile.milky[1] * 0.4 +
          edgeWear * profile.edgeWear
      )
    )
  );
  const b = Math.round(
    Math.max(
      0,
      Math.min(
        255,
        profile.base[2] +
          milkyLift * profile.milky[2] -
          veinShadow * profile.shadow[2] -
          inclDark * profile.incl[2] +
          marbleDepth * profile.milky[2] * 0.38 +
          edgeWear * profile.edgeWear * 0.9
      )
    )
  );
  return {
    r,
    g,
    b,
    bumpV: Math.round(
      Math.max(0, Math.min(255, (0.495 + Math.abs(s.softVein) * 0.008 + s.inclusion * 0.005) * 255))
    ),
    roughV: Math.round(Math.max(18, Math.min(38, 21 + s.inclusion * 10 + s.cloud * 2 - edgeWear * 3))),
    normalStrength: 3.6,
  };
}

function stoneProcSampler(variantKey) {
  switch (variantKey) {
    case 'volcanic':
      return sampleVolcanicStoneNoise;
    case 'basalt':
      return sampleBasaltNoise;
    case 'dry_terracotta':
      return sampleDryTerracottaNoise;
    case 'aged_fired_terracotta':
      return sampleAgedFiredTerracottaNoise;
    case 'soft_stoneware_signs':
      return sampleSoftStonewareSignsNoise;
    case 'archaeological_tile_doubt':
      return sampleArchaeologicalTileDoubtNoise;
    case 'polished_warm_marble_doubt':
      return samplePolishedWarmMarbleDoubtNoise;
    case 'seafoam_jade_gut':
      return sampleSeafoamJadeGutNoise;
    case 'soft_stoneware_gut':
      return sampleSeafoamJadeGutNoise;
    case 'warm_moonstone_jade':
      return sampleWarmMoonstoneJadeNoise;
    case 'polished_jade_marble':
      return samplePolishedJadeMarbleNoise;
    case 'polished_slate_marble':
      return samplePolishedSlateMarbleNoise;
    default:
      return sampleOrganicStoneNoise;
  }
}

function paintStoneProcTexels(variantKey, s, edgeWear) {
  if (variantKey === 'basalt') {
    return paintBasaltTexels(s);
  }
  if (variantKey === 'volcanic') {
    const baseR = 35;
    const baseG = 37;
    const baseB = 37;
    const mineralVar = s.mineral * 5.5 + s.burnish * 3.2;
    const poreSink = Math.max(0, -s.pore) * 3.8;
    const wornHighlight = edgeWear * 13 + Math.max(0, s.burnish) * 4;
    return {
      r: Math.round(Math.max(0, Math.min(255, baseR + mineralVar + wornHighlight - poreSink + s.fine * 2))),
      g: Math.round(
        Math.max(0, Math.min(255, baseG + mineralVar * 0.98 + wornHighlight * 0.97 - poreSink * 0.96 + s.fine * 1.9))
      ),
      b: Math.round(
        Math.max(0, Math.min(255, baseB + mineralVar * 0.96 + wornHighlight * 0.95 - poreSink * 0.94 + s.fine * 1.8))
      ),
      bumpV: Math.round(Math.max(0, Math.min(255, (0.48 + s.fine * 0.04 + Math.max(0, -s.pore) * 0.035) * 255))),
      roughV: Math.round(Math.max(215, Math.min(248, 224 + s.fine * 6 + s.mineral * 5 - edgeWear * 8))),
      normalStrength: 6.2,
    };
  }
  if (variantKey === 'dry_terracotta') {
    const baseR = 212;
    const baseG = 111;
    const baseB = 66;
    const chalkLift = s.chalk * 5 + s.powder * 4;
    const weatherFade = Math.max(0, -s.weather) * 9;
    const patina = Math.max(0, s.pigment - 0.1) * 7;
    const dustEdge = edgeWear * 16;
    return {
      r: Math.round(Math.max(0, Math.min(255, baseR + chalkLift + patina + dustEdge - weatherFade))),
      g: Math.round(Math.max(0, Math.min(255, baseG + chalkLift * 0.58 + patina * 0.5 + dustEdge * 0.7 - weatherFade * 0.55))),
      b: Math.round(Math.max(0, Math.min(255, baseB + chalkLift * 0.38 + patina * 0.35 + dustEdge * 0.45 - weatherFade * 0.45))),
      bumpV: Math.round(Math.max(0, Math.min(255, (0.44 + s.powder * 0.05 + Math.max(0, -s.pore) * 0.045) * 255))),
      roughV: Math.round(Math.max(252, Math.min(255, 253 + s.powder * 1.2))),
      normalStrength: 5.8,
    };
  }
  if (variantKey === 'aged_fired_terracotta') {
    return paintAgedFiredTerracottaTexels(s, edgeWear);
  }
  if (variantKey === 'warm_moonstone_jade') {
    return paintWarmMoonstoneJadeTexels(s, edgeWear);
  }
  if (variantKey === 'archaeological_tile_doubt') {
    return paintArchaeologicalTileDoubtTexels(s, edgeWear);
  }
  if (variantKey === 'seafoam_jade_gut' || variantKey === 'soft_stoneware_gut') {
    return paintSeafoamJadeGutTexels(s, edgeWear);
  }
  if (variantKey === 'soft_stoneware_signs') {
    return paintSoftStonewareSignsTexels(s, edgeWear);
  }
  if (variantKey === 'polished_jade_marble' || variantKey === 'polished_slate_marble' || variantKey === 'polished_warm_marble_doubt') {
    return paintPolishedMarbleTexels(MARBLE_PAINT_PROFILES[variantKey], s, edgeWear);
  }
  if (variantKey === 'sage') {
    const mott = 8.0;
    const shadow = Math.max(0, -s.combined) * 14 + Math.max(0, -s.pits) * 9 + (1 - edgeWear) * 3.5;
    return {
      r: Math.round(Math.max(0, Math.min(255, 180 + s.combined * mott + s.drift * 3 + s.blob * 2 - shadow))),
      g: Math.round(Math.max(0, Math.min(255, 176 + s.combined * mott + s.drift * 3.2 + s.blob * 2.2 - shadow * 0.96))),
      b: Math.round(Math.max(0, Math.min(255, 172 + s.combined * mott + s.drift * 2.8 + s.blob * 1.8 - shadow * 0.9))),
      bumpV: Math.round(Math.max(0, Math.min(255, (0.34 + s.height * 0.58) * 255))),
      roughV: Math.round(Math.max(210, Math.min(255, 232 + s.sand * 8 + s.combined * 12))),
      normalStrength: 11.5,
    };
  }
  const mott = 8.0;
  return {
    r: Math.round(Math.max(0, Math.min(255, 180 + s.combined * mott + s.drift * 3 + s.blob * 2))),
    g: Math.round(Math.max(0, Math.min(255, 176 + s.combined * mott + s.drift * 3.2 + s.blob * 2.2))),
    b: Math.round(Math.max(0, Math.min(255, 172 + s.combined * mott + s.drift * 2.8 + s.blob * 1.8))),
    bumpV: Math.round(Math.max(0, Math.min(255, (0.34 + s.height * 0.58) * 255))),
    roughV: Math.round(Math.max(210, Math.min(255, 232 + s.sand * 8 + s.combined * 12))),
    normalStrength: 11.5,
  };
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

function buildProceduralStoneTextures(variant = 'sage') {
  const variantKey = stoneProceduralVariant(normalizePremiumMaterialId(variant === true || variant === false ? 'sage' : variant));
  const cacheKey = `${STONE_PROC_GEN}:${variantKey}`;
  if (stoneProcCache.key === cacheKey && stoneProcCache.textures) return stoneProcCache.textures;

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
  const sample = stoneProcSampler(variantKey);
  let normalStrength = 11.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      heights[y * size + x] = sample(u, v).height;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;
      const s = sample(u, v);
      const idx = y * size + x;
      const hC = heights[idx];
      const hL = x > 0 ? heights[idx - 1] : hC;
      const hU = y > 0 ? heights[idx - size] : hC;
      const grad = Math.hypot(hC - hL, hC - hU);
      const edgeWear =
        variantKey === 'volcanic' ||
        variantKey === 'basalt' ||
        variantKey === 'dry_terracotta' ||
        variantKey === 'aged_fired_terracotta' ||
        variantKey === 'soft_stoneware_signs' ||
        variantKey === 'archaeological_tile_doubt' ||
        variantKey === 'seafoam_jade_gut' ||
        variantKey === 'soft_stoneware_gut' ||
        variantKey === 'warm_moonstone_jade' ||
        variantKey === 'polished_jade_marble' ||
        variantKey === 'polished_slate_marble' ||
        variantKey === 'polished_warm_marble_doubt'
          ? Math.min(
              1,
              grad *
                (variantKey === 'archaeological_tile_doubt'
                  ? 5.6
                  : variantKey.startsWith('soft_stoneware') ||
                      variantKey.startsWith('seafoam_') ||
                      variantKey.startsWith('archaeological_') ||
                      variantKey.startsWith('warm_moonstone')
                    ? 2.6
                    : variantKey.startsWith('polished_')
                      ? 3.4
                      : 5.2)
            )
          : 0;
      const painted = paintStoneProcTexels(variantKey, s, edgeWear);
      normalStrength = painted.normalStrength;
      colorImg.data[i] = painted.r;
      colorImg.data[i + 1] = painted.g;
      colorImg.data[i + 2] = painted.b;
      colorImg.data[i + 3] = 255;
      bumpImg.data[i] = bumpImg.data[i + 1] = bumpImg.data[i + 2] = painted.bumpV;
      bumpImg.data[i + 3] = 255;
      roughImg.data[i] = roughImg.data[i + 1] = roughImg.data[i + 2] = painted.roughV;
      roughImg.data[i + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  normalCtx.putImageData(
    new ImageData(buildNormalMapFromHeights(heights, size, normalStrength), size, size),
    0,
    0
  );

  const map = new THREE.CanvasTexture(colorCanvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  map.magFilter = THREE.LinearFilter;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.generateMipmaps = false;
  bumpMap.minFilter = THREE.LinearFilter;
  bumpMap.magFilter = THREE.LinearFilter;

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.generateMipmaps = false;
  normalMap.minFilter = THREE.LinearFilter;
  normalMap.magFilter = THREE.LinearFilter;

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.generateMipmaps = false;
  roughnessMap.minFilter = THREE.LinearFilter;
  roughnessMap.magFilter = THREE.LinearFilter;

  const textures = { map, bumpMap, normalMap, roughnessMap };
  stoneProcCache = { key: cacheKey, textures };
  return textures;
}

/** Q4 → stone material preset. Sage/doubt default; signs/gut/support → specialty stones. */
const Q4_STONE_PRESET = {
  concrete_actions: 'sage',
  signs: 'meteorite',
  gut: 'deep_stoneware',
  support: 'moonstone',
  doubt: 'archaeological_doubt',
};

function q4StonePreset(q4Belief) {
  return Q4_STONE_PRESET[q4Belief] ?? 'sage';
}

function makeStoneCanvasTexture(canvas, srgb = false) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

let basaltTexCache = { key: '', textures: null };

/** Dedicated PBR maps for basalt — albedo / normal / roughness / height (displacement). */
function buildBasaltStoneTextures() {
  const cacheKey = String(BASALT_TEX_GEN);
  if (basaltTexCache.key === cacheKey && basaltTexCache.textures) return basaltTexCache.textures;

  initStoneNoisePerm();
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const heightCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = normalCanvas.width = roughCanvas.width = heightCanvas.width = bumpCanvas.width = size;
  colorCanvas.height = normalCanvas.height = roughCanvas.height = heightCanvas.height = bumpCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  const normalCtx = normalCanvas.getContext('2d');
  const roughCtx = roughCanvas.getContext('2d');
  const heightCtx = heightCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const heightImg = heightCtx.createImageData(size, size);
  const bumpImg = bumpCtx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  const organicHeights = new Float32Array(size * size);
  const organicCombined = new Float32Array(size * size);
  let normalStrength = 11.2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const idx = y * size + x;
      const basalt = sampleBasaltNoise(u, v);
      const organic = sampleOrganicStoneNoise(u, v);
      organicHeights[idx] = organic.height;
      organicCombined[idx] = organic.combined;
      heights[idx] = basalt.height + (organic.height - 0.5) * BASALT_SAGE_GRAIN.normalBlend;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;
      const idx = y * size + x;
      const b = sampleBasaltNoise(u, v);
      const hC = heights[idx];
      const hL = x > 0 ? heights[idx - 1] : hC;
      const hU = y > 0 ? heights[idx - size] : hC;
      const edgeWear = Math.min(1, Math.hypot(hC - hL, hC - hU) * 4.2);
      const painted = paintBasaltTexels(
        { ...b, sageGrain: organicCombined[idx] * 0.5 + 0.5 },
        edgeWear
      );
      normalStrength = painted.normalStrength;
      colorImg.data[i] = painted.r;
      colorImg.data[i + 1] = painted.g;
      colorImg.data[i + 2] = painted.b;
      colorImg.data[i + 3] = 255;
      roughImg.data[i] = roughImg.data[i + 1] = roughImg.data[i + 2] = painted.roughV;
      roughImg.data[i + 3] = 255;
      const hPx = Math.round(Math.max(0, Math.min(255, heights[idx] * 255)));
      heightImg.data[i] = heightImg.data[i + 1] = heightImg.data[i + 2] = hPx;
      heightImg.data[i + 3] = 255;
      const bumpPx = Math.round(
        Math.max(0, Math.min(255, (0.34 + organicHeights[idx] * 0.58) * 255))
      );
      bumpImg.data[i] = bumpImg.data[i + 1] = bumpImg.data[i + 2] = bumpPx;
      bumpImg.data[i + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  heightCtx.putImageData(heightImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  normalCtx.putImageData(
    new ImageData(buildNormalMapFromHeights(heights, size, normalStrength), size, size),
    0,
    0
  );

  const textures = {
    basaltAlbedo: makeStoneCanvasTexture(colorCanvas, true),
    basaltNormal: makeStoneCanvasTexture(normalCanvas),
    basaltRoughness: makeStoneCanvasTexture(roughCanvas),
    basaltHeight: makeStoneCanvasTexture(heightCanvas),
    basaltMicroBump: makeStoneCanvasTexture(bumpCanvas),
  };
  basaltTexCache = { key: cacheKey, textures };
  return textures;
}

function buildBasaltStoneMaterial() {
  const {
    basaltAlbedo,
    basaltNormal,
    basaltRoughness,
    basaltHeight,
  } = buildBasaltStoneTextures();
  const sageProc = buildProceduralStoneTextures('sage');
  const spec = getPremiumMaterialSpec(PREMIUM_MATERIAL_IDS.WARM_MOONSTONE);
  const bumpScale = spec.bumpScale ?? BASALT_SAGE_GRAIN.bumpScale;

  const material = new THREE.MeshStandardMaterial({
    map: basaltAlbedo,
    normalMap: basaltNormal,
    roughnessMap: basaltRoughness,
    displacementMap: basaltHeight,
    displacementScale: 0.25,
    bumpMap: sageProc.bumpMap,
    bumpScale,
    roughness: 0.96,
    metalness: 0,
    color: 0xffffff,
    normalScale: new THREE.Vector2(spec.normalScale ?? 1.2, spec.normalScale ?? 1.2),
    flatShading: false,
    vertexColors: false,
    side: THREE.FrontSide,
    depthWrite: true,
    envMap: null,
    envMapIntensity: 0,
  });
  return { material, textured: true, preset: PREMIUM_MATERIAL_IDS.WARM_MOONSTONE };
}

let terracottaTexCache = { key: '', textures: null };

/** Dedicated PBR maps for carved Carrara marble (doubt preset). */
function buildTerracottaStoneTextures() {
  const cacheKey = String(TERRACOTTA_TEX_GEN);
  if (terracottaTexCache.key === cacheKey && terracottaTexCache.textures) return terracottaTexCache.textures;

  initStoneNoisePerm();
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const heightCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = normalCanvas.width = roughCanvas.width = heightCanvas.width = bumpCanvas.width = size;
  colorCanvas.height = normalCanvas.height = roughCanvas.height = heightCanvas.height = bumpCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  const normalCtx = normalCanvas.getContext('2d');
  const roughCtx = roughCanvas.getContext('2d');
  const heightCtx = heightCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const heightImg = heightCtx.createImageData(size, size);
  const bumpImg = bumpCtx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  let normalStrength = 9.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      heights[y * size + x] = sampleMarbleNoise(u, v).height;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;
      const idx = y * size + x;
      const s = sampleMarbleNoise(u, v);
      const hC = heights[idx];
      const hL = x > 0 ? heights[idx - 1] : hC;
      const hU = y > 0 ? heights[idx - size] : hC;
      const edgeWear = Math.min(1, Math.hypot(hC - hL, hC - hU) * 2.4);
      const painted = paintMarbleTexels(s, edgeWear);
      normalStrength = painted.normalStrength;
      colorImg.data[i] = painted.r;
      colorImg.data[i + 1] = painted.g;
      colorImg.data[i + 2] = painted.b;
      colorImg.data[i + 3] = 255;
      roughImg.data[i] = roughImg.data[i + 1] = roughImg.data[i + 2] = painted.roughV;
      roughImg.data[i + 3] = 255;
      const hPx = Math.round(Math.max(0, Math.min(255, heights[idx] * 255)));
      heightImg.data[i] = heightImg.data[i + 1] = heightImg.data[i + 2] = hPx;
      heightImg.data[i + 3] = 255;
      const bumpPx = Math.round(
        Math.max(0, Math.min(255, (0.47 + (heights[idx] - 0.5) * 0.12) * 255))
      );
      bumpImg.data[i] = bumpImg.data[i + 1] = bumpImg.data[i + 2] = bumpPx;
      bumpImg.data[i + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  heightCtx.putImageData(heightImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  normalCtx.putImageData(
    new ImageData(buildNormalMapFromHeights(heights, size, normalStrength), size, size),
    0,
    0
  );

  const textures = {
    terracottaAlbedo: makeStoneCanvasTexture(colorCanvas, true),
    terracottaNormal: makeStoneCanvasTexture(normalCanvas),
    terracottaRoughness: makeStoneCanvasTexture(roughCanvas),
    terracottaHeight: makeStoneCanvasTexture(heightCanvas),
    terracottaBump: makeStoneCanvasTexture(bumpCanvas),
  };
  terracottaTexCache = { key: cacheKey, textures };
  return textures;
}

function buildTerracottaStoneMaterial(envMap = null) {
  const {
    terracottaAlbedo,
    terracottaNormal,
    terracottaRoughness,
    terracottaHeight,
    terracottaBump,
  } = buildTerracottaStoneTextures();
  const spec = getPremiumMaterialSpec(PREMIUM_MATERIAL_IDS.ARCHAEOLOGICAL_DOUBT);
  const ibl = envMap ?? active?.envMap ?? null;

  const material = new THREE.MeshPhysicalMaterial({
    map: terracottaAlbedo,
    normalMap: terracottaNormal,
    roughnessMap: terracottaRoughness,
    displacementMap: terracottaHeight,
    displacementScale: spec.displacementScale ?? 0,
    bumpMap: terracottaBump,
    bumpScale: spec.bumpScale ?? 0.08,
    roughness: spec.roughness ?? 0.32,
    metalness: spec.metalness ?? 0,
    color: 0xffffff,
    clearcoat: spec.clearcoat ?? 0.28,
    clearcoatRoughness: spec.clearcoatRoughness ?? 0.18,
    transmission: 0,
    transparent: false,
    opacity: 1,
    ior: 1.5,
    normalScale: new THREE.Vector2(spec.normalScale ?? 0.6, spec.normalScale ?? 0.6),
    flatShading: false,
    vertexColors: false,
    side: THREE.FrontSide,
    depthWrite: true,
    envMap: ibl,
    envMapIntensity: spec.envMapIntensity ?? 1.15,
  });
  return { material, textured: true, preset: PREMIUM_MATERIAL_IDS.ARCHAEOLOGICAL_DOUBT };
}

let gravelTexCache = { key: '', textures: null };

/** Dedicated PBR maps for gravel — albedo / normal / roughness / height. */
function buildGravelStoneTextures() {
  const cacheKey = String(GRAVEL_TEX_GEN);
  if (gravelTexCache.key === cacheKey && gravelTexCache.textures) return gravelTexCache.textures;

  initStoneNoisePerm();
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const heightCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = normalCanvas.width = roughCanvas.width = heightCanvas.width = bumpCanvas.width = size;
  colorCanvas.height = normalCanvas.height = roughCanvas.height = heightCanvas.height = bumpCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  const normalCtx = normalCanvas.getContext('2d');
  const roughCtx = roughCanvas.getContext('2d');
  const heightCtx = heightCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const heightImg = heightCtx.createImageData(size, size);
  const bumpImg = bumpCtx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  let normalStrength = 31.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      heights[y * size + x] = sampleGravelNoise(u, v).height;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;
      const idx = y * size + x;
      const s = sampleGravelNoise(u, v);
      const hC = heights[idx];
      const hL = x > 0 ? heights[idx - 1] : hC;
      const hU = y > 0 ? heights[idx - size] : hC;
      const edgeWear = Math.min(1, Math.hypot(hC - hL, hC - hU) * 5.4);
      const painted = paintGravelTexels(s, edgeWear);
      normalStrength = painted.normalStrength;
      colorImg.data[i] = painted.r;
      colorImg.data[i + 1] = painted.g;
      colorImg.data[i + 2] = painted.b;
      colorImg.data[i + 3] = 255;
      roughImg.data[i] = roughImg.data[i + 1] = roughImg.data[i + 2] = painted.roughV;
      roughImg.data[i + 3] = 255;
      const hPx = Math.round(Math.max(0, Math.min(255, heights[idx] * 255)));
      heightImg.data[i] = heightImg.data[i + 1] = heightImg.data[i + 2] = hPx;
      heightImg.data[i + 3] = 255;
      const bumpPx = Math.round(Math.max(0, Math.min(255, (0.34 + heights[idx] * 0.58) * 255)));
      bumpImg.data[i] = bumpImg.data[i + 1] = bumpImg.data[i + 2] = bumpPx;
      bumpImg.data[i + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  heightCtx.putImageData(heightImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  normalCtx.putImageData(
    new ImageData(buildNormalMapFromHeights(heights, size, normalStrength), size, size),
    0,
    0
  );

  const textures = {
    gravelAlbedo: makeStoneCanvasTexture(colorCanvas, true),
    gravelNormal: makeStoneCanvasTexture(normalCanvas),
    gravelRoughness: makeStoneCanvasTexture(roughCanvas),
    gravelHeight: makeStoneCanvasTexture(heightCanvas),
    gravelBump: makeStoneCanvasTexture(bumpCanvas),
  };
  gravelTexCache = { key: cacheKey, textures };
  return textures;
}

function buildGravelStoneMaterial() {
  const { gravelAlbedo, gravelNormal, gravelRoughness, gravelHeight, gravelBump } =
    buildGravelStoneTextures();
  const spec = getPremiumMaterialSpec(PREMIUM_MATERIAL_IDS.GRAVEL_STONE);

  const material = new THREE.MeshPhysicalMaterial({
    map: gravelAlbedo,
    normalMap: gravelNormal,
    roughnessMap: gravelRoughness,
    displacementMap: gravelHeight,
    displacementScale: spec.displacementScale ?? 0.2,
    bumpMap: gravelBump,
    bumpScale: spec.bumpScale ?? 0.32,
    roughness: spec.roughness ?? 0.9,
    metalness: 0.0,
    color: 0xffffff,
    clearcoat: 0.0,
    normalScale: new THREE.Vector2(spec.normalScale ?? 1.38, spec.normalScale ?? 1.38),
    flatShading: false,
    vertexColors: false,
    side: THREE.FrontSide,
    depthWrite: true,
    envMap: null,
    envMapIntensity: 0,
  });
  return { material, textured: true, preset: PREMIUM_MATERIAL_IDS.GRAVEL_STONE };
}

let meteoriteTexCache = { key: '', textures: null };

/** Dedicated PBR maps for iron meteorite — albedo / normal / roughness / height. */
function buildMeteoriteStoneTextures() {
  const cacheKey = String(METEORITE_TEX_GEN);
  if (meteoriteTexCache.key === cacheKey && meteoriteTexCache.textures) return meteoriteTexCache.textures;

  initStoneNoisePerm();
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  const heightCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = normalCanvas.width = roughCanvas.width = heightCanvas.width = bumpCanvas.width = size;
  colorCanvas.height = normalCanvas.height = roughCanvas.height = heightCanvas.height = bumpCanvas.height = size;
  const colorCtx = colorCanvas.getContext('2d');
  const normalCtx = normalCanvas.getContext('2d');
  const roughCtx = roughCanvas.getContext('2d');
  const heightCtx = heightCanvas.getContext('2d');
  const bumpCtx = bumpCanvas.getContext('2d');
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const heightImg = heightCtx.createImageData(size, size);
  const bumpImg = bumpCtx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  let normalStrength = 54.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      heights[y * size + x] = sampleMeteoriteNoise(u, v).height;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;
      const idx = y * size + x;
      const s = sampleMeteoriteNoise(u, v);
      const hC = heights[idx];
      const hL = x > 0 ? heights[idx - 1] : hC;
      const hU = y > 0 ? heights[idx - size] : hC;
      const edgeWear = Math.min(1, Math.hypot(hC - hL, hC - hU) * 5.8);
      const painted = paintMeteoriteTexels(s, edgeWear);
      normalStrength = painted.normalStrength;
      colorImg.data[i] = painted.r;
      colorImg.data[i + 1] = painted.g;
      colorImg.data[i + 2] = painted.b;
      colorImg.data[i + 3] = 255;
      roughImg.data[i] = roughImg.data[i + 1] = roughImg.data[i + 2] = painted.roughV;
      roughImg.data[i + 3] = 255;
      const hPx = Math.round(Math.max(0, Math.min(255, heights[idx] * 255)));
      heightImg.data[i] = heightImg.data[i + 1] = heightImg.data[i + 2] = hPx;
      heightImg.data[i + 3] = 255;
      const bumpPx = Math.round(
        Math.max(0, Math.min(255, (0.28 + heights[idx] * 0.72) * 255))
      );
      bumpImg.data[i] = bumpImg.data[i + 1] = bumpImg.data[i + 2] = bumpPx;
      bumpImg.data[i + 3] = 255;
    }
  }

  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  heightCtx.putImageData(heightImg, 0, 0);
  bumpCtx.putImageData(bumpImg, 0, 0);
  normalCtx.putImageData(
    new ImageData(buildNormalMapFromHeights(heights, size, normalStrength), size, size),
    0,
    0
  );

  const textures = {
    meteoriteAlbedo: makeStoneCanvasTexture(colorCanvas, true),
    meteoriteNormal: makeStoneCanvasTexture(normalCanvas),
    meteoriteRoughness: makeStoneCanvasTexture(roughCanvas),
    meteoriteHeight: makeStoneCanvasTexture(heightCanvas),
    meteoriteBump: makeStoneCanvasTexture(bumpCanvas),
  };
  meteoriteTexCache = { key: cacheKey, textures };
  return textures;
}

function buildMeteoriteStoneMaterial(envMap = null) {
  const { meteoriteAlbedo, meteoriteNormal, meteoriteRoughness, meteoriteHeight, meteoriteBump } =
    buildMeteoriteStoneTextures();
  const spec = getPremiumMaterialSpec(PREMIUM_MATERIAL_IDS.METEORITE_STONE);
  const ibl = envMap ?? active?.envMap ?? null;

  const material = new THREE.MeshPhysicalMaterial({
    map: meteoriteAlbedo,
    normalMap: meteoriteNormal,
    roughnessMap: meteoriteRoughness,
    displacementMap: meteoriteHeight,
    displacementScale: spec.displacementScale ?? 0.04,
    bumpMap: meteoriteBump,
    bumpScale: spec.bumpScale ?? 0.26,
    roughness: spec.roughness ?? 0.82,
    metalness: spec.metalness ?? 0.11,
    color: 0xffffff,
    clearcoat: spec.clearcoat ?? 0,
    clearcoatRoughness: spec.clearcoatRoughness ?? 0.62,
    normalScale: new THREE.Vector2(spec.normalScale ?? 1.55, spec.normalScale ?? 1.55),
    flatShading: false,
    vertexColors: true,
    side: THREE.FrontSide,
    depthWrite: true,
    envMap: ibl,
    envMapIntensity: spec.envMapIntensity ?? 0.9,
  });
  return { material, textured: true, preset: PREMIUM_MATERIAL_IDS.METEORITE_STONE };
}

function buildPremiumStoneMaterial(presetId, style2 = null, envMap = null, _stoneRoughness = null) {
  const key = normalizePremiumMaterialId(presetId);
  if (key === PREMIUM_MATERIAL_IDS.WARM_MOONSTONE) {
    return buildBasaltStoneMaterial();
  }
  if (key === PREMIUM_MATERIAL_IDS.METEORITE_STONE) {
    return buildMeteoriteStoneMaterial(envMap);
  }
  if (key === PREMIUM_MATERIAL_IDS.GRAVEL_STONE) {
    return buildGravelStoneMaterial();
  }
  if (key === PREMIUM_MATERIAL_IDS.ARCHAEOLOGICAL_DOUBT) {
    return buildTerracottaStoneMaterial(envMap);
  }
  const spec = getPremiumMaterialSpec(key);
  const proc = buildProceduralStoneTextures(stoneProceduralVariant(key));
  const ibl = envMap ?? active?.envMap ?? null;
  const isSage = key === PREMIUM_MATERIAL_IDS.SAGE_STONE;
  const bumpScale = spec.bumpScale ?? (isSage ? 0.98 : 0.64);
  const normalScale = spec.normalScale ?? 0.5;
  const MaterialClass = isSage ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
  const material = new MaterialClass({
    color: new THREE.Color(spec.color),
    map: proc.map,
    bumpMap: proc.bumpMap,
    bumpScale,
    normalMap: proc.normalMap,
    normalScale: new THREE.Vector2(normalScale, normalScale),
    roughnessMap: proc.roughnessMap,
    roughness: spec.roughness ?? 0.92,
    metalness: spec.metalness ?? 0,
    flatShading: false,
    vertexColors: !isSage,
    side: THREE.FrontSide,
    depthWrite: true,
    envMap: isSage || !(spec.envMapIntensity ?? 0) ? null : ibl,
    envMapIntensity: isSage || !(spec.envMapIntensity ?? 0) ? 0 : (spec.envMapIntensity ?? 0),
  });
  if (!isSage) {
    material.clearcoat = spec.clearcoat ?? 0;
    if (spec.clearcoatRoughness != null) material.clearcoatRoughness = spec.clearcoatRoughness;
    if (spec.transmission != null && spec.transmission > 0) {
      material.transmission = spec.transmission;
      material.thickness = spec.thickness ?? 1.5;
      material.ior = spec.ior ?? 1.54;
      material.transparent = true;
      const att = spec.attenuationColor;
      material.attenuationColor = att
        ? new THREE.Color(att[0], att[1], att[2])
        : new THREE.Color(0.71, 0.69, 0.65);
      material.attenuationDistance = spec.attenuationDistance ?? 1.0;
    }
  }
  return { material, textured: true, preset: key };
}

function buildSageStoneMaterial(style2 = null) {
  return buildPremiumStoneMaterial(PREMIUM_MATERIAL_IDS.SAGE_STONE, style2);
}

function buildVolcanicStoneMaterial(style2 = null, envMap = null) {
  return buildPremiumStoneMaterial(PREMIUM_MATERIAL_IDS.VOLCANIC_STONE, style2, envMap);
}

function buildDryTerracottaStoneMaterial(style2 = null, envMap = null) {
  return buildPremiumStoneMaterial(PREMIUM_MATERIAL_IDS.DRY_TERRACOTTA, style2, envMap);
}

function buildAncientStonewareMaterial(style2 = null, envMap = null) {
  return buildPremiumStoneMaterial(PREMIUM_MATERIAL_IDS.ANCIENT_STONEWARE, style2, envMap);
}

function buildDeepStonewareMaterial(style2 = null, envMap = null) {
  return buildPremiumStoneMaterial(PREMIUM_MATERIAL_IDS.DEEP_STONEWARE, style2, envMap);
}

function buildPolishedSlateMarbleMaterial(style2 = null, envMap = null) {
  return buildPremiumStoneMaterial(PREMIUM_MATERIAL_IDS.POLISHED_SLATE_MARBLE, style2, envMap);
}

function buildPolishedJadeMarbleMaterial(style2 = null, envMap = null) {
  return buildPremiumStoneMaterial(PREMIUM_MATERIAL_IDS.POLISHED_JADE_MARBLE, style2, envMap);
}

function buildJadeStoneMaterial(style2 = null, envMap = null) {
  return buildAncientStonewareMaterial(style2, envMap);
}

function buildStoneMaterial(style2 = null, q4Belief = 'concrete_actions', envMap = null, questionnaire = null) {
  const rough = resolveStoneRoughness(style2, questionnaire);
  return buildPremiumStoneMaterial(q4StonePreset(q4Belief), style2, envMap, rough);
}

/** Flat slab — Q4-driven stone material. */
function buildSlabStoneMaterial(q4Belief = 'concrete_actions', style2 = null) {
  return buildStoneMaterial(style2, q4Belief).material;
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
/** Compact centered metal plate on stone slab (scene units). */
const METAL_SHEET_WRAP_MARGIN_SCENE = 12;
/** Stone must extend at least this far beyond the metal halo footprint. */
const METAL_STONE_FRAME_MARGIN_SCENE = 20;
/** Stone must extend at least this far beyond the Q1 ceramic tube halo. */
const CERAMIC_STONE_WRAP_MARGIN_SCENE = 24;
/** Metal wraps above stone/emboss — tubes in emboss zone are skipped. */
const SLAB_METAL_WRAP_Z_LIFT = 0.38;
/** Metal frame around stone slab — equal gap from all content (scene / SVG px). */
const SLAB_FRAME_EQUAL_GAP_SCENE = 30;
const SLAB_STONE_FRAME_MARGIN = SLAB_FRAME_EQUAL_GAP_SCENE;
const SLAB_STONE_FRAME_RADIUS_SCALE = 0.88;
/** Frame / Q3 tube radius — prototype-v2-unified protection frame scale. */
const UNIFIED_FRAME_TUBE_RADIUS_SCALE = 1.15;
const CERAMIC_FRAME_ENVELOPE_EXTRA = 8;
const FRAME_EQUAL_GAP = SLAB_FRAME_EQUAL_GAP_SCENE;
const FRAME_CONTOUR_RADIAL_PASSES = 6;
const FRAME_CURVE_CHAIKIN_PASSES = 7;
const FRAME_CURVE_CENTRIPETAL = 0.6;
/** Smooth tube bends for slab frame + Q1 ceramic metal. */
const SLAB_METAL_CONNECTION_SMOOTHNESS = 0.97;

function softenMetalStyle2(style2) {
  if (!style2) return { frameSmoothness: SLAB_METAL_CONNECTION_SMOOTHNESS };
  return {
    ...style2,
    frameSmoothness: Math.max(style2.frameSmoothness ?? 0.5, SLAB_METAL_CONNECTION_SMOOTHNESS),
    occupationSmoothness: Math.max(style2.occupationSmoothness ?? 0.5, SLAB_METAL_CONNECTION_SMOOTHNESS),
  };
}

/** Stone slab frame — smooth arcs, sharp features only at tight corners. */
const SLAB_FRAME_ORGANIC_SMOOTHNESS = 0.82;

/** Frame follows Q6 stone roughness — tubes wrap spiky silhouette, not independent wobble. */
function stoneMatchedFrameStyle2(style2) {
  if (!style2) return { frameSmoothness: 1 };
  const rough = stoneRoughnessFromStyle(style2);
  const frameSmooth = Math.max(0, 1 - rough);
  return {
    ...style2,
    frameSmoothness: frameSmooth,
    occupationKey: style2.occupationKey ?? style2.occupation,
    frameContour: {
      wobbleMix: 0.18 + rough * 0.42,
      curlMix: 0.14 + rough * 0.32,
      ampScale: 0.22 + rough * 0.52,
      freqBias: rough * 0.1,
      phase: 0,
    },
  };
}

function organicSlabFrameStyle2(style2) {
  if (!style2) return { frameSmoothness: SLAB_FRAME_ORGANIC_SMOOTHNESS };
  return { ...style2, frameSmoothness: SLAB_FRAME_ORGANIC_SMOOTHNESS };
}

/** Stone slab frame — sharp corners, no Chaikin smoothing (follows silhouette indentations). */
function sharpSlabFrameStyle2(style2) {
  return organicSlabFrameStyle2(style2);
}
const FRAME_CONTOUR_SUBSAMPLE = PATH_STEP * 0.82;
const SLAB_FRAME_CONTOUR_SUBSAMPLE = PATH_STEP * 0.22;
const FRAME_TUBE_MAX_PTS = 220;
const SLAB_FRAME_TUBE_MAX_PTS = 520;
/** Contour trace resolution — 1 = full mask pixels (exact frame follow). */
const SLAB_FRAME_CONTOUR_DOWNSAMPLE = 1;
const SLAB_WRAP_MARGIN_SCENE = 30;
const SLAB_WRAP_STROKE_MUL = 1.48;
const SLAB_WRAP_EXTRA_DILATE_PX = 14 * MASK_SCALE;
/** Morphological close — bridge gaps between L3 lobes into one continuous stone plate. */
const SLAB_PLATE_BRIDGE_SCENE = 22;
/** Dev: hide metal sigils — set true to focus on stone emboss/engrave only. */
const STONE_SLAB_HIDE_METAL = false;
const ENABLE_METAL_FRINGE = false;
/** Q4 metal fringe — connected letters behind stone slab. */
const METAL_FRINGE_RADIUS_SCALE = 1.38;
const METAL_FRINGE_Z_BEHIND = 0.75;
const METAL_FRINGE_RENDER_ORDER = 6;
/** Q1 metal wrap — outer shape over stone (derived from wish text). */
const SLAB_METAL_WRAP_PLACEMENT = { cxFrac: 0.5, cyFrac: 0.5, widthFrac: 0.88, heightFrac: 0.88, fit: 0.88 };
/** Q1 metal emboss — small centered plate on stone. */
const SLAB_METAL_EMBOSS_PLACEMENT = { cxFrac: 0.5, cyFrac: 0.5, widthFrac: 0.36, heightFrac: 0.32, fit: 0.72 };
/** @deprecated alias — kept for any cached references */
const SLAB_Q1_PLACEMENT = SLAB_METAL_EMBOSS_PLACEMENT;
/** Q1 ceramic inset — unified glyph mass centered on stone (saved-roughness L3 look). */
const SLAB_Q1_CERAMIC_PLACEMENT = { cxFrac: 0.5, cyFrac: 0.5, widthFrac: 0.48, heightFrac: 0.45, fit: 0.86 };
/** Q3 metal threads — centered, stone-slab scale (first letter only in SVG). */
const SLAB_Q3_METAL_PLACEMENT = { cxFrac: 0.5, cyFrac: 0.5, widthFrac: 0.9, heightFrac: 0.74, fit: 1.02 };
const SLAB_Q3_METAL_THREAD_RADIUS_SCALE = 0.82;
/** Stone groove placement — same vectors, slightly tighter fit inside metal tubes. */
const SLAB_Q3_ENGRAVE_PLACEMENT = { cxFrac: 0.5, cyFrac: 0.5, widthFrac: 0.9, heightFrac: 0.74, fit: 1.02 };
/** Q3 metal — above stone, below ceramic; clipped hole around Q1 + 20px gap. */
const Q3_THREAD_RENDER_ORDER = 28;
const Q3_THREAD_ABOVE_STONE_Z = 0.045;
/** @deprecated — Q3 no longer behind stone */
const Q3_THREAD_BEHIND_STONE_Z_OFFSET = 0.06;
/** Q1 ceramic — thick unified metal tubes on stone front. */
const SLAB_Q1_CERAMIC_TUBE_RADIUS_SCALE = 1.82;
/** Slab outer frame — same tube radius as Q1 ceramic layer. */
const SLAB_FRAME_TUBE_RADIUS_SCALE = SLAB_Q1_CERAMIC_TUBE_RADIUS_SCALE;

/** Q1 ceramic — fixed tube size; Q4 must not swell letter geometry. */
function ceramicQ1TubeRadius(style3) {
  return frameTubeBaseRadius(style3) * SLAB_Q1_CERAMIC_TUBE_RADIUS_SCALE;
}

/** Q3 metal threads — fixed tube size; Q4 must not swell thread geometry. */
function q3MetalThreadTubeRadius(style3) {
  return frameTubeBaseRadius(style3) * SLAB_Q3_METAL_THREAD_RADIUS_SCALE;
}
const Q1_CERAMIC_RENDER_ORDER = 40;
const Q1_CERAMIC_ABOVE_STONE_Z = 0.1;
/** Q2 name glyphs — preserve editor connection layout; gentle scale only if oversized. */
const SLAB_NAME_SHAPE_MAX_RADIUS = 268;
const SLAB_NAME_SHAPE_FIT = 0.91;
/** Q7 — raised letter ring on stone slab (scattered circle, no connections). */
const SLAB_Q7_EMBOSS_STROKE_SCALE = 0.52;
const SLAB_Q7_EMBOSS_HEIGHT_MUL = 1.05;
const SLAB_Q7_EMBOSS_BEVEL_MUL = 0.62;
const SLAB_Q7_EMBOSS_TUBE_MUL = 0.42;
const SLAB_Q3_ENGRAVE_WALL_MUL = 0.016;
/** @deprecated — rounded tube engrave disabled for Q3 */
const SLAB_Q3_ENGRAVE_BEVEL_MUL = SLAB_Q3_ENGRAVE_WALL_MUL;
/** Q4 doubt — sharp raised bas-relief like ancient carved tile. */
const SLAB_Q3_DOUBT_EMBOSS_HEIGHT_MUL = 3.2;
const SLAB_Q3_DOUBT_EMBOSS_BEVEL_MUL = 0.24;
const SLAB_Q3_DOUBT_EMBOSS_SOLID_DILATE_SCENE = 10;

/** @deprecated alias */
const SLAB_Q2_PLACEMENT = SLAB_Q3_ENGRAVE_PLACEMENT;
const SLAB_Q_SHARED_PLACEMENT = SLAB_Q3_ENGRAVE_PLACEMENT;
/** Test: flat stone slab filling frame interior (slabMode SDF, no letter bumps). */
const STONE_L3_SLAB_MODE = true;

function reportProgress(onProgress, frac, label) {
  if (onProgress) onProgress(Math.min(1, Math.max(0, frac)), label);
}

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

/** Pixels that were empty before fillMaskInteriorHoles — letter counters / enclosed voids. */
function extractFilledHolesMask(beforeFill, afterFill, w, h) {
  const holes = new Uint8Array(beforeFill.length);
  let any = false;
  for (let i = 0; i < beforeFill.length; i++) {
    if (!beforeFill[i] && afterFill[i]) {
      holes[i] = 1;
      any = true;
    }
  }
  return any ? { grid: holes, w, h } : null;
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

/** Q6 occupation radial wobble — same family as unified frame contour. */
function applyOccupationContourWobble(pts, style2, ampMul = 1) {
  const stoneStyle = stoneVectorStyle2(style2) ?? style2;
  const occupationKey = stoneStyle?.occupationKey ?? stoneStyle?.occupation;
  if (!occupationKey || pts.length < 4) return pts;
  const rough = stoneRoughnessFromStyle(stoneStyle);
  if (rough < 0.08) return pts;

  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p.x;
    cy += p.y;
  }
  cx /= pts.length;
  cy /= pts.length;

  const amp = rough * (5 + rough * 3) * ampMul;
  return pts.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return p.clone();
    const ang = Math.atan2(dy, dx);
    const wobble =
      Math.sin(ang * (0.24 + rough * 0.2)) * 0.55 + Math.cos(ang * (0.43 - rough * 0.1)) * 0.45;
    const curl = Math.sin(ang * 0.08 + rough * 1.5) * Math.cos(ang * (0.17 + rough * 0.13));
    const dr = (wobble * 0.5 + curl * 0.32) * amp;
    const scale = (dist + dr) / dist;
    return new THREE.Vector3(cx + dx * scale, cy + dy * scale, p.z);
  });
}

/** Q6 roughness for stone vector wrap (independent of smooth upper layers). */
function stoneRoughnessFromStyle(style2) {
  if (style2?.stoneRoughness != null) {
    return Math.max(0, Math.min(1, Number(style2.stoneRoughness)));
  }
  const key = style2?.occupationKey ?? style2?.occupation;
  if (key) return 1 - (OCCUPATION_SMOOTHNESS[key] ?? 0.5);
  return 0;
}

function stoneVectorStyle2(style2) {
  if (!style2) return null;
  const rough = stoneRoughnessFromStyle(style2);
  const key = style2?.occupationKey ?? style2?.occupation;
  return { ...style2, occupationKey: key, occupation: key, stoneRoughness: rough };
}

/** Morph post-process — spiky vector paths keep more detail in stone slab fuse. */
function stoneSlabMorphKeep(style2) {
  const rough = stoneRoughnessFromStyle(style2);
  return 1 - rough * 0.48;
}

/**
 * Organic stone slab silhouette from timingReason seed — deterministic lobed contour.
 */
function buildOrganicStoneContour(stoneShapeParams, cx, cy, style2 = null) {
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
  return style2 ? applyOccupationContourWobble(pts, stoneVectorStyle2(style2)) : pts;
}

function rasterizeProceduralStoneMask(stoneShapeParams, style3, style2 = null) {
  const pts = buildOrganicStoneContour(stoneShapeParams, CX, CY, style2);
  const morphKeep = stoneSlabMorphKeep(style2);
  const pad = stoneShapeParams.baseRadius * 0.35 + SLAB_WRAP_MARGIN_SCENE;
  const maskOrigin = maskBoundsFromPolylines([{ pts, closed: true }], pad);
  const wrapStroke = l3TubeRadius(style3) * SLAB_WRAP_STROKE_MUL * 2.4;
  let { grid: unionGrid, w, h } = rasterizePolylinesToGrid(
    [{ pts, closed: true }],
    wrapStroke,
    maskOrigin
  );

  const dilatePx = Math.round(
    (L3_MORPH_DILATE_PX + STONE_L3_EXTRA_DILATE_PX + STONE_FUSE_DILATE_PX + SLAB_WRAP_EXTRA_DILATE_PX) *
      morphKeep
  );
  let slabGrid = dilateMaskGrid(unionGrid, w, h, dilatePx);
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);
  const bridgePx = Math.round(SLAB_PLATE_BRIDGE_SCENE * MASK_SCALE * morphKeep);
  slabGrid = closeStrokeMaskGrid(slabGrid, w, h, bridgePx, Math.max(1, bridgePx - 4));
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);
  slabGrid = solidifyInsideOuterBoundary(slabGrid, w, h);
  slabGrid = dilateMaskGrid(slabGrid, w, h, Math.max(1, Math.round(5 * MASK_SCALE * morphKeep)));
  const spurCut = stoneShapeParams.baseRadius * 0.42 * (0.55 + morphKeep * 0.45);
  slabGrid = pruneThinMaskSpurs(slabGrid, w, h, spurCut);
  return { grid: slabGrid, w, h, maskOrigin };
}

/** Less bridging → more visible gaps / lobes between name letters. */
const STONE_NAME_GAP_BRIDGE_MUL = 0.52;
const STONE_NAME_FUSE_DILATE_MUL = 0.82;

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

  const stoneStyle = stoneVectorStyle2(style2);
  const stoneRough = stoneRoughnessFromStyle(stoneStyle);
  polylines = perturbPolylinesForStoneShape(polylines, stoneStyle, style3);
  polylines = fitPolylinesToSceneExtent(polylines);

  const morphKeep = stoneSlabMorphKeep(stoneStyle);
  const wrapPad = l3TubeRadius(style3) * 3.8 + SLAB_WRAP_MARGIN_SCENE;
  const maskOrigin = maskBoundsFromPolylines(polylines, wrapPad);
  if (!maskOrigin) return null;

  const wrapStroke = l3TubeRadius(style3) * SLAB_WRAP_STROKE_MUL * 3.45;
  let { grid: unionGrid, w, h } = rasterizePolylinesToGrid(polylines, wrapStroke, maskOrigin);

  let filled = 0;
  for (let i = 0; i < unionGrid.length; i++) filled += unionGrid[i];
  if (filled < 40) return null;

  const extraFuse = Math.round(36 * MASK_SCALE * STONE_NAME_FUSE_DILATE_MUL * morphKeep);
  const dilatePx = Math.round(
    (L3_MORPH_DILATE_PX +
      STONE_L3_EXTRA_DILATE_PX +
      STONE_FUSE_DILATE_PX +
      SLAB_WRAP_EXTRA_DILATE_PX +
      extraFuse) *
      morphKeep
  );
  let slabGrid = dilateMaskGrid(unionGrid, w, h, dilatePx);
  const beforeHoleFill = new Uint8Array(slabGrid);
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);
  const pierceHoleMask = extractFilledHolesMask(beforeHoleFill, slabGrid, w, h);
  if (pierceHoleMask) pierceHoleMask.maskOrigin = maskOrigin;
  const bridgePx = Math.round(
    SLAB_PLATE_BRIDGE_SCENE * MASK_SCALE * 2.85 * STONE_NAME_GAP_BRIDGE_MUL * morphKeep
  );
  slabGrid = closeStrokeMaskGrid(slabGrid, w, h, bridgePx, Math.max(1, bridgePx - 8));
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);
  slabGrid = solidifyInsideOuterBoundary(slabGrid, w, h);
  slabGrid = mergeMaskToSingleComponent(slabGrid, w, h);
  if (countMaskComponents(slabGrid, w, h) > 1 && stoneRough < 0.38) {
    slabGrid = convexHullFillFromMask(slabGrid, w, h);
  }
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);
  const blurPx = Math.max(0, Math.round(16 * morphKeep));
  if (blurPx > 0) slabGrid = dilateMaskGridBlur(slabGrid, w, h, blurPx);
  const erodePx = Math.max(0, Math.round(3 * morphKeep));
  if (erodePx > 0) slabGrid = erodeMaskGrid(slabGrid, w, h, erodePx);
  const spurCut = l3TubeRadius(style3) * 2.6 * (0.5 + morphKeep * 0.5);
  slabGrid = pruneThinMaskSpurs(slabGrid, w, h, spurCut);
  return { grid: slabGrid, w, h, maskOrigin, pierceHoleMask };
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

  const stoneStyle = stoneVectorStyle2(style2);
  polylines = perturbPolylinesForStoneShape(polylines, stoneStyle, style3);
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

/** Q1 emboss paths — same placement as repoussé relief. */
function collectEmbossPolylinesForMetal(rootSvg, stoneSlabMask, style3, questionnaire) {
  const embossEl = rootSvg.querySelector('.layer-metal-emboss');
  if (!embossEl || !stoneSlabMask?.maskOrigin) return null;

  const embossPat = questionnaire?.metalEmbossPattern;
  let { polylines } = collectGlyphLayerPolylines(embossEl, rootSvg, style3);
  if (!polylines.length) return null;

  const embossPlacement = {
    ...SLAB_METAL_EMBOSS_PLACEMENT,
    fit: SLAB_METAL_EMBOSS_PLACEMENT.fit * (embossPat?.embossScale ?? 1),
  };
  return transformPolylinesToBox(
    polylines,
    sceneTextBox(stoneSlabMask.maskOrigin, embossPlacement),
    embossPlacement.fit
  );
}

/** Metal sheet — small emboss footprint + uniform halo ring (emboss + wrap). */
function rasterizeMetalEmbossPlateMask(rootSvg, stoneSlabMask, style3, questionnaire) {
  const polylines = collectEmbossPolylinesForMetal(rootSvg, stoneSlabMask, style3, questionnaire);
  if (!polylines?.length || !stoneSlabMask?.grid) return null;

  const { w, h, maskOrigin } = stoneSlabMask;
  const reliefStroke = REPOUSSE_FIELD_DEFAULTS.reliefStroke ?? 20;
  const reliefBlur = REPOUSSE_FIELD_DEFAULTS.reliefGridBlur ?? 2;

  let { grid: strokeGrid } = rasterizePolylinesToGrid(polylines, reliefStroke, maskOrigin);
  if (reliefBlur > 0) {
    strokeGrid = dilateMaskGridBlur(strokeGrid, w, h, Math.round(reliefBlur * MASK_SCALE));
  }
  let embossFootprint = closeStrokeMaskGrid(
    strokeGrid,
    w,
    h,
    Math.round(4 * MASK_SCALE),
    Math.round(2 * MASK_SCALE)
  );

  const wrapPx = Math.max(2, Math.round(METAL_SHEET_WRAP_MARGIN_SCENE * MASK_SCALE));
  const distOut = distanceToMaskGrid(embossFootprint, w, h);
  const outerGrid = new Uint8Array(w * h);
  for (let i = 0; i < outerGrid.length; i++) {
    outerGrid[i] = embossFootprint[i] || distOut[i] <= wrapPx ? 1 : 0;
  }

  let filled = 0;
  for (let i = 0; i < outerGrid.length; i++) filled += outerGrid[i];
  if (filled < 40) return null;

  return { grid: outerGrid, w, h, maskOrigin, fromEmboss: true, reliefGrid: embossFootprint };
}

/**
 * Q1 ceramic tubes — stone slab extension + bezel seat/collar (metal sits inside stone).
 */
function buildCeramicQ1StoneWrapIntegration(rootSvg, slabMask, style3, style2, stoneTubeR) {
  const polylines = collectCeramicQ1TubePolylines(rootSvg, slabMask, style3);
  if (!polylines.length || !slabMask?.grid) return null;

  const tubeR = ceramicQ1TubeRadius(style3);
  const { w, h, maskOrigin } = slabMask;
  const strokeScene = tubeR * 2.12;
  const { grid: tubeGrid } = rasterizePolylinesToGrid(polylines, strokeScene, maskOrigin);

  const wrapPx = Math.max(2, Math.round(METAL_SHEET_WRAP_MARGIN_SCENE * MASK_SCALE * 1.2));
  const distOut = distanceToMaskGrid(tubeGrid, w, h);
  const outerGrid = new Uint8Array(w * h);
  for (let i = 0; i < outerGrid.length; i++) {
    outerGrid[i] = tubeGrid[i] || distOut[i] <= wrapPx ? 1 : 0;
  }

  const ceramicMask = { grid: outerGrid, w, h, maskOrigin, fromEmboss: true };
  const roundR = stoneTubeR * 1.25;
  const metalHaloWrap = buildMetalHaloWrapParams(ceramicMask, stoneTubeR);
  if (metalHaloWrap) {
    metalHaloWrap.wrapBand = roundR * 2.72;
    metalHaloWrap.collarH = stoneTubeR * 0.74;
    metalHaloWrap.seatDepth = roundR * 0.58;
  }
  return {
    ceramicMask,
    metalHaloWrap,
    metalBedSegments: buildStrokeSegments(polylines, 84),
    metalBedTubeR: tubeR,
    metalBedDepth: roundR * 0.46,
    metalBedShoulder: roundR * 0.36,
    distToMetal: distanceToMaskGrid(tubeGrid, w, h),
  };
}

/** Union stone slab with dilated metal plate so metal never floats past stone edge. */
function expandStoneSlabToContainMetal(slabGrid, w, h, metalPlateMask, marginScene) {
  if (!metalPlateMask?.grid || metalPlateMask.grid.length !== slabGrid.length) return slabGrid;
  const marginPx = Math.max(3, Math.round(marginScene * MASK_SCALE));
  const metalPad = dilateMaskGrid(metalPlateMask.grid, w, h, marginPx);
  let out = new Uint8Array(slabGrid.length);
  for (let i = 0; i < out.length; i++) out[i] = slabGrid[i] || metalPad[i] ? 1 : 0;
  out = dilateMaskGridBlur(out, w, h, Math.round(3 * MASK_SCALE));
  out = fillMaskInteriorHoles(out, w, h);
  return out;
}

/** Stone seat + collar wrapping the metal halo (mask-based, not ellipse). */
function buildMetalHaloWrapParams(metalPlateMask, stoneTubeR) {
  if (!metalPlateMask?.grid || !metalPlateMask.fromEmboss) return null;
  const { grid, w, h, maskOrigin } = metalPlateMask;
  const distIn = distanceTransform(grid, w, h);
  const distOut = distanceToMaskGrid(grid, w, h);
  const roundR = stoneTubeR * 1.02;
  return {
    grid,
    w,
    h,
    maskOrigin,
    distIn,
    distOut,
    seatDepth: roundR * 0.5,
    collarH: stoneTubeR * 0.62,
    maxH: stoneTubeR * 1.08,
    roundR,
    wrapBand: roundR * 2.35,
  };
}

/** L3 tube radius — exact copy from three-pbr-amulet-saved-roughness.js (fixed L3_STROKE_WIDTH). */
function savedRoughnessL3TubeRadius(style3) {
  const gender = style3?.gender || 'female';
  if (gender === 'nonbinary') return L3_STROKE_WIDTH * 0.52;
  if (gender === 'male') return L3_STROKE_WIDTH * 0.42;
  return L3_STROKE_WIDTH * 0.5;
}

/** Sample L3 paths — exact copy from saved-roughness (no domePad / cap extension). */
function collectCeramicSavedRoughnessPolylines(layerEl, rootSvg) {
  const polylines = [];
  const add = (pts, closed) => {
    if (pts.length >= 2) polylines.push({ pts, closed });
  };
  layerEl.querySelectorAll('path').forEach((el) => add(samplePath(el, rootSvg), false));
  layerEl.querySelectorAll('circle').forEach((el) => add(sampleCircle(el, rootSvg), true));
  layerEl.querySelectorAll('ellipse').forEach((el) => add(sampleEllipse(el, rootSvg), true));
  return polylines;
}

/** L3 mask raster — exact copy from saved-roughness (L3_STROKE_WIDTH stroke, round caps). */
function rasterizeCeramicSavedRoughnessMaskCanvas(polylines, maskOrigin) {
  const w = Math.max(64, Math.ceil((maskOrigin.maxX - maskOrigin.minX) * MASK_SCALE));
  const h = Math.max(64, Math.ceil((maskOrigin.maxY - maskOrigin.minY) * MASK_SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = L3_STROKE_WIDTH * MASK_SCALE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const toCanvas = (v) => ({
    x: (v.x - maskOrigin.minX) * MASK_SCALE,
    y: (maskOrigin.maxY - v.y) * MASK_SCALE,
  });

  for (const { pts, closed } of polylines) {
    if (pts.length < 2) continue;
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
  return canvas;
}

/** L3 dome height — exact copy from saved-roughness. */
function savedRoughnessCeramicDomeHeight(distPx, radiusScene) {
  const d = distPx / MASK_SCALE;
  const dd = Math.min(d, radiusScene);
  const h = Math.sqrt(Math.max(0, radiusScene * radiusScene - (radiusScene - dd) * (radiusScene - dd)));
  return h * 0.92;
}

/** L3 organic displacement — exact copy from saved-roughness (4-arg L3 call path). */
function applySavedRoughnessCeramicOrganicDisplacement(geom, gender, tubeRadius, ageNum) {
  const pos = geom.attributes.position;
  const normal = geom.attributes.normal;
  const rough = 0.5;
  const age = Math.max(1, Math.min(120, Number(ageNum) || 25));
  const ageAmp = 0.1 + (age / 120) * 4.0;
  const ageFactor = ageAmp / 4;
  const amp = tubeRadius * ageFactor * rough * 0.5;
  const freq = 0.04 + ageFactor * 0.16;

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
    pos.setXYZ(i, x + nx * n * amp, y + ny * n * amp, z + nz * n * amp);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
}

/** L3 inflated mesh — exact copy from saved-roughness buildInflatedMeshFromMask. */
function buildSavedRoughnessCeramicInflatedMesh(grid, w, h, style3, ageNum, maskOrigin, smooth = false) {
  const radius = savedRoughnessL3TubeRadius(style3);
  const dist = distanceTransform(grid, w, h);
  const step = MASK_MESH_STEP;
  const vertMap = new Map();
  const positions = [];

  const vertKey = (x, y) => x + ',' + y;
  const addVertex = (x, y) => {
    const key = vertKey(x, y);
    if (vertMap.has(key)) return vertMap.get(key);
    const i = y * w + x;
    const z = savedRoughnessCeramicDomeHeight(dist[i], radius);
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

  if (!smooth) {
    const gender = style3?.gender || 'female';
    applySavedRoughnessCeramicOrganicDisplacement(geom, gender, radius, ageNum);
    geom.computeVertexNormals();
  }
  return geom;
}

/** Q1 ceramic mask — saved-roughness L3 pipeline, placed on stone slab. */
function buildCeramicQ1SavedRoughnessMask(rootSvg, stoneSlabMask, style3) {
  const el = rootSvg.querySelector('.layer-q1-ceramic') || rootSvg.querySelector('.layer-3');
  if (!el || !stoneSlabMask?.maskOrigin) return null;

  let polylines = collectCeramicSavedRoughnessPolylines(el, rootSvg);
  if (!polylines.length) return null;

  const placement = SLAB_Q1_CERAMIC_PLACEMENT;
  const box = sceneTextBox(stoneSlabMask.maskOrigin, placement);
  polylines = transformPolylinesToBox(polylines, box, placement.fit);

  const maskOrigin = stoneSlabMask.maskOrigin;
  const canvas = rasterizeCeramicSavedRoughnessMaskCanvas(polylines, maskOrigin);
  const { grid, w, h } = readMaskGrid(canvas);

  let filled = 0;
  for (let i = 0; i < grid.length; i++) filled += grid[i];
  if (filled < 40) return null;

  return { grid, w, h, maskOrigin };
}

function resolveMetalPlateMask(rootSvg, stoneSlabMask, style3, questionnaire) {
  return (
    rasterizeMetalEmbossPlateMask(rootSvg, stoneSlabMask, style3, questionnaire) ??
    rasterizeMetalEllipseMask(stoneSlabMask, questionnaire?.metalPlateParams)
  );
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
    return rasterizeProceduralStoneMask(stoneShapeParams, style3, style2);
  }
  const l3El = rootSvg.querySelector('.layer-3');
  if (!l3El) return rasterizeFrameInteriorMask(rootSvg, style3);

  const l3Pack = collectLayer3Polylines(l3El, rootSvg, style3);
  const l3Polys = perturbPolylinesForStoneShape(l3Pack.polylines, style2, style3);
  const morphKeep = stoneSlabMorphKeep(style2);
  const wrapPad = l3TubeRadius(style3) * 3.8 + SLAB_WRAP_MARGIN_SCENE;
  const maskOrigin = maskBoundsFromPolylines(l3Polys, wrapPad);
  if (!maskOrigin) return rasterizeFrameInteriorMask(rootSvg, style3);

  const wrapStroke = l3Pack.strokeScene * SLAB_WRAP_STROKE_MUL;
  const { grid: unionGrid, w, h } = rasterizePolylinesToGrid(l3Polys, wrapStroke, maskOrigin);

  let filled = 0;
  for (let i = 0; i < unionGrid.length; i++) filled += unionGrid[i];
  if (filled < 40) return rasterizeFrameInteriorMask(rootSvg, style3);

  const dilatePx = Math.round(
    (L3_MORPH_DILATE_PX + STONE_L3_EXTRA_DILATE_PX + STONE_FUSE_DILATE_PX + SLAB_WRAP_EXTRA_DILATE_PX) *
      morphKeep
  );
  let slabGrid = dilateMaskGrid(unionGrid, w, h, dilatePx);
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);

  const bridgePx = Math.round(SLAB_PLATE_BRIDGE_SCENE * MASK_SCALE * morphKeep);
  slabGrid = closeStrokeMaskGrid(slabGrid, w, h, bridgePx, Math.max(1, bridgePx - 4));
  slabGrid = fillMaskInteriorHoles(slabGrid, w, h);
  slabGrid = solidifyInsideOuterBoundary(slabGrid, w, h);
  slabGrid = dilateMaskGrid(slabGrid, w, h, Math.max(1, Math.round(5 * MASK_SCALE * morphKeep)));

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
  if (isFrame) {
    const rough = style2 ? frameRoughnessFromStyle2(style2) : 0.5;
    if (rough < 0.02) return 40;
    if (rough >= 0.95) return 6;
    if (rough >= 0.72) return 8;
    if (rough >= 0.5) return 12;
    if (rough >= 0.28) return 20;
    return 32;
  }
  const key = style2?.occupationKey;
  if (key === 'tech_finance') return 40;
  const smooth = OCCUPATION_SMOOTHNESS[key] ?? 0.5;
  const rough = 1 - smooth;
  if (rough >= 0.95) return 6;
  if (rough >= 0.7) return 8;
  if (rough >= 0.5) return 10;
  if (rough >= 0.3) return 16;
  return 22;
}

function buildStrokeCurve(
  pts,
  style3,
  straight,
  occupationKey,
  isFrame = false,
  frameRoughOverride = null,
  closedCurve = false,
  curveAmpMul = 1
) {
  if (pts.length < 2) return null;
  const unique = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].distanceTo(pts[i - 1]) > 0.05) unique.push(pts[i]);
  }
  if (unique.length < 2) return null;

  const ampMul = Math.max(1, curveAmpMul);
  const sharpFrame =
    isFrame && frameRoughOverride != null && frameRoughOverride >= 0.85 && ampMul <= 1.05;

  if (straight || sharpFrame) {
    return new THREE.CatmullRomCurve3(unique, closedCurve, 'centripetal', 0.02);
  }

  const rough =
    isFrame && frameRoughOverride != null
      ? frameRoughOverride
      : occupationKey != null
        ? 1 - (OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5)
        : 0;
  const effectiveRough = ampMul > 1.05 ? Math.min(1, rough * 0.75 + (ampMul - 1) * 0.22) : rough;
  const smoothPasses = isFrame
    ? effectiveRough > 0.08
      ? Math.max(0, Math.round((2 - effectiveRough * 2) / ampMul))
      : FRAME_CURVE_CHAIKIN_PASSES + (effectiveRough <= 0.06 ? 2 : 1)
    : Math.max(0, Math.round((6 - effectiveRough * 5) / ampMul));
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
    !isFrame && occupationKey != null
      ? baseAmp * (0.08 + effectiveRough * 0.55) * ampMul
      : !isFrame
        ? baseAmp * 0.5 * ampMul
        : 0;
  for (let i = 1; i < nPts - 1; i++) {
    const t = i / (nPts - 1);
    const x = s[i].x;
    const y = s[i].y;
    let dx = 0;
    let dy = 0;
    if (!isFrame) {
      const n = Math.sin(x * 0.08 + y * 0.13) * Math.cos(y * 0.11 - x * 0.07);
      const n2 = Math.sin(x * 0.21 - y * 0.17) * 0.45;
      dx = (n + n2) * pathAmp;
      dy = (n * 0.8 + n2 * 0.55) * pathAmp;
    } else if (effectiveRough > 0.08) {
      const twistAmp = baseAmp * (0.04 + effectiveRough * 0.12) * ampMul * 1.75;
      const curl =
        Math.sin(t * Math.PI * 2 * (0.9 + effectiveRough * 1.1)) *
        Math.cos(t * Math.PI * (1.8 + effectiveRough * 1.8) + effectiveRough * 1.1);
      const spike = Math.sin(t * Math.PI * (4.2 + effectiveRough * 3.5) + effectiveRough) * 0.32;
      dx = (curl + spike) * twistAmp;
      dy = (Math.sin(t * Math.PI * 2.5 + effectiveRough * 0.6) * 0.48 + spike * 0.22) * twistAmp;
    }
    s[i].x += dx;
    s[i].y += dy;
  }
  if (isFrame && effectiveRough <= 0.35 && ampMul <= 1.05) {
    const cent = FRAME_CURVE_CENTRIPETAL + (1 - effectiveRough) * 0.22;
    return new THREE.CatmullRomCurve3(s, closedCurve, 'centripetal', cent);
  }
  const tension = isFrame
    ? ampMul > 1.05
      ? 0.08 + effectiveRough * 0.38
      : 0.28
    : occupationKey != null
      ? 0.02 + effectiveRough * 0.46
      : 0.5;
  return new THREE.CatmullRomCurve3(s, false, 'catmullrom', tension);
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  return len;
}

/** Smooth gentle arcs on a closed contour while pinning sharp corner vertices. */
function smoothClosedContourOrganic(pts, cornerAngleRad = 0.48, passes = 2, blend = 0.58) {
  if (pts.length < 4) return pts;
  const n = pts.length;
  const sharp = new Array(n);
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    sharp[i] = contourTurnAngleRad(prev, cur, next) >= cornerAngleRad;
  }
  let s = pts.map((p) => p.clone());
  for (let pass = 0; pass < passes; pass++) {
    const next = s.map((p) => p.clone());
    for (let i = 0; i < n; i++) {
      if (sharp[i]) continue;
      const prev = s[(i - 1 + n) % n];
      const cur = s[i];
      const follow = s[(i + 1) % n];
      const ax = (prev.x + cur.x * 2 + follow.x) / 4;
      const ay = (prev.y + cur.y * 2 + follow.y) / 4;
      next[i].x = cur.x + (ax - cur.x) * blend;
      next[i].y = cur.y + (ay - cur.y) * blend;
    }
    s = next;
  }
  return s;
}

/**
 * Taper open tube ends to a fine point (tail) or a rounded dome cap.
 * @param {'tail'|'round'} mode
 */
function applyTubeEndStyle(geom, curve, tubularSegs, radialSegs, closed, mode = 'tail', endFrac = 0.22) {
  if (closed || !mode || mode === 'none') return;
  const pos = geom.attributes.position;
  const rings = tubularSegs + 1;
  const vertsPerRing = radialSegs + 1;
  const taperLen = Math.max(0.08, Math.min(0.34, endFrac));
  const centerAt = (ring) => {
    const p = curve.getPointAt(ring / tubularSegs);
    return new THREE.Vector3(p.x, p.y, p.z);
  };
  const scaleAt = (t) => {
    if (t >= taperLen && t <= 1 - taperLen) return 1;
    const u = t < taperLen ? t / taperLen : (1 - t) / taperLen;
    const ease = u * u * (3 - 2 * u);
    if (mode === 'round') return Math.sin(ease * Math.PI * 0.5);
    return ease;
  };
  for (let ring = 0; ring < rings; ring++) {
    const scale = scaleAt(ring / tubularSegs);
    if (scale >= 0.999) continue;
    const center = centerAt(ring);
    for (let j = 0; j < vertsPerRing; j++) {
      const idx = ring * vertsPerRing + j;
      pos.setXYZ(
        idx,
        center.x + (pos.getX(idx) - center.x) * scale,
        center.y + (pos.getY(idx) - center.y) * scale,
        center.z + (pos.getZ(idx) - center.z) * scale
      );
    }
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingSphere();
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
  isFrame = false,
  frameRoughOverride = null,
  frameAmpMul = 1,
  spikyUpperLayer = false
) {
  const pos = geom.attributes.position;
  const normal = geom.attributes.normal;
  if (!occupationKey && metalLayer && !isFrame) return;
  if (occupationKey === 'tech_finance' && !isFrame && !spikyUpperLayer) return;

  const rough =
    isFrame && frameRoughOverride != null
      ? frameRoughOverride
      : isFrame
        ? frameRoughnessFromStyle2({ frameSmoothness: 1 - (frameRoughOverride ?? 0.5) })
        : 1 - (OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5);
  if (!isFrame && rough < 0.02 && !spikyUpperLayer) return;
  const age = Math.max(1, Math.min(120, Number(ageNum) || 25));
  const ageAmp = 0.1 + (age / 120) * 4.0;
  let amp;
  let freq;

  if (isFrame) {
    const frameRough = frameRoughOverride ?? rough;
    const spikeScale = spikyUpperLayer ? rough * rough : 1;
    const ampScale = (0.55 + Math.min(1, frameAmpMul) * 0.75) * (spikyUpperLayer ? 0.85 + spikeScale * 1.15 : 1);
    amp = tubeRadius * (frameRough * 0.55 + 0.1) * ampScale;
    freq = 0.016 + frameRough * 0.16;
    if (spikyUpperLayer) {
      freq *= 1 + spikeScale * 0.45;
      amp *= 0.75 + spikeScale * 0.85;
    }
  } else if (metalLayer) {
    const spikeScale = spikyUpperLayer ? rough * rough : 1;
    const occMul = rough * (spikyUpperLayer ? 1.8 + spikeScale * 1.55 : 2.8);
    amp =
      (gender === 'female' ? tubeRadius * 0.3 : gender === 'male' ? tubeRadius * 0.2 : tubeRadius * 0.25) *
      ageAmp *
      occMul;
    if (spikyUpperLayer) amp *= 0.65 + spikeScale * 0.75;
    freq = 0.015 + rough * 0.2 + (age / 120) * 0.08;
    if (spikyUpperLayer) freq *= 1 + spikeScale * 0.35;
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

/** Join open SVG paths at shared endpoints — one continuous tube mass (smooth Q1 corners). */
function mergeConnectedPolylines(polylines, snapScene = 14) {
  const closed = [];
  const open = [];
  for (const pl of polylines) {
    if (!pl?.pts || pl.pts.length < 2) continue;
    if (pl.closed) closed.push({ pts: pl.pts.slice(), closed: true });
    else open.push({ pts: pl.pts.slice(), closed: false });
  }
  if (open.length <= 1) return [...closed, ...open];

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  let changed = true;
  while (changed && open.length > 1) {
    changed = false;
    outer: for (let i = 0; i < open.length; i++) {
      const a = open[i].pts;
      for (let j = i + 1; j < open.length; j++) {
        const b = open[j].pts;
        const joins = [
          [a.length - 1, b, 0, false],
          [a.length - 1, b, b.length - 1, true],
          [0, b, 0, true],
          [0, b, b.length - 1, false],
        ];
        for (const [ai, bp, bi, reverse] of joins) {
          if (dist(a[ai], bp[bi]) > snapScene) continue;
          const ext = reverse ? bp.slice().reverse() : bp;
          open[i] =
            ai === a.length - 1
              ? { pts: [...a, ...ext.slice(1)], closed: false }
              : { pts: [...ext.slice(0, -1), ...a], closed: false };
          open.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return [...closed, ...open];
}

/** Round sharp bends with a quadratic fillet before tube extrusion. */
function appendFilletArc(out, prev, cur, next, filletR, angle) {
  const v1x = cur.x - prev.x;
  const v1y = cur.y - prev.y;
  const v2x = next.x - cur.x;
  const v2y = next.y - cur.y;
  const l1 = Math.hypot(v1x, v1y) || 1;
  const l2 = Math.hypot(v2x, v2y) || 1;
  const u1x = v1x / l1;
  const u1y = v1y / l1;
  const u2x = v2x / l2;
  const u2y = v2y / l2;
  const half = Math.max(0.08, angle / 2);
  let d = filletR / Math.tan(half);
  d = Math.min(d, l1 * 0.44, l2 * 0.44);
  const p1 = new THREE.Vector3(cur.x - u1x * d, cur.y - u1y * d, cur.z ?? 0);
  const p2 = new THREE.Vector3(cur.x + u2x * d, cur.y + u2y * d, cur.z ?? 0);
  if (!out.length || out[out.length - 1].distanceTo(p1) > 0.05) out.push(p1);
  const steps = Math.max(4, Math.ceil(angle * 5));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const mt = 1 - t;
    out.push(
      new THREE.Vector3(
        mt * mt * p1.x + 2 * mt * t * cur.x + t * t * p2.x,
        mt * mt * p1.y + 2 * mt * t * cur.y + t * t * p2.y,
        mt * mt * (p1.z ?? 0) + 2 * mt * t * (cur.z ?? 0) + t * t * (p2.z ?? 0)
      )
    );
  }
  out.push(p2);
}

function filletPolylineCorners(pts, closed, filletR, maxAngle = 2.35) {
  const n = pts.length;
  if (n < 3 || filletR <= 0) return pts.map((p) => p.clone());
  const out = [];
  if (closed) {
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const cur = pts[i];
      const next = pts[(i + 1) % n];
      const angle = contourTurnAngleRad(prev, cur, next);
      if (angle < maxAngle) appendFilletArc(out, prev, cur, next, filletR, angle);
      else out.push(cur.clone());
    }
    return out.length >= 3 ? out : pts.map((p) => p.clone());
  }
  out.push(pts[0].clone());
  for (let i = 1; i < n - 1; i++) {
    const prev = pts[i - 1];
    const cur = pts[i];
    const next = pts[i + 1];
    const angle = contourTurnAngleRad(prev, cur, next);
    if (angle < maxAngle) appendFilletArc(out, prev, cur, next, filletR, angle);
    else out.push(cur.clone());
  }
  out.push(pts[n - 1].clone());
  return out;
}

function roundCeramicTubePolylines(polylines, tubeRadius) {
  const filletR = tubeRadius * 0.55;
  return polylines.map(({ pts, closed }) => ({
    closed,
    pts: filletPolylineCorners(pts, closed, filletR, 2.45),
  }));
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
  xyScale = 1,
  tagQ1Ceramic = false,
  tagQ5Material = false,
  skipOrganicDisplacement = false,
  straightTubes = false,
  tubeEndStyle = 'none',
  radialSegsOverride = null,
  tubeEndFrac = null
) {
  if (pts.length < 2) return false;
  const upperRough = style2?.__upperLayerRough ?? occupationRoughness(style2);
  const spikyUpper = style2?.__spikyUpperLayer === true && upperRough >= 0.14;
  const occupationKey = style2?.occupationKey ?? style2?.occupation ?? null;
  const upperCeramic = tagQ1Ceramic || tagQ5Material;
  const useStraight = upperCeramic && upperRough < 0.1;
  const curveIsFrame = isFrame && !spikyUpper;
  const isL2Metal = !!style2 && !curveIsFrame;
  const polishedL2 = isL2Metal && occupationKey === 'tech_finance' && !spikyUpper;
  const frameRough = curveIsFrame || spikyUpper ? frameRoughnessFromStyle2(style2) : null;
  const curveAmpMul = spikyUpper ? 1 + upperRough * 0.82 : 1;
  const curve = buildStrokeCurve(
    pts,
    style3,
    polishedL2 || straightTubes || useStraight,
    straightTubes || useStraight ? null : occupationKey,
    curveIsFrame,
    frameRough,
    closed,
    curveAmpMul
  );
  if (!curve) return false;
  if (closed) curve.closed = true;
  const pathLen = polylineLength(pts);
  const tubularSegs = curveIsFrame || spikyUpper
    ? Math.min(520, Math.max(72, Math.ceil(pathLen / (spikyUpper ? 0.95 : 1.15))))
    : Math.min(400, Math.max(48, Math.ceil(pathLen / 2)));
  const gender = style3?.gender || 'female';
  const base = isFrame
    ? frameTubeBaseRadius(style3)
    : gender === 'nonbinary'
      ? TUBE_RADIUS * 2.2
      : gender === 'male'
        ? TUBE_RADIUS * 1.4
        : TUBE_RADIUS * 0.7;
  const radius = base * radiusScale;
  const radialSegs =
    radialSegsOverride ??
    (style2
      ? metalRadialSegs(style2, style3, curveIsFrame)
      : polishedL2
        ? 40
        : curveIsFrame
          ? gender === 'nonbinary'
            ? 10
            : gender === 'male'
              ? 4
              : 26
          : gender === 'nonbinary'
            ? 4
            : gender === 'male'
              ? 10
              : 26);
  const geom = new THREE.TubeGeometry(curve, tubularSegs, radius, radialSegs, closed);
  const endStyle =
    tubeEndStyle !== 'none'
      ? tubeEndStyle
      : !closed && (tagQ5Material || tagQ1Ceramic)
        ? 'tail'
        : 'none';
  if (endStyle !== 'none') {
    const endFrac = tubeEndFrac ?? (endStyle === 'round' ? 0.3 : 0.22);
    applyTubeEndStyle(geom, curve, tubularSegs, radialSegs, closed, endStyle, endFrac);
  }
  const frameAmpMul = curveIsFrame ? style2?.frameContour?.wobbleMix ?? 1 : 1;
  const smooth = curveIsFrame
    ? frameSmoothnessFromStyle2(style2)
    : style2?.occupationSmoothness ??
      (occupationKey ? OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5 : 0.5);
  const skipDisp =
    polishedL2 ||
    straightTubes ||
    useStraight ||
    skipOrganicDisplacement ||
    smooth >= 0.92 ||
    (spikyUpper && upperRough < 0.14);
  const dispIsFrame = curveIsFrame && !spikyUpper;
  const dispMetalLayer = (spikyUpper && upperRough >= 0.14) || isL2Metal || dispIsFrame;
  if (!skipDisp && (occupationKey || dispIsFrame || (spikyUpper && upperRough >= 0.14))) {
    applyOrganicDisplacement(
      geom,
      gender,
      radius,
      ageNum,
      occupationKey,
      dispMetalLayer,
      style3?.surfaceScale,
      dispIsFrame,
      frameRough,
      frameAmpMul,
      spikyUpper && upperRough >= 0.14
    );
  }
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.z = z;
  if (xyScale !== 1) mesh.scale.set(xyScale, xyScale, 1);
  mesh.renderOrder = renderOrder;
  if (tagQ1Ceramic || tagQ5Material) {
    mesh.layers.enable(CERAMIC_LIGHT_LAYER);
    mesh.userData.q5Material = true;
    if (!active.q5MaterialMeshes) active.q5MaterialMeshes = [];
    active.q5MaterialMeshes.push(mesh);
    active.ceramicMeshes = active.q5MaterialMeshes;
  }
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

function protectionFrameTubeRadius(style3, style2) {
  return frameTubeBaseRadius(style3) * UNIFIED_FRAME_TUBE_RADIUS_SCALE * frameRadiusScaleFromStyle2(style2);
}

/** Centerline offset — equal gap (SUMMONING_FRAME_PAD) between content and frame inner edge. */
function protectionFrameCenterlinePad(style3, style2) {
  return SUMMONING_FRAME_PAD + protectionFrameTubeRadius(style3, style2) + FRAME_CONTENT_CLEARANCE;
}

function unifiedFrameSmoothness(style2) {
  if (style2?.occupationSmoothness != null) return style2.occupationSmoothness;
  return style2 ? frameSmoothnessFromStyle2(style2) : 0.5;
}

/** Sample path points for unified protection frame offset (step=2, PATH_MAIN_W/2 outset). */
function samplePolylinesForFrameContour(polylines, outset = PATH_MAIN_W / 2) {
  const samples = [];
  const step = 2;
  for (const { pts, closed } of polylines) {
    if (pts.length < 2) continue;
    const segs = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < segs; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(2, Math.ceil(segLen / step));
      for (let j = 0; j < steps; j++) {
        const t = steps <= 1 ? 0 : j / (steps - 1);
        samples.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          outset,
        });
      }
    }
  }
  return samples;
}

/** Sample Q1 ceramic paths — outer envelope includes dome inflation beyond stroke half-width. */
function sampleCeramicFramePathPoints(rootSvg, stoneSlabMask, style3) {
  const el = rootSvg.querySelector('.layer-q1-ceramic') || rootSvg.querySelector('.layer-3');
  if (!el || !stoneSlabMask?.maskOrigin) return [];
  let polylines = collectCeramicSavedRoughnessPolylines(el, rootSvg);
  if (!polylines.length) return [];

  const placement = SLAB_Q1_CERAMIC_PLACEMENT;
  const box = sceneTextBox(stoneSlabMask.maskOrigin, placement);
  polylines = transformPolylinesToBox(polylines, box, placement.fit);
  return samplePolylinesForFrameContour(polylines, PATH_MAIN_W / 2 + CERAMIC_FRAME_ENVELOPE_EXTRA);
}

/** Sample Q3 metal thread paths — envelope includes tube radius so frame clears the threads. */
function sampleQ3FramePathPoints(rootSvg, stoneSlabMask, style3, style2, questionnaire = null) {
  const polylines = collectQ3LayerPolylines(
    rootSvg,
    stoneSlabMask,
    style3,
    questionnaire,
    SLAB_Q3_METAL_PLACEMENT
  );
  const tubeR = q3MetalThreadTubeRadius(style3);
  return samplePolylinesForFrameContour(polylines, PATH_MAIN_W / 2 + tubeR);
}

/**
 * 360° radial offset frame — exact values from prototype-v2-unified.html protection
 * (buildSummoningFrameContourProtection / buildSummoningFrameContourSummoning).
 */
function buildUnifiedProtectionFrameContour(cx, cy, samples, pad, style2) {
  const r = new Float64Array(360);
  for (const s of samples) {
    const dx = s.x - cx;
    const dy = s.y - cy;
    const dist = Math.hypot(dx, dy) + (s.outset ?? PATH_MAIN_W / 2);
    if (dist < 1) continue;
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const idx = Math.min(359, Math.round(deg) % 360);
    if (dist > r[idx]) r[idx] = dist;
  }
  let radii = fillRadialBins(r);
  for (let a = 0; a < 360; a++) {
    const mirror = (360 - a) % 360;
    const sym = Math.max(radii[a], radii[mirror]);
    radii[a] = sym;
    radii[mirror] = sym;
  }
  const smooth = unifiedFrameSmoothness(style2);
  const rough = 1 - smooth;
  const smoothIters = Math.max(1, Math.round(1 + smooth * 4));
  radii = smoothRadialRadii(radii, smoothIters);
  if (rough > 0.12) {
    const amp = rough * 7;
    for (let a = 0; a < 360; a++) {
      const wobble =
        Math.sin(a * (0.24 + rough * 0.2)) * 0.55 + Math.cos(a * (0.43 - rough * 0.1)) * 0.45;
      const curl =
        Math.sin(a * 0.08 + rough * 1.5) * Math.cos(a * (0.17 + rough * 0.13));
      radii[a] += (wobble * 0.5 + curl * 0.32) * amp;
    }
    radii = smoothRadialRadii(radii, rough > 0.72 ? 1 : 2);
  }
  const pts = [];
  for (let a = 0; a < 360; a++) {
    const rad = (a * Math.PI) / 180;
    const radius = radii[a] + pad;
    pts.push(new THREE.Vector3(cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius, 0));
  }
  return pts;
}

/** Union mask of ceramic footprint + Q3 metal tube envelope (same maskOrigin). */
function buildCeramicQ3UnionMaskGrid(rootSvg, stoneSlabMask, style3, style2, questionnaire = null) {
  const ceramicMask = buildCeramicQ1SavedRoughnessMask(rootSvg, stoneSlabMask, style3);
  if (!ceramicMask?.grid) return null;
  let { grid, w, h, maskOrigin } = ceramicMask;

  const domePx = Math.max(2, Math.round(CERAMIC_FRAME_ENVELOPE_EXTRA * MASK_SCALE));
  grid = dilateMaskGridBlur(grid, w, h, domePx);

  const q3Polys = collectQ3LayerPolylines(
    rootSvg,
    stoneSlabMask,
    style3,
    questionnaire,
    SLAB_Q3_METAL_PLACEMENT
  );
  if (q3Polys.length) {
    const tubeR = q3MetalThreadTubeRadius(style3);
    const q3Mask = rasterizePolylinesToGrid(q3Polys, tubeR * 2.08, maskOrigin);
    if (q3Mask.w === w && q3Mask.h === h) {
      for (let i = 0; i < grid.length; i++) grid[i] = grid[i] || q3Mask.grid[i];
    }
  }
  return { grid, w, h, maskOrigin };
}

/** Outer contour around Q3 + ceramic — morphological equal gap, frame centerline outside content. */
function buildCeramicQ3FrameContour(rootSvg, stoneSlabMask, style3, style2, questionnaire = null) {
  const mask = buildCeramicQ3UnionMaskGrid(rootSvg, stoneSlabMask, style3, style2, questionnaire);
  if (!mask?.grid) return [];

  const tubeR = protectionFrameTubeRadius(style3, style2);
  const marginScene = FRAME_EQUAL_GAP + tubeR;
  const marginPx = Math.max(6, Math.round(marginScene * MASK_SCALE));
  const dilated = dilateMaskGridBlur(mask.grid, mask.w, mask.h, marginPx);
  const ds = downsampleMaskGrid(dilated, mask.w, mask.h, SLAB_FRAME_CONTOUR_DOWNSAMPLE);
  const raw = traceLargestMaskBoundary(ds.grid, ds.w, ds.h);
  if (raw.length < 8) return [];
  let pts = raw.map((p) => slabMaskPointToScene(p.x, p.y, mask.maskOrigin, ds.step));
  pts = scalePointsFromCenter(pts, SLAB_STONE_XY_SCALE);
  return subsampleContourPts(pts, FRAME_CONTOUR_SUBSAMPLE);
}

/** Closed metal loop around Q3 + ceramic — z sits just above ceramic dome. */
function addCeramicMetalFrame(
  rootSvg,
  slabMask,
  material,
  scene,
  stoneMesh,
  renderOrder,
  style3,
  ageNum,
  style2,
  questionnaire = null
) {
  const pts = buildCeramicQ3FrameContour(rootSvg, slabMask, style3, style2, questionnaire);
  if (pts.length < 8 || !stoneMesh) return 0;
  const stoneTubeR = l3TubeRadius(style3) * STONE_L3_THICKNESS;
  const tubeR =
    frameTubeBaseRadius(style3) *
    SLAB_FRAME_TUBE_RADIUS_SCALE *
    frameRadiusScaleFromStyle2(style2);
  const z = ceramicQ1TubeZ(stoneMesh, style3, style2, stoneTubeR) + tubeR * 0.92;
  const frameStyle2 = organicSlabFrameStyle2(style2);
  const reduced = downsamplePoints(pts, SLAB_FRAME_TUBE_MAX_PTS);
  return addTubeFromPoints(
    reduced,
    material,
    scene,
    z,
    renderOrder,
    style3,
    ageNum,
    true,
    SLAB_FRAME_TUBE_RADIUS_SCALE * frameRadiusScaleFromStyle2(style2),
    frameStyle2,
    true,
    1,
    true,
    true,
    true,
    false,
    'none'
  )
    ? 1
    : 0;
}

/** Closed metal loop — equal gap outside stone silhouette (follows Q6 vector spikes). */
function addStoneSlabMetalFrame(
  slabMask,
  material,
  scene,
  z,
  renderOrder,
  style3,
  ageNum,
  style2,
  stoneMesh = null,
  rootSvg = null,
  questionnaire = null
) {
  const stoneRough = stoneRoughnessFromStyle(style2);
  const frameStyle2 = stoneMatchedFrameStyle2(style2);
  let pts = [];
  if (stoneMesh?.geometry?.attributes?.position?.count > 0) {
    pts = buildStoneMeshFrameContour(stoneMesh, style3, frameStyle2, slabMask);
  } else if (slabMask?.grid?.some((v) => v)) {
    pts = buildSlabStoneFrameContour(slabMask, style3, frameStyle2);
  } else if (rootSvg) {
    pts = buildSlabEqualGapFrameContour(rootSvg, slabMask, style3, frameStyle2, questionnaire);
  }
  if (pts.length < 8 && slabMask?.grid?.some((v) => v)) {
    pts = buildSlabStoneFrameContour(slabMask, style3, frameStyle2);
  }
  if (pts.length < 8) return 0;
  const contour =
    stoneRough > 0.28 ? pts : smoothClosedContourOrganic(pts, 0.34, 1, 0.48);
  const reduced = downsamplePoints(contour, SLAB_FRAME_TUBE_MAX_PTS);
  const skipDisp = stoneRough < 0.12;
  const frameZ = stoneMesh ? slabFrameBackZ(stoneMesh, style3, style2) : (z ?? slabFrameBackZ(null, style3, style2));

  return addTubeFromPoints(
    reduced,
    material,
    scene,
    frameZ,
    renderOrder ?? FRAME_RENDER_ORDER,
    style3,
    ageNum,
    true,
    SLAB_FRAME_TUBE_RADIUS_SCALE * frameRadiusScaleFromStyle2(style2),
    frameStyle2,
    true,
    1,
    true,
    true,
    skipDisp,
    false,
    'none'
  )
    ? 1
    : 0;
}

function tryFrameTube(pts, material, scene, z, renderOrder, style3, ageNum, style2) {
  if (pts.length < 2) return false;
  const reduced = downsamplePoints(pts, 160);
  const smoothStyle2 = softenMetalStyle2(style2);
  return addTubeFromPoints(reduced, material, scene, z, renderOrder, style3, ageNum, true, 1.15 * frameRadiusScaleFromStyle2(style2), smoothStyle2, true);
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
function addFrameRing(mount, material, scene, z, renderOrder, style3, ageNum, style2, stoneMesh = null) {
  const strokePad = combinedContentStrokePad(style2, style3);
  const frameRoot = mount.querySelector('.layer-frame');
  const intent = frameRoot?.getAttribute('data-intent') || style3?.intent || 'protection';
  const anchorEl = mount.querySelector('.layer-2') || mount.querySelector('.layer-3');
  const frameZ = stoneMesh ? slabFrameBackZ(stoneMesh, style3, style2) : (z ?? slabFrameBackZ(null, style3, style2));
  const frameOrder = renderOrder ?? FRAME_RENDER_ORDER;

  const pathEl = mount.querySelector('.layer-frame path');
  if (pathEl) {
    let pts = sampleGeometryLength(pathEl, mount);
    if (pts.length < 2) pts = samplePath(pathEl, mount);
    if (tryFrameTube(pts, material, scene, frameZ, frameOrder, style3, ageNum, style2)) return 1;
  }

  const circleEl = mount.querySelector('.layer-frame circle');
  if (circleEl) {
    let pts = sampleGeometryLength(circleEl, mount);
    if (pts.length < 2) pts = sampleCircle(circleEl, mount);
    if (tryFrameTube(pts, material, scene, frameZ, frameOrder, style3, ageNum, style2)) return 1;
  }

  if (intent === 'summoning') {
    console.warn('[pbr] summoning frame path missing or invalid');
    return 0;
  }
  const bb = unionLayersBBox(mount);
  if (!bb) return 0;
  const r = Math.max(bb.halfW, bb.halfH) + strokePad + FRAME_PAD + 12;
  const pts = scenePointsOnCircle(mount, anchorEl, bb.cx, bb.cy, r);
  return tryFrameTube(pts, material, scene, frameZ, frameOrder, style3, ageNum, style2) ? 1 : 0;
}

/** Metal tubes from pre-transformed polylines (wish layer positioned on stone). */
function addTubesFromPolylines(polylines, material, scene, z, renderOrder, style3, ageNum, style2, opts = {}) {
  if (!polylines?.length) return 0;
  const xyScale = opts.xyScale ?? 1;
  const radiusScale = opts.radiusScale ?? 1;
  const isFrame = opts.isFrame ?? false;
  const tagQ1Ceramic = opts.tagQ1Ceramic ?? false;
  const tagQ5Material = opts.tagQ5Material ?? tagQ1Ceramic;
  const skipOrganicDisplacement = opts.skipOrganicDisplacement ?? false;
  const straightTubes = opts.straightTubes ?? false;
  const tubeEndStyle = opts.tubeEndStyle ?? 'none';
  const radialSegsOverride = opts.radialSegs ?? null;
  const tubeEndFrac = opts.tubeEndFrac ?? null;
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
        isFrame,
        xyScale,
        tagQ1Ceramic,
        tagQ5Material,
        skipOrganicDisplacement,
        straightTubes,
        tubeEndStyle,
        radialSegsOverride,
        tubeEndFrac
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
  const embossPolylines = collectEmbossPolylinesForMetal(rootSvg, stoneSlabMask, style3, questionnaire);
  if (!embossPolylines?.length) return null;

  const embossPat = questionnaire?.metalEmbossPattern;

  return {
    plateMask: metalPlateMask ?? null,
    stoneSlabMask,
    shapePolylines: [],
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
  const metalPlateMask = resolveMetalPlateMask(
    rootSvg,
    stoneSlabMask,
    style3,
    questionnaire
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
  return rasterizeProceduralStoneMask(stoneShapeParams, style3, style2);
}

/** Contact-shadow field from metal ellipse plate onto stone beneath. */
function metalSheetContactDist(metalPlateMask) {
  if (!metalPlateMask?.grid) return null;
  const { grid, w, h } = metalPlateMask;
  if (!grid.some((v) => v)) return null;
  return distanceToMaskGrid(grid, w, h);
}

/** Q1 connected glyphs → polylines for thick metal-style tubes on stone front. */
function collectCeramicQ1TubePolylines(rootSvg, stoneSlabMask, style3) {
  const el = rootSvg.querySelector('.layer-q1-ceramic') || rootSvg.querySelector('.layer-3');
  if (!el || !stoneSlabMask?.maskOrigin) return [];
  let polylines = collectCeramicSavedRoughnessPolylines(el, rootSvg);
  if (!polylines.length) return [];
  polylines = mergeConnectedPolylines(polylines, l3TubeRadius(style3) * 1.05);
  const placement = SLAB_Q1_CERAMIC_PLACEMENT;
  const box = sceneTextBox(stoneSlabMask.maskOrigin, placement);
  return transformPolylinesToBox(polylines, box, placement.fit);
}

function ceramicQ1TubeZ(stoneMesh) {
  stoneMesh.geometry.computeBoundingBox();
  const stoneTop = stoneMesh.geometry.boundingBox.max.z * stoneMesh.scale.z;
  return stoneMesh.position.z + stoneTop + Q1_CERAMIC_ABOVE_STONE_Z;
}

/** Frame sits behind stone — bottom layer in z and renderOrder. */
function slabFrameTubeRadius(style3, style2) {
  return (
    frameTubeBaseRadius(style3) *
    SLAB_FRAME_TUBE_RADIUS_SCALE *
    frameRadiusScaleFromStyle2(style2)
  );
}

function slabFrameBackZ(stoneMesh, style3, style2) {
  if (stoneMesh?.geometry) {
    stoneMesh.geometry.computeBoundingBox();
    const bb = stoneMesh.geometry.boundingBox;
    const stoneBackZ = stoneMesh.position.z + bb.min.z * stoneMesh.scale.z;
    const tubeR = slabFrameTubeRadius(style3, style2);
    return stoneBackZ - tubeR * 1.35 - 0.3;
  }
  return L2_SURFACE_Z - L3_STONE_BACK_GAP - 6;
}

/** Q1 — one connected thick tube mass (same material as unified metal, not flat inflated mesh). */
function addCeramicQ1CenterLayer(
  scene,
  stoneMesh,
  rootSvg,
  stoneSlabMask,
  style3,
  style2,
  metalMat,
  ageNum = 25
) {
  if (!stoneMesh || !stoneSlabMask?.maskOrigin || !metalMat) return { count: 0 };
  const polylines = collectCeramicQ1TubePolylines(rootSvg, stoneSlabMask, style3);
  if (!polylines.length) return { count: 0 };

  const z = ceramicQ1TubeZ(stoneMesh);
  const smoothStyle2 = softenMetalStyle2(style2);
  const count = addTubesFromPolylines(
    polylines,
    metalMat,
    scene,
    z,
    Q1_CERAMIC_RENDER_ORDER,
    style3,
    ageNum,
    smoothStyle2,
    {
      xyScale: SLAB_STONE_XY_SCALE,
      radiusScale: SLAB_Q1_CERAMIC_TUBE_RADIUS_SCALE,
      isFrame: true,
      tagQ5Material: true,
    }
  );
  return { count };
}

function collectQ3LayerPolylines(rootSvg, slabMask, style3, questionnaire, placement, layerClass = '.layer-q3-thread') {
  const q3El = rootSvg.querySelector(layerClass);
  if (!q3El || !slabMask?.maskOrigin) return [];
  let { polylines } = collectGlyphLayerPolylines(q3El, rootSvg, style3);
  if (!polylines.length) return [];
  const engravePat = questionnaire?.stoneEngravingPattern;
  const box = sceneTextBox(slabMask.maskOrigin, placement);
  const fit = placement.fit * (engravePat?.decorativeScale ?? 1);
  return transformPolylinesToBox(polylines, box, fit);
}

/** Radial bridge segments from Q3 path ends to the stone slab frame contour. */
function appendQ3FrameBridgePolylines(polylines, slabMask, style3) {
  if (!polylines.length || !slabMask?.maskOrigin) return polylines;
  let framePts = buildSlabStoneFrameContour(slabMask);
  if (framePts.length < 8) return polylines;

  const scale = SLAB_STONE_XY_SCALE;
  framePts = framePts.map((p) => new THREE.Vector3(p.x / scale, p.y / scale, 0));
  const { maskOrigin } = slabMask;
  const cx = (maskOrigin.minX + maskOrigin.maxX) * 0.5;
  const cy = (maskOrigin.minY + maskOrigin.maxY) * 0.5;
  const inset = frameTubeBaseRadius(style3) * 0.85;
  framePts = framePts.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const l = Math.hypot(dx, dy) || 1;
    return new THREE.Vector3(p.x - (dx / l) * inset, p.y - (dy / l) * inset, 0);
  });

  function framePointOnRay(px, py) {
    const angle = Math.atan2(py - cy, px - cx);
    let best = framePts[0];
    let bestDa = Infinity;
    for (const fp of framePts) {
      const a = Math.atan2(fp.y - cy, fp.x - cx);
      const da = Math.abs(Math.atan2(Math.sin(a - angle), Math.cos(a - angle)));
      if (da < bestDa) {
        bestDa = da;
        best = fp;
      }
    }
    return best;
  }

  const bridges = [];
  const seen = new Set();
  for (const { pts, closed } of polylines) {
    if (pts.length < 2) continue;
    const ends = closed ? [pts[0]] : [pts[0], pts[pts.length - 1]];
    for (const ep of ends) {
      const fp = framePointOnRay(ep.x, ep.y);
      const key = `${Math.round(ep.x * 2)},${Math.round(ep.y * 2)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (Math.hypot(fp.x - ep.x, fp.y - ep.y) < frameTubeBaseRadius(style3) * 0.35) continue;
      bridges.push({
        closed: false,
        pts: [ep.clone(), fp.clone()],
      });
    }
  }
  return bridges.length ? [...polylines, ...bridges] : polylines;
}

function collectQ3MetalThreadPolylines(rootSvg, slabMask, style3, questionnaire = null) {
  return collectQ3LayerPolylines(
    rootSvg,
    slabMask,
    style3,
    questionnaire,
    SLAB_Q3_METAL_PLACEMENT
  );
}

/** Q3 answer — glyph paths for stone slab engraving (`.layer-q3-stone-engrave`). */
function collectQ3StoneEngravePolylines(rootSvg, slabMaskOrigin, style3, questionnaire = null) {
  return collectQ3LayerPolylines(
    rootSvg,
    { maskOrigin: slabMaskOrigin },
    style3,
    questionnaire,
    SLAB_Q3_ENGRAVE_PLACEMENT,
    '.layer-q3-stone-engrave'
  );
}

function scenePointInMaskGrid(x, y, mask) {
  if (!mask?.grid) return false;
  const { grid, w, h, maskOrigin } = mask;
  const px = Math.round((x - maskOrigin.minX) * MASK_SCALE);
  const py = Math.round((maskOrigin.maxY - y) * MASK_SCALE);
  if (px < 0 || py < 0 || px >= w || py >= h) return false;
  return grid[py * w + px] > 0;
}

/** Forbidden zone — Q1 ceramic footprint + gap (+ optional tube radius for clip). */
function buildCeramicQ3HoleMask(rootSvg, slabMask, style3, style2, extraMarginScene = 0) {
  const q1Polys = collectCeramicQ1TubePolylines(rootSvg, slabMask, style3);
  if (!q1Polys.length || !slabMask?.maskOrigin) return null;
  const scaled = scalePolylinesFromCenter(q1Polys, SLAB_STONE_XY_SCALE);
  const tubeR = ceramicQ1TubeRadius(style3) * SLAB_STONE_XY_SCALE;
  const { w, h, maskOrigin } = slabMask;
  const q1Mask = rasterizePolylinesToGrid(scaled, tubeR * 2.08, maskOrigin);
  if (q1Mask.w !== w || q1Mask.h !== h) return null;
  const gapPx = Math.max(
    2,
    Math.round((SLAB_FRAME_EQUAL_GAP_SCENE + extraMarginScene) * MASK_SCALE)
  );
  const grid = dilateMaskGridBlur(q1Mask.grid, w, h, gapPx);
  return { grid, w, h, maskOrigin };
}

/** Split polylines — drop segments inside the ceramic hole mask. */
function clipPolylinesOutsideMask(polylines, mask) {
  if (!mask?.grid || !polylines.length) return polylines;
  const out = [];
  for (const { pts } of polylines) {
    let run = [];
    const flush = () => {
      if (run.length >= 2) out.push({ pts: run, closed: false });
      run = [];
    };
    for (const p of pts) {
      if (!scenePointInMaskGrid(p.x, p.y, mask)) run.push(p);
      else flush();
    }
    flush();
  }
  return out;
}

function q3MetalThreadZ(stoneMesh) {
  stoneMesh.geometry.computeBoundingBox();
  const stoneTop = stoneMesh.geometry.boundingBox.max.z * stoneMesh.scale.z;
  return stoneMesh.position.z + stoneTop + Q3_THREAD_ABOVE_STONE_Z;
}

/** Q3 metal — above stone, below ceramic; full paths visible under ceramic (no hole clip). */
function addQ3MetalThreadLayer(
  scene,
  rootSvg,
  stoneMesh,
  slabMask,
  style2,
  style3,
  ageNum,
  ceramicMat,
  questionnaire = null
) {
  if (!stoneMesh || !slabMask?.maskOrigin || !ceramicMat) return 0;
  const polylines = collectQ3MetalThreadPolylines(rootSvg, slabMask, style3, questionnaire);
  if (!polylines.length) return 0;
  const stoneTubeR = l3TubeRadius(style3) * STONE_L3_THICKNESS;
  const z = q3MetalThreadZ(stoneMesh);
  return addTubesFromPolylines(polylines, ceramicMat, scene, z, Q3_THREAD_RENDER_ORDER, style3, ageNum, style2, {
    xyScale: SLAB_STONE_XY_SCALE,
    radiusScale: SLAB_Q3_METAL_THREAD_RADIUS_SCALE,
    isFrame: true,
    tagQ5Material: true,
    skipOrganicDisplacement: true,
    straightTubes: true,
    tubeEndStyle: 'round',
    tubeEndFrac: 0.28,
  });
}

/**
 * Solid Q1 metal — 3D tubes centered on the stone (no repoussé sheet/halo).
 * Material matches prototype-v2-saved-roughness.html buildMetalMaterial.
 */
function addSolidMetalCenterLayer(scene, metalPack, stoneMesh, style3, ageNum) {
  if (!metalPack?.embossPolylines?.length || !stoneMesh) return 0;

  const envMap = getStudioEnvMap(active.renderer);
  const mat = buildSavedRoughnessMetalMaterial(envMap, unifiedMetalRoughnessFromAge(ageNum));

  stoneMesh.geometry.computeBoundingBox();
  const stoneTop = stoneMesh.geometry.boundingBox.max.z * stoneMesh.scale.z;
  const z = stoneMesh.position.z + stoneTop + 0.06;
  const xyScale = stoneMesh.scale.x;

  return addTubesFromPolylines(
    metalPack.embossPolylines,
    mat,
    scene,
    z,
    42,
    style3,
    ageNum,
    null,
    {
      xyScale,
      radiusScale: SLAB_METAL_RADIUS_SCALE * 0.92,
    }
  );
}

/** @deprecated wire tubes — use addSolidMetalCenterLayer */
function addMetalWishLayer(scene, pack, metalMat, style3, ageNum, style2, questionnaire = null) {
  const z = slabMetalWrapZ(style3);
  const tubeSpread = questionnaire?.metalShapeParams?.tubeSpread ?? 1;
  const embossMul = pack.embossHeightMul ?? 1;

  const tubesShape = addTubesFromPolylines(
    pack.shapePolylines ?? [],
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

function contourTurnAngleRad(prev, cur, next) {
  const ax = prev.x - cur.x;
  const ay = prev.y - cur.y;
  const bx = next.x - cur.x;
  const by = next.y - cur.y;
  const la = Math.hypot(ax, ay) || 1;
  const lb = Math.hypot(bx, by) || 1;
  const dot = (ax / la) * (bx / lb) + (ay / la) * (by / lb);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
}

/** Keep sharp corners / indentations when thinning a traced mask loop. */
function subsampleContourPtsPreserveCorners(pts, minDist, cornerRad = 0.38) {
  if (pts.length < 4) return subsampleContourPts(pts, minDist);
  const n = pts.length;
  const keepCorner = (i) => {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    return contourTurnAngleRad(prev, cur, next) >= cornerRad;
  };
  const out = [pts[0]];
  for (let i = 1; i < n; i++) {
    const p = pts[i];
    const last = out[out.length - 1];
    if (keepCorner(i) || Math.hypot(p.x - last.x, p.y - last.y) >= minDist) out.push(p);
  }
  if (out.length >= 2 && keepCorner(0)) {
    const p = pts[0];
    const last = out[out.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) >= minDist * 0.35) out[0] = p;
  }
  return out.length >= 3 ? out : pts;
}

function fillRadialBins(radii) {
  const n = radii.length;
  const filled = Array.from(radii);
  for (let i = 0; i < n; i++) {
    if (filled[i] > 0) continue;
    let prev = -1;
    let next = -1;
    for (let d = 1; d < n; d++) {
      if (prev < 0 && filled[(i - d + n) % n] > 0) prev = filled[(i - d + n) % n];
      if (next < 0 && filled[(i + d) % n] > 0) next = filled[(i + d) % n];
      if (prev >= 0 && next >= 0) break;
    }
    filled[i] = prev >= 0 && next >= 0 ? (prev + next) / 2 : prev >= 0 ? prev : next >= 0 ? next : 0;
  }
  return filled;
}

function smoothRadialRadii(radii, passes) {
  let cur = radii.slice();
  for (let pass = 0; pass < passes; pass++) {
    const next = cur.slice();
    for (let i = 0; i < cur.length; i++) {
      const prev = cur[(i - 1 + cur.length) % cur.length];
      const follow = cur[(i + 1) % cur.length];
      next[i] = (prev + cur[i] * 2 + follow) / 4;
    }
    cur = next;
  }
  return cur;
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const denom = dot00 * dot11 - dot01 * dot01;
  if (Math.abs(denom) < 1e-12) return false;
  const inv = 1 / denom;
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;
  return u >= 0 && v >= 0 && u + v <= 1;
}

/** Rasterize rendered stone mesh XY silhouette (world space, follows every curve). */
function rasterizeStoneMeshSilhouette(stoneMesh) {
  if (!stoneMesh?.geometry?.attributes?.position) return null;
  stoneMesh.updateMatrixWorld(true);
  const geom = stoneMesh.geometry;
  const pos = geom.attributes.position;
  const index = geom.index;
  const v = new THREE.Vector3();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    stoneMesh.localToWorld(v);
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }
  if (!isFinite(minX)) return null;

  const pad = SLAB_FRAME_EQUAL_GAP_SCENE + 48;
  const maskOrigin = {
    minX: minX - pad,
    maxX: maxX + pad,
    minY: minY - pad,
    maxY: maxY + pad,
  };
  const w = Math.max(96, Math.ceil((maskOrigin.maxX - maskOrigin.minX) * MASK_SCALE));
  const h = Math.max(96, Math.ceil((maskOrigin.maxY - maskOrigin.minY) * MASK_SCALE));
  const grid = new Uint8Array(w * h);

  const worldVert = (i) => {
    v.fromBufferAttribute(pos, i);
    return stoneMesh.localToWorld(v.clone());
  };

  const stampTri = (a, b, c) => {
    const tminX = Math.min(a.x, b.x, c.x);
    const tmaxX = Math.max(a.x, b.x, c.x);
    const tminY = Math.min(a.y, b.y, c.y);
    const tmaxY = Math.max(a.y, b.y, c.y);
    const px0 = Math.max(0, Math.floor((tminX - maskOrigin.minX) * MASK_SCALE));
    const px1 = Math.min(w - 1, Math.ceil((tmaxX - maskOrigin.minX) * MASK_SCALE));
    const py0 = Math.max(0, Math.floor((maskOrigin.maxY - tmaxY) * MASK_SCALE));
    const py1 = Math.min(h - 1, Math.ceil((maskOrigin.maxY - tminY) * MASK_SCALE));
    for (let py = py0; py <= py1; py++) {
      const sy = maskOrigin.maxY - (py + 0.5) / MASK_SCALE;
      for (let px = px0; px <= px1; px++) {
        const sx = maskOrigin.minX + (px + 0.5) / MASK_SCALE;
        if (pointInTriangle(sx, sy, a.x, a.y, b.x, b.y, c.x, c.y)) {
          grid[py * w + px] = 1;
        }
      }
    }
  };

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      stampTri(worldVert(index.getX(i)), worldVert(index.getX(i + 1)), worldVert(index.getX(i + 2)));
    }
  } else {
    for (let i = 0; i + 2 < pos.count; i += 3) {
      stampTri(worldVert(i), worldVert(i + 1), worldVert(i + 2));
    }
  }

  if (!grid.some((v) => v)) return null;
  fillMaskInteriorHoles(grid, w, h);
  return { grid, w, h, maskOrigin };
}

/**
 * Frame centerline — exact offset from stone silhouette via distance field (every corner/curve).
 */
function buildExactGapFrameContourFromGrid(grid, w, h, maskOrigin, style3, style2, xyScale = 1) {
  const centerlinePx = Math.round(slabFrameCenterlineMarginScene(style3, style2) * MASK_SCALE);
  const distOut = distanceToMaskGrid(grid, w, h);
  const dilated = new Uint8Array(w * h);
  for (let i = 0; i < grid.length; i++) {
    dilated[i] = grid[i] || distOut[i] <= centerlinePx ? 1 : 0;
  }
  fillMaskInteriorHoles(dilated, w, h);
  const raw = traceLargestMaskBoundary(dilated, w, h);
  if (raw.length < 8) return [];
  let pts = raw.map((p) => slabMaskPointToScene(p.x, p.y, maskOrigin, 1));
  if (Math.abs(xyScale - 1) > 1e-4) pts = scalePointsFromCenter(pts, xyScale);
  return subsampleContourPtsPreserveCorners(pts, SLAB_FRAME_CONTOUR_SUBSAMPLE);
}

/** Frame loop — rendered stone mesh silhouette first (exact wrap), mask fallback. */
function buildStoneMeshFrameContour(stoneMesh, style3, style2, slabMask = null) {
  const pack = rasterizeStoneMeshSilhouette(stoneMesh);
  if (pack?.grid) {
    return buildExactGapFrameContourFromGrid(pack.grid, pack.w, pack.h, pack.maskOrigin, style3, style2, 1);
  }
  if (slabMask?.grid?.some((v) => v)) {
    return buildExactGapFrameContourFromGrid(
      slabMask.grid,
      slabMask.w,
      slabMask.h,
      slabMask.maskOrigin,
      style3,
      style2,
      SLAB_STONE_XY_SCALE
    );
  }
  return [];
}

/** Mask-based frame fallback — same exact distance-field offset as mesh silhouette. */
function buildSlabEqualGapFrameContour(rootSvg, slabMask, style3, style2, questionnaire = null) {
  const union = buildSlabFrameContentUnionMask(rootSvg, slabMask, style3, style2, questionnaire);
  if (!union?.grid) return buildSlabStoneFrameContour(slabMask, style3, style2);
  return buildExactGapFrameContourFromGrid(
    union.grid,
    union.w,
    union.h,
    union.maskOrigin,
    style3,
    style2,
    SLAB_STONE_XY_SCALE
  );
}

/** Outer contour of stone slab mask — equal gap fallback when mesh contour unavailable. */
function buildSlabStoneFrameContour(slabMask, style3 = null, style2 = null) {
  if (!slabMask?.grid) return [];
  const { grid, w, h, maskOrigin } = slabMask;
  return buildExactGapFrameContourFromGrid(
    grid,
    w,
    h,
    maskOrigin,
    style3,
    style2,
    SLAB_STONE_XY_SCALE
  );
}

/** Frame tube centerline offset — inner tube wall sits SLAB_FRAME_EQUAL_GAP_SCENE outside stone. */
function slabFrameCenterlineMarginScene(style3, style2) {
  const tubeR = frameTubeBaseRadius(style3) * SLAB_FRAME_TUBE_RADIUS_SCALE * frameRadiusScaleFromStyle2(style2);
  return SLAB_FRAME_EQUAL_GAP_SCENE + tubeR;
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

function scalePolylinesFromCenter(polylines, scale) {
  if (Math.abs(scale - 1) < 1e-4) return polylines;
  return polylines.map(({ pts, closed }) => ({
    closed,
    pts: scalePointsFromCenter(pts, scale),
  }));
}

function mergeMaskGrid(into, from) {
  if (!into?.length || !from?.length || into.length !== from.length) return;
  for (let i = 0; i < into.length; i++) into[i] = into[i] || from[i];
}

/** Frame outline — equal gap outside stone slab (Q1 metal sits inside stone). */
function buildSlabFrameContentUnionMask(_rootSvg, slabMask, _style3, _style2, _questionnaire = null) {
  if (!slabMask?.grid) return null;
  return { grid: slabMask.grid.slice(), w: slabMask.w, h: slabMask.h, maskOrigin: slabMask.maskOrigin };
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
  } else {
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

/**
 * Q6 — stone wraps perturbed name-vector silhouette (clay-over-mold).
 */
function perturbPolylinesForStoneShape(polylines, style2, style3) {
  const stoneStyle = stoneVectorStyle2(style2) ?? style2;
  const rough = stoneRoughnessFromStyle(stoneStyle);
  if (rough < 0.08) return polylines;
  const occupationKey = stoneStyle?.occupationKey ?? stoneStyle?.occupation;
  if (!occupationKey) return polylines;
  const ampMul = 1.1 + rough * 1.55;
  return perturbPolylinesForL2Shadow(
    polylines,
    {
      ...stoneStyle,
      occupationKey,
      __pathAmpMul: ampMul,
      __fewerSmoothPasses: rough > 0.38,
    },
    style3
  );
}

/** עיקול 2D של מסלולי L2 — תואם ל-buildStrokeCurve כדי שצל המגע ב-L3 יעקוב אחרי הקוצניות */
function perturbPolylinesForL2Shadow(polylines, style2, style3) {
  const occupationKey = style2?.occupationKey ?? style2?.occupation;
  if (!occupationKey) return polylines;
  const rough = 1 - (OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5);
  if (rough < 0.08) return polylines;

  const gender = style3?.gender || style2?.gender || 'female';
  const baseAmp = gender === 'female' ? 2.5 : gender === 'male' ? 1.2 : 1.8;
  const ampMul = style2?.__pathAmpMul ?? 1;
  const pathAmp = baseAmp * (0.08 + rough * 0.55) * ampMul;
  const smoothPasses = style2?.__fewerSmoothPasses
    ? Math.max(0, Math.round((6 - rough * 5) * 0.52))
    : Math.max(1, Math.round(6 - rough * 5));

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
function rasterizeGlyphLayerMaskCanvas(
  layerEl,
  rootSvg,
  style3,
  slabMaskOrigin,
  placement,
  strokeScale = 1,
  strokeOpts = null
) {
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
  if (strokeOpts?.machineStroke) {
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 6;
  } else {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  drawPolylinesMask(ctx, polylines, slabMaskOrigin, strokeW);

  const { grid } = readMaskGrid(canvas);
  let filled = 0;
  for (let i = 0; i < grid.length; i++) filled += grid[i];
  if (filled < 16) return null;

  return prepareTextOverlayFromGrid(grid, w, h, slabMaskOrigin, MASK_SCALE);
}

function q7SceneJitter(seed, i, spread) {
  let h = 2166136261;
  const s = String(seed) + ':' + i;
  for (let j = 0; j < s.length; j++) h = Math.imul(h ^ s.charCodeAt(j), 16777619);
  return (((h >>> 0) / 4294967296) * 2 - 1) * spread;
}

function placeQ7LetterPolylines(polylines, tx, ty, targetSize) {
  const bounds = polylineBounds(polylines);
  if (!bounds) return [];
  const lcx = (bounds.minX + bounds.maxX) / 2;
  const lcy = (bounds.minY + bounds.maxY) / 2;
  const extent = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1e-3);
  const scale = targetSize / extent;
  return polylines.map(({ pts, closed }) => ({
    closed,
    pts: pts.map(
      (p) => new THREE.Vector3(tx + (p.x - lcx) * scale, ty + (p.y - lcy) * scale, 0)
    ),
  }));
}

/** Q7 first-letter ring — polylines placed on stone slab in scene space. */
function collectQ7EmbossLetterGroups(rootSvg, slabMaskOrigin, style3, questionnaire) {
  const letters = questionnaire?.q7Letters || [];
  const layerEl = rootSvg.querySelector('.layer-q7-emboss');
  if (!letters.length || !layerEl || !slabMaskOrigin) return [];

  const cx = (slabMaskOrigin.minX + slabMaskOrigin.maxX) / 2;
  const cy = (slabMaskOrigin.minY + slabMaskOrigin.maxY) / 2;
  const span = Math.min(
    slabMaskOrigin.maxX - slabMaskOrigin.minX,
    slabMaskOrigin.maxY - slabMaskOrigin.minY
  );
  const R = span * 0.36;
  const letterSize = span * 0.1;
  const seed = letters.join('');
  const pad = l3TubeRadius(style3) * 0.28;
  const groups = [];

  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    const glyphEl =
      layerEl.querySelector('.amulet-glyph-' + letter) ||
      layerEl.querySelectorAll('.amulet-glyph')[i];
    if (!glyphEl) continue;
    const raw = collectLayer2PathPolylines(glyphEl, rootSvg);
    if (!raw.length) continue;

    const ang = (i / letters.length) * Math.PI * 2 - Math.PI / 2 + q7SceneJitter(seed, i, 0.11);
    const r = R + q7SceneJitter(seed, i + 17, span * 0.045);
    const tx = cx + Math.cos(ang) * r;
    const ty = cy + Math.sin(ang) * r;
    const placed = placeQ7LetterPolylines(raw, tx, ty, letterSize);
    const polylines = placed.map(({ pts, closed }) => ({
      closed,
      pts: closed ? pts : extendOpenPathCaps(pts, pad),
    }));
    if (polylines.length) groups.push({ letter, polylines });
  }
  return groups;
}

function collectQ7EmbossPolylines(rootSvg, slabMaskOrigin, style3, questionnaire) {
  return collectQ7EmbossLetterGroups(rootSvg, slabMaskOrigin, style3, questionnaire).flatMap(
    (g) => g.polylines
  );
}

function rasterizePolylinesOverlay(polylines, strokeScene, maskOrigin) {
  if (!polylines.length || !maskOrigin) return null;
  const strokeW = strokeScene * MASK_SCALE;
  const w = Math.max(32, Math.ceil((maskOrigin.maxX - maskOrigin.minX) * MASK_SCALE));
  const h = Math.max(32, Math.ceil((maskOrigin.maxY - maskOrigin.minY) * MASK_SCALE));
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
  const { grid } = readMaskGrid(canvas);
  let filled = 0;
  for (let i = 0; i < grid.length; i++) filled += grid[i];
  if (filled < 8) return null;
  return { grid, w, h, maskOrigin, maskScale: MASK_SCALE };
}

/** Single glyph overlay mask — tight bbox per letter in scene space. */
function rasterizeGlyphWorldMaskCanvas(glyphEl, rootSvg, style3, strokeScale = 1) {
  let { polylines, strokeScene } = collectGlyphLayerPolylines(glyphEl, rootSvg, style3);
  if (!polylines.length) return null;

  strokeScene *= strokeScale;
  const maskOrigin = maskBoundsFromPolylines(polylines, strokeScene);
  if (!maskOrigin) return null;

  const strokeW = strokeScene * MASK_SCALE;
  const w = Math.max(32, Math.ceil((maskOrigin.maxX - maskOrigin.minX) * MASK_SCALE));
  const h = Math.max(32, Math.ceil((maskOrigin.maxY - maskOrigin.minY) * MASK_SCALE));
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

  const { grid } = readMaskGrid(canvas);
  let filled = 0;
  for (let i = 0; i < grid.length; i++) filled += grid[i];
  if (filled < 8) return null;

  return { grid, w, h, maskOrigin, maskScale: MASK_SCALE };
}

function buildSlabQ7EmbossOverlays(rootSvg, slabMaskOrigin, style3, stoneTubeR, questionnaire = null) {
  const roundR = stoneTubeR * 1.25;
  const overlays = [];
  const letterGroups = collectQ7EmbossLetterGroups(rootSvg, slabMaskOrigin, style3, questionnaire);
  if (!letterGroups.length) return overlays;

  const strokeScene = effectiveL3StrokeWidth(style3) * SLAB_Q7_EMBOSS_STROKE_SCALE;
  const bevelW = roundR * SLAB_Q7_EMBOSS_BEVEL_MUL;
  for (const { polylines } of letterGroups) {
    const bounds = maskBoundsFromPolylines(polylines, strokeScene);
    if (!bounds) continue;
    const mask = rasterizePolylinesOverlay(polylines, strokeScene, bounds);
    if (!mask) continue;
    const smoothed = smoothEmbossOverlayMask(mask);
    overlays.push({
      ...smoothed,
      height: roundR * SLAB_Q7_EMBOSS_HEIGHT_MUL,
      bevelWidth: bevelW,
      sharpRelief: false,
    });
  }
  return overlays;
}

/** Q3 answer — thin vector hairline carved in stone. */
function buildSlabQ3EngraveOverlays(rootSvg, slabMaskOrigin, style3, stoneTubeR, questionnaire = null) {
  const roundR = stoneTubeR * 1.25;
  const engravePat = questionnaire?.stoneEngravingPattern;
  const scaleMul = engravePat?.decorativeScale ?? 1;
  const overlays = [];
  const q3El = rootSvg.querySelector('.layer-q3-stone-engrave');
  if (!q3El || !slabMaskOrigin) return overlays;

  const mask = rasterizeGlyphLayerMaskCanvas(
    q3El,
    rootSvg,
    style3,
    slabMaskOrigin,
    SLAB_Q3_ENGRAVE_PLACEMENT,
    SLAB_Q3_ENGRAVE_STROKE_SCALE * scaleMul,
    { machineStroke: true }
  );
  if (mask) {
    const fused = prepareTextOverlayFromGrid(mask.grid, mask.w, mask.h, slabMaskOrigin, MASK_SCALE);
    overlays.push({
      ...fused,
      machineCut: true,
      thinChannel: true,
      vectorHairline: true,
      vHalfMul: 0.98,
      depth: roundR * SLAB_Q3_ENGRAVE_DEPTH_MUL * scaleMul,
    });
  }
  return overlays;
}

/** Q4 doubt — sharp cliff bas-relief plateau (reference tile horse/rider relief). */
function buildSlabQ3SharpEmbossOverlays(rootSvg, slabMaskOrigin, style3, stoneTubeR, questionnaire = null) {
  const roundR = stoneTubeR * 1.25;
  const engravePat = questionnaire?.stoneEngravingPattern;
  const scaleMul = engravePat?.decorativeScale ?? 1;
  const overlays = [];
  const q3El = rootSvg.querySelector('.layer-q3-stone-engrave');
  if (!q3El || !slabMaskOrigin) return overlays;

  const mask = rasterizeGlyphLayerMaskCanvas(
    q3El,
    rootSvg,
    style3,
    slabMaskOrigin,
    SLAB_Q3_ENGRAVE_PLACEMENT,
    1.02 * scaleMul
  );
  if (mask) {
    let grid = mask.grid.slice();
    const dilatePx = Math.max(2, Math.round(SLAB_Q3_DOUBT_EMBOSS_SOLID_DILATE_SCENE * MASK_SCALE));
    grid = dilateMaskGrid(grid, mask.w, mask.h, dilatePx);
    grid = fillMaskInteriorHoles(grid, mask.w, mask.h);
    grid = closeStrokeMaskGrid(grid, mask.w, mask.h, dilatePx, Math.max(1, dilatePx - 2));
    grid = fillMaskInteriorHoles(grid, mask.w, mask.h);
    const fused = prepareTextOverlayFromGrid(grid, mask.w, mask.h, slabMaskOrigin, MASK_SCALE);
    overlays.push({
      ...fused,
      height: roundR * SLAB_Q3_DOUBT_EMBOSS_HEIGHT_MUL * scaleMul,
      bevelWidth: roundR * SLAB_Q3_DOUBT_EMBOSS_BEVEL_MUL,
      plateau: true,
      sharpRelief: true,
    });
  }
  return overlays;
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
 * Stone relief on slab — Q7 ring emboss only (Q3 engraving is a 2D canvas overlay).
 */
function buildSlabStoneEngraveRelief(rootSvg, slabMaskOrigin, style2, style3, stoneTubeR, questionnaire = null) {
  const roundR = stoneTubeR * 1.25;

  const q7Polylines = collectQ7EmbossPolylines(
    rootSvg,
    slabMaskOrigin,
    style3,
    questionnaire
  );
  const embossOverlays = buildSlabQ7EmbossOverlays(
    rootSvg,
    slabMaskOrigin,
    style3,
    stoneTubeR,
    questionnaire
  );
  const embossSegments = q7Polylines.length ? buildStrokeSegments(q7Polylines, 80) : null;

  let embossHeight = roundR * 2.2;
  for (const ov of embossOverlays) {
    embossHeight = Math.max(embossHeight, ov.height || 0);
  }

  return {
    engraveSegments: null,
    engraveOverlays: [],
    embossOverlays,
    embossSegments,
    embossTubeR: roundR * SLAB_Q7_EMBOSS_TUBE_MUL,
    embossHeight,
    basePlateHeight: roundR * 0.4,
    sharpRelief: false,
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
  previewMode = null,
  renderOpts = null
) {
  const onProgress = renderOpts?.onProgress;
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
      let { grid: slabGrid, w, h, maskOrigin, pierceHoleMask } = rasterizeSlabWrapMask(
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
      const ceramicWrap = skipMetal
        ? null
        : buildCeramicQ1StoneWrapIntegration(
            rootSvg,
            { grid: slabGrid, w, h, maskOrigin },
            style3,
            style2,
            stoneTubeR
          );
      if (ceramicWrap?.ceramicMask) {
        slabGrid = expandStoneSlabToContainMetal(
          slabGrid,
          w,
          h,
          ceramicWrap.ceramicMask,
          CERAMIC_STONE_WRAP_MARGIN_SCENE
        );
      }
      let metalPlateMask = skipMetal
        ? null
        : resolveMetalPlateMask(rootSvg, { grid: slabGrid, w, h, maskOrigin }, style3, questionnaire);
      if (metalPlateMask && !skipMetal) {
        slabGrid = expandStoneSlabToContainMetal(
          slabGrid,
          w,
          h,
          metalPlateMask,
          METAL_STONE_FRAME_MARGIN_SCENE
        );
      }
      const slabMask = { grid: slabGrid, w, h, maskOrigin, pierceHoleMask };
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
      const slabMetalIntegration = buildSlabMetalIntegration(
        rootSvg,
        maskOrigin,
        w,
        h,
        style2,
        style3,
        stoneTubeR
      );
      const plateDistToMetal = metalPlateMask ? metalSheetContactDist(metalPlateMask) : null;
      const distToMetal = slabMetalIntegration.distToMetal ?? plateDistToMetal;
      const metalHaloWrap =
        metalPlateMask?.fromEmboss && !skipMetal
          ? buildMetalHaloWrapParams(metalPlateMask, stoneTubeR)
          : null;
      const plateCradle =
        metalPlateMask && !skipMetal && !metalPlateMask.fromEmboss
          ? buildMetalPlateCradleParams(metalPlateMask, questionnaire?.metalPlateParams, stoneTubeR)
          : null;

      const nameTube =
        layer2El && style2
          ? buildNameTubeStoneGeometry(layer2El, rootSvg, style2, style3)
          : null;

      const stoneMetalOpts = {
        slabMode: true,
        stoneMaterialPreset: q4StonePreset(questionnaire?.q4Belief),
        stoneRoughness: resolveStoneRoughness(style2, questionnaire),
        slabThornIntensity: resolveSlabThornIntensity(questionnaire),
        slabThornSeed: slabThornSeedFromQ6(questionnaire?.q6Difficulty),
        basePlateHeight: stoneTubeR * 1.35 * 0.36,
        metalPlateCradle: plateCradle,
        metalHaloWrap,
        embossFootprintMask: null,
        pierceHoleMask: pierceHoleMask ?? null,
        letterGapRelief: !!nameTube?.segments?.length,
        metalBedSegments: slabMetalIntegration.metalBedSegments,
        metalBedTubeR: slabMetalIntegration.metalBedTubeR,
        metalBedDepth: slabMetalIntegration.metalBedDepth,
        metalBedShoulder: slabMetalIntegration.metalBedShoulder,
        ...glyphRelief,
      };
      reportProgress(onProgress, 0.12, 'מסכת אבן…');
      await yieldToMainThread();
      const stoneProgress = (f) => reportProgress(onProgress, 0.12 + f * 0.58, 'גיבוש אבן…');
      const stoneCacheKey = hashSlabStoneInputs(
        stoneMetalOpts,
        nameTube?.segments?.length ?? 0,
        questionnaire
      );
      let geom = takeCachedSlabStoneGeometry(stoneCacheKey);
      if (geom) {
        reportProgress(onProgress, 0.72, 'אבן מטמון…');
      } else if (nameTube) {
        geom = await buildStoneSculptureMeshFromMaskAsync(
          slabGrid,
          w,
          h,
          maskOrigin,
          stoneTubeR,
          MASK_SCALE,
          distToMetal,
          nameTube.segments,
          stoneMetalOpts,
          { onProgress: stoneProgress }
        );
        storeCachedSlabStoneGeometry(stoneCacheKey, geom);
      } else {
        geom = await buildStoneSculptureMeshFromMaskAsync(
          slabGrid,
          w,
          h,
          maskOrigin,
          stoneTubeR,
          MASK_SCALE,
          distToMetal,
          null,
          stoneMetalOpts,
          { onProgress: stoneProgress }
        );
        storeCachedSlabStoneGeometry(stoneCacheKey, geom);
      }
      await yieldToMainThread();
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
    reportProgress(onProgress, 0.12, 'מסכת אבן…');
    await yieldToMainThread();
    const stoneProgress = (f) => reportProgress(onProgress, 0.12 + f * 0.58, 'גיבוב אבן…');
    const geom = await buildStoneSculptureMeshFromMaskAsync(
      l3Mask,
      w,
      h,
      maskOrigin,
      stoneTubeR,
      MASK_SCALE,
      distToL2Stone,
      segments,
      null,
      { onProgress: stoneProgress }
    );
    reportProgress(onProgress, 0.72, 'אבן מוכנה');
    await yieldToMainThread();
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
  questionnaire = null,
  renderOpts = null
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
      questionnaire,
      renderOpts?.previewMode ?? null,
      renderOpts
    );
    const stoneMesh = new THREE.Mesh(geom, material);
    geom.computeBoundingBox();
    const zFront = geom.boundingBox.max.z;
    stoneMesh.position.z = L2_SURFACE_Z - zFront - L3_STONE_BACK_GAP;
    stoneMesh.scale.set(SLAB_STONE_XY_SCALE, SLAB_STONE_XY_SCALE, 1);
    stoneMesh.layers.set(0);
    stoneMesh.renderOrder = STONE_RENDER_ORDER;
    scene.add(stoneMesh);
    return {
      count: 1,
      stoneMesh,
      slabMask: slabMask ?? null,
      metalPack: metalPack ?? null,
    };
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
    questionnaire,
    renderOpts?.previewMode ?? null,
    renderOpts
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

  return { count: 1, stoneMesh: null, slabMask: null, metalPack: null };
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
const FRAME_INSET_PX = 25;

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
  const onProgress = opts.onProgress;
  reportProgress(onProgress, 0.02, 'מכין SVG…');
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

  await yieldToMainThread();
  reportProgress(onProgress, 0.05, 'טוען שכבות…');

  const layer3 = mount.querySelector('.layer-3');
  if (!layer3) throw new Error('layer 3 missing');
  const layer2 = mount.querySelector('.layer-2');
  const vb = parseViewBox(mount);

  if (opts?.container) opts.container.innerHTML = '';
  disposeActiveScene();

  active.q5MaterialMeshes = [];
  active.ceramicMeshes = active.q5MaterialMeshes;

  const renderer = getOrCreateRenderer();
  const l3MaterialMode = opts.l3MaterialMode === 'stone' ? 'stone' : 'opal';
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const l3AgeFactorVal = l3AgeFactor(style3, opts.ageNum);

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure =
    l3MaterialMode === 'stone'
      ? isMeteoriteQ4Belief(opts.questionnaire?.q4Belief)
        ? 1.34
        : 1.12
      : 1.5;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  configureDragonGlassRenderer(renderer);
  active.renderer = renderer;

  const scene = new THREE.Scene();
  active.envMap = setupEnvironment(renderer, scene);
  const metalEnvMap = getStudioEnvMap(renderer);
  const unifiedMetalMat =
    l3MaterialMode === 'stone'
      ? buildSavedRoughnessMetalMaterial(metalEnvMap, unifiedMetalRoughnessFromAge(opts.ageNum))
      : null;
  const ceramicQ5 = opts.questionnaire?.q5Feeling ?? 'hope';
  const ceramicQ1Mat =
    l3MaterialMode === 'stone'
      ? buildCeramicQ1MaterialFromQ5(ceramicQ5, active.envMap)
      : null;
  active.ceramicQ1Material = ceramicQ1Mat;
  active.ceramicQ5Feeling = ceramicQ5;
  const slabFrameMetalMat = ceramicQ1Mat;
  const meteoriteStone =
    l3MaterialMode === 'stone' && isMeteoriteQ4Belief(opts.questionnaire?.q4Belief);
  if (l3MaterialMode === 'stone') {
    if (meteoriteStone) tuneMeteoriteStoneScene(renderer, scene);
    else tuneStoneSceneDark(renderer, scene);
  } else {
    tuneRendererExposureForQ5(renderer, ceramicQ5);
    tuneSceneEnvironmentForQ5(scene, ceramicQ5);
  }
    if (l3MaterialMode === 'stone') {
    if (meteoriteStone) addMeteoriteStoneLights(scene);
    else addStoneSculptureLights(scene);
    if (!meteoriteStone) addUnifiedMetalPreviewLights(scene);
    addQ5CeramicAccentLights(scene, ceramicQ5);
  } else {
    addLights(scene, 0);
  }

  renderer.sortObjects = true;

  const metalRough = style2 ? metalRoughnessFromStyle2(style2) : 0;
  const metalMat =
    l3MaterialMode === 'stone' && unifiedMetalMat
      ? unifiedMetalMat
      : buildMetalMaterial(style2, false, metalEnvMap);
  const opalPalette = buildL3OpalPalette(style3?.domainKey);
  let l3Mat;
  let l3StoneTextured = false;
  if (l3MaterialMode === 'stone') {
    const q4Belief = opts.questionnaire?.q4Belief ?? 'concrete_actions';
    const stone = buildStoneMaterial(style2, q4Belief, active.envMap, opts.questionnaire);
    l3Mat = stone.material;
    l3StoneTextured = stone.textured;
    if (STONE_L3_SLAB_MODE) {
      const pbrMapStone =
        stone.preset === PREMIUM_MATERIAL_IDS.WARM_MOONSTONE ||
        stone.preset === PREMIUM_MATERIAL_IDS.METEORITE_STONE ||
        stone.preset === PREMIUM_MATERIAL_IDS.GRAVEL_STONE ||
        stone.preset === PREMIUM_MATERIAL_IDS.ARCHAEOLOGICAL_DOUBT;
      if (
        !pbrMapStone ||
        stone.preset === PREMIUM_MATERIAL_IDS.METEORITE_STONE
      ) {
        l3Mat.vertexColors = true;
      }
    }
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
    opts.questionnaire,
    opts
  );
  const tubesL3 = l3Solid?.count ?? l3Solid ?? 0;
  const stoneMesh = l3Solid?.stoneMesh ?? null;
  active.stoneMesh = stoneMesh;
  const slabMask = l3Solid?.slabMask ?? null;
  const metalPack = l3Solid?.metalPack ?? null;
  if (!tubesL3) throw new Error('no L3 paths');

  let tubesMetalFringe = 0;
  if (ENABLE_METAL_FRINGE && l3MaterialMode === 'stone' && stoneMesh) {
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
  let tubesQ1Ceramic = 0;
  let tubesQ3Threads = 0;

  if (l3MaterialMode === 'stone' && STONE_L3_SLAB_MODE && stoneMesh && slabMask) {
    reportProgress(opts.onProgress, 0.66, 'חוטי Q3…');
    await yieldToMainThread();
    tubesQ3Threads = addQ3MetalThreadLayer(
      scene,
      mount,
      stoneMesh,
      slabMask,
      style2,
      style3,
      opts.ageNum,
      ceramicQ1Mat,
      opts.questionnaire
    );
    reportProgress(opts.onProgress, 0.7, 'קרמיקה Q1…');
    await yieldToMainThread();
    const ceramicResult = addCeramicQ1CenterLayer(
      scene,
      stoneMesh,
      mount,
      slabMask,
      style3,
      style2,
      ceramicQ1Mat,
      opts.ageNum
    );
    tubesQ1Ceramic = ceramicResult?.count ?? 0;
  }

  if (
    l3MaterialMode === 'stone' &&
    STONE_L3_SLAB_MODE &&
    !STONE_SLAB_HIDE_METAL &&
    metalPack &&
    stoneMesh &&
    !tubesQ1Ceramic
  ) {
    reportProgress(opts.onProgress, 0.74, 'מתכת…');
    await yieldToMainThread();
    tubesL3Metal = addSolidMetalCenterLayer(scene, metalPack, stoneMesh, style3, opts.ageNum);
    reportProgress(opts.onProgress, 0.92, 'מתכת מוכנה');
    await yieldToMainThread();
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
  if (l3MaterialMode === 'stone' && STONE_L3_SLAB_MODE && stoneMesh && slabFrameMetalMat) {
    tubesFrame = addStoneSlabMetalFrame(
      slabMask,
      slabFrameMetalMat,
      scene,
      null,
      FRAME_RENDER_ORDER,
      style3,
      opts.ageNum,
      style2,
      stoneMesh,
      mount,
      opts.questionnaire
    );
  }
  if (!tubesFrame && slabFrameMetalMat) {
    tubesFrame = addFrameRing(
      mount,
      slabFrameMetalMat,
      scene,
      null,
      FRAME_RENDER_ORDER,
      style3,
      opts.ageNum,
      style2,
      stoneMesh
    );
  }
  if (!tubesFrame) console.warn('[pbr] frame ring failed');

  reportProgress(onProgress, 0.94, 'רינדור סופי…');
  await yieldToMainThread();

  const age = Math.max(1, Math.min(120, Number(opts.ageNum) || 25));
  const rotationY = ((age - 1) / 119) * 0.25 - 0.125;
  scene.rotation.y = rotationY;
  scene.updateMatrixWorld(true);
  if (opts.darkerShadows) {
    deepenSceneShadows(scene, renderer);
  }
  const cameraHalf = fitSceneInsideFrame(scene, mount, style2, style3);
  const camera = makeCanvasCamera(cameraHalf);
  renderer.render(scene, camera);
  active.scene = scene;
  active.camera = camera;
  reportProgress(onProgress, 1, 'הושלם');

  return {
    mount,
    renderer,
    scene,
    camera,
    baseRotY: rotationY,
    tubesL2,
    tubesL3: tubesL3 + tubesL3Metal + tubesMetalEmboss + tubesMetalFringe + tubesQ1Ceramic + tubesQ3Threads,
    tubesL3Slab: tubesL3,
    tubesL3Metal,
    tubesMetalEmboss,
    tubesMetalFringe,
    tubesQ1Ceramic,
    tubesQ3Threads,
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
    if (opts?.container) opts.container.innerHTML = '';
    const core = await renderPbrCore(opts.svg, opts);
    mount = core.mount;

    const canvas = core.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    opts.container.appendChild(canvas);
    opts.onProgress?.(1, 'הושלם');

    return {
      tubesL2: core.tubesL2,
      tubesL3: core.tubesL3,
      tubesMetalFringe: core.tubesMetalFringe,
      tubesQ1Ceramic: core.tubesQ1Ceramic,
      tubesQ3Threads: core.tubesQ3Threads,
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

export async function renderThreePbrAmuletInteractive(opts) {
  let mount = null;
  try {
    if (opts?.container) opts.container.innerHTML = '';
    const core = await renderPbrCore(opts.svg, { ...opts, darkerShadows: true });
    mount = core.mount;

    const canvas = core.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    opts.container.appendChild(canvas);
    opts.onProgress?.(1, 'הושלם');

    const orbit = attachAmuletOrbitControls(canvas, {
      scene: core.scene,
      camera: core.camera,
      renderer: core.renderer,
      baseRotY: core.baseRotY,
    });

    return {
      tubesL2: core.tubesL2,
      tubesL3: core.tubesL3,
      tubesFrame: core.tubesFrame,
      metalRough: core.metalRough,
      l3Rough: core.l3Rough,
      l3MaterialMode: core.l3MaterialMode,
      pbr: true,
      interactive: true,
      resetView: () => orbit.reset(),
    };
  } finally {
    if (mount?.parentNode) mount.parentNode.removeChild(mount);
  }
}

/**
 * Fast tube-only preview for early questionnaire steps (no stone slab / textures).
 * @param {1|2|3} vectorStage — 1: wish L3 · 2: + name L2 · 3: + Q3 layers
 */
export async function renderVectorPreviewInteractive(opts) {
  const {
    svg,
    style2,
    style3,
    container,
    vectorStage = 1,
    ageNum = 25,
    onProgress,
    autoRotate = false,
  } = opts;
  let mount = null;

  try {
    reportProgress(onProgress, 0.08, 'מצייר וקטורים…');
    mount = mountSvg(svg);
    await yieldToMainThread();

    const renderer = getOrCreateRenderer();
    const canvas = renderer.domElement;
    const canvasMounted = Boolean(container && canvas.parentNode === container);

    /* Keep the previous frame visible until the new vector pass is drawn. */
    if (!canvasMounted && container) {
      container.innerHTML = '';
    }

    disposeInteractive();
    disposeActiveScene();

    const layer3 = mount.querySelector('.layer-3');
    if (!layer3) throw new Error('layer 3 missing');
    const layer2 = mount.querySelector('.layer-2');

    renderer.setClearColor(0x000000, 0);
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    active.renderer = renderer;

    const scene = new THREE.Scene();
    const matWish = new THREE.MeshBasicMaterial({ color: 0xc8c0b2 });
    const matName = new THREE.MeshBasicMaterial({ color: 0x9da3ab });
    const matQ3 = new THREE.MeshBasicMaterial({ color: 0x6f737a });

    const zName = L2_SURFACE_Z - 4;
    const zQ3 = L2_SURFACE_Z;
    const zWish = L2_SURFACE_Z + 4;

    let tubes = 0;
    const age = Math.max(1, Math.min(120, Number(ageNum) || 25));

    if (vectorStage >= 2 && layer2) {
      tubes += addTubesFromLayer(layer2, mount, matName, scene, zName, 18, style3, age, style2);
    }

    if (vectorStage >= 3) {
      for (const sel of ['.layer-q3-thread', '.layer-q3-stone-engrave']) {
        const el = mount.querySelector(sel);
        if (el) {
          tubes += addTubesFromLayer(el, mount, matQ3, scene, zQ3, 22, style3, age, style2);
        }
      }
    }

    tubes += addTubesFromLayer(layer3, mount, matWish, scene, zWish, 28, style3, age, style2);
    if (!tubes) throw new Error('no vector paths');

    reportProgress(onProgress, 0.82, 'מסדר תצוגה…');
    await yieldToMainThread();

    const rotationY = ((age - 1) / 119) * 0.25 - 0.125;
    scene.rotation.y = rotationY;
    scene.updateMatrixWorld(true);

    const cameraHalf = fitSceneInsideFrame(scene, mount, style2, style3);
    const camera = makeCanvasCamera(cameraHalf);
    renderer.render(scene, camera);
    active.scene = scene;
    active.camera = camera;

    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    if (container && !canvasMounted) {
      container.appendChild(canvas);
    }
    opts.onProgress?.(1, 'הושלם');

    const orbit = attachAmuletOrbitControls(canvas, {
      scene,
      camera,
      renderer,
      baseRotY: rotationY,
      autoRotate,
    });

    return {
      tubes,
      vectorStage,
      pbr: false,
      vector: true,
      interactive: true,
      resetView: () => orbit.reset(),
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

/** Current interactive PBR scene (meshes + current rotation) for GLB export */
export function getActivePbrScene() {
  return active.scene ?? null;
}

export function getActivePbrRenderer() {
  return active.renderer ?? null;
}

export function getActivePbrCamera() {
  return active.camera ?? null;
}

export function captureLiveAmuletSnapshot() {
  const renderer = active.renderer;
  const scene = active.scene;
  const camera = active.camera;
  if (!renderer || !scene || !camera) return null;

  renderer.render(scene, camera);

  const dom = renderer.domElement;
  const w = dom.width;
  const h = dom.height;
  if (!w || !h) return null;

  const snap = document.createElement('canvas');
  snap.width = w;
  snap.height = h;
  const ctx = snap.getContext('2d', { alpha: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(dom, 0, 0);
  return snap;
}

export function captureHighResSnapshot(targetPx) {
  const renderer = active.renderer;
  const scene = active.scene;
  const camera = active.camera;
  if (!renderer || !scene || !camera) return captureLiveAmuletSnapshot();
  targetPx = targetPx || 4096;

  const dom = renderer.domElement;
  const origDPR = renderer.getPixelRatio();
  const origBufferW = dom.width;
  const origBufferH = dom.height;
  const cssW = dom.clientWidth || origBufferW / Math.max(origDPR, 1);
  const cssH = dom.clientHeight || origBufferH / Math.max(origDPR, 1);

  renderer.setPixelRatio(1);
  renderer.setSize(targetPx, targetPx, false);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);

  const snap = document.createElement('canvas');
  snap.width = targetPx;
  snap.height = targetPx;
  snap.getContext('2d', { alpha: true }).drawImage(dom, 0, 0);

  renderer.setPixelRatio(origDPR);
  renderer.setSize(cssW, cssH, false);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  return snap;
}

/**
 * Garden snapshot — copy the live frame (never resize the active renderer).
 */
export function captureAmuletSnapshotForGarden() {
  return captureLiveAmuletSnapshot();
}

/** Clone the live PBR scene for garden 3D spin (user amulet 008 only). */
export function cloneActivePbrSceneForGarden() {
  const src = active.scene;
  if (!src) return null;
  const clone = src.clone(true);
  clone.rotation.copy(src.rotation);
  return clone;
}

/** Build a detached PBR scene clone (e.g. after page reload from stored answers). */
export async function buildPbrSceneCloneForGarden(opts) {
  const core = await renderPbrCore(opts.svg, opts);
  const mount = core.mount;
  const clone = core.scene.clone(true);
  clone.rotation.copy(core.scene.rotation);
  core.renderer.dispose();
  disposeScene(core.scene);
  if (mount?.parentNode) mount.parentNode.removeChild(mount);
  active.scene = null;
  active.camera = null;
  active.renderer = null;
  active.interactive = null;
  active.ceramicMeshes = null;
  active.q5MaterialMeshes = null;
  active.ceramicQ1Material = null;
  active.ceramicQ5Feeling = null;
  active.stoneMesh = null;
  active.q5AccentLights = null;
  return clone;
}

/** Lighter vector-tube scene for garden spin — avoids full PBR freeze on reload. */
export async function buildVectorSceneCloneForGarden(opts) {
  const container = document.createElement('div');
  container.hidden = true;
  container.style.cssText =
    'position:fixed;left:-10000px;top:0;width:680px;height:680px;opacity:0;pointer-events:none';
  document.body.appendChild(container);
  try {
    await renderVectorPreviewInteractive({
      svg: opts.svg,
      style2: opts.style2,
      style3: opts.style3,
      container,
      vectorStage: 3,
      ageNum: opts.ageNum ?? 25,
      autoRotate: false,
    });
    const src = active.scene;
    if (!src) throw new Error('vector scene missing');
    const clone = src.clone(true);
    clone.rotation.copy(src.rotation);
    disposeInteractive();
    if (active.renderer) {
      active.renderer.dispose();
      active.renderer = null;
    }
    disposeScene(src);
    active.scene = null;
    active.camera = null;
    return clone;
  } finally {
    container.remove();
  }
}

/** Same rig as prototype-v2-unified.html addMetalLights — side key + rim on tube metal. */
function addUnifiedMetalPreviewLights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x505060, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 4.2);
  key.position.set(-480, 720, 880);
  const fill = new THREE.DirectionalLight(0x90a8e0, 1.8);
  fill.position.set(580, 160, 520);
  const rim = new THREE.DirectionalLight(0xfff4e0, 2.6);
  rim.position.set(420, -580, 700);
  const under = new THREE.DirectionalLight(0x707080, 0.7);
  under.position.set(0, -800, 400);
  scene.add(key, fill, rim, under);
}

function addMetalPreviewLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.22));
  scene.add(new THREE.HemisphereLight(0xf0f4ff, 0x606878, 0.42));
  const key = new THREE.DirectionalLight(0xffffff, 6.4);
  key.position.set(0.5, 1.6, 2.8);
  const rim = new THREE.DirectionalLight(0xd8e4ff, 4.2);
  rim.position.set(-2.4, 0.6, -1.2);
  const fill = new THREE.DirectionalLight(0xfff4e8, 2.4);
  fill.position.set(2.0, -0.3, 1.6);
  const spec = new THREE.DirectionalLight(0xffffff, 4.2);
  spec.position.set(-0.6, 2.2, 2.2);
  const fringe = new THREE.DirectionalLight(0xe8f0ff, 3.6);
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
  await yieldToMainThread();
  reportProgress(opts.onProgress, 0.05, 'טוען אבן…');

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
    'stone',
    opts
  );
  geom.computeBoundingBox();

  const renderer = createLayerPreviewRenderer(0x080808, 1.12);
  const scene = new THREE.Scene();
  scene.environment = null;
  const q4Belief = opts.questionnaire?.q4Belief ?? 'concrete_actions';
  if (isMeteoriteQ4Belief(q4Belief)) addMeteoriteStoneLights(scene);
  else addStoneSculptureLights(scene);

  const mat = buildStoneMaterial(
    style2,
    opts.questionnaire?.q4Belief ?? 'concrete_actions',
    active.envMap,
    opts.questionnaire
  ).material;
  const mesh = new THREE.Mesh(geom, mat);
  mesh.scale.set(SLAB_STONE_XY_SCALE, SLAB_STONE_XY_SCALE, 1);
  geom.computeBoundingBox();
  const zFront = geom.boundingBox.max.z;
  mesh.position.z = L2_SURFACE_Z - zFront - L3_STONE_BACK_GAP;
  mesh.renderOrder = STONE_RENDER_ORDER;

  const group = new THREE.Group();
  group.add(mesh);

  const { span } = centerGroupAtOrigin(group);
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 5000);
  const dist = span * 0.88;
  camera.position.set(span * 0.14, span * 0.1, dist);
  camera.lookAt(0, -span * 0.03, span * 0.01);
  reportProgress(opts.onProgress, 0.96, 'רינדור…');
  await yieldToMainThread();
  renderer.render(scene, camera);
  mountLayerPreviewCanvas(renderer, container);
  opts.onProgress?.(1, 'הושלם');

  disposeScene(scene);
  renderer.dispose();
  if (mount.parentNode) mount.parentNode.removeChild(mount);

  return { ok: true, span, fringeCount: 0 };
}

/**
 * Close-up render of the solid metal tubes (Q1), no stone.
 * @param {{ svg: string, style3: object, questionnaire: object, container: HTMLElement }} opts
 */
export async function renderMetalLayerPreview(opts) {
  const { svg, style2, style3, questionnaire, container, ageNum } = opts;
  const mount = mountSvg(svg);
  await yieldToMainThread();
  reportProgress(opts.onProgress, 0.08, 'מכין מתכת…');

  const stoneSlabMask = buildStoneSlabMaskForMetal(mount, style2, style3, questionnaire);
  if (!stoneSlabMask) throw new Error('metal preview: no stone shape (Q2)');

  const metalPlateMask = resolveMetalPlateMask(mount, stoneSlabMask, style3, questionnaire);
  const metalPack = buildMetalRepousseLayerPack(
    mount,
    stoneSlabMask,
    metalPlateMask,
    style3,
    questionnaire
  );
  if (!metalPack?.embossPolylines?.length) throw new Error('metal preview: no .layer-metal-emboss paths');

  reportProgress(opts.onProgress, 0.45, 'מתכת…');
  await yieldToMainThread();

  const renderer = createLayerPreviewRenderer(0xffffff, 1.18);
  active.renderer = renderer;
  const scene = new THREE.Scene();
  scene.environment = getStudioEnvMap(renderer);
  addUnifiedMetalPreviewLights(scene);

  const mat = buildSavedRoughnessMetalMaterial(
    getStudioEnvMap(renderer),
    unifiedMetalRoughnessFromAge(ageNum)
  );
  const group = new THREE.Group();
  addTubesFromPolylines(
    metalPack.embossPolylines,
    mat,
    group,
    0,
    0,
    style3,
    ageNum,
    null,
    { xyScale: 1, radiusScale: SLAB_METAL_RADIUS_SCALE * 0.92 }
  );

  const { span } = centerGroupAtOrigin(group);
  scene.add(group);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 8000);
  const dist = span * 1.22;
  camera.position.set(span * 0.07, -span * 0.09, dist);
  camera.lookAt(0, 0, span * 0.38);

  reportProgress(opts.onProgress, 0.72, 'רינדור מתכת…');
  await yieldToMainThread();
  renderer.render(scene, camera);
  mountLayerPreviewCanvas(renderer, container);
  opts.onProgress?.(1, 'הושלם');

  disposeScene(scene);
  renderer.dispose();
  active.renderer = null;
  if (mount.parentNode) mount.parentNode.removeChild(mount);

  return { ok: true, span, fringeCount: 0 };
}

export {
  buildStoneMaterial,
  buildPremiumStoneMaterial,
  buildAncientStonewareMaterial,
  buildDeepStonewareMaterial,
  buildPolishedJadeMarbleMaterial,
  buildPolishedSlateMarbleMaterial,
  q4StonePreset,
  Q4_STONE_PRESET,
  PREMIUM_MATERIAL_IDS,
  PREMIUM_MATERIAL_LIBRARY,
  addStoneLights,
  addStoneRefLights,
  addStoneSculptureLights,
  buildProceduralStoneTextures,
  deriveAmuletShapeParams,
  METAL_ELLIPSE_BY_BELIEF,
  buildCeramicQ1MaterialFromQ5,
  Q5_CERAMIC_MATERIAL,
};
