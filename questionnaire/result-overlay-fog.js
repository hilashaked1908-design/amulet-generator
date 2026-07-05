/**
 * Luca fog for the questionnaire result overlay.
 */
import {
  bootFogWebGL,
  disposeFogWebGL,
  getDetailFogState,
  resizeFogHost,
} from './amulet-detail-fog.js?v=20250705-result-fog';

function waitForFogReady(timeoutMs) {
  const deadline = performance.now() + (timeoutMs || 5000);
  return new Promise(function (resolve) {
    function tick() {
      const host = document.getElementById('resultFogHost');
      const state = getDetailFogState();
      const live = Boolean(host && host.classList.contains('pagmar__detail-fog--live'));
      if (state.lucaFog && live) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            resolve(state);
          });
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

export async function bootResultOverlayFog() {
  const host = document.getElementById('resultFogHost');
  if (!host) return null;

  bootFogWebGL(host, { profile: 'result' });
  const state = await waitForFogReady();
  resizeFogHost();
  requestAnimationFrame(resizeFogHost);
  return state;
}

export function resizeResultOverlayFog() {
  resizeFogHost();
}

export function stopResultOverlayFog() {
  disposeFogWebGL();
}
