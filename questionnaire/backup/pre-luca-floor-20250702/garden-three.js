/**
 * Amulet garden — Cyber Garden style (ground-plane pan + low camera + sprites).
 */
import * as THREE from './vendor/three.module.js';
import { createLucaFog } from './garden-fog.js';

function isDepthShadeEnabled() {
  const body = document.body;
  return (
    !body.classList.contains('is-site-intro-open') &&
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
const POSITION_VERSION = '20250701-layout-nudge-v1';
/** Fixed garden slot for user-created amulets — deep field. */
const USER_AMULET_SLOT = { x: -6.0, z: -22.0 };

/** Cyber Garden–style movement: low camera, hold + slide on ground plane */
const CAMERA_Y = 1.5;
const PAN_SPEED = 0.028;
const LOOK_AHEAD = 6;
const ZOOM_SPEED = 0.012;
const MIN_CAMERA_Z = -32;
const MAX_CAMERA_Z = 42;
const LOOK_AT_Y = -0.45;
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
const OPENING_CAMERA_NUDGE_BACK_PX = 100;
const OPENING_REF_VIEWPORT_H = 1078;
const OPENING_CAMERA_BACK_Z = 8.2;
const OPENING_CAMERA_SIDE_X = 1.4;

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

const _openingProjectCam = new THREE.PerspectiveCamera(CAMERA_FOV, 1920 / 1078, 0.1, 200);
const _openingProjectPt = new THREE.Vector3();

function amuletScreenAtOpening(x, z, cameraPose) {
  _openingProjectCam.position.set(cameraPose.x, CAMERA_Y, cameraPose.z);
  _openingProjectCam.lookAt(cameraPose.x, LOOK_AT_Y, cameraPose.z - LOOK_AHEAD);
  _openingProjectCam.updateMatrixWorld(true);
  _openingProjectPt.set(x, SPRITE_WORLD_Y, z);
  _openingProjectPt.project(_openingProjectCam);
  return {
    cx: (_openingProjectPt.x * 0.5 + 0.5) * 1920,
    cy: (-_openingProjectPt.y * 0.5 + 0.5) * 1078,
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
const SCREEN_LOWER_PX = 470;
const CLICK_DRAG_PX = 8;
/** Full 360° spin when an amulet is clicked — slow one-sided Y rotation on the sprite */
const AMULET_SPIN_MS = 2800;
/** Subtle scale while spec panel is open for that amulet */
const SELECTED_SCALE = 1.05;
const SCALE_LERP = 0.18;
const FOCUS_FADE_LERP = 0.22;
/** Tighter screen bounds for hit tests and spec-panel anchoring (opaque content, not full quad). */
const VISUAL_HIT_FACTOR = 0.38;
/** Continuous depth falloff — near bright, far gradually vanish. */
const DARK_DIST_START = 5;
const DARK_DIST_FULL = 40;
const DARK_MIN_BRIGHTNESS = 0.025;
const DARK_MIN_OPACITY = 0.04;
const DARK_AMOUNT_LERP = 0.16;
const MAX_PIXEL_RATIO = 1.5;

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
  })
  .catch((err) => console.warn('[garden-three] Luca fog failed', err));

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
let controlsEnabled = !document.body.classList.contains('is-site-intro-open');
let selectedIndex = null;
let pointerDown = null;
let lastPointer = {
  x: typeof window !== 'undefined' ? window.innerWidth * 0.5 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight * 0.5 : 0,
};
let userAmuletSprite = null;
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
  return sessionStorage.getItem(key) || localStorage.getItem(key);
}

function writeStoredItem(key, value) {
  sessionStorage.setItem(key, value);
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn('[garden-three] failed to mirror storage key', key, err);
  }
}

function removeStoredItem(key) {
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
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

function applyContentAnchor(sprite, texture) {
  const img = texture.image;
  const { minX, minY, maxX, maxY } = alphaBoundsFromImage(img);
  const cw = img.width;
  const ch = img.height;
  const size = SPRITE_SIZE;
  const cx = (minX + maxX + 1) / 2 / cw;
  const cy = (ch - maxY - 1) / ch + SCREEN_LOWER_PX / ch;

  texture.offset.set(0, 0);

  sprite.center.set(cx, cy);
  sprite.userData.baseScale = size;
  sprite.scale.set(size, size, 1);
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

function persistUserAmuletSnapshot(sourceCanvas) {
  try {
    const snapshot = snapshotCanvas(sourceCanvas);
    writeStoredItem(SNAPSHOT_KEY, snapshot.toDataURL('image/png'));
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
  if (hasUserAmuletSnapshot()) {
    applyUserAmuletSlotPosition();
  }
  sessionStorage.setItem(POSITION_VERSION_KEY, POSITION_VERSION);
}

/** Nudge placement sideways when another amulet already occupies the spot. */
function findClearPosition(desiredX, desiredZ, selfRadius) {
  const others = sprites.filter((sprite) => sprite !== userAmuletSprite);

  function isClear(x, z) {
    for (const sprite of others) {
      const dist = Math.hypot(x - sprite.position.x, z - sprite.position.z);
      const minDist = selfRadius + spriteFootprintRadius(sprite) + 0.35;
      if (dist < minDist) return false;
    }
    return true;
  }

  if (isClear(desiredX, desiredZ)) return { x: desiredX, z: desiredZ };

  const step = Math.max(selfRadius, SPRITE_SIZE * 0.5) * 0.85;
  for (let ring = 1; ring <= 16; ring++) {
    const samples = Math.max(6, ring * 2);
    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2 + ring * 0.3;
      const x = desiredX + Math.cos(angle) * step * ring;
      const z = desiredZ + Math.sin(angle) * step * ring;
      if (isClear(x, z)) return { x, z };
    }
  }

  return { x: desiredX + step, z: desiredZ };
}

function resolveUserAmuletLayout(snapshotCanvas, restore) {
  const selfRadius = estimateSpriteScale() * 0.42;
  if (restore) {
    const saved = loadUserAmuletPosition();
    if (saved) return saved;
  }
  return userAmuletSlotPosition(selfRadius);
}

function focusCameraOnAmulet(sprite) {
  camera.position.x = sprite.position.x + 1.2;
  camera.position.z = sprite.position.z + 4.7;
  lookForward();
  notifyCameraMove();
}

function addUserAmuletSprite(sourceCanvas, options) {
  if (!sourceCanvas?.width || !sourceCanvas?.height) return null;

  if (userAmuletSprite) {
    scene.remove(userAmuletSprite);
    userAmuletSprite.material?.map?.dispose?.();
    userAmuletSprite.material?.dispose?.();
    userAmuletSprite = null;
  }

  const snapshot = snapshotCanvas(sourceCanvas);
  persistUserAmuletSnapshot(snapshot);
  const answers = (options && options.answers) || loadAnswers();
  if (Object.keys(answers).length) {
    persistUserAmuletAnswers(answers);
  }
  const texture = configureSpriteTexture(new THREE.CanvasTexture(snapshot));
  texture.needsUpdate = true;

  const restore = Boolean(options && options.restore);
  const layout = resolveUserAmuletLayout(snapshot, restore);
  if (!restore) persistUserAmuletPosition(layout.x, layout.z);

  userAmuletSprite = makeSprite({ tex: 0, x: layout.x, z: layout.z }, texture, USER_AMULET_INDEX);
  userAmuletSprite.userData.isUserAmulet = true;
  userAmuletSprite.userData.answers = answers;

  return userAmuletSprite;
}

function restoreUserAmuletFromStorage() {
  const dataUrl = loadUserAmuletSnapshotUrl();
  if (!dataUrl) return Promise.resolve(false);

  restoreUserAmuletAnswersIfNeeded();

  return new Promise(function (resolve) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      addUserAmuletSprite(canvas, {
        restore: true,
        answers: loadUserAmuletAnswers() || undefined,
      });
      document.body.classList.add('has-user-amulet');
      resolve(true);
    };
    img.onerror = function () {
      console.warn('[garden-three] failed to restore user amulet snapshot');
      resolve(false);
    };
    img.src = dataUrl;
  });
}

function focusUserAmulet() {
  if (!userAmuletSprite) return false;
  focusCameraOnAmulet(userAmuletSprite);
  controlsEnabled = true;
  document.body.style.cursor = 'grab';
  return true;
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
  sprite.renderOrder = 2;
  sprite.userData.questionIndex = questionIndex;
  sprite.userData.tex = layout.tex;
  scene.add(sprite);
  sprites.push(sprite);
  attachGalleryAnswers(sprite);
  return sprite;
}

function attachGalleryAnswers(sprite) {
  const tex = sprite.userData.tex;
  if (typeof tex !== 'number') return;
  if (typeof window.loadGalleryAmuletAnswers !== 'function') return;
  window.loadGalleryAmuletAnswers(tex).then(function (data) {
    if (data) sprite.userData.answers = data;
  });
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

function focusMulForSprite(sprite) {
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

function depthDarknessForSprite(sprite) {
  let target = 0;
  if (
    isDepthShadeEnabled() &&
    !(isAmuletFocusMode() && indexMatchesSprite(selectedIndex, sprite))
  ) {
    const dist = camera.position.distanceTo(sprite.position);
    target = THREE.MathUtils.smoothstep(dist, DARK_DIST_START, DARK_DIST_FULL);
  }
  const current = sprite.userData.depthDark ?? 0;
  const next = current + (target - current) * DARK_AMOUNT_LERP;
  sprite.userData.depthDark = next;
  return next;
}

function updateCursorFromPointer(clientX, clientY) {
  const hit = pickAmulet(clientX, clientY, false);
  document.body.style.cursor = hit ? 'pointer' : 'grab';
}

function updateDepthFade(now) {
  for (const sprite of sprites) {
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

    const darkT = depthDarknessForSprite(sprite);
    const depthT = darkT * darkT;
    const brightness = THREE.MathUtils.lerp(1, DARK_MIN_BRIGHTNESS, depthT);
    const depthOpacity = THREE.MathUtils.lerp(1, DARK_MIN_OPACITY, depthT);
    sprite.material.opacity = focusMul * depthOpacity;
    sprite.material.color.setRGB(brightness, brightness, brightness);
    sprite.visible = focusMul > 0.02 && !sprite.userData.spin3dHidden;
    applySpriteFloat(sprite);
  }
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
  const box = new THREE.Box3().setFromObject(sceneClone);
  const center = box.getCenter(new THREE.Vector3());
  sceneClone.position.sub(center);
  wrapper.add(sceneClone);
  const size = box.getSize(new THREE.Vector3());
  wrapper.userData.baseRotY = sceneClone.rotation.y || 0;
  sceneClone.rotation.y = 0;
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
  camera.position.x -= deltaX * PAN_SPEED;
  camera.position.z = THREE.MathUtils.clamp(
    camera.position.z - deltaY * PAN_SPEED,
    MIN_CAMERA_Z,
    MAX_CAMERA_Z
  );
  lookForward();
  capturePlacementAnchor();
  notifyCameraMove('pan');
});

canvas.addEventListener('pointerleave', () => {
  if (controlsEnabled) document.body.style.cursor = 'grab';
});

function shouldIgnoreGardenWheel(target) {
  if (!target || !(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      '.pagmar__site-intro, .pagmar__index-filter-panel, .pagmar__choice-panel, ' +
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
  camera.position.z = THREE.MathUtils.clamp(
    camera.position.z + e.deltaY * ZOOM_SPEED,
    MIN_CAMERA_Z,
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
  window.dispatchEvent(
    new CustomEvent('questionnaire:star-click', {
      detail: {
        anchor,
        index: typeof tex === 'number' ? tex : index,
        tex,
        answers: sprite.userData.answers || null,
      },
    })
  );
}

canvas.addEventListener('pointerup', (e) => {
  if (!pointerDown) return;
  const moved = pointerDown.moved;
  pointerDown = null;

  if (moved) return;

  const specPanelOpen = document.body.classList.contains('is-spec-panel-open');
  const hit = pickAmulet(e.clientX, e.clientY, specPanelOpen);

  if (specPanelOpen && !hit) {
    window.dispatchEvent(new CustomEvent('questionnaire:close-panel'));
    return;
  }

  if (!hit) return;

  startAmuletSpin(hit);

  const index = hit.userData.isUserAmulet
    ? USER_AMULET_INDEX
    : hit.userData.tex ?? hit.userData.questionIndex;

  const closingSame =
    specPanelOpen &&
    selectedIndex === index &&
    document.body.classList.contains('is-spec-panel-open');

  if (!closingSame) {
    selectedIndex = index;
  }

  if (hit.userData.isUserAmulet) {
    const anchor = spriteAnchorInCanvas(hit);
    window.dispatchEvent(
      new CustomEvent('questionnaire:star-click', {
        detail: {
          anchor,
          index: USER_AMULET_INDEX,
          answers: hit.userData.answers || loadUserAmuletAnswers(),
        },
      })
    );
    return;
  }

  dispatchAmuletClick(hit, index);
});

window.addEventListener('questionnaire:answered', () => {
  updateFocusVisuals();
});

window.addEventListener('questionnaire:panel-open', () => {
  controlsEnabled = false;
  document.body.style.cursor = 'default';
});

window.addEventListener('questionnaire:intro-open', () => {
  controlsEnabled = false;
  pointerDown = null;
  document.body.style.cursor = 'default';
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
  if (document.body.classList.contains('is-site-intro-open')) return;
  controlsEnabled = true;
  updateCursorFromPointer(lastPointer.x, lastPointer.y);
  updateFocusVisuals();
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
  if (!document.hidden) updateDepthFade(performance.now());
});

Promise.all(AMULET_LAYOUT.map(({ tex }) => loadTexture(tex)))
  .then((textures) => {
    AMULET_LAYOUT.forEach((layout, i) => {
      makeSprite(layout, textures[i], i);
    });
    migrateUserAmuletPositionIfNeeded();
    restoreUserAmuletAnswersIfNeeded();
    if (hasUserAmuletSnapshot()) {
      return restoreUserAmuletFromStorage();
    }
  })
  .then(() => {
    updateFocusVisuals();
    window.__gardenReady = sprites.length;
  })
  .catch((err) => {
    console.error('[garden-three] failed to load amulets', err);
    mount.insertAdjacentHTML(
      'beforeend',
      '<p style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#f4f4f4;font-family:sans-serif;padding:2rem;text-align:center">לא הצלחתי לטעון את הקמעים.<br>ודאי שהשרת רץ.</p>'
    );
  });

window.gardenAddUserAmulet = addUserAmuletSprite;
window.gardenCapturePlacementAnchor = capturePlacementAnchor;
window.gardenFocusUserAmulet = focusUserAmulet;
window.gardenPersistUserAmuletSnapshot = persistUserAmuletSnapshot;
window.gardenPersistUserAmuletAnswers = persistUserAmuletAnswers;
window.gardenLoadUserAmuletAnswers = loadUserAmuletAnswers;
window.gardenHasUserAmuletSnapshot = hasUserAmuletSnapshot;
window.gardenAnchorForTex = function (texIndex) {
  for (const sprite of sprites) {
    if (sprite.userData.isUserAmulet) continue;
    if (sprite.userData.tex === texIndex) return spriteBoundsInCanvas(sprite);
  }
  return null;
};
window.gardenAnchorForUserAmulet = function () {
  if (!userAmuletSprite) return null;
  return spriteBoundsInCanvas(userAmuletSprite);
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
