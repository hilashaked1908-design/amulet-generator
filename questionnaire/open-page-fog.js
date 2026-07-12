/**
 * Open page - Luca fog canvas (same glass sampling stack as garden / about / detail).
 */
import { bootFogWebGL, resizeFogHost } from './amulet-detail-fog.js?v=20250712-open-fog';

function bootOpenFog() {
  const host = document.getElementById('openFogHost');
  if (!host) return;
  bootFogWebGL(host, { profile: 'garden' });
  resizeFogHost();
  requestAnimationFrame(resizeFogHost);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOpenFog, { once: true });
  } else {
    bootOpenFog();
  }
  window.addEventListener('resize', resizeFogHost, { passive: true });
}
