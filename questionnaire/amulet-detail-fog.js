/**
 * Luca fog — detail page + result overlay.
 */
import * as THREE from './vendor/three.module.js';
import { createLucaFog } from './garden-fog.js?v=20250707-garden-loader-fog';

const GARDEN_CAMERA_FOV = 58;

const fogState = {
  host: null,
  renderer: null,
  scene: null,
  camera: null,
  lucaFog: null,
  booted: false,
  webglBooted: false,
  loopStarted: false,
};

const frameCallbacks = [];

export function getDetailFogState() {
  return fogState;
}

export function onDetailFrame(callback) {
  if (typeof callback !== 'function') return;
  frameCallbacks.push(callback);
}

export function bootFogWebGL(host, options) {
  options = options || {};
  if (!host) return fogState;
  if (fogState.webglBooted && fogState.host === host) return fogState;

  disposeFogWebGL();

  fogState.webglBooted = true;
  fogState.host = host;

  const fogRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  fogRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  fogRenderer.setClearColor(0x000000, 0);
  fogRenderer.domElement.className = 'pagmar__detail-fog-canvas';
  fogRenderer.domElement.style.background = 'transparent';
  host.appendChild(fogRenderer.domElement);

  const fogScene = new THREE.Scene();
  const fogCamera = new THREE.PerspectiveCamera(GARDEN_CAMERA_FOV, 1, 0.1, 200);
  fogCamera.position.set(0, 1.5, 10);
  fogCamera.lookAt(0, -0.45, 0);

  fogState.renderer = fogRenderer;
  fogState.scene = fogScene;
  fogState.camera = fogCamera;
  fogState.booted = true;

  createLucaFog({
    scene: fogScene,
    camera: fogCamera,
    domElement: fogRenderer.domElement,
    profile: options.profile || 'garden',
  })
    .then(function (fog) {
      fogState.lucaFog = fog;
      host.classList.add('pagmar__detail-fog--live');
      resizeFogHost();
      requestAnimationFrame(resizeFogHost);
    })
    .catch(function (err) {
      console.error('[fog] Luca fog failed', err);
    });

  resizeFogHost();
  startDetailFrameLoop();
  return fogState;
}

export function bootDetailFogWebGL(host) {
  return bootFogWebGL(host, { profile: 'garden' });
}

/** @deprecated Use bootDetailFogWebGL — kept for scene.js compatibility */
export function bootDetailFog(host) {
  return bootDetailFogWebGL(host);
}

export function disposeFogWebGL() {
  if (fogState.lucaFog?.dispose) {
    try {
      fogState.lucaFog.dispose();
    } catch (_) {}
  }
  if (fogState.renderer) {
    fogState.renderer.dispose();
  }
  if (fogState.host) {
    fogState.host.classList.remove('pagmar__detail-fog--live');
    fogState.host.innerHTML = '';
  }
  fogState.host = null;
  fogState.renderer = null;
  fogState.scene = null;
  fogState.camera = null;
  fogState.lucaFog = null;
  fogState.booted = false;
  fogState.webglBooted = false;
  fogState.loopStarted = false;
}

export function resizeFogHost() {
  if (!fogState.host || !fogState.renderer || !fogState.camera) return;
  const w = fogState.host.clientWidth || window.innerWidth;
  const h = fogState.host.clientHeight || window.innerHeight;
  if (!w || !h) return;
  fogState.renderer.setSize(w, h, false);
  fogState.camera.aspect = w / h;
  fogState.camera.updateProjectionMatrix();
}

/** @deprecated */
export function resizeDetailFog() {
  resizeFogHost();
}

export function renderDetailFog(t) {
  if (fogState.lucaFog) fogState.lucaFog.update(t);
  if (fogState.renderer && fogState.scene && fogState.camera) {
    fogState.renderer.render(fogState.scene, fogState.camera);
  }
}

function startDetailFrameLoop() {
  if (fogState.loopStarted) return;
  fogState.loopStarted = true;

  function frame(now) {
    requestAnimationFrame(frame);
    const t = (typeof now === 'number' ? now : performance.now()) * 0.001;
    renderDetailFog(t);
    for (let i = 0; i < frameCallbacks.length; i++) {
      frameCallbacks[i](t);
    }
  }

  requestAnimationFrame(frame);
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', resizeFogHost);
}
