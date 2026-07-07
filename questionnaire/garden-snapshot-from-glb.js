/**
 * Offscreen detail-style GLB render → garden snapshot (same rig as amulet.html).
 */
import { loadGlb } from './amulet-glb-store.js';
import {
  mountDetailAmulet3D,
  disposeDetailAmuletMount,
  captureDetailAmuletSnapshot,
  waitForContainerLayout,
} from './amulet-detail-mount.js';

const OFFSCREEN_HOST_STYLE =
  'position:fixed;left:-10000px;top:0;width:720px;height:720px;opacity:0;pointer-events:none;overflow:hidden';

function waitFrames(count) {
  return new Promise(function (resolve) {
    let left = count || 2;
    function tick() {
      if (--left <= 0) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

/** Render a transparent PNG snapshot from a stored GLB key (e.g. collection-1783…). */
export async function captureGardenSnapshotFromGlb(glbKey, options) {
  options = options || {};
  const targetPx = options.targetPx || 2048;

  const loaded = await loadGlb(glbKey);
  if (!loaded?.scene) return null;

  const host = document.createElement('div');
  host.style.cssText = OFFSCREEN_HOST_STYLE;
  document.body.appendChild(host);

  try {
    await waitForContainerLayout(host, 48);
    mountDetailAmulet3D(host, loaded.scene, {
      materialOverrides: loaded.materialOverrides || [],
      useDetailPresentation: true,
    });
    await waitFrames(3);
    await new Promise(function (r) {
      window.setTimeout(r, 60);
    });
    return captureDetailAmuletSnapshot({ targetPx: targetPx });
  } finally {
    disposeDetailAmuletMount();
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}
