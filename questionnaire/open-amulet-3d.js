/**
 * Open page - seed amulet [021] in Figma layout slot.
 * Static PNG shows immediately; 3D upgrades after idle.
 */
import { loadGlbFromUrl } from './amulet-glb-store.js';
import {
  mountDetailAmulet3D,
  disposeDetailAmuletMount,
  waitForContainerLayout,
} from './amulet-detail-mount.js';

const AMULET_021_ENTRY_ID = '1783268062084';
const AMULET_021_GLB_URL = '/questionnaire/seed/glbs/' + AMULET_021_ENTRY_ID + '.glb';

let bootToken = 0;

function hidePlaceholder(container) {
  if (!container) return;
  container.classList.add('is-3d-ready');
  const placeholder = container.querySelector('.pagmar-open__amulet-placeholder');
  if (placeholder) placeholder.setAttribute('aria-hidden', 'true');
}

async function bootOpenAmulet3D() {
  const container = document.getElementById('openAmulet3D');
  if (!container) return;

  const token = ++bootToken;
  container.dataset.amuletLabel = '021';
  container.dataset.amuletId = AMULET_021_ENTRY_ID;

  try {
    const loaded = await loadGlbFromUrl(AMULET_021_GLB_URL);
    if (!loaded?.scene) throw new Error('seed GLB [021] missing');
    if (token !== bootToken) return;

    disposeDetailAmuletMount();
    await waitForContainerLayout(container);
    if (token !== bootToken) return;

    mountDetailAmulet3D(container, loaded.scene, {
      materialOverrides: loaded.materialOverrides || [],
      useDetailPresentation: true,
      autoRotate: true,
      autoRotateSpeed: 0.11,
      fitMargin: 1.02,
      skipStoneBackCap: true,
    });

    if (token !== bootToken) {
      disposeDetailAmuletMount();
      return;
    }

    hidePlaceholder(container);
    window.dispatchEvent(new CustomEvent('pagmar-open:amulet-ready'));
  } catch (err) {
    if (token === bootToken) {
      console.warn('[open-amulet-3d] mount failed — keeping static snapshot', err);
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
