/**
 * Luca fog for the create full-page amulet loader (garden-style background).
 */
import {
  bootFogWebGL,
  disposeFogWebGL,
  getDetailFogState,
  resizeFogHost,
} from './amulet-detail-fog.js?v=20250707-garden-loader-fog';

const FOG_HOST_ID = 'createFullpageLoaderFog';

function waitForFogReady(timeoutMs) {
  const deadline = performance.now() + (timeoutMs || 5000);
  return new Promise(function (resolve) {
    function tick() {
      const host = document.getElementById(FOG_HOST_ID);
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

export async function bootCreateLoaderFog() {
  const host = document.getElementById(FOG_HOST_ID);
  if (!host) return null;

  bootFogWebGL(host, { profile: 'garden' });
  const state = await waitForFogReady();
  resizeFogHost();
  requestAnimationFrame(resizeFogHost);
  return state;
}

export function resizeCreateLoaderFog() {
  resizeFogHost();
}

export function stopCreateLoaderFog() {
  disposeFogWebGL();
}
