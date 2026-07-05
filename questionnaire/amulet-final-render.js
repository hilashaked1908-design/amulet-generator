/**
 * Final PBR render — same pipeline as prototype-v2-thick.html composeAmulet().
 */
import { renderThreePbrAmuletInteractive, getActivePbrScene, getActivePbrRenderer } from '../three-pbr-amulet.js';
import { deferToNextTask, yieldToMainThread } from '../render-yield.js';
import {
  initAmuletCompose,
  composeFullAmuletForPbr,
  L3_MASS_SCALE,
} from './amulet-compose.js';
import {
  PRESENT_ENVIRONMENT_INTENSITY,
  PRESENT_TONE_MAPPING_EXPOSURE,
} from './amulet-present-lighting.js';

let cachedCompose = null;
let cachedComposeKey = '';

function composeCacheKey(answers) {
  return [
    answers.q1Wish,
    answers.q2Name,
    answers.q3WhyNow,
    answers.q4Belief,
    answers.q5Feeling,
    answers.q6Difficulty,
    answers.q7Change,
  ].join('\0');
}

export function invalidateComposeCache() {
  cachedCompose = null;
  cachedComposeKey = '';
}

window.amuletInvalidateComposeCache = invalidateComposeCache;

/** Background SVG compose while user answers Q4–Q6 (no textures yet). */
export async function precomposeForFinalRender(answers) {
  if (!answers?.q1Wish?.trim()) return;
  try {
    await initAmuletCompose();
    const key = composeCacheKey(answers);
    if (cachedComposeKey === key && cachedCompose) return;
    cachedCompose = await composeFullAmuletForPbr(answers);
    cachedComposeKey = key;
  } catch (err) {
    console.warn('[amulet] precompose failed', err);
  }
}

export async function renderFinalAmuletLikePrototype(answers, container, onProgress) {
  if (!container) throw new Error('amulet container missing');

  await initAmuletCompose();
  await yieldToMainThread();
  onProgress?.(0.02, 'בונה SVG…');

  const key = composeCacheKey(answers);
  let composed = cachedComposeKey === key && cachedCompose ? cachedCompose : null;
  if (!composed) {
    composed = await deferToNextTask(function () {
      return composeFullAmuletForPbr(answers);
    });
  }
  invalidateComposeCache();

  if (!composed) throw new Error('לא ניתן לבנות קמע מהתשובות');

  try {
    const model3d = JSON.stringify({
      svg: composed.svg,
      style2: composed.style2,
      style3: composed.style3,
      ageNum: composed.ageNum,
      domainHex: composed.domainHex,
      questionnaire: composed.questionnaire,
    });
    try { sessionStorage.setItem('amuletComposed3D', model3d); } catch (_) {}
    try { localStorage.setItem('amuletComposed3D', model3d); } catch (_) {}
  } catch (_) {}

  await yieldToMainThread();
  onProgress?.(0.12, 'טוען טקסטורות…');

  container.hidden = false;
  container.innerHTML = '';

  const result = await deferToNextTask(function () {
    return renderThreePbrAmuletInteractive({
      svg: composed.svg,
      style2: composed.style2,
      style3: { ...composed.style3, l3MassScale: L3_MASS_SCALE },
      container,
      questionnaire: composed.questionnaire,
      domainHex: composed.domainHex,
      ageNum: composed.ageNum,
      l3MaterialMode: 'stone',
      onProgress: function (frac, label) {
        onProgress?.(0.12 + frac * 0.88, label);
      },
    });
  });

  try {
    const pbrScene = getActivePbrScene();
    const pbrRenderer = getActivePbrRenderer();
    if (pbrScene) {
      const lighting = [];
      pbrScene.traverse(function (obj) {
        if (!obj.isLight) return;
        if (obj.layers && (obj.layers.mask & 1) === 0) return;
        const entry = {
          type: obj.type,
          color: obj.color ? obj.color.getHex() : 0xffffff,
          intensity: obj.intensity,
        };
        if (obj.position) {
          entry.position = [obj.position.x, obj.position.y, obj.position.z];
        }
        if (obj.isHemisphereLight && obj.groundColor) {
          entry.groundColor = obj.groundColor.getHex();
        }
        lighting.push(entry);
      });

      const rendererSettings = {
        lighting: lighting,
        toneMappingExposure: PRESENT_TONE_MAPPING_EXPOSURE,
        environmentIntensity: PRESENT_ENVIRONMENT_INTENSITY,
        presentation: true,
      };
      if (pbrRenderer) {
        rendererSettings.toneMapping = pbrRenderer.toneMapping;
        rendererSettings.outputColorSpace = pbrRenderer.outputColorSpace;
      }

      const materialOverrides = [];
      pbrScene.traverse(function (obj) {
        if (!obj.isMesh || !obj.material) return;
        var m = obj.material;
        if (m.metalness > 0.5) {
          materialOverrides.push({
            meshName: obj.name || obj.uuid,
            envMapIntensity: m.envMapIntensity,
            clearcoat: m.clearcoat,
            clearcoatRoughness: m.clearcoatRoughness,
            reflectivity: m.reflectivity,
          });
        }
      });

      const store = await import('./amulet-glb-store.js');
      try { await store.copyGlb('user-amulet', 'user-amulet-prev'); } catch (_) {}
      await store.saveGlb('user-amulet', pbrScene, { lighting, rendererSettings, materialOverrides });
    }
  } catch (err) {
    console.warn('[amulet-final-render] GLB save failed (non-fatal)', err);
  }

  return result;
}
