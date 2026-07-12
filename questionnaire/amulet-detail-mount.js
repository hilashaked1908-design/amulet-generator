/**
 * 3D amulet mount - copied from amulet-detail-scene.js setup3DAmulet (detail page is source of truth).
 * Used by the questionnaire result overlay only; detail page keeps its inline implementation.
 */
import * as THREE from './vendor/three.module.js';
import {
  addCreationLights,
  applyPresentMaterialMaps,
  applyPresentRendererSettings,
  buildRoomEnvironmentMap,
  buildStudioEnvMap,
  PRESENT_TONE_MAPPING_EXPOSURE,
} from './amulet-present-lighting.js';
import { ensureStoneBackCapForScene } from '../three-pbr-amulet.js?v=20250712-stone-back-vendor';

const STONE_PRESENTATION_RENDER_ORDER = 12;
const METAL_PRESENTATION_RENDER_ORDER = 24;

function meshMaterialRef(obj) {
  if (!obj?.material) return null;
  return Array.isArray(obj.material) ? obj.material[0] : obj.material;
}

function prepareLoadedGlbForPresentation(glbScene, THREE, options) {
  if (!glbScene) return;

  glbScene.updateMatrixWorld(true);

  let stoneMesh = null;
  let stoneScore = -1;

  glbScene.traverse(function (obj) {
    if (!obj.isMesh || !obj.material) return;
    const mat = meshMaterialRef(obj);
    const metalness = mat?.metalness ?? 0;
    if (metalness > 0.45) {
      obj.renderOrder = METAL_PRESENTATION_RENDER_ORDER;
      return;
    }

    const count = obj.geometry?.attributes?.position?.count || 0;
    if (count < 3) return;
    const hasVertexColors = Boolean(obj.geometry?.attributes?.color);
    let score = count;
    if (hasVertexColors) score += count * 2;
    if (metalness < 0.15) score += count * 0.5;
    if (score > stoneScore) {
      stoneScore = score;
      stoneMesh = obj;
    }
  });

  if (stoneMesh) {
    stoneMesh.renderOrder = STONE_PRESENTATION_RENDER_ORDER;
    const mats = Array.isArray(stoneMesh.material)
      ? stoneMesh.material
      : [stoneMesh.material];
    mats.forEach(function (m) {
      if (!m) return;
      m.side = THREE.DoubleSide;
      m.depthWrite = true;
      m.transparent = false;
      m.opacity = 1;
      m.needsUpdate = true;
    });
  }

  if (!(options && options.skipStoneBackCap)) {
    try {
      if (!ensureStoneBackCapForScene(glbScene, THREE)) {
        console.warn('[amulet-detail-mount] stone back cap — no stone mesh found');
      }
    } catch (err) {
      console.warn('[amulet-detail-mount] stone back cap skipped', err);
    }
  }

  glbScene.traverse(function (obj) {
    if (obj.name !== 'stoneBackCap' || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach(function (m) {
      if (!m) return;
      m.side = THREE.DoubleSide;
      m.depthWrite = true;
      m.transparent = false;
      m.opacity = 1;
      m.needsUpdate = true;
    });
  });

  glbScene.updateMatrixWorld(true);
}

const state = {
  container: null,
  renderer: null,
  scene: null,
  camera: null,
  group: null,
  loopStarted: false,
  userRotX: 0.2,
  userRotY: 0,
  spinAnim: null,
  autoRotate: false,
  autoRotateSpeed: 0.1,
  lastFrameMs: 0,
};

export function getDetailAmuletRenderState() {
  return {
    renderer: state.renderer,
    scene: state.scene,
    camera: state.camera,
  };
}

function applyAmuletRotation() {
  if (!state.group) return;
  if (state.spinAnim) {
    const now = performance.now();
    const t = Math.min(1, (now - state.spinAnim.start) / state.spinAnim.duration);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    state.userRotY = state.spinAnim.fromY + eased * Math.PI * 2;
    if (t >= 1) state.spinAnim = null;
  }
  state.group.rotation.x = state.userRotX;
  state.group.rotation.y = state.userRotY;
}

export function spinDetailAmulet360() {
  if (!state.group || state.spinAnim) return false;
  state.spinAnim = {
    start: performance.now(),
    duration: 1400,
    fromY: state.userRotY,
  };
  return true;
}

function setupDragRotation(canvas) {
  canvas.addEventListener('pointerdown', function (e) {
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.userRotY += dx * 0.008;
    state.userRotX = Math.max(-1.2, Math.min(1.2, state.userRotX - dy * 0.005));
    applyAmuletRotation();
  });

  function endDrag() {
    state.dragging = false;
    canvas.style.cursor = 'grab';
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
}

function resizeDetailAmuletRenderer() {
  if (!state.renderer || !state.container || !state.camera) return;
  const w = state.container.clientWidth || 300;
  const h = state.container.clientHeight || 300;
  state.renderer.setSize(w, h);
  state.camera.aspect = w / h;
  state.camera.updateProjectionMatrix();
}

function startDetailAmuletRenderLoop() {
  if (state.loopStarted) return;
  state.loopStarted = true;
  state.lastFrameMs = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const t = typeof now === 'number' ? now : performance.now();
    const dt = Math.min(0.05, Math.max(0, (t - state.lastFrameMs) / 1000));
    state.lastFrameMs = t;
    if (state.autoRotate && state.group && !state.dragging && !state.spinAnim) {
      state.userRotY += state.autoRotateSpeed * dt;
    }
    if (state.renderer && state.scene && state.camera) {
      applyAmuletRotation();
      state.renderer.render(state.scene, state.camera);
      if (window.pagmarGlassLens && !document.body.classList.contains('pagmar-open')) {
        window.pagmarGlassLens.tick();
      }
    }
  }
  frame(state.lastFrameMs);
}

export function waitForContainerLayout(container, maxFrames) {
  maxFrames = maxFrames || 30;
  return new Promise(function (resolve) {
    let left = maxFrames;
    function tick() {
      if (!container || (container.clientWidth > 0 && container.clientHeight > 0)) {
        resolve();
        return;
      }
      if (--left <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    }
    tick();
  });
}

export function mountDetailAmulet3D(container, glbScene, options) {
  const materialOverrides = (options && options.materialOverrides) || [];
  const useDetailPresentation = Boolean(options && options.useDetailPresentation);
  if (!container || !glbScene) throw new Error('mountDetailAmulet3D: missing container or scene');

  disposeDetailAmuletMount();

  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const clearAlpha =
    options && options.opaqueBackground ? 1 : 0;
  renderer.setClearColor(0x000000, clearAlpha);

  const scene = new THREE.Scene();
  scene.background = clearAlpha > 0 ? new THREE.Color(0x000000) : null;

  const roomEnvTex = buildRoomEnvironmentMap(renderer);
  scene.environment = roomEnvTex;

  if (useDetailPresentation) {
    applyPresentRendererSettings(renderer, scene);
  }

  const studioEnv = buildStudioEnvMap(renderer);

  glbScene.rotation.set(0, 0, 0);
  glbScene.updateMatrixWorld(true);
  applyPresentMaterialMaps(glbScene, roomEnvTex, studioEnv, materialOverrides, {
    sheshPresentation: useDetailPresentation,
  });
  prepareLoadedGlbForPresentation(glbScene, THREE, options);

  const box = new THREE.Box3().setFromObject(glbScene);
  const center = box.getCenter(new THREE.Vector3());
  glbScene.position.sub(center);

  const group = new THREE.Group();
  group.add(glbScene);
  if (options && typeof options.presentationOffsetY === 'number') {
    group.position.y = options.presentationOffsetY;
  }
  scene.add(group);
  if (useDetailPresentation) {
    addCreationLights(scene);
  }

  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const fov = 40;
  const fitMargin =
    typeof options.fitMargin === 'number'
      ? options.fitMargin
      : useDetailPresentation
        ? 1.34
        : 1.05;
  const dist = (maxDim / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2)) * fitMargin;

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, dist * 4);
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);

  container.innerHTML = '';
  container.style.display = '';
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';
  canvas.style.pointerEvents = 'auto';
  canvas.style.cursor = 'grab';

  state.container = container;
  state.renderer = renderer;
  state.scene = scene;
  state.camera = camera;
  state.group = group;
  state.userRotX =
    options && typeof options.initialRotX === 'number' ? options.initialRotX : 0.2;
  state.userRotY =
    options && typeof options.initialRotY === 'number' ? options.initialRotY : 0;
  state.autoRotate = Boolean(options && options.autoRotate);
  state.autoRotateSpeed =
    typeof options.autoRotateSpeed === 'number' ? options.autoRotateSpeed : 0.1;
  state.spinAnim = null;
  state.lastFrameMs = performance.now();

  setupDragRotation(canvas);
  startDetailAmuletRenderLoop();

  requestAnimationFrame(function () {
    resizeDetailAmuletRenderer();
    renderer.render(scene, camera);
  });

  return getDetailAmuletRenderState();
}

export function disposeDetailAmuletMount() {
  state.loopStarted = false;
  state.dragging = false;
  if (state.renderer) {
    state.renderer.dispose();
  }
  if (state.scene) {
    state.scene.traverse(function (obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(function (m) {
        m.dispose?.();
      });
    });
  }
  if (state.container) state.container.innerHTML = '';
  state.container = null;
  state.renderer = null;
  state.scene = null;
  state.camera = null;
  state.group = null;
  state.userRotX = 0.2;
  state.userRotY = 0;
  state.spinAnim = null;
  state.autoRotate = false;
  state.autoRotateSpeed = 0.1;
  state.lastFrameMs = 0;
}

export function captureDetailAmuletSnapshot(options) {
  options = options || {};
  const targetPx = options.targetPx || 2048;
  const { renderer, scene, camera } = state;
  if (!renderer || !scene || !camera) return null;

  const savedRotX = state.userRotX;
  const savedRotY = state.userRotY;
  const savedSpinAnim = state.spinAnim;
  state.userRotX = 0;
  state.userRotY = 0;
  state.spinAnim = null;
  applyAmuletRotation();

  try {
    resizeDetailAmuletRenderer();

    const dom = renderer.domElement;
    const origDPR = renderer.getPixelRatio();
    const cssW = Math.max(1, dom.clientWidth || dom.width / Math.max(origDPR, 1));
    const cssH = Math.max(1, dom.clientHeight || dom.height / Math.max(origDPR, 1));
    const aspect = cssW / cssH;
    const snapW = Math.max(1, aspect >= 1 ? targetPx : Math.round(targetPx * aspect));
    const snapH = Math.max(1, aspect >= 1 ? Math.round(targetPx / aspect) : targetPx);

    renderer.setPixelRatio(1);
    renderer.setSize(snapW, snapH, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMappingExposure =
      typeof renderer.toneMappingExposure === 'number' ? renderer.toneMappingExposure : PRESENT_TONE_MAPPING_EXPOSURE;
    renderer.render(scene, camera);

    const snap = document.createElement('canvas');
    snap.width = snapW;
    snap.height = snapH;
    snap.getContext('2d', { alpha: true }).drawImage(dom, 0, 0);

    renderer.setPixelRatio(origDPR);
    renderer.setSize(cssW, cssH, false);
    renderer.setClearColor(0x000000, 0);
    return snap;
  } catch (err) {
    console.warn('[amulet-detail-mount] snapshot capture failed', err);
    return null;
  } finally {
    state.userRotX = savedRotX;
    state.userRotY = savedRotY;
    state.spinAnim = savedSpinAnim;
    applyAmuletRotation();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', resizeDetailAmuletRenderer);
}
