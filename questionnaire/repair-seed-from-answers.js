/**
 * Re-render seed amulets from collection answers (correct stone + metal materials).
 */
import { GLTFExporter } from './vendor/GLTFExporter.js';
import {
  initAmuletCompose,
  composeFullAmuletForPbr,
  L3_MASS_SCALE,
} from './amulet-compose.js';
import {
  renderThreePbrAmuletInteractive,
  getActivePbrScene,
  getActivePbrRenderer,
  captureHighResSnapshot,
  disposeThreePbr,
} from '../three-pbr-amulet.js';
import {
  PRESENT_ENVIRONMENT_INTENSITY,
  PRESENT_TONE_MAPPING_EXPOSURE,
} from './amulet-present-lighting.js';

const OFFSCREEN_HOST_STYLE =
  'position:fixed;left:-10000px;top:0;width:720px;height:720px;opacity:0;pointer-events:none;overflow:hidden';

const Q4_STONE_ROUGH = {
  concrete_actions: 0.96,
  gut: 0.48,
  doubt: 0.32,
  signs: null,
  support: 0.96,
};

const Q5_METAL = {
  hope: { rough: 0.081, bc: [100, 100, 111] },
  excitement: { rough: 0.05, bc: [161, 161, 171] },
  fear: { rough: 0.07, bc: [20, 20, 25] },
  confusion: { rough: 0.5, bc: [63, 63, 63] },
  impatience: { rough: 0.5, bc: [63, 63, 63] },
};

function rgbFromBc(bc) {
  if (!bc || bc.length < 3) return null;
  return bc.slice(0, 3).map(function (v) {
    return Math.round(v * 255);
  });
}

function near(a, b, tol) {
  return Math.abs(a - b) <= tol;
}

function rgbNear(a, b, tol) {
  if (!a || !b) return a == null && b == null;
  return a.every(function (v, i) {
    return near(v, b[i], tol);
  });
}

function parseGlbJson(buffer) {
  const data = new Uint8Array(buffer);
  if (String.fromCharCode(data[0], data[1], data[2], data[3]) !== 'glTF') return null;
  const length = new DataView(buffer).getUint32(8, true);
  let off = 12;
  while (off < length) {
    const view = new DataView(buffer, off);
    const chunkLen = view.getUint32(0, true);
    const chunkType = view.getUint32(4, true);
    off += 8;
    if (chunkType === 0x4e4f534a) {
      const text = new TextDecoder().decode(data.slice(off, off + chunkLen));
      return JSON.parse(text);
    }
    off += chunkLen;
  }
  return null;
}

export function auditGlbBuffer(buffer, answers) {
  const js = parseGlbJson(buffer);
  if (!js) return { ok: false, reason: 'invalid GLB' };
  const mats = js.materials || [];
  const stoneMats = mats.filter(function (m) {
    return (m.pbrMetallicRoughness?.metallicFactor ?? 0) < 0.1;
  });
  const metalMats = mats.filter(function (m) {
    return (m.pbrMetallicRoughness?.metallicFactor ?? 0) > 0.5;
  });
  const issues = [];
  const q4 = answers?.q4Belief;
  const q5 = answers?.q5Feeling;
  const expStoneRough = Q4_STONE_ROUGH[q4];
  const expMetal = Q5_METAL[q5];

  if (stoneMats.length && expStoneRough != null) {
    const rough = stoneMats[0].pbrMetallicRoughness?.roughnessFactor;
    if (rough != null && !near(rough, expStoneRough, 0.06)) {
      issues.push('stone rough ' + rough + ' expected ~' + expStoneRough + ' (q4=' + q4 + ')');
    }
  }

  if (metalMats.length && expMetal) {
    const pbr = metalMats[0].pbrMetallicRoughness || {};
    const rough = pbr.roughnessFactor;
    const bc = rgbFromBc(pbr.baseColorFactor);
    if (rough != null && !near(rough, expMetal.rough, 0.06)) {
      issues.push('metal rough ' + rough + ' expected ~' + expMetal.rough + ' (q5=' + q5 + ')');
    }
    if (bc && !rgbNear(bc, expMetal.bc, 40)) {
      issues.push('metal color [' + bc + '] expected ~[' + expMetal.bc + '] (q5=' + q5 + ')');
    }
  }

  return { ok: issues.length === 0, issues: issues };
}

function collectExportMeta(scene, renderer) {
  const lighting = [];
  scene.traverse(function (obj) {
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
  if (renderer) {
    rendererSettings.toneMapping = renderer.toneMapping;
    rendererSettings.outputColorSpace = renderer.outputColorSpace;
  }

  const materialOverrides = [];
  scene.traverse(function (obj) {
    if (!obj.isMesh || !obj.material) return;
    const m = obj.material;
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

  return { lighting, rendererSettings, materialOverrides };
}

async function exportGlbBinary(scene, opts) {
  const exporter = new GLTFExporter();
  return new Promise(function (resolve, reject) {
    exporter.parse(
      scene,
      function (result) {
        resolve(result);
      },
      reject,
      { binary: true }
    );
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function saveSeedGlb(id, glbBuffer, meta) {
  const res = await fetch('/api/seed-glb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: id,
      glbBase64: arrayBufferToBase64(glbBuffer),
      lighting: meta.lighting,
      rendererSettings: meta.rendererSettings,
      materialOverrides: meta.materialOverrides,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function saveSeedSnapshot(id, canvas) {
  const res = await fetch('/api/seed-snapshot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: id, snapshot: canvas.toDataURL('image/png') }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function syncIdb(id, glbBuffer, meta, snapshotCanvas) {
  const store = await import('./amulet-glb-store.js');
  const key = 'collection-' + id;
  const bundle = {
    glb: glbBuffer,
    lighting: meta.lighting,
    rendererSettings: meta.rendererSettings,
    materialOverrides: meta.materialOverrides,
  };
  const dbReq = indexedDB.open('amuletGlbStore', 2);
  await new Promise(function (resolve, reject) {
    dbReq.onerror = function () {
      reject(dbReq.error);
    };
    dbReq.onsuccess = function () {
      const db = dbReq.result;
      const tx = db.transaction('glbs', 'readwrite');
      tx.objectStore('glbs').put(bundle, key);
      tx.oncomplete = function () {
        db.close();
        resolve();
      };
      tx.onerror = function () {
        reject(tx.error);
      };
    };
  });
  if (snapshotCanvas?.width) {
    await store.saveSnapshot(key, snapshotCanvas.toDataURL('image/png'));
  }
}

/**
 * Compose + PBR render from answers, export GLB + snapshot with correct materials.
 */
export async function repairAmuletFromAnswers(entry, options) {
  options = options || {};
  if (!entry?.id || !entry?.answers) throw new Error('entry missing id/answers');

  await initAmuletCompose();
  const composed = await composeFullAmuletForPbr(entry.answers);
  if (!composed) throw new Error('compose failed for ' + entry.id);

  const host = document.createElement('div');
  host.style.cssText = OFFSCREEN_HOST_STYLE;
  document.body.appendChild(host);

  try {
    await renderThreePbrAmuletInteractive({
      svg: composed.svg,
      style2: composed.style2,
      style3: Object.assign({}, composed.style3, { l3MassScale: L3_MASS_SCALE }),
      container: host,
      questionnaire: composed.questionnaire,
      domainHex: composed.domainHex,
      ageNum: composed.ageNum,
      l3MaterialMode: 'stone',
    });

    await new Promise(function (r) {
      requestAnimationFrame(function () {
        requestAnimationFrame(r);
      });
    });

    const scene = getActivePbrScene();
    const renderer = getActivePbrRenderer();
    if (!scene) throw new Error('PBR scene missing');

    const meta = collectExportMeta(scene, renderer);
    const glbBuffer = await exportGlbBinary(scene, meta);
    const audit = auditGlbBuffer(glbBuffer, entry.answers);
    if (!audit.ok) {
      console.warn('[repair-seed] post-render audit', entry.id, audit.issues);
    }

    const snapshot = captureHighResSnapshot(options.targetPx || 2048);
    if (!snapshot?.width) throw new Error('snapshot failed');

    if (options.saveSeed !== false) {
      await saveSeedGlb(entry.id, glbBuffer, meta);
      await saveSeedSnapshot(entry.id, snapshot);
    }
    if (options.syncIdb !== false) {
      await syncIdb(entry.id, glbBuffer, meta, snapshot);
    }

    return {
      id: entry.id,
      audit: audit,
      glbBytes: glbBuffer.byteLength,
      snapshotPx: snapshot.width,
      snapshot: snapshot,
      glbBuffer: glbBuffer,
      meta: meta,
    };
  } finally {
    disposeThreePbr();
    if (host.parentNode) host.parentNode.removeChild(host);
  }
}

export async function fetchSeedGlbBuffer(id) {
  const res = await fetch('/questionnaire/seed/glbs/' + id + '.glb', { cache: 'no-store' });
  if (!res.ok) throw new Error('GLB fetch failed ' + id);
  return res.arrayBuffer();
}

export async function auditSeedEntry(entry) {
  const buf = await fetchSeedGlbBuffer(entry.id);
  return auditGlbBuffer(buf, entry.answers);
}
