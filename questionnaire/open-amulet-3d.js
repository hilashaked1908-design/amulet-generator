/**
 * Open page - seed amulet [014] in Figma layout slot.
 * Loads 3D immediately (no static snapshot flash).
 */
import { loadGlb } from './amulet-glb-store.js';
import {
  mountDetailAmulet3D,
  disposeDetailAmuletMount,
  waitForContainerLayout,
} from './amulet-detail-mount.js?v=20250712-open-stone';

const AMULET_014_ENTRY_ID = '1783187972558';
const AMULET_014_GLB_KEY = 'collection-' + AMULET_014_ENTRY_ID;

let bootToken = 0;

function markAmuletReady(container) {
  if (!container) return;
  container.classList.add('is-3d-ready');
}

async function bootOpenAmulet3D() {
  const container = document.getElementById('openAmulet3D');
  if (!container) return;

  const token = ++bootToken;
  container.dataset.amuletLabel = '014';
  container.dataset.amuletId = AMULET_014_ENTRY_ID;

  try {
    const loaded = await loadGlb(AMULET_014_GLB_KEY, { preferBundledSeed: true });
    if (!loaded?.scene) throw new Error('seed GLB [014] missing');
    if (token !== bootToken) return;

    disposeDetailAmuletMount();
    await waitForContainerLayout(container);
    if (token !== bootToken) return;

    mountDetailAmulet3D(container, loaded.scene, {
      materialOverrides: loaded.materialOverrides || [],
      useDetailPresentation: true,
      autoRotate: true,
      autoRotateSpeed: 0.11,
      fitMargin: 1.08,
      initialRotX: 0.2,
    });

    if (token !== bootToken) {
      disposeDetailAmuletMount();
      return;
    }

    markAmuletReady(container);
    window.dispatchEvent(new CustomEvent('pagmar-open:amulet-ready'));
  } catch (err) {
    if (token === bootToken) {
      console.warn('[open-amulet-3d] mount failed', err);
    }
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootOpenAmulet3D, { once: true });
  } else {
    bootOpenAmulet3D();
  }
}
