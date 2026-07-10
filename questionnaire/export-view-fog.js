/**
 * Luca fog for the export view page.
 */
import {
  bootFogWebGL,
  disposeFogWebGL,
  getDetailFogState,
  resizeFogHost,
} from './amulet-detail-fog.js?v=20250710-export-view';

function waitForFogReady(timeoutMs) {
  const deadline = performance.now() + (timeoutMs || 5000);
  return new Promise(function (resolve) {
    function tick() {
      const host = document.getElementById('exportFogHost');
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

export async function bootExportViewFog() {
  const host = document.getElementById('exportFogHost');
  if (!host) return null;

  bootFogWebGL(host, { profile: 'garden' });
  const state = await waitForFogReady();
  resizeFogHost();
  requestAnimationFrame(resizeFogHost);
  return state;
}

export function resizeExportViewFog() {
  resizeFogHost();
}

export function stopExportViewFog() {
  disposeFogWebGL();
}
