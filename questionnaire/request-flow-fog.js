/**
 * Full-page Luca fog for the questionnaire request flow (Figma image 157).
 */
import {
  bootFogWebGL,
  disposeFogWebGL,
  getDetailFogState,
  resizeFogHost,
} from './amulet-detail-fog.js?v=20250709-request-fog';

let bootToken = 0;

function waitForFogReady(timeoutMs) {
  const deadline = performance.now() + (timeoutMs || 5000);
  return new Promise(function (resolve) {
    function tick() {
      const host = document.getElementById('requestFogHost');
      const state = getDetailFogState();
      const live = Boolean(host && host.classList.contains('pagmar__detail-fog--live'));
      if (state.lucaFog && live && state.host === host) {
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

export async function bootRequestFlowFog() {
  const host = document.getElementById('requestFogHost');
  if (!host) return null;

  const token = ++bootToken;
  bootFogWebGL(host, { profile: 'garden' });
  const state = await waitForFogReady();
  if (token !== bootToken) return null;

  resizeFogHost();
  requestAnimationFrame(resizeFogHost);
  return state;
}

export function resizeRequestFlowFog() {
  const host = document.getElementById('requestFogHost');
  const state = getDetailFogState();
  if (host && state.host === host) {
    resizeFogHost();
  }
}

export function stopRequestFlowFog() {
  bootToken += 1;
  const host = document.getElementById('requestFogHost');
  const state = getDetailFogState();
  if (host && state.host === host) {
    disposeFogWebGL();
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', resizeRequestFlowFog);
}
