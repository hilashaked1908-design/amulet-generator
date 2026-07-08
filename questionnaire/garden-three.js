/**
 * Amulet garden — Cyber Garden style (ground-plane pan + low camera + sprites).
 */
console.log('%c[garden-three] v20250707-white-fog-v2 loaded', 'color:lime;font-size:14px');
import * as THREE from './vendor/three.module.js';
import { createLucaFog } from './garden-fog.js';

function glbStore() { return import('./amulet-glb-store.js'); }

function isDepthShadeEnabled() {
  const body = document.body;
  return (
    !body.classList.contains('is-site-intro-open') &&
    !body.classList.contains('is-about-overlay-open') &&
    !body.classList.contains('is-create-mode') &&
    !body.classList.contains('pagmar-create') &&
    !body.classList.contains('is-amulet-ready') &&
    !body.classList.contains('is-panel-open') &&
    !body.classList.contains('is-spec-panel-open')
  );
}

const STORAGE_KEY = 'amuletQuestionnaire';
const SNAPSHOT_KEY = 'amuletUserSnapshot';
const POSITION_KEY = 'amuletUserPosition';
const USER_ANSWERS_KEY = 'amuletUserAnswers';
const PLACEMENT_ANCHOR_KEY = 'amuletUserPlacementAnchor';
const POSITION_VERSION_KEY = 'amuletUserPositionVersion';
const POSITION_VERSION = '20250705-placement-anchor';
const COLLECTION_KEY = 'amuletCollection';
/** Tiny JPEG thumb kept in localStorage; full image lives in IndexedDB. */
const COLLECTION_LS_THUMB_PX = 280;
const COLLECTION_LS_SNAPSHOT_MAX_CHARS = 96000;
/** Fixed garden slot for user-created amulets — same depth as gallery row 1. */
const USER_AMULET_SLOT = { x: 4.0, z: 2.5 };

/** NEW amulets [018]+ — wide meadow from anchor [014], alternating wings + depth rows. */
const NEW_AMULET_FIRST_LABEL = 18;
const NEW_AMULET_WING_BASE_PX = 380;
const NEW_AMULET_WING_ROW_GROW_PX = 95;
const NEW_AMULET_DEPTH_BASE_PX = 50;
const NEW_AMULET_DEPTH_ROW_PX = 110;
const NEW_AMULET_DEPTH_JITTER_PX = [0, 34, 20, 48];
/** Scattered meadow slots (screen px from anchor [014]) — fills sides, forward, and back. */
const SPREAD_MEADOW_SLOTS = [
  { side: -420, depth: 45 },
  { side: 420, depth: 75 },
  { side: -280, depth: 130 },
  { side: 280, depth: 160 },
  { side: -560, depth: 95 },
  { side: 560, depth: 185 },
  { side: -160, depth: 210 },
  { side: 160, depth: 240 },
  { side: 0, depth: 100 },
  { side: -340, depth: 290 },
  { side: 340, depth: 320 },
  { side: -480, depth: 350 },
  { side: 480, depth: 380 },
  { side: -620, depth: 260 },
  { side: 620, depth: 300 },
  { side: -80, depth: 390 },
  { side: 80, depth: 420 },
  { side: -520, depth: 460 },
  { side: 520, depth: 490 },
  { side: 0, depth: 430 },
  { side: -240, depth: 530 },
  { side: 240, depth: 560 },
  { side: -360, depth: -35 },
  { side: 360, depth: -15 },
  { side: -180, depth: -55 },
  { side: 180, depth: -25 },
  { side: -440, depth: -20 },
  { side: 440, depth: 10 },
];
const SPREAD_GRID_LAYOUT_TAG = 'spread-grid-v12';
const CHAIN_CLEARANCE = 0.55;
const CHAIN_WIDE_ROW_ANCHOR_LABEL = 14;
const REVERT_V10_LAYOUT_PREFIX = 'chain-wide-v10';
const RESTORED_LAYOUT_PREFIX = 'preserved-pos-v9';
const LOCKED_CHAIN_LABEL_TAG = 'locked-chain-v1';

/** Locked positions for [015]/[016] — 100px after prev, offset sideways. */
const LOCKED_CHAIN_LABELS = [
  { label: 15, prevLabel: 14, afterPx: 100, sidePx: -180 },
  { label: 16, prevLabel: 15, afterPx: 100, sidePx: 180 },
];

/** One-time restore nudges (existing [017] only). */
const CHAIN_SAVED_LABEL_NUDGE = {
  17: { rightPx: 60, forwardPx: 200 },
};

/** Cyber Garden–style movement: low camera, hold + slide on ground plane */
const CAMERA_Y_BASE = 1.5;
const PAN_SPEED = 0.028;
const LOOK_AHEAD = 6;
const ZOOM_SPEED = 0.012;
const DEFAULT_MIN_CAMERA_Z = -32;
let minCameraZ = DEFAULT_MIN_CAMERA_Z;
const MAX_CAMERA_Z = 42;
const CAMERA_Z_PADDING = 12;
const CAMERA_X_PADDING = 14;
let minCameraX = -18;
let maxCameraX = 18;
const LOOK_AT_Y_BASE = -0.45;
const CAMERA_FOV = 58;
const SPRITE_WORLD_Y = -1.38;
const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), -SPRITE_WORLD_Y);

/** Original garden layout + screen-pixel nudges from opening camera. */
const AMULET_LAYOUT_BASE = [
  { tex: 0, x: -6.46, z: 3.57 },
  { tex: 1, x: -0.04, z: 1.69 },
  { tex: 2, x: 8.72, z: 1.45 },
  { tex: 3, x: 8.8, z: -6.55 },
  { tex: 4, x: -7.76, z: -12.06 },
  { tex: 5, x: 1.62, z: -18.67 },
];

/** Per-amulet screen nudges from opening camera (right / back; negative back = forward). */
const AMULET_SCREEN_NUDGES_PX = [
  { tex: 0, rightPx: 20, backPx: -20 }, // 001 — right 20, forward 20
  { tex: 1, backPx: 80 }, // 002 — 80px back (100 − 20 forward)
];

/** Opening — frame gallery amulets 001–003 (left / centre / right). */
const OPENING_FRAME_TEX = [0, 1, 2];
const OPENING_SHIFT_RIGHT_PX = 120;
const OPENING_ZOOM_IN_PX = 150;
/** Extra opening-camera nudge in screen pixels (left / back). */
const OPENING_CAMERA_NUDGE_LEFT_PX = 80;
/** 100 base + 450 pull-back — camera farther from amulets at opening. */
const OPENING_CAMERA_NUDGE_BACK_PX = 550;
const OPENING_REF_VIEWPORT_H = 1080;
const OPENING_CAMERA_BACK_Z = 8.2;
const OPENING_CAMERA_SIDE_X = 1.4;
/** Amulets sit lower on screen at opening; camera + lookAt lift together (same pitch). */
const OPENING_AMULETS_LOWER_PX = 100;
const OPENING_VIEW_REF_DIST = 9;
const OPENING_VIEW_Y_OFFSET =
  OPENING_AMULETS_LOWER_PX /
  (OPENING_REF_VIEWPORT_H /
    (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * OPENING_VIEW_REF_DIST));
const CAMERA_Y = CAMERA_Y_BASE + OPENING_VIEW_Y_OFFSET;
const LOOK_AT_Y = LOOK_AT_Y_BASE + OPENING_VIEW_Y_OFFSET;
/** Revert one-time opening down-nudge if it was applied earlier. */
const OPENING_DOWN_MIGRATION_KEY = 'opening-down-200-v1';
const OPENING_DOWN_REVERT_KEY = 'opening-down-200-revert-v1';
const OPENING_DOWN_NUDGE_PX = 200;

function openingFrameCentroid(layout = AMULET_LAYOUT_BASE) {
  const slots = layout.filter((l) => OPENING_FRAME_TEX.includes(l.tex));
  let x = 0;
  let z = 0;
  for (const s of slots) {
    x += s.x;
    z += s.z;
  }
  return { x: x / slots.length, z: z / slots.length };
}

function openingFrameDist(camX, camZ, layout = AMULET_LAYOUT_BASE) {
  const focus = openingFrameCentroid(layout);
  return Math.hypot(camX - focus.x, CAMERA_Y - SPRITE_WORLD_Y, camZ - focus.z);
}

function openingPxPerUnit(dist) {
  return OPENING_REF_VIEWPORT_H / (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * dist);
}

function applyOpeningCameraPixelNudge(pose, leftPx, backPx) {
  const camPos = new THREE.Vector3(pose.x, CAMERA_Y, pose.z);
  const lookAt = new THREE.Vector3(pose.x, LOOK_AT_Y, pose.z - LOOK_AHEAD);
  const view = new THREE.Vector3().subVectors(lookAt, camPos).normalize();
  const right = new THREE.Vector3().crossVectors(view, new THREE.Vector3(0, 1, 0)).normalize();
  const wpp = 1 / openingPxPerUnit(openingFrameDist(pose.x, pose.z));
  camPos.addScaledVector(right, -leftPx * wpp);
  camPos.addScaledVector(view, -backPx * wpp);
  return { x: camPos.x, y: CAMERA_Y, z: camPos.z };
}

function openingCameraPose(layout = AMULET_LAYOUT_BASE) {
  const focus = openingFrameCentroid(layout);
  const baseX = focus.x + OPENING_CAMERA_SIDE_X;
  const baseZ = focus.z + OPENING_CAMERA_BACK_Z;
  const px0 = openingPxPerUnit(openingFrameDist(baseX, baseZ, layout));
  const x = baseX - OPENING_SHIFT_RIGHT_PX / px0;
  const px1 = openingPxPerUnit(openingFrameDist(x, baseZ, layout));
  const z = baseZ - OPENING_ZOOM_IN_PX / px1;
  return applyOpeningCameraPixelNudge(
    { x, y: CAMERA_Y, z },
    OPENING_CAMERA_NUDGE_LEFT_PX,
    OPENING_CAMERA_NUDGE_BACK_PX
  );
}

const _openingProjectCam = new THREE.PerspectiveCamera(CAMERA_FOV, 1920 / 1080, 0.1, 200);
const _openingProjectPt = new THREE.Vector3();

function amuletScreenAtOpening(x, z, cameraPose) {
  _openingProjectCam.position.set(cameraPose.x, CAMERA_Y, cameraPose.z);
  _openingProjectCam.lookAt(cameraPose.x, LOOK_AT_Y, cameraPose.z - LOOK_AHEAD);
  _openingProjectCam.updateMatrixWorld(true);
  _openingProjectPt.set(x, SPRITE_WORLD_Y, z);
  _openingProjectPt.project(_openingProjectCam);
  return {
    cx: (_openingProjectPt.x * 0.5 + 0.5) * 1920,
    cy: (-_openingProjectPt.y * 0.5 + 0.5) * 1080,
  };
}

/** Move a ground anchor along opening view until screen position shifts by `screenDistPx` (negative = forward). */
function nudgeAlongOpeningViewPx(x, z, screenDistPx, cameraPose) {
  const start = amuletScreenAtOpening(x, z, cameraPose);
  const camPos = new THREE.Vector3(cameraPose.x, CAMERA_Y, cameraPose.z);
  const lookAt = new THREE.Vector3(cameraPose.x, LOOK_AT_Y, cameraPose.z - LOOK_AHEAD);
  const view = new THREE.Vector3().subVectors(lookAt, camPos).normalize();
  const sign = screenDistPx >= 0 ? 1 : -1;
  const target = Math.abs(screenDistPx);
  let lo = 0;
  let hi = Math.max(4, target * 0.12);
  for (let i = 0; i < 48; i += 1) {
    const mid = (lo + hi) * 0.5;
    const next = amuletScreenAtOpening(
      x + view.x * sign * mid,
      z + view.z * sign * mid,
      cameraPose
    );
    const dist = Math.hypot(next.cx - start.cx, next.cy - start.cy);
    if (dist < target) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) * 0.5;
  return { x: x + view.x * sign * t, z: z + view.z * sign * t };
}

function nudgeScreenRightPx(x, z, rightPx, cameraPose) {
  const camPos = new THREE.Vector3(cameraPose.x, CAMERA_Y, cameraPose.z);
  const lookAt = new THREE.Vector3(cameraPose.x, LOOK_AT_Y, cameraPose.z - LOOK_AHEAD);
  const view = new THREE.Vector3().subVectors(lookAt, camPos).normalize();
  const right = new THREE.Vector3().crossVectors(view, new THREE.Vector3(0, 1, 0)).normalize();
  const dist = Math.hypot(x - camPos.x, CAMERA_Y - SPRITE_WORLD_Y, z - camPos.z);
  const wpp = 1 / openingPxPerUnit(dist);
  return {
    x: x + right.x * rightPx * wpp,
    z: z + right.z * rightPx * wpp,
  };
}

function nudgeScreenDownPx(x, z, downPx, cameraPose) {
  const camPos = new THREE.Vector3(cameraPose.x, CAMERA_Y, cameraPose.z);
  const lookAt = new THREE.Vector3(cameraPose.x, LOOK_AT_Y, cameraPose.z - LOOK_AHEAD);
  const view = new THREE.Vector3().subVectors(lookAt, camPos).normalize();
  const right = new THREE.Vector3().crossVectors(view, new THREE.Vector3(0, 1, 0)).normalize();
  const camUp = new THREE.Vector3().crossVectors(right, view).normalize();
  const down = new THREE.Vector3(-camUp.x, 0, -camUp.z);
  if (down.lengthSq() < 1e-8) return { x, z };
  down.normalize();
  const dist = Math.hypot(x - camPos.x, CAMERA_Y - SPRITE_WORLD_Y, z - camPos.z);
  const wpp = 1 / openingPxPerUnit(dist);
  return {
    x: x + down.x * downPx * wpp,
    z: z + down.z * downPx * wpp,
  };
}

function buildAmuletLayout() {
  const openingPose = openingCameraPose();
  const byTex = new Map(AMULET_LAYOUT_BASE.map((slot) => [slot.tex, { ...slot }]));
  for (const { tex, rightPx, backPx } of AMULET_SCREEN_NUDGES_PX) {
    const slot = byTex.get(tex);
    if (!slot) continue;
    if (rightPx) {
      const right = nudgeScreenRightPx(slot.x, slot.z, rightPx, openingPose);
      slot.x = right.x;
      slot.z = right.z;
    }
    if (backPx) {
      const depth = nudgeAlongOpeningViewPx(slot.x, slot.z, backPx, openingPose);
      slot.x = depth.x;
      slot.z = depth.z;
    }
  }
  return AMULET_LAYOUT_BASE.map((slot) => byTex.get(slot.tex));
}

const AMULET_LAYOUT = buildAmuletLayout();
const INITIAL_CAMERA = openingCameraPose();

/** Float disabled — keeps amulet anchors stable. */
const FLOAT_AMP_Y = 0;
const FLOAT_AMP_X = 0;
const FLOAT_AMP_Z = 0;

/** Uniform world scale (+200px apparent diameter vs original 7.0 at opening distance). */
const SPRITE_PX_EXTRA = 200;
const SPRITE_REF_DIST = 10;
const SPRITE_SIZE =
  7.0 +
  SPRITE_PX_EXTRA /
    (OPENING_REF_VIEWPORT_H / (2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)) * SPRITE_REF_DIST));
/** Anchor nudge — original screen placement. */
const SCREEN_LOWER_PX = 570;
const CLICK_DRAG_PX = 8;
/** Full 360° spin when an amulet is clicked — slow one-sided Y rotation on the sprite */
const AMULET_SPIN_MS = 2800;
/** Subtle scale while spec panel is open for that amulet */
const SELECTED_SCALE = 1.05;
const SCALE_LERP = 0.18;
const FOCUS_FADE_LERP = 0.22;
/** Tighter screen bounds for hit tests and spec-panel anchoring (opaque content, not full quad). */
const VISUAL_HIT_FACTOR = 0.38;
/** Cyber Garden–style blue depth sheet — sprites pass through while scrolling. */
const FOG_VEIL_AHEAD = 42;
const SPRITE_ORDER_BEHIND_VEIL = 2;
const SPRITE_ORDER_IN_FRONT = 8;
const MAX_PIXEL_RATIO = 2;

const mount = document.getElementById('questionGarden');
if (!mount) throw new Error('#questionGarden not found');
if (location.protocol === 'file:') {
  mount.innerHTML =
    '<p style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#f4f4f4;font-family:sans-serif;padding:2rem;text-align:center;line-height:1.6">פתחי דרך השרת המקומי:<br><code style="color:#ccc">http://localhost:8080/questionnaire/index.html</code></p>';
  throw new Error('Garden requires local server (not file://)');
}

const questions = window.AMULET_QUESTIONS || [];
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  premultipliedAlpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.sortObjects = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
renderer.domElement.style.background = 'transparent';
mount.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.add(new THREE.AmbientLight(0xffffff, 0.92));

const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200);
camera.position.set(INITIAL_CAMERA.x, INITIAL_CAMERA.y, INITIAL_CAMERA.z);

let lucaFog = null;
createLucaFog({ scene, camera, domElement: renderer.domElement })
  .then((fog) => {
    lucaFog = fog;
    console.info('[garden-three] Luca fog ready');
  })
  .catch((err) => console.error('[garden-three] Luca fog failed', err));

let lastCameraZ = INITIAL_CAMERA.z;
let gridTravelZ = 0;

function lookForward() {
  camera.position.y = CAMERA_Y;
  camera.lookAt(camera.position.x, LOOK_AT_Y, camera.position.z - LOOK_AHEAD);
}

function notifyCameraMove(sync) {
  const dz = camera.position.z - lastCameraZ;
  lastCameraZ = camera.position.z;
  gridTravelZ -= dz;

  window.dispatchEvent(
    new CustomEvent('questionnaire:camera-move', {
      detail: { travel: gridTravelZ, sync: sync || 'wheel' },
    })
  );
}

lookForward();
notifyCameraMove();

const sprites = [];
const _proj = new THREE.Vector3();
let controlsEnabled =
  !document.body.classList.contains('is-site-intro-open') &&
  !document.body.classList.contains('is-about-overlay-open');
let selectedIndex = null;
let pointerDown = null;
let lastPointer = {
  x: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight * 0.5 : 0,
};
let userAmuletSprite = null;
let collectionSprites = [];
let livePlacementAnchor = null;
/** Prepared PBR mesh for user amulet 008 — true 3D spin in the garden. */
let userAmuletMeshTemplate = null;
let userAmuletMeshTemplatePromise = null;
/** @type {{ group: THREE.Group, sprite: THREE.Sprite, baseRotY: number, fitMaxDim: number, startTime: number } | null} */
let activeUserAmulet3DSpin = null;

const USER_AMULET_INDEX = questions.length;
const _viewRay = new THREE.Raycaster();
const _viewNdc = new THREE.Vector2(0, 0);
const _groundHit = new THREE.Vector3();

function readStoredItem(key) {
  return localStorage.getItem(key) || sessionStorage.getItem(key);
}

function freeLocalStorageForCollection() {
  const keys = ['pagmarFogSeed', 'amuletComposed3D'];
  for (let i = 0; i < keys.length; i += 1) {
    try {
      localStorage.removeItem(keys[i]);
    } catch (_) {}
  }
}

function writeStoredItem(key, value) {
  let sessionOk = false;
  try {
    sessionStorage.setItem(key, value);
    sessionOk = true;
  } catch (err) {
    console.warn('[garden-three] sessionStorage write failed for', key, err);
  }

  freeLocalStorageForCollection();
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn('[garden-three] localStorage quota exceeded for', key, '– retrying after cleanup');
  }

  try {
    localStorage.removeItem(key);
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn('[garden-three] localStorage still full for', key, err);
  }

  return sessionOk;
}

function collectionWriteVerified(collection) {
  const expectedLength = collection.length;
  const expectedLastId = expectedLength ? collection[expectedLength - 1]?.id : null;
  const sources = [
    sessionStorage.getItem(COLLECTION_KEY),
    localStorage.getItem(COLLECTION_KEY),
  ];

  for (let i = 0; i < sources.length; i += 1) {
    const parsed = parseCollectionRaw(sources[i]);
    if (parsed.length !== expectedLength) continue;
    if (expectedLastId != null) {
      const last = parsed[parsed.length - 1];
      if (!last || last.id !== expectedLastId) continue;
    }
    return true;
  }
  return false;
}

function removeStoredItem(key) {
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
}

/** In-memory collection for this page session — never reload stale storage mid-flow. */
let runtimeCollection = null;

function parseCollectionRaw(raw) {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function entryMergeKey(entry) {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.id != null) return 'id:' + entry.id;
  const ts = entry.createdAt || 0;
  const snap = typeof entry.snapshot === 'string' ? entry.snapshot.slice(0, 80) : '';
  return 'fp:' + ts + ':' + snap;
}

function mergeCollectionEntries(a, b) {
  const byKey = new Map();
  for (const entry of [...a, ...b]) {
    const key = entryMergeKey(entry);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      continue;
    }
    const prefer =
      (entry.snapshot && !existing.snapshot) ||
      (entry.createdAt || 0) > (existing.createdAt || 0)
        ? entry
        : existing;
    byKey.set(key, prefer);
  }
  return [...byKey.values()].sort(function (x, y) {
    return (x.createdAt || 0) - (y.createdAt || 0);
  });
}

function readCollectionFromStorage() {
  const local = parseCollectionRaw(localStorage.getItem(COLLECTION_KEY));
  const session = parseCollectionRaw(sessionStorage.getItem(COLLECTION_KEY));
  return mergeCollectionEntries(local, session);
}

function stripHeavyCollectionFields(collection) {
  let dirty = false;
  for (let i = 0; i < collection.length; i += 1) {
    const entry = collection[i];
    if (!entry || !entry.composed3D) continue;
    delete entry.composed3D;
    dirty = true;
  }
  return dirty;
}

const SEED_COLLECTION_URL = '/questionnaire/seed/collection.json';

/** Load bundled amulets for Netlify (static seed folder). Merges with local storage. */
async function loadSeedCollectionFromFile() {
  try {
    const res = await fetch(SEED_COLLECTION_URL, { cache: 'no-store' });
    if (!res.ok) return;
    const seed = await res.json();
    if (!Array.isArray(seed) || !seed.length) return;
    const local = runtimeCollection || readCollectionFromStorage();
    runtimeCollection = local.length ? mergeCollectionEntries(local, seed) : seed.slice();
    saveCollection(runtimeCollection);
    console.log('[garden-three] loaded', seed.length, 'seed amulet(s) from', SEED_COLLECTION_URL);
  } catch (err) {
    console.warn('[garden-three] seed collection unavailable', err);
  }
}

function initCollectionFromStorage() {
  const local = parseCollectionRaw(localStorage.getItem(COLLECTION_KEY));
  const session = parseCollectionRaw(sessionStorage.getItem(COLLECTION_KEY));
  runtimeCollection = mergeCollectionEntries(local, session);
  const prevMax = Math.max(local.length, session.length);
  if (runtimeCollection.length > prevMax) {
    console.warn(
      '[garden-three] recovered',
      runtimeCollection.length - prevMax,
      'amulet(s) by merging localStorage + sessionStorage'
    );
  }
  if (stripHeavyCollectionFields(runtimeCollection)) {
    console.warn('[garden-three] stripped heavy composed3D data from collection storage');
  }
  if (runtimeCollection.length) {
    saveCollection(runtimeCollection);
  }
}

function loadCollection() {
  if (runtimeCollection) return runtimeCollection;
  runtimeCollection = readCollectionFromStorage();
  return runtimeCollection;
}

function slimCollectionEntry(entry, stripHeavy) {
  const slim = {
    id: entry.id,
    answers: entry.answers,
    position: entry.position,
    createdAt: entry.createdAt,
    snapshotInIdb: entry.id != null,
    snapshot: '',
  };
  if (entry.isLive) slim.isLive = true;
  const snap = entry.snapshot;
  if (typeof snap === 'string' && snap.length > 0) {
    if (snap.length <= COLLECTION_LS_SNAPSHOT_MAX_CHARS) {
      slim.snapshot = snap;
    }
  }
  return slim;
}

function slimCollectionPayload(collection, stripHeavy) {
  return JSON.stringify(collection.map(function (entry) {
    return slimCollectionEntry(entry, stripHeavy);
  }));
}

function saveCollection(collection) {
  if (!Array.isArray(collection)) return false;
  runtimeCollection = collection;

  const attempts = [
    function () { return slimCollectionPayload(collection, false); },
    function () { return slimCollectionPayload(collection, true); },
    function () {
      return JSON.stringify(collection.map(function (entry) {
        return {
          id: entry.id,
          answers: entry.answers,
          position: entry.position,
          createdAt: entry.createdAt,
          snapshotInIdb: entry.id != null,
          snapshot: '',
        };
      }));
    },
  ];

  freeLocalStorageForCollection();
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      const payload = attempts[i]();
      if (!writeStoredItem(COLLECTION_KEY, payload)) continue;
      if (collectionWriteVerified(collection)) {
        if (i > 0) {
          console.warn('[garden-three] collection saved using reduced payload (level', i, ')');
        }
        return true;
      }
    } catch (err) {
      console.warn('[garden-three] collection save attempt', i, 'failed', err);
    }
  }

  console.error(
    '[garden-three] CRITICAL: could not save',
    collection.length,
    'amulet(s) — localStorage full. Do not refresh.'
  );
  return false;
}

function persistCollectionEntryPosition(collection, collectionIndex, sprite) {
  const list = collection || loadCollection();
  const entry = list[collectionIndex];
  if (!entry || !sprite) return list;
  entry.position = spritePositionPayload(sprite);
  saveCollection(list);
  return list;
}

function persistLiveAmuletPositions() {
  if (userAmuletSprite) {
    const x = userAmuletSprite.userData.floatAnchorX ?? userAmuletSprite.position.x;
    const z = userAmuletSprite.userData.floatAnchorZ ?? userAmuletSprite.position.z;
    persistUserAmuletPosition(x, z);
  }
  const collection = loadCollection();
  if (!collection.length) return;
  let dirty = false;
  for (const sprite of collectionSprites) {
    const idx = sprite.userData.collectionIndex;
    if (typeof idx !== 'number' || idx < 0 || idx >= collection.length) continue;
    const next = spritePositionPayload(sprite);
    const prev = normalizeSavedPosition(collection[idx].position);
    if (!prev || prev.x !== next.x || prev.z !== next.z || prev.yWorld !== next.yWorld) {
      collection[idx].position = next;
      dirty = true;
    }
  }
  if (dirty) saveCollection(collection);
}

/** Absolute garden slots by display label — bypasses screen nudges when set. */
const COLLECTION_ABSOLUTE_SLOTS = {
  10: { x: 0.2, z: -0.55, yWorld: -1.95 }, // [010]
};

/** Fine-tune collection slots by display label ([011]+) — relative nudges. */
const COLLECTION_LABEL_LAYOUT = {
  11: { zWorld: -5.5, backPx: 220, downPx: 480 }, // 011 — back + lower, visible on opening
  12: { zWorld: 4.0, xWorld: -6.0, rightPx: 240, backPx: 160, downPx: 50 }, // 012 — more back, bit lower
};

/** [021] — visible slot next to [020], not far wing (pan required). */
const LABEL_021_CHAIN_OFFSET = { afterPx: 140, sidePx: 200 };
const LABEL_021_FORCED_TAG = 'label-021-visible-v3';

/** One-time saved-position nudges for specific labels (applied once, persisted). */
const COLLECTION_SAVED_LABEL_NUDGE = {};

function collectionDisplayLabel(collectionIndex) {
  return USER_AMULET_INDEX + collectionIndex + 1;
}

function applyCollectionLabelLayout(x, z, collectionIndex) {
  const fine = COLLECTION_LABEL_LAYOUT[collectionDisplayLabel(collectionIndex)];
  if (!fine) return { x, z };
  if (fine.xWorld) x += fine.xWorld;
  if (fine.zWorld) z += fine.zWorld;
  if (fine.rightPx || fine.backPx || fine.downPx) {
    const pose = openingCameraPose();
    if (fine.rightPx) {
      const right = nudgeScreenRightPx(x, z, fine.rightPx, pose);
      x = right.x;
      z = right.z;
    }
    if (fine.downPx) {
      const down = nudgeScreenDownPx(x, z, fine.downPx, pose);
      x = down.x;
      z = down.z;
    }
    if (fine.backPx) {
      const depth = nudgeAlongOpeningViewPx(x, z, fine.backPx, pose);
      x = depth.x;
      z = depth.z;
    }
  }
  return { x, z };
}

function collectionSlotPosition(index) {
  if (index === 0) {
    return { x: USER_AMULET_SLOT.x, z: USER_AMULET_SLOT.z };
  }
  const pose = openingCameraPose();
  const label = collectionDisplayLabel(index);
  if (label === 21 && index > 0) {
    const chained = positionRelativeToPrevIndex(
      index - 1,
      index,
      pose,
      LABEL_021_CHAIN_OFFSET.afterPx,
      LABEL_021_CHAIN_OFFSET.sidePx
    );
    if (chained) return chained;
  }
  const wide = positionForNewAmulet(index, pose);
  if (wide) return wide;
  const chained = positionRelativeToPrevIndex(index - 1, index, pose);
  if (chained) return chained;
  return { x: 0, z: -8 - index * 6 };
}

function hasSavedPosition(pos) {
  return normalizeSavedPosition(pos) != null;
}

function normalizeSavedPosition(pos) {
  if (!pos) return null;
  if (Array.isArray(pos) && pos.length >= 3) {
    return {
      x: pos[0],
      z: pos[2],
      yWorld: typeof pos[1] === 'number' ? pos[1] : undefined,
    };
  }
  if (typeof pos.x === 'number' && typeof pos.z === 'number') {
    return {
      x: pos.x,
      z: pos.z,
      yWorld: pos.yWorld,
    };
  }
  return null;
}

function collectionIndexForLabel(label) {
  const collection = loadCollection();
  for (let i = 0; i < collection.length; i += 1) {
    if (collectionDisplayLabel(i) === label) return i;
  }
  return -1;
}

function disposeGardenSprite(sprite) {
  if (!sprite) return;
  scene.remove(sprite);
  sprite.material?.map?.dispose?.();
  sprite.material?.dispose?.();
  const idx = sprites.indexOf(sprite);
  if (idx >= 0) sprites.splice(idx, 1);
}

const PURGE_LABELS_021_KEY = 'purge-labels-021-022-023-v1';

function removeCollectionEntriesByLabels(labels) {
  const labelSet = new Set(labels.map(Number));
  const collection = loadCollection();
  if (!collection.length) return Promise.resolve([]);

  const removed = [];
  const kept = [];
  for (let i = 0; i < collection.length; i += 1) {
    const label = collectionDisplayLabel(i);
    if (labelSet.has(label)) {
      removed.push({ entry: collection[i], label: label });
    } else {
      kept.push(collection[i]);
    }
  }
  if (!removed.length) return Promise.resolve([]);

  const removedIds = new Set(
    removed.map(function (item) { return item.entry && item.entry.id; }).filter(function (id) { return id != null; })
  );

  return glbStore().then(function (store) {
    return Promise.all(removed.map(function (item) {
      const id = item.entry && item.entry.id;
      if (id == null) return Promise.resolve();
      const snapKey = 'collection-' + id;
      return Promise.all([
        store.deleteGlb(snapKey).catch(function () {}),
        store.deleteGlb('snap-' + snapKey).catch(function () {}),
      ]);
    }));
  }).then(function () {
    runtimeCollection = kept;
    saveCollection(kept);

    for (const sprite of collectionSprites.slice()) {
      const entryId = sprite.userData.collectionEntryId;
      if (removedIds.has(entryId)) {
        disposeGardenSprite(sprite);
        const ci = collectionSprites.indexOf(sprite);
        if (ci >= 0) collectionSprites.splice(ci, 1);
        continue;
      }
      const newIdx = kept.findIndex(function (entry) { return entry && entry.id === entryId; });
      if (newIdx >= 0) {
        sprite.userData.collectionIndex = newIdx;
        sprite.userData.questionIndex = USER_AMULET_INDEX + newIdx;
      }
    }

    if (userAmuletSprite && removedIds.has(userAmuletSprite.userData.collectionEntryId)) {
      disposeGardenSprite(userAmuletSprite);
      userAmuletSprite = null;
      removeStoredItem(SNAPSHOT_KEY);
      removeStoredItem(POSITION_KEY);
      removeStoredItem(USER_ANSWERS_KEY);
      removeStoredItem(PLACEMENT_ANCHOR_KEY);
      livePlacementAnchor = null;
      document.body.classList.remove('has-user-amulet');
    }

    updateCameraScrollLimits();
    console.log(
      '[garden-three] removed amulet(s):',
      removed.map(function (item) {
        return '[' + String(item.label).padStart(3, '0') + ']';
      }).join(', ')
    );
    return removed;
  });
}

function purgeAmulets021022023Once() {
  try {
    if (localStorage.getItem(PURGE_LABELS_021_KEY) === 'done') return Promise.resolve();
  } catch (_) {}

  const targets = [21, 22, 23];
  const hasAny = targets.some(function (label) {
    return collectionIndexForLabel(label) >= 0;
  });
  if (!hasAny) {
    try {
      localStorage.setItem(PURGE_LABELS_021_KEY, 'done');
    } catch (_) {}
    return Promise.resolve([]);
  }

  return removeCollectionEntriesByLabels(targets).then(function (removed) {
    if (removed.length) {
      try {
        localStorage.setItem(PURGE_LABELS_021_KEY, 'done');
      } catch (_) {}
    }
    return removed;
  });
}

function afterPxForChainSlot(slotIndex) {
  if (slotIndex <= 0) return 0;
  return 40 + (slotIndex * 37) % 16;
}

function chainWideAnchorIndex() {
  return collectionIndexForLabel(CHAIN_WIDE_ROW_ANCHOR_LABEL);
}

function chainWideStartIndex() {
  const anchorIdx = chainWideAnchorIndex();
  return anchorIdx >= 0 ? anchorIdx + 1 : -1;
}

function newAmuletSpreadOffset(label) {
  const offset = label - NEW_AMULET_FIRST_LABEL;
  const slot = SPREAD_MEADOW_SLOTS[offset % SPREAD_MEADOW_SLOTS.length];
  const ring = Math.floor(offset / SPREAD_MEADOW_SLOTS.length);
  const jitter = NEW_AMULET_DEPTH_JITTER_PX[offset % NEW_AMULET_DEPTH_JITTER_PX.length];
  const sideSign = slot.side === 0 ? (offset % 2 === 0 ? 1 : -1) : Math.sign(slot.side);
  const ringSide = ring * NEW_AMULET_WING_ROW_GROW_PX * 0.65;
  const ringDepth = ring * NEW_AMULET_DEPTH_ROW_PX * 0.75;
  return {
    sidePx: slot.side + sideSign * ringSide,
    depthPx: slot.depth + ringDepth + jitter,
  };
}

/** [018]+ — wide alternating wings, each row deeper into the garden. */
function positionForNewAmulet(slotIndex, pose) {
  const label = collectionDisplayLabel(slotIndex);
  if (label < NEW_AMULET_FIRST_LABEL) return null;

  const anchorIdx = chainWideAnchorIndex();
  if (anchorIdx < 0) return null;

  const collection = loadCollection();
  const anchorPos = normalizeSavedPosition(collection[anchorIdx]?.position);
  if (!anchorPos) return null;

  const { sidePx, depthPx } = newAmuletSpreadOffset(label);

  let x = anchorPos.x;
  let z = anchorPos.z;
  const depth = nudgeAlongOpeningViewPx(x, z, depthPx, pose);
  const side = nudgeScreenRightPx(depth.x, depth.z, sidePx, pose);
  return { x: side.x, z: side.z, yWorld: anchorPos.yWorld };
}

/** v9 grid — one-time restore for entries displaced by v10 migration. */
function positionInWideChainV9(slotIndex, pose) {
  const anchorIdx = chainWideAnchorIndex();
  if (anchorIdx < 0) return null;

  const startIdx = anchorIdx + 1;
  if (slotIndex < startIdx) return null;

  const collection = loadCollection();
  const anchorPos = normalizeSavedPosition(collection[anchorIdx]?.position);
  if (!anchorPos) return null;

  const offsetInWide = slotIndex - startIdx;
  const colsPerRow = 4;
  const sideStep = 220;
  const rowNumber = Math.floor(offsetInWide / colsPerRow);
  const colInRow = offsetInWide % colsPerRow;
  const jitter = [0, 24, 41, 17];

  let cumulativeDepth = 25;
  for (let row = 1; row <= rowNumber; row += 1) {
    const span = 50 - 35 + 1;
    cumulativeDepth += 35 + (row * 31) % span;
  }
  cumulativeDepth += jitter[colInRow % jitter.length] + (offsetInWide % 5) * 9;

  let x = anchorPos.x;
  let z = anchorPos.z;
  const depth = nudgeAlongOpeningViewPx(x, z, cumulativeDepth, pose);
  x = depth.x;
  z = depth.z;

  const center = (colsPerRow - 1) / 2;
  const lateral = Math.round((colInRow - center) * sideStep);
  const side = nudgeScreenRightPx(x, z, lateral, pose);
  x = side.x;
  z = side.z;

  const label = collectionDisplayLabel(slotIndex);
  const labelNudge = CHAIN_SAVED_LABEL_NUDGE[label];
  if (labelNudge) {
    const nudged = applySavedLabelNudge(x, z, labelNudge);
    x = nudged.x;
    z = nudged.z;
  }

  return { x, z, yWorld: anchorPos.yWorld };
}

/** Even index → left; odd index → right (legacy single-step chain). */
function sidePxForChainSlot(slotIndex) {
  if (slotIndex <= 0) return 0;
  return slotIndex % 2 === 0 ? -140 : 140;
}

function positionRelativeToPrevIndex(prevIndex, slotIndex, pose, afterPx, sidePx) {
  const collection = loadCollection();
  const prevPos = normalizeSavedPosition(collection[prevIndex]?.position);
  if (!prevPos) return null;

  let x = prevPos.x;
  let z = prevPos.z;

  const depthPx = afterPx != null ? afterPx : afterPxForChainSlot(slotIndex);
  const depth = nudgeAlongOpeningViewPx(x, z, depthPx, pose);
  x = depth.x;
  z = depth.z;

  const lateral = sidePx != null ? sidePx : sidePxForChainSlot(slotIndex);
  if (lateral) {
    const side = nudgeScreenRightPx(x, z, lateral, pose);
    x = side.x;
    z = side.z;
  }

  return { x, z, yWorld: prevPos.yWorld };
}

function applySavedLabelNudge(x, z, spec) {
  const pose = openingCameraPose();
  let nx = x;
  let nz = z;
  if (spec.rightPx) {
    const right = nudgeScreenRightPx(nx, nz, spec.rightPx, pose);
    nx = right.x;
    nz = right.z;
  }
  if (spec.backPx) {
    const depth = nudgeAlongOpeningViewPx(nx, nz, spec.backPx, pose);
    nx = depth.x;
    nz = depth.z;
  }
  if (spec.forwardPx) {
    const depth = nudgeAlongOpeningViewPx(nx, nz, -spec.forwardPx, pose);
    nx = depth.x;
    nz = depth.z;
  }
  return { x: nx, z: nz };
}

function positionFromEntry(entry, collectionIndex) {
  const saved = normalizeSavedPosition(entry?.position);
  if (saved) return saved;
  return collectionSlotPosition(collectionIndex);
}

/** Undo opening-down-200-v1 — restore saved positions after layout revert. */
function revertOpeningGlobalDownOnce() {
  try {
    if (localStorage.getItem(OPENING_DOWN_MIGRATION_KEY) !== 'done') return;
    if (localStorage.getItem(OPENING_DOWN_REVERT_KEY) === 'done') return;
  } catch (_) {
    return;
  }

  const collection = loadCollection();
  const pose = openingCameraPose();
  let dirty = false;

  for (let index = 0; index < collection.length; index += 1) {
    const entry = collection[index];
    const saved = normalizeSavedPosition(entry?.position);
    if (!saved) continue;
    const up = nudgeScreenDownPx(saved.x, saved.z, -OPENING_DOWN_NUDGE_PX, pose);
    entry.position = { x: up.x, z: up.z, yWorld: saved.yWorld };
    dirty = true;
  }

  const userPos = loadUserAmuletPosition();
  if (userPos) {
    const up = nudgeScreenDownPx(userPos.x, userPos.z, -OPENING_DOWN_NUDGE_PX, pose);
    persistUserAmuletPosition(up.x, up.z);
  }

  if (dirty) saveCollection(collection);

  try {
    localStorage.removeItem(OPENING_DOWN_MIGRATION_KEY);
    localStorage.setItem(OPENING_DOWN_REVERT_KEY, 'done');
  } catch (_) {}
}

/** One-time label nudges — persists to storage, never stacks on refresh. */
function migrateForwardNudgeLabels() {
  const collection = loadCollection();
  if (!collection.length) return;
  let dirty = false;
  for (let index = 0; index < collection.length; index++) {
    const entry = collection[index];
    const label = collectionDisplayLabel(index);
    const spec = COLLECTION_SAVED_LABEL_NUDGE[label];
    if (!spec) continue;
    if (entry.layoutNudge === spec.tag) continue;
    const saved = normalizeSavedPosition(entry.position);
    if (!saved) continue;
    const nudged = applySavedLabelNudge(saved.x, saved.z, spec);
    entry.position = { x: nudged.x, z: nudged.z, yWorld: saved.yWorld };
    entry.layoutNudge = spec.tag;
    dirty = true;
  }
  if (dirty) saveCollection(collection);
}

/** One-time: restore positions v10 moved — never re-layout saved amulets on refresh. */
function revertV10LayoutOnce() {
  const collection = loadCollection();
  const startIdx = chainWideStartIndex();
  if (startIdx < 0) return;

  const pose = openingCameraPose();
  let dirty = false;

  for (let idx = startIdx; idx < collection.length; idx += 1) {
    const entry = collection[idx];
    const label = collectionDisplayLabel(idx);
    if (label === 15 || label === 16) continue;

    const restoredTag = RESTORED_LAYOUT_PREFIX + '-' + label;
    if (entry.layoutNudge === restoredTag) continue;

    const nudge = entry.layoutNudge || '';
    if (!nudge.startsWith(REVERT_V10_LAYOUT_PREFIX)) continue;

    const target = positionInWideChainV9(idx, pose);
    if (!target) continue;

    const prevSelf = normalizeSavedPosition(entry.position);
    entry.position = {
      x: target.x,
      z: target.z,
      yWorld: prevSelf?.yWorld ?? target.yWorld,
    };
    entry.layoutNudge = restoredTag;
    dirty = true;
  }

  if (dirty) saveCollection(collection);
}

/** Place [021] beside [020] in view — replaces off-screen wing / bad nudge positions. */
function forceRepositionLabel021Once() {
  const collection = loadCollection();
  const idx = collectionIndexForLabel(21);
  if (idx < 0) return;

  const entry = collection[idx];
  if (!entry || entry.layoutNudge === LABEL_021_FORCED_TAG) return;

  const pose = openingCameraPose();
  const prevIdx = idx - 1;
  let target = null;

  if (prevIdx >= 0) {
    target = positionRelativeToPrevIndex(
      prevIdx,
      idx,
      pose,
      LABEL_021_CHAIN_OFFSET.afterPx,
      LABEL_021_CHAIN_OFFSET.sidePx
    );
  }

  if (!target) {
    const focus = openingFrameCentroid();
    const nudged = applySavedLabelNudge(focus.x, focus.z, { rightPx: 240, forwardPx: 120 });
    target = { x: nudged.x, z: nudged.z, yWorld: SPRITE_WORLD_Y };
  }

  const prevSelf = normalizeSavedPosition(entry.position);
  entry.position = {
    x: target.x,
    z: target.z,
    yWorld: prevSelf?.yWorld ?? target.yWorld ?? SPRITE_WORLD_Y,
  };
  entry.layoutNudge = LABEL_021_FORCED_TAG;
  saveCollection(collection);
  console.log('[garden-three] [021] visible beside [020] at', entry.position);
}

/** One-time: [018]+ → wide spread meadow (replaces compact cluster). */
function migrateSpreadGridLayoutOnce() {
  const collection = loadCollection();
  if (!collection.length) return;

  const pose = openingCameraPose();
  let dirty = false;

  for (let idx = 0; idx < collection.length; idx += 1) {
    const entry = collection[idx];
    const label = collectionDisplayLabel(idx);
    if (label < NEW_AMULET_FIRST_LABEL || label === 21) continue;
    if (entry.layoutNudge === SPREAD_GRID_LAYOUT_TAG) continue;

    const target = positionForNewAmulet(idx, pose);
    if (!target) continue;

    const prevSelf = normalizeSavedPosition(entry.position);
    entry.position = {
      x: target.x,
      z: target.z,
      yWorld: prevSelf?.yWorld ?? target.yWorld,
    };
    entry.layoutNudge = SPREAD_GRID_LAYOUT_TAG;
    dirty = true;
  }

  if (dirty) {
    saveCollection(collection);
    console.log('[garden-three] migrated [018]+ to wide spread grid');
  }
}

/** Restore [015]/[016] to chain-relative positions (100px after prev, left/right). */
function restoreLockedChainLabelPositions() {
  const collection = loadCollection();
  if (!collection.length) return;

  const pose = openingCameraPose();
  let dirty = false;
  const specs = [...LOCKED_CHAIN_LABELS].sort((a, b) => a.label - b.label);

  for (const spec of specs) {
    const idx = collectionIndexForLabel(spec.label);
    const prevIdx = collectionIndexForLabel(spec.prevLabel);
    if (idx < 0 || prevIdx < 0) continue;

    const entry = collection[idx];
    const tag = LOCKED_CHAIN_LABEL_TAG + '-' + spec.label;
    if (entry.layoutNudge === tag) continue;

    const target = positionRelativeToPrevIndex(
      prevIdx,
      idx,
      pose,
      spec.afterPx,
      spec.sidePx
    );
    if (!target) continue;

    const prevSelf = normalizeSavedPosition(entry.position);
    entry.position = {
      x: target.x,
      z: target.z,
      yWorld: prevSelf?.yWorld ?? target.yWorld,
    };
    entry.layoutNudge = tag;
    dirty = true;
  }

  if (dirty) saveCollection(collection);
}

function spritePositionPayload(sprite) {
  return {
    x: sprite.userData.floatAnchorX ?? sprite.position.x,
    z: sprite.userData.floatAnchorZ ?? sprite.position.z,
    yWorld:
      typeof sprite.userData.floatAnchorY === 'number'
        ? sprite.userData.floatAnchorY
        : undefined,
  };
}

function applyPositionToSprite(sprite, pos, collectionIndex) {
  setSpriteAnchor(sprite, pos.x, pos.z);
  if (pos.yWorld != null) {
    sprite.userData.floatAnchorY = pos.yWorld;
  } else if (collectionIndex === 1) {
    sprite.userData.floatAnchorY = SPRITE_WORLD_Y - 0.6;
  } else {
    sprite.userData.floatAnchorY = SPRITE_WORLD_Y;
  }
  applySpriteFloat(sprite);
}

/** Fill missing entry.position only — never overwrite saved positions. */
function fillMissingCollectionPositionsInStorage() {
  const collection = loadCollection();
  if (!collection.length) return;
  let dirty = false;
  for (let index = 0; index < collection.length; index += 1) {
    const entry = collection[index];
    if (!entry || typeof entry !== 'object') continue;
    if (hasSavedPosition(entry.position)) continue;
    const slot = collectionSlotPosition(index);
    entry.position = { x: slot.x, z: slot.z };
    if (slot.yWorld != null) entry.position.yWorld = slot.yWorld;
    dirty = true;
  }
  if (dirty) saveCollection(collection);
}

function considerCameraBounds(x, z, bounds) {
  bounds.minX = Math.min(bounds.minX, x - CAMERA_X_PADDING);
  bounds.maxX = Math.max(bounds.maxX, x + CAMERA_X_PADDING);
  bounds.minZ = Math.min(bounds.minZ, z - CAMERA_Z_PADDING);
}

function updateCameraScrollLimits() {
  const bounds = {
    minX: INITIAL_CAMERA.x - 10,
    maxX: INITIAL_CAMERA.x + 10,
    minZ: DEFAULT_MIN_CAMERA_Z,
  };

  for (const slot of AMULET_LAYOUT) {
    considerCameraBounds(slot.x, slot.z, bounds);
  }

  const collection = loadCollection();
  collection.forEach(function (entry, index) {
    const saved = normalizeSavedPosition(entry.position);
    if (saved) {
      considerCameraBounds(saved.x, saved.z, bounds);
      return;
    }
    const slot = collectionSlotPosition(index);
    considerCameraBounds(slot.x, slot.z, bounds);
  });

  if (userAmuletSprite) {
    considerCameraBounds(userAmuletSprite.position.x, userAmuletSprite.position.z, bounds);
  }

  minCameraX = bounds.minX;
  maxCameraX = bounds.maxX;
  minCameraZ = bounds.minZ;
}

function updateCameraScrollLimit(collectionCount) {
  updateCameraScrollLimits();
}

function hasUserAmuletSnapshot() {
  return Boolean(readStoredItem(SNAPSHOT_KEY));
}

function loadUserAmuletSnapshotUrl() {
  return readStoredItem(SNAPSHOT_KEY);
}

function persistUserAmuletAnswers(answers) {
  if (!answers) return;
  try {
    const payload = JSON.stringify(answers);
    writeStoredItem(USER_ANSWERS_KEY, payload);
    writeStoredItem(STORAGE_KEY, payload);
  } catch (err) {
    console.warn('[garden-three] failed to persist user amulet answers', err);
  }
}

function loadAnswers() {
  try {
    return JSON.parse(readStoredItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function loadUserAmuletAnswers() {
  try {
    const raw = readStoredItem(USER_ANSWERS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function restoreUserAmuletAnswersIfNeeded() {
  if (allAnswered(loadAnswers())) return loadAnswers();
  try {
    const raw = readStoredItem(USER_ANSWERS_KEY);
    if (!raw) return loadAnswers();
    writeStoredItem(STORAGE_KEY, raw);
    return JSON.parse(raw);
  } catch {
    return loadAnswers();
  }
}

function allAnswered(answers) {
  for (let i = 0; i < questions.length; i++) {
    const v = answers[questions[i].key];
    if (v === undefined || v === null || String(v).trim() === '') return false;
  }
  return questions.length > 0;
}

function nextUnansweredIndex(answers) {
  for (let i = 0; i < questions.length; i++) {
    const v = answers[questions[i].key];
    if (v === undefined || v === null || String(v).trim() === '') return i;
  }
  return 0;
}

function configureSpriteTexture(tex) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.premultiplyAlpha = false;
  var maxAniso = renderer.capabilities ? renderer.capabilities.getMaxAnisotropy() : 4;
  tex.anisotropy = Math.min(maxAniso, 16);
  tex.needsUpdate = true;
  return tex;
}

function alphaBoundsFromImage(img) {
  const w = img.width;
  const h = img.height;
  if (!w || !h) return { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 };

  const maxSide = 256;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  let minX = sw;
  let minY = sh;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (data[(y * sw + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 };
  const inv = 1 / scale;
  return {
    minX: Math.floor(minX * inv),
    minY: Math.floor(minY * inv),
    maxX: Math.min(w - 1, Math.ceil(maxX * inv)),
    maxY: Math.min(h - 1, Math.ceil(maxY * inv)),
  };
}

const SCREEN_LOWER_REF_H = 1320;
function applyContentAnchor(sprite, texture) {
  const img = texture.image;
  const { minX, minY, maxX, maxY } = alphaBoundsFromImage(img);
  const cw = img.width;
  const ch = img.height;
  const size = SPRITE_SIZE;
  const cx = (minX + maxX + 1) / 2 / cw;
  const cy = (ch - maxY - 1) / ch + SCREEN_LOWER_PX / SCREEN_LOWER_REF_H;

  texture.offset.set(0, 0);

  sprite.center.set(cx, cy);
  sprite.userData.baseScale = size;
  sprite.scale.set(size, size, 1);
}

function currentTexturePixelCount(sprite) {
  const img = sprite.material?.map?.image;
  if (!img) return 0;
  return (img.width || img.naturalWidth || 0) * (img.height || img.naturalHeight || 0);
}

function replaceSpriteTexture(sprite, canvas) {
  const oldMap = sprite.material?.map;
  const cropped = cropAndSquare(canvas);
  const tex = configureSpriteTexture(new THREE.CanvasTexture(cropped));
  tex.needsUpdate = true;
  sprite.material.map = tex;
  sprite.material.needsUpdate = true;
  applyContentAnchor(sprite, tex);
  oldMap?.dispose?.();
}

function upgradeSpriteTextureFromDataUrl(sprite, dataUrl, minPixelGain) {
  minPixelGain = minPixelGain || 1.15;
  return new Promise(function (resolve) {
    const img = new Image();
    img.onload = function () {
      const pixels = img.width * img.height;
      const current = currentTexturePixelCount(sprite);
      if (!pixels || pixels <= current * minPixelGain) {
        resolve(false);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      replaceSpriteTexture(sprite, canvas);
      resolve(true);
    };
    img.onerror = function () {
      resolve(false);
    };
    img.src = dataUrl;
  });
}

function snapshotKeyForSprite(sprite) {
  if (sprite.userData.isUserAmulet) return 'user-amulet';
  if (sprite.userData.isCollectionAmulet) {
    const collection = loadCollection();
    const entry = collection[sprite.userData.collectionIndex];
    return entry && entry.id ? 'collection-' + entry.id : null;
  }
  return null;
}

function upgradeSpriteFromIndexedDb(sprite) {
  const key = snapshotKeyForSprite(sprite);
  if (!key) return Promise.resolve(false);
  return glbStore()
    .then(function (store) {
      return store.loadSnapshot(key);
    })
    .then(function (hiResUrl) {
      if (!hiResUrl) return false;
      return upgradeSpriteTextureFromDataUrl(sprite, hiResUrl);
    })
    .catch(function () {
      return false;
    });
}

function upgradeAllAmuletSprites() {
  const targets = sprites.filter(function (sprite) {
    return sprite.userData.isUserAmulet || sprite.userData.isCollectionAmulet;
  });
  return Promise.all(targets.map(upgradeSpriteFromIndexedDb));
}

function amuletTextureUrls(i) {
  return [
    `/public/amulets/amulet-${i}.png?v=675`,
    `assets/garden/amulet-${i}.png`,
    new URL(`../public/amulets/amulet-${i}.png`, import.meta.url).href,
  ];
}

function loadTextureFromCandidates(urls) {
  return new Promise((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    const tryAt = (index) => {
      if (index >= urls.length) {
        reject(new Error('texture load failed: ' + urls.join(', ')));
        return;
      }
      loader.load(
        urls[index],
        (tex) => resolve(configureSpriteTexture(tex)),
        undefined,
        () => tryAt(index + 1)
      );
    };
    tryAt(0);
  });
}

function loadTexture(i) {
  return loadTextureFromCandidates(amuletTextureUrls(i));
}

function snapshotCanvas(sourceCanvas) {
  const snapshot = document.createElement('canvas');
  snapshot.width = sourceCanvas.width;
  snapshot.height = sourceCanvas.height;
  const ctx = snapshot.getContext('2d');
  ctx.clearRect(0, 0, snapshot.width, snapshot.height);
  ctx.drawImage(sourceCanvas, 0, 0);
  return snapshot;
}

function cropAndSquare(canvas) {
  var w = canvas.width, h = canvas.height;
  if (!w || !h) return canvas;

  var maxScan = 512;
  if (Math.max(w, h) > maxScan) {
    var scale = maxScan / Math.max(w, h);
    var scaled = document.createElement('canvas');
    scaled.width = Math.max(1, Math.round(w * scale));
    scaled.height = Math.max(1, Math.round(h * scale));
    scaled.getContext('2d').drawImage(canvas, 0, 0, scaled.width, scaled.height);
    canvas = scaled;
    w = scaled.width;
    h = scaled.height;
  }

  var ctx = canvas.getContext('2d', { willReadFrequently: true });
  var data = ctx.getImageData(0, 0, w, h).data;
  var minX = w, minY = h, maxX = -1, maxY = -1;
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas;
  var contentW = maxX - minX + 1;
  var contentH = maxY - minY + 1;
  var side = Math.max(contentW, contentH);
  var pad = Math.round(side * 0.09);
  side += pad * 2;
  var out = document.createElement('canvas');
  out.width = side;
  out.height = side;
  var ox = Math.round((side - contentW) / 2);
  var oy = Math.round((side - contentH) / 2);
  out.getContext('2d').drawImage(canvas, minX, minY, contentW, contentH, ox, oy, contentW, contentH);
  return out;
}

function downscaleCanvas(canvas, maxDim) {
  var cropped = cropAndSquare(canvas);
  let w = cropped.width;
  let h = cropped.height;
  if (w <= maxDim && h <= maxDim) return cropped;
  const ratio = Math.min(maxDim / w, maxDim / h);
  w = Math.round(w * ratio);
  h = Math.round(h * ratio);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(cropped, 0, 0, w, h);
  return out;
}

function tinyThumbFromCanvas(canvas, maxDim) {
  const scaled = downscaleCanvas(canvas, maxDim || COLLECTION_LS_THUMB_PX);
  return scaled.toDataURL('image/jpeg', 0.82);
}

function dataUrlToTinyThumb(dataUrl) {
  return new Promise(function (resolve) {
    if (!dataUrl || typeof dataUrl !== 'string') {
      resolve('');
      return;
    }
    const img = new Image();
    img.onload = function () {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      resolve(tinyThumbFromCanvas(c));
    };
    img.onerror = function () {
      resolve('');
    };
    img.src = dataUrl;
  });
}

/** Move large inline snapshots from localStorage into IndexedDB. */
function migrateCollectionSnapshotsToIdb() {
  const collection = loadCollection();
  if (!collection.length) return Promise.resolve();

  return Promise.all(collection.map(function (entry) {
    if (!entry || !entry.id) return Promise.resolve(false);
    const snap = entry.snapshot;
    if (typeof snap !== 'string' || !snap.startsWith('data:') || snap.length <= COLLECTION_LS_SNAPSHOT_MAX_CHARS) {
      return Promise.resolve(false);
    }
    const snapKey = 'collection-' + entry.id;
    return glbStore().then(function (store) {
      return store.loadSnapshot(snapKey).then(function (existing) {
        if (!existing) {
          return store.saveSnapshot(snapKey, snap);
        }
      }).then(function () {
        return dataUrlToTinyThumb(snap);
      }).then(function (thumb) {
        entry.snapshot = thumb || '';
        entry.snapshotInIdb = true;
        return true;
      });
    }).catch(function () {
      return false;
    });
  })).then(function (flags) {
    if (flags.some(Boolean)) saveCollection(collection);
  });
}

function compressSnapshotDataUrl(canvas) {
  const hi = downscaleCanvas(canvas, 4096);
  return hi.toDataURL('image/png');
}

function compressSnapshotForLocalStorage(canvas) {
  const lo = downscaleCanvas(canvas, 1536);
  return lo.toDataURL('image/png');
}

function persistUserAmuletSnapshot(sourceCanvas) {
  try {
    const snapshot = snapshotCanvas(sourceCanvas);
    var hiResUrl = compressSnapshotDataUrl(snapshot);
    var loResUrl = compressSnapshotForLocalStorage(snapshot);
    writeStoredItem(SNAPSHOT_KEY, loResUrl);
    glbStore().then(function (store) {
      return store.saveSnapshot('user-amulet', hiResUrl);
    }).catch(function (err) {
      console.warn('[garden-three] IndexedDB snapshot save failed', err);
    });
  } catch (err) {
    console.warn('[garden-three] failed to persist user amulet snapshot', err);
  }
}

function persistUserAmuletPosition(x, z) {
  try {
    writeStoredItem(POSITION_KEY, JSON.stringify({ x, z }));
  } catch (err) {
    console.warn('[garden-three] failed to persist user amulet position', err);
  }
}

function loadUserAmuletPosition() {
  try {
    const raw = readStoredItem(POSITION_KEY);
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (typeof pos.x === 'number' && typeof pos.z === 'number') return pos;
  } catch {
    /* ignore */
  }
  return null;
}

function estimateSpriteScale() {
  return SPRITE_SIZE;
}

function spriteFootprintRadius(sprite) {
  return (sprite.userData.baseScale || SPRITE_SIZE) * 0.42;
}

/** Ray from screen centre onto the garden ground plane. */
function getViewCenterOnGround() {
  _viewRay.setFromCamera(_viewNdc, camera);
  const hit = _viewRay.ray.intersectPlane(GROUND_PLANE, _groundHit);
  if (hit) return { x: hit.x, z: hit.z };
  return { x: camera.position.x, z: camera.position.z - LOOK_AHEAD };
}

function persistPlacementAnchor(pos) {
  try {
    writeStoredItem(PLACEMENT_ANCHOR_KEY, JSON.stringify({ x: pos.x, z: pos.z }));
  } catch {
    /* ignore */
  }
}

function loadPlacementAnchor() {
  if (livePlacementAnchor) return livePlacementAnchor;
  try {
    const raw = readStoredItem(PLACEMENT_ANCHOR_KEY);
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (typeof pos.x === 'number' && typeof pos.z === 'number') return pos;
  } catch {
    /* ignore */
  }
  return null;
}

function capturePlacementAnchor() {
  const pos = getViewCenterOnGround();
  livePlacementAnchor = pos;
  persistPlacementAnchor(pos);
  return pos;
}

function userAmuletSlotPosition(selfRadius) {
  return findClearPosition(USER_AMULET_SLOT.x, USER_AMULET_SLOT.z, selfRadius);
}

/** Place new amulet — [018]+ in wide spread meadow. */
function resolveNewAmuletPlacement(selfRadius) {
  const occupied = collectOccupiedPositions(null);
  const collection = loadCollection();
  const slotIndex = collection.length;
  const pose = openingCameraPose();
  const newLabel = collectionDisplayLabel(slotIndex);

  if (slotIndex === 0 && occupied.length === 0) {
    const anchor = loadPlacementAnchor();
    const base = anchor || { x: USER_AMULET_SLOT.x, z: USER_AMULET_SLOT.z };
    return findClearPosition(base.x, base.z, selfRadius, occupied);
  }

  if (newLabel >= NEW_AMULET_FIRST_LABEL) {
    const target = positionForNewAmulet(slotIndex, pose);
    if (target) {
      if (isPositionClear(target.x, target.z, selfRadius, occupied)) {
        return { x: target.x, z: target.z };
      }
      const { sidePx } = newAmuletSpreadOffset(newLabel);
      const gapFills = [
        { side: sidePx > 0 ? NEW_AMULET_WING_ROW_GROW_PX : -NEW_AMULET_WING_ROW_GROW_PX, depth: 0 },
        { side: -sidePx * 0.3, depth: 0 },
        { side: NEW_AMULET_WING_BASE_PX * 0.45, depth: NEW_AMULET_DEPTH_ROW_PX * 0.35 },
        { side: -NEW_AMULET_WING_BASE_PX * 0.45, depth: NEW_AMULET_DEPTH_ROW_PX * 0.35 },
        { side: 0, depth: NEW_AMULET_DEPTH_ROW_PX },
        { side: 0, depth: -NEW_AMULET_DEPTH_ROW_PX * 0.55 },
        { side: sidePx * 0.5, depth: NEW_AMULET_DEPTH_ROW_PX * 0.6 },
        { side: -sidePx * 0.5, depth: -NEW_AMULET_DEPTH_ROW_PX * 0.4 },
      ];
      for (const fill of gapFills) {
        let x = target.x;
        let z = target.z;
        if (fill.depth) {
          const depth = nudgeAlongOpeningViewPx(x, z, fill.depth, pose);
          x = depth.x;
          z = depth.z;
        }
        if (fill.side) {
          const side = nudgeScreenRightPx(x, z, fill.side, pose);
          x = side.x;
          z = side.z;
        }
        if (isPositionClear(x, z, selfRadius, occupied)) {
          return { x, z };
        }
      }
      return findClearPosition(target.x, target.z, selfRadius, occupied);
    }
  }

  if (slotIndex > 0) {
    const target = positionRelativeToPrevIndex(slotIndex - 1, slotIndex, pose);
    if (target) {
      if (isPositionClear(target.x, target.z, selfRadius, occupied)) {
        return { x: target.x, z: target.z };
      }
      return findClearPosition(target.x, target.z, selfRadius, occupied);
    }
  }

  const anchor = loadPlacementAnchor();
  const base = anchor || { x: USER_AMULET_SLOT.x, z: USER_AMULET_SLOT.z };
  return findClearPosition(base.x, base.z, selfRadius, occupied);
}

function resolveUserAmuletLayout(selfRadius, restore, options) {
  if (restore) {
    const saved = loadUserAmuletPosition();
    if (saved) return saved;
  }
  if (options && options.placedAtView) {
    const center = getViewCenterOnGround();
    return findClearPosition(center.x, center.z, selfRadius);
  }
  return resolveNewAmuletPlacement(selfRadius);
}

function applyUserAmuletSlotPosition() {
  const selfRadius = userAmuletSprite
    ? spriteFootprintRadius(userAmuletSprite)
    : SPRITE_SIZE * 0.42;
  const layout = userAmuletSlotPosition(selfRadius);
  persistUserAmuletPosition(layout.x, layout.z);
  if (userAmuletSprite) {
    setSpriteAnchor(userAmuletSprite, layout.x, layout.z);
    updateFocusVisuals();
  }
  return layout;
}

function migrateUserAmuletPositionIfNeeded() {
  if (sessionStorage.getItem(POSITION_VERSION_KEY) === POSITION_VERSION) return;
  sessionStorage.setItem(POSITION_VERSION_KEY, POSITION_VERSION);
}

/** Nudge placement when another amulet already occupies the spot — spread in X and depth. */
function collectOccupiedPositions(excludeSprite) {
  const occupied = [];
  const seen = new Set();

  function add(x, z, radius) {
    if (typeof x !== 'number' || typeof z !== 'number') return;
    const key = x.toFixed(2) + ',' + z.toFixed(2);
    if (seen.has(key)) return;
    seen.add(key);
    occupied.push({
      x: x,
      z: z,
      radius: radius || SPRITE_SIZE * 0.42,
    });
  }

  for (const sprite of sprites) {
    if (sprite === excludeSprite) continue;
    add(
      sprite.userData.floatAnchorX ?? sprite.position.x,
      sprite.userData.floatAnchorZ ?? sprite.position.z,
      spriteFootprintRadius(sprite)
    );
  }

  for (const entry of loadCollection()) {
    const pos = normalizeSavedPosition(entry.position);
    if (pos) add(pos.x, pos.z);
  }

  return occupied;
}

function isPositionClear(x, z, selfRadius, occupied) {
  for (const o of occupied) {
    const minDist = selfRadius + o.radius + CHAIN_CLEARANCE;
    if (Math.hypot(x - o.x, z - o.z) < minDist) return false;
  }
  return true;
}

function findClearPosition(desiredX, desiredZ, selfRadius, occupied) {
  const others = occupied || collectOccupiedPositions(userAmuletSprite);
  if (isPositionClear(desiredX, desiredZ, selfRadius, others)) {
    return { x: desiredX, z: desiredZ };
  }

  const hSpread = 1.45;
  const dSpread = 1.05;
  const step = Math.max(selfRadius, SPRITE_SIZE * 0.5) * 0.85;
  for (let ring = 1; ring <= 20; ring++) {
    const samples = Math.max(8, ring * 3);
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2 + ring * 0.27;
      const x = desiredX + Math.cos(angle) * step * ring * hSpread;
      const z = desiredZ + Math.sin(angle) * step * ring * dSpread;
      if (isPositionClear(x, z, selfRadius, others)) return { x, z };
    }
  }

  return { x: desiredX + step * hSpread, z: desiredZ - step * dSpread * 2 };
}

function cameraPoseForAmulet(atX, atZ) {
  return openingCameraPose([{ tex: 0, x: atX, z: atZ }]);
}

function focusCameraOnAmulet(sprite, options) {
  if (!sprite) return false;
  const x = sprite.userData.floatAnchorX ?? sprite.position.x;
  const z = sprite.userData.floatAnchorZ ?? sprite.position.z;
  updateCameraScrollLimits();
  const pose = cameraPoseForAmulet(x, z);
  const targetX = THREE.MathUtils.clamp(pose.x, minCameraX, maxCameraX);
  const targetZ = THREE.MathUtils.clamp(pose.z, minCameraZ, MAX_CAMERA_Z);
  const animate = !options || options.animate !== false;

  selectedIndex = sprite.userData.questionIndex ?? selectedIndex;
  controlsEnabled = true;
  document.body.style.cursor = 'grab';

  if (!animate) {
    camera.position.x = targetX;
    camera.position.z = targetZ;
    camera.position.y = CAMERA_Y;
    camera.lookAt(x, LOOK_AT_Y, z);
    lastCameraZ = camera.position.z;
    notifyCameraMove('focus');
    updateFocusVisuals();
    return true;
  }

  const startX = camera.position.x;
  const startZ = camera.position.z;
  const startTime = performance.now();
  const duration = 900;

  function step(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const ease = t * (2 - t);
    camera.position.x = startX + (targetX - startX) * ease;
    camera.position.z = startZ + (targetZ - startZ) * ease;
    camera.position.y = CAMERA_Y;
    camera.lookAt(x, LOOK_AT_Y, z);
    lastCameraZ = camera.position.z;
    notifyCameraMove('focus');
    updateFocusVisuals();
    if (t < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
  return true;
}

function extractSpriteSnapshotUrl(sprite) {
  const tex = sprite.material?.map;
  if (!tex?.image) return null;
  try {
    const img = tex.image;
    const w = img.width || img.naturalWidth;
    const h = img.height || img.naturalHeight;
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0);
    return canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[garden-three] failed to extract sprite snapshot', err);
    return null;
  }
}

function buildQuickCollectionEntry(sprite, entryId) {
  const answers = sprite.userData.answers || loadUserAmuletAnswers() || loadAnswers();
  const archivedPosition = spritePositionPayload(sprite);
  let thumbUrl = '';
  try {
    const img = sprite.material?.map?.image;
    if (img && (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement)) {
      const c = document.createElement('canvas');
      c.width = img.width || img.naturalWidth;
      c.height = img.height || img.naturalHeight;
      if (c.width && c.height) {
        c.getContext('2d').drawImage(img, 0, 0);
        thumbUrl = tinyThumbFromCanvas(c);
      }
    }
  } catch (_) {}
  return {
    id: entryId,
    snapshot: thumbUrl,
    snapshotInIdb: true,
    answers: answers,
    createdAt: answers.completedAt || Date.now(),
    position: archivedPosition,
  };
}

function enrichCollectionEntryInBackground(sprite, entryId) {
  void buildCollectionEntryFromSprite(sprite, entryId).then(function (built) {
    const collection = loadCollection();
    const idx = collection.findIndex(function (e) { return e && e.id === entryId; });
    if (idx < 0) return;
    const merged = Object.assign({}, collection[idx], built);
    if (collection[idx].isLive) merged.isLive = true;
    collection[idx] = merged;
    saveCollection(collection);
  }).catch(function (err) {
    console.warn('[garden-three] background collection enrich failed', err);
  });
}

async function buildCollectionEntryFromSprite(sprite, entryId) {
  let snapshotUrl = extractSpriteSnapshotUrl(sprite) || loadUserAmuletSnapshotUrl();
  const answers = sprite.userData.answers || loadUserAmuletAnswers() || loadAnswers();
  const archivedPosition = spritePositionPayload(sprite);
  const snapKey = 'collection-' + entryId;

  let thumbUrl = '';
  let idbSnapshotUrl = snapshotUrl || '';

  if (snapshotUrl) {
    try {
      const img = sprite.material?.map?.image;
      if (img && (img instanceof HTMLCanvasElement || img instanceof HTMLImageElement)) {
        const c = document.createElement('canvas');
        c.width = img.width || img.naturalWidth;
        c.height = img.height || img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        const hiResSnapshotUrl = compressSnapshotDataUrl(c);
        thumbUrl = tinyThumbFromCanvas(c);
        idbSnapshotUrl = hiResSnapshotUrl || snapshotUrl;
      } else {
        thumbUrl = await dataUrlToTinyThumb(snapshotUrl);
      }
    } catch (_) {
      thumbUrl = await dataUrlToTinyThumb(snapshotUrl);
    }
  }

  if (!snapshotUrl) {
    console.warn('[garden-three] collection entry without snapshot — answers and position still saved');
  }

  try {
    const store = await glbStore();
    if (idbSnapshotUrl) {
      await store.saveSnapshot(snapKey, idbSnapshotUrl);
    }
    let copied = false;
    try {
      await store.copyGlb('user-amulet', snapKey);
      copied = true;
    } catch (_) {}
    if (!copied) {
      try {
        await store.copyGlb('user-amulet-prev', snapKey);
        copied = true;
      } catch (_) {}
    }
    if (copied) {
      try {
        await store.deleteGlb('user-amulet-prev');
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[garden-three] IndexedDB collection save failed (non-fatal)', err);
  }

  let composed3D = null;
  try {
    var raw3d = sessionStorage.getItem('amuletComposed3D') || localStorage.getItem('amuletComposed3D');
    if (raw3d) composed3D = JSON.parse(raw3d);
  } catch (_) {}

  if (composed3D) {
    try {
      const store = await glbStore();
      await store.saveSnapshot('composed3d-' + entryId, JSON.stringify(composed3D));
    } catch (err) {
      console.warn('[garden-three] composed3D IDB save failed (non-fatal)', err);
    }
  }

  return {
    id: entryId,
    snapshot: thumbUrl,
    snapshotInIdb: true,
    answers: answers,
    createdAt: answers.completedAt || Date.now(),
    position: archivedPosition,
  };
}

/** Save live amulet into collection immediately so refresh never loses it. */
function persistLiveAmuletToCollection(sprite) {
  if (!sprite) return false;

  const collection = loadCollection();
  for (const entry of collection) {
    if (entry && entry.isLive) entry.isLive = false;
  }

  const entryId = sprite.userData.collectionEntryId || Date.now();
  sprite.userData.collectionEntryId = entryId;

  let collIdx = typeof sprite.userData.collectionIndex === 'number'
    ? sprite.userData.collectionIndex
    : collection.findIndex(function (e) { return e && e.id === entryId; });

  const built = buildQuickCollectionEntry(sprite, entryId);
  built.isLive = true;

  const prevEntry = collIdx >= 0 && collection[collIdx]
    ? Object.assign({}, collection[collIdx])
    : null;
  const insertedNew = !(collIdx >= 0 && collection[collIdx]);

  if (collIdx >= 0 && collection[collIdx]) {
    collection[collIdx] = Object.assign({}, collection[collIdx], built);
  } else {
    collection.push(built);
    collIdx = collection.length - 1;
  }

  sprite.userData.collectionIndex = collIdx;
  sprite.userData.questionIndex = USER_AMULET_INDEX + collIdx;
  sprite.userData.isCollectionAmulet = true;
  if (!collectionSprites.includes(sprite)) {
    collectionSprites.push(sprite);
  }

  const ok = saveCollection(collection);
  if (!ok) {
    if (insertedNew) {
      collection.pop();
    } else if (prevEntry) {
      collection[collIdx] = prevEntry;
    }
    const spriteIdx = collectionSprites.indexOf(sprite);
    if (spriteIdx >= 0) collectionSprites.splice(spriteIdx, 1);
    sprite.userData.isCollectionAmulet = false;
    delete sprite.userData.collectionIndex;
    console.error('[garden-three] failed to save new amulet to collection — do not refresh');
  } else {
    enrichCollectionEntryInBackground(sprite, entryId);
  }
  updateCameraScrollLimits();
  return ok;
}

async function archiveUserAmuletToCollection() {
  if (!userAmuletSprite) return true;

  if (activeUserAmulet3DSpin) finishUserAmulet3DSpin();
  userAmuletMeshTemplate = null;
  userAmuletMeshTemplatePromise = null;

  const collection = loadCollection();
  const entryId = userAmuletSprite.userData.collectionEntryId;
  const collIdx = userAmuletSprite.userData.collectionIndex;
  const sprite = userAmuletSprite;

  if (entryId != null && typeof collIdx === 'number' && collection[collIdx]?.id === entryId) {
    const updated = buildQuickCollectionEntry(sprite, entryId);
    updated.isLive = false;
    const prev = collection[collIdx];
    collection[collIdx] = Object.assign({}, collection[collIdx], updated);
    if (!saveCollection(collection)) {
      collection[collIdx] = prev;
      console.error('[garden-three] failed to persist archived amulet — do not refresh');
      return false;
    }
    enrichCollectionEntryInBackground(sprite, entryId);
    sprite.userData.isUserAmulet = false;
    sprite.userData.isCollectionAmulet = true;
    if (!collectionSprites.includes(sprite)) {
      collectionSprites.push(sprite);
    }
    userAmuletSprite = null;
    updateCameraScrollLimits();
    return true;
  }

  const entryIdNew = Date.now();
  const built = buildQuickCollectionEntry(sprite, entryIdNew);
  collection.push(built);

  if (!saveCollection(collection)) {
    collection.pop();
    console.error('[garden-three] failed to persist archived amulet — do not refresh');
    return false;
  }
  enrichCollectionEntryInBackground(sprite, entryIdNew);
  updateCameraScrollLimits();

  const newIdx = collection.length - 1;
  sprite.userData.isUserAmulet = false;
  sprite.userData.isCollectionAmulet = true;
  sprite.userData.collectionIndex = newIdx;
  sprite.userData.collectionEntryId = built.id;
  sprite.userData.questionIndex = USER_AMULET_INDEX + newIdx;
  collectionSprites.push(sprite);
  updateCameraScrollLimit(collection.length);
  userAmuletSprite = null;
  return true;
}

async function addUserAmuletSprite(sourceCanvas, options) {
  if (!sourceCanvas?.width || !sourceCanvas?.height) return null;

  if (userAmuletSprite) {
    const archived = await archiveUserAmuletToCollection();
    if (!archived) {
      throw new Error('failed to archive previous amulet');
    }
  }

  var rawSnapshot = snapshotCanvas(sourceCanvas);
  const restore = Boolean(options && options.restore);
  if (!restore) {
    window.setTimeout(function () {
      persistUserAmuletSnapshot(rawSnapshot);
    }, 0);
  }
  var croppedSnapshot = cropAndSquare(rawSnapshot);
  const answers = (options && options.answers) || loadAnswers();
  if (Object.keys(answers).length) {
    persistUserAmuletAnswers(answers);
  }
  const texture = configureSpriteTexture(new THREE.CanvasTexture(croppedSnapshot));
  texture.needsUpdate = true;

  const collectionCount = loadCollection().length;
  const selfRadius = estimateSpriteScale() * 0.42;
  const layout = resolveUserAmuletLayout(selfRadius, restore, options);
  persistUserAmuletPosition(layout.x, layout.z);

  userAmuletSprite = makeSprite({ tex: 0, x: layout.x, z: layout.z }, texture, USER_AMULET_INDEX + collectionCount);
  setSpriteAnchor(userAmuletSprite, layout.x, layout.z);
  applySpriteFloat(userAmuletSprite);
  if (!restore && options && options.placedAtView) {
    userAmuletSprite.userData.placedAtView = true;
  }
  userAmuletSprite.userData.isUserAmulet = true;
  userAmuletSprite.userData.answers = answers;

  if (!restore) {
    upgradeSpriteFromIndexedDb(userAmuletSprite).catch(function () {});
    const saved = persistLiveAmuletToCollection(userAmuletSprite);
    if (!saved) {
      const failedSprite = userAmuletSprite;
      userAmuletSprite = null;
      disposeGardenSprite(failedSprite);
      throw new Error('failed to save amulet to collection');
    }
    if (options && options.focusAfterPlace) {
      focusCameraOnAmulet(userAmuletSprite, { animate: true });
    }
  }

  updateCameraScrollLimits();
  return userAmuletSprite;
}

function restoreUserAmuletFromStorage() {
  const loResUrl = loadUserAmuletSnapshotUrl();
  if (!loResUrl) return Promise.resolve(false);

  restoreUserAmuletAnswersIfNeeded();

  return glbStore().then(function (store) {
    return store.loadSnapshot('user-amulet');
  }).catch(function () { return null; }).then(function (hiResUrl) {
    var dataUrl = hiResUrl || loResUrl;
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        addUserAmuletSprite(canvas, {
          restore: true,
          answers: loadUserAmuletAnswers() || undefined,
        }).then(function (sprite) {
          if (sprite) document.body.classList.add('has-user-amulet');
          resolve(Boolean(sprite));
        }).catch(function (err) {
          console.warn('[garden-three] failed to restore user amulet snapshot', err);
          resolve(false);
        });
      };
      img.onerror = function () {
        console.warn('[garden-three] failed to restore user amulet snapshot');
        resolve(false);
      };
      img.src = dataUrl;
    });
  });
}

function applySlotToSprite(sprite, collectionIndex, entry) {
  applyPositionToSprite(sprite, positionFromEntry(entry, collectionIndex), collectionIndex);
}

function syncCollectionSpritePositions() {
  const collection = loadCollection();
  for (const sprite of sprites) {
    const qIdx = sprite.userData.questionIndex;
    if (typeof qIdx !== 'number' || qIdx < USER_AMULET_INDEX) continue;
    const collIdx = qIdx - USER_AMULET_INDEX;
    if (collIdx < 0) continue;
    applySlotToSprite(sprite, collIdx, collection[collIdx]);
  }
}

function restoreCollectionFromStorage() {
  const collection = loadCollection();
  if (!collection.length) return Promise.resolve();
  updateCameraScrollLimit(collection.length);

  function restoreOneEntry(entry, index) {
    var snapKey = entry.id ? 'collection-' + entry.id : null;
    var snapshotIsUrl =
      typeof entry.snapshot === 'string' &&
      (entry.snapshot.startsWith('/') || entry.snapshot.startsWith('http'));
    var tryIdb = snapKey && entry.snapshotInIdb !== false && !snapshotIsUrl;
    return (tryIdb
      ? glbStore().then(function (store) { return store.loadSnapshot(snapKey); }).catch(function () { return null; })
      : Promise.resolve(null)
    ).then(function (hiResUrl) {
      var dataUrl = hiResUrl || entry.snapshot;
      if (!dataUrl && entry.id != null) {
        dataUrl = '/questionnaire/seed/snapshots/' + entry.id + '.png';
      }
      if (!dataUrl) {
        console.warn('[garden-three] missing snapshot for collection entry', index, entry.id);
        return;
      }
      return new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          canvas.getContext('2d').drawImage(img, 0, 0);

          var pos = positionFromEntry(entry, index);
          var texture = configureSpriteTexture(new THREE.CanvasTexture(canvas));
          var sprite = makeSprite(
            { tex: 0, x: pos.x, z: pos.z },
            texture,
            USER_AMULET_INDEX + index
          );
          applyPositionToSprite(sprite, pos, index);
          sprite.userData.isCollectionAmulet = true;
          sprite.userData.collectionIndex = index;
          if (entry.id != null) sprite.userData.collectionEntryId = entry.id;
          sprite.userData.answers = entry.answers;
          collectionSprites.push(sprite);
          upgradeSpriteFromIndexedDb(sprite).finally(resolve);
        };
        img.onerror = function () {
          console.warn('[garden-three] failed to restore collection amulet', index);
          resolve();
        };
        img.src = dataUrl;
      });
    });
  }

  /* Load a few amulets at a time — same quality, less network congestion online. */
  var batchSize = 3;
  var chain = Promise.resolve();
  for (var start = 0; start < collection.length; start += batchSize) {
    (function (from) {
      chain = chain.then(function () {
        var slice = collection.slice(from, from + batchSize);
        return Promise.all(slice.map(function (entry, j) {
          return restoreOneEntry(entry, from + j);
        }));
      });
    })(start);
  }
  return chain;
}

/* Snapshot upgrades handled via IndexedDB hi-res storage */

function focusSavedAmulet() {
  if (userAmuletSprite) {
    return focusCameraOnAmulet(userAmuletSprite, { animate: true });
  }
  const collection = loadCollection();
  const liveIdx = collection.findIndex(function (entry) {
    return entry && entry.isLive;
  });
  if (liveIdx >= 0) {
    for (const sprite of collectionSprites) {
      if (sprite.userData.collectionIndex === liveIdx) {
        return focusCameraOnAmulet(sprite, { animate: true });
      }
    }
  }
  return focusUserAmulet();
}

function focusUserAmulet() {
  if (!userAmuletSprite) return false;
  return focusCameraOnAmulet(userAmuletSprite, { animate: true });
}

function initSpriteFloat(sprite, anchorX, anchorZ, seed) {
  const u = sprite.userData;
  u.floatAnchorX = anchorX;
  u.floatAnchorY = SPRITE_WORLD_Y;
  u.floatAnchorZ = anchorZ;
  const s = (seed + 1) * 1.618 + anchorX * 0.13 + anchorZ * 0.09;
  u.floatPhase = (s - Math.floor(s)) * Math.PI * 2;
  const s2 = s * 2.71;
  u.floatFreq = 0.28 + (s2 - Math.floor(s2)) * 0.24;
  u.floatFreqX = 0.18 + ((s * 3.1) % 1) * 0.2;
}

function setSpriteAnchor(sprite, x, z) {
  sprite.userData.floatAnchorX = x;
  sprite.userData.floatAnchorY = SPRITE_WORLD_Y;
  sprite.userData.floatAnchorZ = z;
}

function applySpriteFloat(sprite) {
  const u = sprite.userData;
  if (u.floatAnchorX == null) return;
  sprite.position.set(u.floatAnchorX, u.floatAnchorY, u.floatAnchorZ);
}

function makeSprite(layout, texture, questionIndex) {
  const mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    alphaTest: 0,
    depthWrite: false,
    depthTest: true,
    fog: false,
    toneMapped: false,
  });

  const sprite = new THREE.Sprite(mat);
  applyContentAnchor(sprite, texture);
  const seed = typeof layout.tex === 'number' ? layout.tex : questionIndex;
  initSpriteFloat(sprite, layout.x, layout.z, seed);
  applySpriteFloat(sprite);
  sprite.renderOrder = SPRITE_ORDER_IN_FRONT;
  sprite.userData.questionIndex = questionIndex;
  sprite.userData.tex = layout.tex;
  scene.add(sprite);
  sprites.push(sprite);
  attachGalleryAnswers(sprite);
  return sprite;
}

function attachGalleryAnswers(_sprite) {
  /* Gallery amulets removed — only user/collection sprites remain. */
}

function spriteGardenIndex(sprite) {
  if (sprite.userData.isUserAmulet) return USER_AMULET_INDEX;
  const tex = sprite.userData.tex;
  if (typeof tex === 'number') return tex;
  return sprite.userData.questionIndex;
}

function indexMatchesSprite(index, sprite) {
  if (index == null) return false;
  return spriteGardenIndex(sprite) === index;
}

function isAmuletFocusMode() {
  return (
    document.body.classList.contains('is-spec-panel-open') &&
    selectedIndex != null
  );
}

function isRequestQuestionnaireMode() {
  const body = document.body;
  return (
    (body.classList.contains('is-create-mode') || body.classList.contains('pagmar-create')) &&
    !body.classList.contains('is-create-amulet-ready') &&
    !body.classList.contains('is-amulet-ready')
  );
}

function focusMulForSprite(sprite) {
  if (isRequestQuestionnaireMode()) {
    sprite.userData.focusMul = 0;
    return 0;
  }
  const current = sprite.userData.focusMul ?? 1;
  const target = !isAmuletFocusMode()
    ? 1
    : indexMatchesSprite(selectedIndex, sprite)
      ? 1
      : 0;
  const next = current + (target - current) * FOCUS_FADE_LERP;
  sprite.userData.focusMul = next;
  return next;
}

function targetScaleMulForSprite(sprite) {
  if (indexMatchesSprite(selectedIndex, sprite)) return SELECTED_SCALE;
  return 1;
}

function fogVeilZ() {
  return camera.position.z - FOG_VEIL_AHEAD;
}

function spriteRenderOrderForVeil(sprite) {
  const anchorZ = sprite.userData.floatAnchorZ ?? sprite.position.z;
  return anchorZ < fogVeilZ() ? SPRITE_ORDER_BEHIND_VEIL : SPRITE_ORDER_IN_FRONT;
}

function spriteDisplayLabel(sprite) {
  let index;
  if (sprite.userData.isUserAmulet) {
    index = USER_AMULET_INDEX + loadCollection().length;
  } else if (sprite.userData.isCollectionAmulet) {
    index = USER_AMULET_INDEX + sprite.userData.collectionIndex;
  } else {
    index = sprite.userData.tex ?? sprite.userData.questionIndex;
  }
  return '[' + String(index + 1).padStart(3, '0') + ']';
}

function canShowAmuletHover() {
  if (!document.body.classList.contains('pagmar-index')) return false;
  if (!controlsEnabled) return false;
  if (document.body.classList.contains('is-create-mode')) return false;
  if (document.body.classList.contains('is-amulet-ready')) return false;
  if (document.body.classList.contains('is-panel-open')) return false;
  if (document.body.classList.contains('is-spec-panel-open')) return false;
  if (document.body.classList.contains('is-filter-page')) return false;
  if (pointerDown?.moved) return false;
  return true;
}

function dispatchAmuletHover(detail) {
  window.dispatchEvent(
    new CustomEvent('questionnaire:amulet-hover', { detail: detail || { active: false } })
  );
}

function updateCursorFromPointer(clientX, clientY) {
  const hit = canShowAmuletHover() ? pickAmulet(clientX, clientY, false) : null;
  document.body.style.cursor = hit ? 'pointer' : controlsEnabled ? 'grab' : 'default';
  dispatchAmuletHover(
    hit
      ? { active: true, label: spriteDisplayLabel(hit), x: clientX, y: clientY }
      : { active: false }
  );
}

let indexCtaPill = null;
let indexCtaOverAmulet = false;

function getIndexCtaBodyRect() {
  if (!indexCtaPill) indexCtaPill = document.getElementById('indexCreateCta');
  if (!indexCtaPill) return null;
  const body = indexCtaPill.querySelector('.pagmar__index-cta-pill__body');
  if (!body) return null;
  return body.getBoundingClientRect();
}

function spriteScreenBounds(sprite) {
  if ((sprite.userData.focusMul ?? 1) < 0.06) return null;
  if (sprite.userData.spin3dHidden) return null;
  if (!sprite.visible) return null;

  const rect = canvas.getBoundingClientRect();
  _proj.copy(sprite.position);
  _proj.project(camera);
  if (_proj.z > 1) return null;

  const sx = (_proj.x * 0.5 + 0.5) * rect.width + rect.left;
  const sy = (-_proj.y * 0.5 + 0.5) * rect.height + rect.top;
  const dist = camera.position.distanceTo(sprite.position);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const visibleHeight = 2 * Math.tan(vFov / 2) * dist;
  const pxPerUnit = rect.height / visibleHeight;
  const size = sprite.scale.x;
  const halfW = size * VISUAL_HIT_FACTOR * pxPerUnit;
  const halfH = size * VISUAL_HIT_FACTOR * pxPerUnit;

  return {
    left: sx - halfW,
    right: sx + halfW,
    top: sy - halfH,
    bottom: sy + halfH,
  };
}

function rectsOverlap(a, b) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

function updateIndexCtaGlass() {
  if (typeof canvas === 'undefined' || !canvas || typeof sprites === 'undefined' || !sprites.length) {
    return;
  }
  if (!document.body.classList.contains('pagmar-index')) return;
  if (
    document.body.classList.contains('is-create-mode') ||
    document.body.classList.contains('is-amulet-ready')
  ) {
    if (indexCtaOverAmulet) {
      indexCtaOverAmulet = false;
      indexCtaPill?.classList.remove('is-over-amulet');
    }
    return;
  }

  const ctaRect = getIndexCtaBodyRect();
  if (!ctaRect) return;

  let overlaps = false;
  for (const sprite of sprites) {
    const bounds = spriteScreenBounds(sprite);
    if (bounds && rectsOverlap(bounds, ctaRect)) {
      overlaps = true;
      break;
    }
  }

  if (overlaps === indexCtaOverAmulet) return;
  indexCtaOverAmulet = overlaps;
  if (!indexCtaPill) indexCtaPill = document.getElementById('indexCreateCta');
  indexCtaPill?.classList.toggle('is-over-amulet', overlaps);
}

function isIndexFilterActive() {
  return document.body.classList.contains('is-filter-page');
}

function updateDepthFade(now) {
  const filterMode = isIndexFilterActive();
  for (const sprite of sprites) {
    if (filterMode) {
      sprite.visible = false;
      continue;
    }
    const focusMul = focusMulForSprite(sprite);
    const targetMul = targetScaleMulForSprite(sprite);
    const currentMul = sprite.userData.scaleMul ?? 1;
    const nextMul = currentMul + (targetMul - currentMul) * SCALE_LERP;
    sprite.userData.scaleMul = nextMul;
    const base = sprite.userData.baseScale || SPRITE_SIZE;

    const spinT = amuletSpinProgress(sprite, now);
    const useSpriteSpin =
      spinT != null && (!sprite.userData.isUserAmulet || !activeUserAmulet3DSpin);
    const spinScaleX = useSpriteSpin && !sprite.userData.isMesh ? spinScaleXFromProgress(spinT) : 1;
    const worldSize = base * nextMul;
    sprite.scale.set(worldSize * spinScaleX, worldSize, 1);

    sprite.renderOrder = spriteRenderOrderForVeil(sprite);
    sprite.material.opacity = focusMul;
    sprite.material.color.set(0xffffff);
    sprite.visible = focusMul > 0.02 && !sprite.userData.spin3dHidden;
    applySpriteFloat(sprite);
  }
  updateIndexCtaGlass();
}

function updateFocusVisuals() {
  updateDepthFade(performance.now());
}

/** 0–1 while spinning; clears spinActive when the turn finishes. */
function amuletSpinProgress(sprite, now) {
  if (!sprite.userData.spinActive) return null;
  if (sprite.userData.isUserAmulet && activeUserAmulet3DSpin) return null;
  const t = Math.min(1, (now - sprite.userData.spinStartTime) / AMULET_SPIN_MS);
  if (t >= 1) sprite.userData.spinActive = false;
  return t;
}

/** Symmetric Y spin — front and back look the same, only edge-on goes thin. */
function spinScaleXFromProgress(t) {
  return Math.abs(Math.cos(t * Math.PI * 2));
}

function spriteSpinWorldSize(sprite) {
  const base = sprite.userData.baseScale || SPRITE_SIZE;
  const mul = sprite.userData.scaleMul ?? 1;
  return base * mul;
}

function wrapPbrSceneForGarden(sceneClone) {
  const wrapper = new THREE.Group();
  sceneClone.rotation.set(0, 0, 0);
  sceneClone.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(sceneClone);
  const center = box.getCenter(new THREE.Vector3());
  sceneClone.position.sub(center);
  wrapper.add(sceneClone);
  const size = box.getSize(new THREE.Vector3());
  wrapper.userData.baseRotY = 0;
  wrapper.userData.fitMaxDim = Math.max(size.x, size.y, size.z, 80);
  return wrapper;
}

function disposeGardenSpinGroup(group) {
  group.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (!obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => mat.dispose?.());
  });
}

/* Garden sprites use the snapshot captured during creation — no re-render needed. */

async function ensureUserAmuletMeshTemplate() {
  if (userAmuletMeshTemplate) return userAmuletMeshTemplate;
  if (userAmuletMeshTemplatePromise) return userAmuletMeshTemplatePromise;

  userAmuletMeshTemplatePromise = (async () => {
    const pbr = await import('../three-pbr-amulet.js');
    let sceneClone = pbr.cloneActivePbrSceneForGarden();
    if (!sceneClone) {
      const compose = await import('./amulet-compose.js');
      await compose.initAmuletCompose();
      const answers = loadUserAmuletAnswers() || loadAnswers();
      const composed = await compose.composeFullAmuletForPbr(answers);
      if (!composed) throw new Error('user amulet compose failed');
      const meshOpts = {
        svg: composed.svg,
        style2: composed.style2,
        style3: { ...composed.style3, l3MassScale: compose.L3_MASS_SCALE },
        questionnaire: composed.questionnaire,
        domainHex: composed.domainHex,
        ageNum: composed.ageNum,
        l3MaterialMode: 'stone',
      };
      // Vector tubes only on reload — full PBR would freeze the tab for many seconds.
      sceneClone = await pbr.buildVectorSceneCloneForGarden(meshOpts);
    }
    userAmuletMeshTemplate = wrapPbrSceneForGarden(sceneClone);
    return userAmuletMeshTemplate;
  })();

  try {
    return await userAmuletMeshTemplatePromise;
  } finally {
    userAmuletMeshTemplatePromise = null;
  }
}

function setUserAmuletSpinVisibility(sprite, visible) {
  sprite.userData.spin3dHidden = !visible;
  sprite.visible = visible && (sprite.userData.focusMul ?? 1) > 0.02;
}

function finishUserAmulet3DSpin() {
  const spin = activeUserAmulet3DSpin;
  if (!spin) return;
  scene.remove(spin.group);
  disposeGardenSpinGroup(spin.group);
  spin.sprite.userData.spinActive = false;
  setUserAmuletSpinVisibility(spin.sprite, true);
  activeUserAmulet3DSpin = null;
}

function updateUserAmulet3DSpin(now) {
  const spin = activeUserAmulet3DSpin;
  if (!spin) return;
  if (isIndexFilterActive()) {
    spin.group.visible = false;
    return;
  }
  spin.group.visible = true;
  const t = Math.min(1, (now - spin.startTime) / AMULET_SPIN_MS);
  const target = spriteSpinWorldSize(spin.sprite);
  const scale = target / spin.fitMaxDim;
  spin.group.scale.setScalar(scale);
  spin.group.position.copy(spin.sprite.position);
  spin.group.rotation.y = spin.baseRotY + t * Math.PI * 2;
  if (t >= 1) finishUserAmulet3DSpin();
}

async function startUserAmulet3DSpin(sprite) {
  if (sprite.userData.spinActive || activeUserAmulet3DSpin || sprite.userData.spin3dPending) return;
  sprite.userData.spin3dPending = true;
  sprite.userData.spinActive = true;
  sprite.userData.spinStartTime = performance.now();

  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const template = await ensureUserAmuletMeshTemplate();
    if (!sprite.userData.spinActive && !sprite.userData.spin3dPending) return;

    sprite.userData.spinActive = false;
    const group = template.clone(true);
    group.userData.baseRotY = template.userData.baseRotY;
    group.userData.fitMaxDim = template.userData.fitMaxDim;
    scene.add(group);
    setUserAmuletSpinVisibility(sprite, false);
    activeUserAmulet3DSpin = {
      group,
      sprite,
      baseRotY: template.userData.baseRotY,
      fitMaxDim: template.userData.fitMaxDim,
      startTime: performance.now(),
    };
  } catch (err) {
    console.warn('[garden-three] user amulet 3D spin failed, using sprite spin', err);
    sprite.userData.spinStartTime = performance.now();
  } finally {
    sprite.userData.spin3dPending = false;
  }
}

function startAmuletSpin(sprite) {
  if (sprite.userData.spinActive) return;
  if (sprite.userData.isUserAmulet) {
    startUserAmulet3DSpin(sprite);
    return;
  }
  sprite.userData.spinActive = true;
  sprite.userData.spinStartTime = performance.now();
}

function resize() {
  const w = mount.clientWidth || window.innerWidth;
  const h = mount.clientHeight || window.innerHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

resize();
window.addEventListener('resize', resize);
if (window.ResizeObserver) {
  new ResizeObserver(resize).observe(mount);
} else {
  requestAnimationFrame(resize);
}

const canvas = renderer.domElement;

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  pointerDown = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
  dispatchAmuletHover({ active: false });
});

canvas.addEventListener('pointermove', (e) => {
  lastPointer.x = e.clientX;
  lastPointer.y = e.clientY;

  if (controlsEnabled && (!pointerDown || e.buttons !== 1)) {
    updateCursorFromPointer(e.clientX, e.clientY);
  }

  if (!controlsEnabled || !pointerDown || e.buttons !== 1) return;
  const dx = e.clientX - pointerDown.x;
  const dy = e.clientY - pointerDown.y;
  if (Math.hypot(dx, dy) > CLICK_DRAG_PX) pointerDown.moved = true;
  const deltaX = e.clientX - pointerDown.lastX;
  const deltaY = e.clientY - pointerDown.lastY;
  pointerDown.lastX = e.clientX;
  pointerDown.lastY = e.clientY;
  camera.position.x = THREE.MathUtils.clamp(
    camera.position.x - deltaX * PAN_SPEED,
    minCameraX,
    maxCameraX
  );
  camera.position.z = THREE.MathUtils.clamp(
    camera.position.z - deltaY * PAN_SPEED,
    minCameraZ,
    MAX_CAMERA_Z
  );
  lookForward();
  capturePlacementAnchor();
  notifyCameraMove('pan');
});

canvas.addEventListener('pointerleave', () => {
  if (controlsEnabled) document.body.style.cursor = 'grab';
  dispatchAmuletHover({ active: false });
});

function shouldIgnoreGardenWheel(target) {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      '.pagmar__site-intro, .pagmar__about-overlay, .pagmar__index-filter-sidebar, .pagmar__index-filter-trigger, ' +
        '.pagmar__index-filter-close, .pagmar__index-about, .pagmar__index-cta-pill, ' +
        '.pagmar__choice-panel, ' +
        '.pagmar__text-panel, .pagmar__index-create, .pagmar__spec-panel'
    )
  );
}

function handleGardenWheel(e) {
  if (e.__gardenWheelHandled) return;
  if (!controlsEnabled) return;
  if (shouldIgnoreGardenWheel(e.target)) return;
  e.__gardenWheelHandled = true;
  e.preventDefault();
  if (Math.abs(e.deltaX) > 0.5) {
    camera.position.x = THREE.MathUtils.clamp(
      camera.position.x - e.deltaX * ZOOM_SPEED * 0.9,
      minCameraX,
      maxCameraX
    );
  }
  camera.position.z = THREE.MathUtils.clamp(
    camera.position.z + e.deltaY * ZOOM_SPEED,
    minCameraZ,
    MAX_CAMERA_Z
  );
  lookForward();
  capturePlacementAnchor();
  notifyCameraMove('wheel');
}

window.addEventListener('wheel', handleGardenWheel, { passive: false, capture: true });
mount.addEventListener('wheel', handleGardenWheel, { passive: false, capture: true });
canvas.addEventListener('wheel', handleGardenWheel, { passive: false });

window.gardenHandleWheel = handleGardenWheel;
window.__gardenHandleWheel = handleGardenWheel;

function spriteAnchorInCanvas(sprite) {
  const bounds = spriteBoundsInCanvas(sprite);
  if (!bounds) return null;
  return bounds;
}

function spriteBoundsInCanvas(sprite) {
  const pagmar = mount.closest('.pagmar-canvas');
  if (!pagmar) return null;

  const rect = canvas.getBoundingClientRect();
  const pagmarRect = pagmar.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  _proj.copy(sprite.position);
  _proj.project(camera);
  if (_proj.z > 1) return null;

  const cxCanvas = (_proj.x * 0.5 + 0.5) * rect.width;
  const cyCanvas = (-_proj.y * 0.5 + 0.5) * rect.height;
  const cx = cxCanvas + (rect.left - pagmarRect.left);
  const cy = cyCanvas + (rect.top - pagmarRect.top);

  const dist = camera.position.distanceTo(sprite.position);
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const visibleHeight = 2 * Math.tan(vFov / 2) * dist;
  const pxPerUnit = rect.height / visibleHeight;
  const size = sprite.scale.x;
  const halfW = size * 0.5 * pxPerUnit;
  const halfH = size * 0.5 * pxPerUnit;
  const visualHalfW = size * VISUAL_HIT_FACTOR * pxPerUnit;
  const visualHalfH = size * VISUAL_HIT_FACTOR * pxPerUnit;

  return {
    x: cx,
    y: cy,
    clientX: rect.left + cxCanvas,
    clientY: rect.top + cyCanvas,
    halfW,
    halfH,
    visualHalfW,
    visualHalfH,
    left: cx - visualHalfW,
    right: cx + visualHalfW,
    top: cy - visualHalfH,
    bottom: cy + visualHalfH,
  };
}

/** Screen-space hit test — pick the amulet whose center is closest to the click. */
function pickAmulet(clientX, clientY, tight) {
  const rect = canvas.getBoundingClientRect();
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  if (sx < 0 || sy < 0 || sx > rect.width || sy > rect.height) return null;

  const hitFactor = tight ? 0.34 : 0.48;
  let best = null;
  let bestDist = Infinity;

  for (const sprite of sprites) {
    if ((sprite.userData.focusMul ?? 1) < 0.06) continue;
    if (sprite.userData.spin3dHidden) continue;

    _proj.copy(sprite.position);
    _proj.project(camera);
    if (_proj.z > 1) continue;

    const px = (_proj.x * 0.5 + 0.5) * rect.width;
    const py = (-_proj.y * 0.5 + 0.5) * rect.height;
    const dist = camera.position.distanceTo(sprite.position);
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const visibleHeight = 2 * Math.tan(vFov / 2) * dist;
    const pxPerUnit = rect.height / visibleHeight;
    const size = sprite.scale.x;
    const halfW = size * hitFactor * pxPerUnit;
    const halfH = size * hitFactor * pxPerUnit;

    if (sx < px - halfW || sx > px + halfW || sy < py - halfH || sy > py + halfH) continue;

    const clickDist = Math.hypot(sx - px, sy - py);
    if (clickDist < bestDist) {
      bestDist = clickDist;
      best = sprite;
    }
  }

  return best;
}

function dispatchAmuletClick(sprite, index) {
  const anchor = spriteAnchorInCanvas(sprite);
  const tex = sprite.userData.tex;
  let resolvedIndex;
  if (sprite.userData.isUserAmulet) {
    resolvedIndex = USER_AMULET_INDEX + loadCollection().length;
  } else if (sprite.userData.isCollectionAmulet) {
    resolvedIndex = USER_AMULET_INDEX + sprite.userData.collectionIndex;
  } else {
    resolvedIndex = typeof tex === 'number' ? tex : index;
  }
  window.dispatchEvent(
    new CustomEvent('questionnaire:star-click', {
      detail: {
        anchor,
        index: resolvedIndex,
        tex,
        answers: sprite.userData.answers || null,
      },
    })
  );
}

function navigateToAmuletDetail(index) {
  if (typeof window.pagmarIndexChrome !== 'undefined' && window.pagmarIndexChrome.markTyped) {
    window.pagmarIndexChrome.markTyped();
  }
  stashGardenStateForReturn();
  try {
    sessionStorage.setItem('pagmarAmuletNavAt', String(Date.now()));
  } catch (_) {}
  var entryId =
    typeof window.pagmarEntryIdForAmuletIndex === 'function'
      ? window.pagmarEntryIdForAmuletIndex(index)
      : null;
  if (entryId == null) {
    var base = USER_AMULET_INDEX;
    if (index >= base) {
      var collIdx = index - base;
      var coll = loadCollection();
      if (collIdx >= 0 && collIdx < coll.length && coll[collIdx] && coll[collIdx].id != null) {
        entryId = coll[collIdx].id;
      }
    }
  }
  var url = 'amulet.html?id=' + encodeURIComponent(index);
  if (entryId != null) {
    url += '&entry=' + encodeURIComponent(entryId);
    try {
      sessionStorage.setItem(
        'pagmarAmuletDetailNav',
        JSON.stringify({ index: index, entryId: entryId })
      );
    } catch (_) {}
  }
  window.location.href = url;
}

window.pagmarNavigateToAmuletDetail = navigateToAmuletDetail;

canvas.addEventListener('pointerup', (e) => {
  if (!pointerDown) return;
  const moved = pointerDown.moved;
  pointerDown = null;

  if (moved) return;

  if (document.body.classList.contains('is-create-mode')) return;

  const hit = pickAmulet(e.clientX, e.clientY, false);
  if (!hit) return;

  startAmuletSpin(hit);

  let index;
  if (hit.userData.isUserAmulet) {
    index = USER_AMULET_INDEX + loadCollection().length;
  } else if (hit.userData.isCollectionAmulet) {
    index = USER_AMULET_INDEX + hit.userData.collectionIndex;
  } else {
    index = hit.userData.tex ?? hit.userData.questionIndex;
  }

  e.preventDefault();
  navigateToAmuletDetail(index);
});

window.addEventListener('questionnaire:create-open', () => {
  if (!preCreateGardenState) {
    preCreateGardenState = captureGardenViewState();
    writeGardenViewStateToStorage(preCreateGardenState);
  }
  dispatchAmuletHover({ active: false });
  updateFocusVisuals();
});

window.addEventListener('questionnaire:create-close', () => {
  if (preCreateGardenState) {
    applyGardenViewState(preCreateGardenState);
    preCreateGardenState = null;
  }
  updateFocusVisuals();
});

window.addEventListener('questionnaire:answered', () => {
  updateFocusVisuals();
});

let preFilterGardenState = null;
let preCreateGardenState = null;

const GARDEN_VIEW_STATE_KEY = 'pagmarGardenViewState';
const GARDEN_RETURN_PENDING_KEY = 'pagmarGardenReturnPending';

function captureGardenViewState() {
  return {
    x: camera.position.x,
    z: camera.position.z,
    gridTravelZ: gridTravelZ,
  };
}

function writeGardenViewStateToStorage(state) {
  if (!state || typeof state.x !== 'number' || typeof state.z !== 'number') return;
  try {
    sessionStorage.setItem(GARDEN_VIEW_STATE_KEY, JSON.stringify(state));
  } catch (_) {}
}

function readGardenViewStateFromStorage() {
  try {
    const raw = sessionStorage.getItem(GARDEN_VIEW_STATE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (state && typeof state.x === 'number' && typeof state.z === 'number') return state;
  } catch (_) {}
  return null;
}

function applyGardenViewState(state) {
  if (!state || typeof state.x !== 'number' || typeof state.z !== 'number') return false;
  camera.position.x = state.x;
  camera.position.z = state.z;
  lookForward();
  if (typeof state.gridTravelZ === 'number') gridTravelZ = state.gridTravelZ;
  lastCameraZ = state.z;
  window.dispatchEvent(
    new CustomEvent('questionnaire:camera-move', {
      detail: { travel: gridTravelZ, sync: 'pan' },
    })
  );
  updateFocusVisuals();
  return true;
}

function stashGardenStateForReturn() {
  const state = captureGardenViewState();
  writeGardenViewStateToStorage(state);
  try {
    sessionStorage.setItem(GARDEN_RETURN_PENDING_KEY, '1');
  } catch (_) {}
  return state;
}

function restoreGardenReturnStateOnLoad() {
  try {
    if (sessionStorage.getItem(GARDEN_RETURN_PENDING_KEY) !== '1') return false;
    sessionStorage.removeItem(GARDEN_RETURN_PENDING_KEY);
  } catch (_) {
    return false;
  }
  const state = readGardenViewStateFromStorage();
  if (!state) return false;
  return applyGardenViewState(state);
}

function stashPreFilterGardenState() {
  if (preFilterGardenState) return;
  preFilterGardenState = captureGardenViewState();
  writeGardenViewStateToStorage(preFilterGardenState);
}

function restorePreFilterGardenState() {
  const state = preFilterGardenState || readGardenViewStateFromStorage();
  if (!state) return;
  applyGardenViewState(state);
  preFilterGardenState = null;
}

window.addEventListener('questionnaire:index-filter-change', (evt) => {
  const active = evt.detail && evt.detail.active;
  if (active) {
    stashPreFilterGardenState();
    controlsEnabled = false;
    pointerDown = null;
    document.body.style.cursor = 'default';
    dispatchAmuletHover({ active: false });
  } else {
    restorePreFilterGardenState();
    if (
      !document.body.classList.contains('is-panel-open') &&
      !document.body.classList.contains('is-spec-panel-open') &&
      !document.body.classList.contains('is-site-intro-open') &&
      !document.body.classList.contains('is-about-overlay-open')
    ) {
      controlsEnabled = true;
      updateCursorFromPointer(lastPointer.x, lastPointer.y);
    }
  }
  updateFocusVisuals();
});

window.addEventListener('questionnaire:panel-open', () => {
  controlsEnabled = false;
  document.body.style.cursor = 'default';
  dispatchAmuletHover({ active: false });
});

window.addEventListener('questionnaire:intro-open', () => {
  controlsEnabled = false;
  pointerDown = null;
  document.body.style.cursor = 'default';
  dispatchAmuletHover({ active: false });
});

window.addEventListener('questionnaire:intro-close', () => {
  if (
    document.body.classList.contains('is-panel-open') ||
    document.body.classList.contains('is-spec-panel-open')
  ) {
    return;
  }
  controlsEnabled = true;
  updateCursorFromPointer(lastPointer.x, lastPointer.y);
});

window.addEventListener('questionnaire:panel-close', () => {
  selectedIndex = null;
  if (
    document.body.classList.contains('is-site-intro-open') ||
    document.body.classList.contains('is-about-overlay-open')
  ) {
    return;
  }
  controlsEnabled = true;
  updateCursorFromPointer(lastPointer.x, lastPointer.y);
  updateFocusVisuals();
});

window.addEventListener('questionnaire:about-opened', () => {
  controlsEnabled = false;
});

window.addEventListener('questionnaire:about-closed', () => {
  if (
    document.body.classList.contains('is-panel-open') ||
    document.body.classList.contains('is-spec-panel-open') ||
    document.body.classList.contains('is-site-intro-open')
  ) {
    return;
  }
  controlsEnabled = true;
  updateCursorFromPointer(lastPointer.x, lastPointer.y);
});

function tick(now) {
  requestAnimationFrame(tick);
  if (document.hidden) return;
  const t = typeof now === 'number' ? now : performance.now();
  tick.last = t;
  updateUserAmulet3DSpin(t);
  updateDepthFade(t);
  if (lucaFog) lucaFog.update(t * 0.001);
  renderer.render(scene, camera);
}

requestAnimationFrame(tick);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistLiveAmuletPositions();
  if (!document.hidden) updateDepthFade(performance.now());
});

window.addEventListener('beforeunload', persistLiveAmuletPositions);

Promise.resolve()
  .then(() => {
    migrateUserAmuletPositionIfNeeded();
    restoreUserAmuletAnswersIfNeeded();
    initCollectionFromStorage();
    return loadSeedCollectionFromFile();
  })
  .then(() => {
    return purgeAmulets021022023Once();
  })
  .then(() => {
    revertOpeningGlobalDownOnce();
    migrateForwardNudgeLabels();
    forceRepositionLabel021Once();
    revertV10LayoutOnce();
    migrateSpreadGridLayoutOnce();
    restoreLockedChainLabelPositions();
    return migrateCollectionSnapshotsToIdb();
  })
  .then(() => {
    fillMissingCollectionPositionsInStorage();
    return restoreCollectionFromStorage().then(function () {
      const collection = loadCollection();
      const liveIdx = collection.findIndex(function (entry) {
        return entry && entry.isLive;
      });
      if (liveIdx >= 0) {
        for (const sprite of collectionSprites) {
          if (sprite.userData.collectionIndex === liveIdx) {
            userAmuletSprite = sprite;
            sprite.userData.isUserAmulet = true;
            return;
          }
        }
      }
      if (hasUserAmuletSnapshot()) {
        return restoreUserAmuletFromStorage();
      }
    }).then(function () {
      syncCollectionSpritePositions();
    });
  })
  .then(() => {
    updateCameraScrollLimits();
    if (collectionSprites.length || userAmuletSprite) {
      document.body.classList.add('has-user-amulet');
    }
    updateFocusVisuals();
    window.__gardenReady = sprites.length || 1;
    return upgradeAllAmuletSprites().then(function () {
      updateFocusVisuals();
      restoreGardenReturnStateOnLoad();
    });
  })
  .catch((err) => {
    console.error('[garden-three] failed to load amulets', err);
  });

window.addEventListener('pageshow', function (evt) {
  if (!evt.persisted || !window.__gardenReady) return;
  restoreGardenReturnStateOnLoad();
});

window.gardenStashPreFilterState = stashPreFilterGardenState;
window.gardenRestorePreFilterState = restorePreFilterGardenState;
window.gardenStashIndexReturnState = stashGardenStateForReturn;

window.gardenGetViewState = function gardenGetViewState() {
  return {
    x: camera.position.x,
    z: camera.position.z,
    gridTravelZ: gridTravelZ,
  };
};

window.gardenRestoreViewState = function gardenRestoreViewState(state) {
  if (!state || typeof state.x !== 'number' || typeof state.z !== 'number') return;
  camera.position.x = state.x;
  camera.position.z = state.z;
  lookForward();
  if (typeof state.gridTravelZ === 'number') {
    gridTravelZ = state.gridTravelZ;
  }
  lastCameraZ = state.z;
  window.dispatchEvent(
    new CustomEvent('questionnaire:camera-move', {
      detail: { travel: gridTravelZ, sync: 'pan' },
    })
  );
  updateFocusVisuals();
};

window.gardenAddUserAmulet = function (sourceCanvas, options) {
  return addUserAmuletSprite(sourceCanvas, options);
};
window.gardenCapturePlacementAnchor = capturePlacementAnchor;
window.gardenFocusUserAmulet = focusUserAmulet;
window.gardenFocusSavedAmulet = focusSavedAmulet;
window.gardenFocusSprite = function (sprite) {
  return focusCameraOnAmulet(sprite, { animate: true });
};
window.gardenPersistUserAmuletSnapshot = persistUserAmuletSnapshot;
window.gardenPersistUserAmuletAnswers = persistUserAmuletAnswers;
window.gardenLoadUserAmuletAnswers = loadUserAmuletAnswers;
window.gardenHasUserAmuletSnapshot = hasUserAmuletSnapshot;
window.gardenLoadCollection = loadCollection;
window.gardenListAmuletIndices = function () {
  const indices = [];
  for (const sprite of sprites) {
    if (sprite.userData.isUserAmulet) {
      indices.push(USER_AMULET_INDEX + loadCollection().length);
    } else if (sprite.userData.isCollectionAmulet) {
      indices.push(USER_AMULET_INDEX + sprite.userData.collectionIndex);
    }
  }
  return indices.sort(function (a, b) {
    return a - b;
  });
};
window.gardenAnchorForTex = function () {
  return null;
};
window.gardenAnchorForUserAmulet = function (collectionIndex) {
  if (typeof collectionIndex === 'number') {
    for (const sprite of collectionSprites) {
      if (sprite.userData.collectionIndex === collectionIndex) {
        return spriteBoundsInCanvas(sprite);
      }
    }
  }
  if (!userAmuletSprite) return null;
  return spriteBoundsInCanvas(userAmuletSprite);
};
window.gardenRemoveCollectionByLabel = function (labels) {
  const list = Array.isArray(labels) ? labels : [labels];
  return removeCollectionEntriesByLabels(list.map(Number));
};
window.gardenClearUserAmulet = function () {
  if (!userAmuletSprite) return;
  if (activeUserAmulet3DSpin) finishUserAmulet3DSpin();
  userAmuletMeshTemplate = null;
  userAmuletMeshTemplatePromise = null;
  userAmuletSprite.userData.spinActive = false;
  userAmuletSprite.userData.spin3dPending = false;
  scene.remove(userAmuletSprite);
  userAmuletSprite.material?.map?.dispose?.();
  userAmuletSprite.material?.dispose?.();
  const idx = sprites.indexOf(userAmuletSprite);
  if (idx >= 0) sprites.splice(idx, 1);
  userAmuletSprite = null;
  removeStoredItem(SNAPSHOT_KEY);
  removeStoredItem(POSITION_KEY);
  removeStoredItem(USER_ANSWERS_KEY);
  removeStoredItem(PLACEMENT_ANCHOR_KEY);
  livePlacementAnchor = null;
};

window.gardenPrimeUserAmuletMesh3D = function () {
  // Intentionally lazy — building the 3D mesh blocks the main thread if done eagerly.
};

window.questionnaireStar = {
  getAnchorCanvasPoint() {
    return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
  },
  pauseFloat() {
    controlsEnabled = false;
  },
  resumeFloat() {
    controlsEnabled = true;
    document.body.style.cursor = 'grab';
  },
  placeAtCenter() {},
};
