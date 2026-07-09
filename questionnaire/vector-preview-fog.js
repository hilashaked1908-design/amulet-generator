/**
 * Animated fog veil over questionnaire vector preview (Q1-Q7).
 * Does not touch the full-page main loader.
 */
import {
  bootFogWebGL,
  disposeFogWebGL,
  getDetailFogState,
  resizeFogHost,
} from './amulet-detail-fog.js?v=20250708-vector-fog-exp';

const HOST_CLASS = 'pagmar__vector-fog-veil';
let hostEl = null;
let bootToken = 0;

function findAmuletFrame() {
  const container = document.getElementById('amuletContainer');
  if (container) {
    const frame = container.closest('.figma-amulet');
    if (frame) return frame;
  }
  return document.querySelector(
    '.pagmar__request-amulet-build, .pagmar__index-create-amulet-frame, .pagmar__create-amulet-frame'
  );
}

function ensureHost() {
  const frame = findAmuletFrame();
  if (!frame) return null;

  if (!hostEl || !hostEl.isConnected) {
    hostEl = frame.querySelector('.' + HOST_CLASS);
  }
  if (!hostEl) {
    hostEl = document.createElement('div');
    hostEl.className = HOST_CLASS;
    hostEl.setAttribute('aria-hidden', 'true');
    frame.appendChild(hostEl);
  }
  return hostEl;
}

function waitForFogReady(timeoutMs) {
  const deadline = performance.now() + (timeoutMs || 4000);
  return new Promise(function (resolve) {
    function tick() {
      const state = getDetailFogState();
      const live = Boolean(hostEl && hostEl.classList.contains('pagmar__detail-fog--live'));
      if (state.lucaFog && live) {
        requestAnimationFrame(function () {
          requestAnimationFrame(resolve);
        });
        return;
      }
      if (performance.now() >= deadline) {
        resolve(state);
        return;
      }
      requestAnimationFrame(tick);
    }
    tick();
  });
}

export async function bootVectorPreviewFog() {
  const host = ensureHost();
  if (!host) return null;

  const token = ++bootToken;
  bootFogWebGL(host, { profile: 'vector-preview' });
  const state = await waitForFogReady();
  if (token !== bootToken) return null;

  resizeFogHost();
  requestAnimationFrame(resizeFogHost);
  return state;
}

export function resizeVectorPreviewFog() {
  if (hostEl && getDetailFogState().host === hostEl) {
    resizeFogHost();
  }
}

export function stopVectorPreviewFog() {
  bootToken += 1;
  const state = getDetailFogState();
  if (state.host && state.host === hostEl) {
    disposeFogWebGL();
  }
  if (hostEl) {
    hostEl.classList.remove('pagmar__detail-fog--live');
    hostEl.innerHTML = '';
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', resizeVectorPreviewFog);
}
