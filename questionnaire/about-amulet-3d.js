/**
 * About overlay - interactive 3D sample amulet [014] from seed GLB.
 */
import {
  mountDetailStyleAmulet,
  disposePresentedAmulet,
} from './amulet-detail-present.js?v=20250710-about-amulet-3d';

const AMULET_014_GLB_KEY = 'collection-1783187972558';

let bootToken = 0;

async function bootAboutAmulet3D() {
  const container = document.getElementById('aboutAmulet3D');
  if (!container) return;

  const token = ++bootToken;
  container.innerHTML = '';

  try {
    await mountDetailStyleAmulet(container, AMULET_014_GLB_KEY, {
      useDetailPresentation: true,
      autoRotate: true,
      autoRotateSpeed: 0.11,
      fitMargin: 1.08,
    });
    if (token !== bootToken) {
      disposePresentedAmulet();
    }
  } catch (err) {
    if (token === bootToken) {
      console.warn('[about-amulet-3d] mount failed', err);
    }
  }
}

function stopAboutAmulet3D() {
  bootToken += 1;
  const container = document.getElementById('aboutAmulet3D');
  if (!container) return;
  if (container.querySelector('canvas')) {
    disposePresentedAmulet();
  }
  container.innerHTML = '';
}

if (typeof window !== 'undefined') {
  window.addEventListener('questionnaire:about-opened', function () {
    bootAboutAmulet3D();
  });
  window.addEventListener('questionnaire:about-closed', function () {
    stopAboutAmulet3D();
  });
}
