/**
 * Result overlay - mount amulet with the same 3D pipeline as amulet.html (detail page).
 */
import { loadGlb } from './amulet-glb-store.js';
import { disposeThreePbr } from '../three-pbr-amulet.js';
import {
  mountDetailAmulet3D,
  disposeDetailAmuletMount,
  captureDetailAmuletSnapshot,
  getDetailAmuletRenderState,
  waitForContainerLayout,
} from './amulet-detail-mount.js';

export function getPresentedAmuletRenderState() {
  return getDetailAmuletRenderState();
}

export function disposePresentedAmulet() {
  disposeDetailAmuletMount();
}

export function capturePresentedAmuletSnapshot(options) {
  return captureDetailAmuletSnapshot(options);
}

export async function mountDetailStyleAmulet(container, glbKey, options) {
  if (!container) throw new Error('container missing');

  const preferBundledSeed =
    Boolean(options && options.preferBundledSeed) ||
    /^collection-\d+$/.test(String(glbKey));

  const loaded = await loadGlb(glbKey, { preferBundledSeed });
  if (!loaded?.scene) throw new Error('GLB missing for ' + glbKey);

  disposePresentedAmulet();

  await waitForContainerLayout(container);

  const mounted = mountDetailAmulet3D(container, loaded.scene, {
    materialOverrides: loaded.materialOverrides || [],
    useDetailPresentation: Boolean(options && options.useDetailPresentation),
    autoRotate: Boolean(options && options.autoRotate),
    autoRotateSpeed: options && options.autoRotateSpeed,
    fitMargin: options && options.fitMargin,
  });

  disposeThreePbr();
  return mounted;
}
