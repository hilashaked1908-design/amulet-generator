/**
 * Luca fog for the about overlay.
 */
import {
  bootFogWebGL,
  disposeFogWebGL,
  getDetailFogState,
  resizeFogHost,
} from './amulet-detail-fog.js?v=20250710-about-fog';

let bootToken = 0;

function waitForFogReady(timeoutMs) {
  const deadline = performance.now() + (timeoutMs || 5000);
  return new Promise(function (resolve) {
    function tick() {
      const host = document.getElementById('aboutFogHost');
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

export async function bootAboutOverlayFog() {
  const host = document.getElementById('aboutFogHost');
  if (!host) return null;

  const token = ++bootToken;
  bootFogWebGL(host, { profile: 'garden' });
  const state = await waitForFogReady();
  if (token !== bootToken) return null;

  resizeFogHost();
  requestAnimationFrame(resizeFogHost);
  return state;
}

export function resizeAboutOverlayFog() {
  const host = document.getElementById('aboutFogHost');
  const state = getDetailFogState();
  if (host && state.host === host) {
    resizeFogHost();
  }
}

export function stopAboutOverlayFog() {
  bootToken += 1;
  const host = document.getElementById('aboutFogHost');
  const state = getDetailFogState();
  if (host && state.host === host) {
    disposeFogWebGL();
  }

  if (document.body.classList.contains('is-panel-open')) {
    import('./request-flow-fog.js?v=20250709-request-fog')
      .then(function (mod) {
        mod.bootRequestFlowFog();
      })
      .catch(function () {});
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', resizeAboutOverlayFog);

  window.addEventListener('questionnaire:about-opened', function () {
    bootAboutOverlayFog().catch(function (err) {
      console.warn('[about-fog] boot failed', err);
    });
  });

  window.addEventListener('questionnaire:about-closed', function () {
    stopAboutOverlayFog();
  });
}
