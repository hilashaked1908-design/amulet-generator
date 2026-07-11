/**
 * Detail page: fog background + interactive 3D amulet from saved GLB.
 */
import {
  mountDetailAmulet3D,
  getDetailAmuletRenderState,
  waitForContainerLayout,
} from './amulet-detail-mount.js';
import { exportRendererTransparentPng, exportAmuletCanvasPng } from './amulet-export.js';
import {
  authoritativeAnswersForEntry,
  authoritativeAnswersForEntryAsync,
  bundledGlbUrlForEntry,
  canonicalSeedSnapshotUrl,
  collectAuthoritativeGlbUrls,
  displayLabelForEntryId,
  entryLooksLikeSeed,
  entryShouldUseBundledSeedGlb,
  ensureSeedEntryMap,
  glbUrlMatchesEntryId,
  loadLocalCollection,
  parseGlbUrlFromLocation,
  readDetailNavGlbUrl,
  resolveEntryRecord,
  seedGlbFileExists,
} from './amulet-entry-resolve.js';

console.log('%c[detail-scene] v20250711-glb-url-authority loaded', 'color:lime;font-size:14px');

if (document.body.classList.contains('pagmar-amulet-detail')) {

  function parseIndex() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('id');
    if (raw == null || raw === '') return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function parseEntryIdFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('entry');
      if (raw == null || raw === '') return null;
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n)) return null;

      const urlIndex = parseIndex();
      if (
        typeof window.pagmarEntryIdForAmuletIndex === 'function' &&
        urlIndex != null
      ) {
        const indexEntry = window.pagmarEntryIdForAmuletIndex(urlIndex);
        if (indexEntry != null && indexEntry != n) {
          console.warn(
            '[detail-scene] URL id/index does not match entry — using entry param',
            { entry: n, id: urlIndex, indexEntry: indexEntry }
          );
        }
      }
      return n;
    } catch (_) {
      return null;
    }
  }

  function resolveSceneIndex(entryId, collection) {
    if (
      entryId != null &&
      typeof window.pagmarIndexForEntryId === 'function'
    ) {
      const fromEntry = window.pagmarIndexForEntryId(entryId);
      if (fromEntry != null) return fromEntry;
    }
    const label = displayLabelForEntryId(entryId, collection);
    if (label != null) return label - 1;
    return parseIndex();
  }

  let sceneBootToken = 0;

  function blockPbrReplace() {
    return window.__pagmarDetailBundledGlbEntryId != null;
  }

  function lockBundledGlbEntry(entryId) {
    window.__pagmarDetailBundledGlbEntryId = entryId;
    window.__pagmarDetailGlbMounted = false;
    window.pagmarDetailComposePreload = null;
    window.pagmarDetailComposePreloadEntryId = null;
  }

  function unlockBundledGlbEntry() {
    window.__pagmarDetailBundledGlbEntryId = null;
  }

  const container3D = document.getElementById('detailAmulet3D');
  const fallback2D = document.getElementById('detailAmuletFallback');
  const exportBtnWrap = document.getElementById('detailExportBtnWrap');
  const exportBtn = document.getElementById('detailExportBtn');
  let amuletRenderer = null;
  let amuletScene = null;
  let amuletCamera = null;
  let amuletGroup = null;

  function setExportReady(ready) {
    if (exportBtn) exportBtn.disabled = !ready;
  }

  function bindExportButton() {
    if (!exportBtn || exportBtn.dataset.bound === '1') return;
    exportBtn.dataset.bound = '1';
    exportBtn.addEventListener('click', function () {
      try {
        if (amuletRenderer && amuletScene && amuletCamera) {
          exportRendererTransparentPng(amuletRenderer, amuletScene, amuletCamera, {
            targetPx: 2048,
            filename: 'amulet',
          });
          return;
        }
        exportAmuletCanvasPng(container3D, { filename: 'amulet' });
      } catch (err) {
        console.error('[detail-scene] export failed', err);
      }
    });
  }

  setExportReady(false);
  bindExportButton();
  if (exportBtnWrap) exportBtnWrap.hidden = false;

  function markAmulet3DReady() {
    setExportReady(true);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        signalSceneReady();
      });
    });
  }

  function signalSceneReady() {
    if (window.pagmarDetailBoot) window.pagmarDetailBoot.done('scene');
  }

  function yieldToMain() {
    return new Promise(function (resolve) {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(resolve, { timeout: 600 });
      } else {
        setTimeout(resolve, 0);
      }
    });
  }

  async function mountBundledSeedGlb(seedGlb, seedRs, materialOverrides) {
    if (!container3D) return false;
    await waitForContainerLayout(container3D);
    const sceneClone = seedGlb.scene.clone(true);
    setup3DAmulet(sceneClone, seedRs, materialOverrides, {
      skipStoneBackCap: true,
    });
    return true;
  }

  function showSnapshotFallback(entryId, entryRecord) {
    const snap =
      (entryRecord &&
        entryRecord.snapshot &&
        String(entryRecord.snapshot).indexOf('/' + entryId + '.') !== -1 &&
        entryRecord.snapshot) ||
      canonicalSeedSnapshotUrl(entryId);
    if (!snap) return;
    const img = document.getElementById('detailAmuletImg');
    const backImg = document.getElementById('detailAmuletImgBack');
    if (img) {
      img.src = snap;
      img.alt = 'קמע';
    }
    if (backImg) backImg.src = snap;
    if (fallback2D) fallback2D.style.display = '';
    if (container3D) container3D.style.display = 'none';
  }

  const seedBoot =
    window.pagmarDetailWarmup && window.pagmarDetailWarmup.seed
      ? window.pagmarDetailWarmup.seed
      : import('./seed-bootstrap.js').then(function (seedMod) {
          return seedMod.ensureSeedCollectionLoaded();
        });

  seedBoot.then(function () {
    bootDetailScene();
  }).catch(function () {
    bootDetailScene();
  });

  async function bootDetailScene() {
    const bootToken = ++sceneBootToken;
    const entryId = parseEntryIdFromUrl();
    if (entryId == null) {
      console.error('[detail-scene] missing entry URL param — cannot load amulet');
      signalSceneReady();
      return;
    }

    lockBundledGlbEntry(entryId);

    if (window.pagmarDetailWarmup && window.pagmarDetailWarmup.lock) {
      await window.pagmarDetailWarmup.lock.catch(function () {});
    }

    await ensureSeedEntryMap();
    const collection = loadLocalCollection();
    const entryRecord = await resolveEntryRecord(entryId);
    const seedMap = await ensureSeedEntryMap();
    const useBundledSeedGlb = entryShouldUseBundledSeedGlb(entryId, seedMap, entryRecord);
    const seedFileOnDisk = await seedGlbFileExists(entryId);
    const isBundledSeed =
      entryLooksLikeSeed(entryRecord, entryId, seedMap) ||
      useBundledSeedGlb ||
      seedFileOnDisk;
    const bundledGlbUrl = bundledGlbUrlForEntry(entryRecord, entryId, seedMap);
    const answersForEntry =
      (await authoritativeAnswersForEntryAsync(entryId, collection)) ||
      authoritativeAnswersForEntry(entryId, collection);
    const sceneIndex = resolveSceneIndex(entryId, collection);
    const displayLabel = displayLabelForEntryId(entryId, collection);
    const urlIdParam = parseIndex();

    const bootDiagnostic = {
      entryId: entryId,
      urlIdParam: urlIdParam,
      sceneIndex: sceneIndex,
      displayLabel: displayLabel,
      isBundledSeed: isBundledSeed,
      navGlbUrl: readDetailNavGlbUrl(entryId),
      urlGlbParam: parseGlbUrlFromLocation(entryId),
      seedFileOnDisk: seedFileOnDisk,
      glbCandidates: collectAuthoritativeGlbUrls(
        entryId,
        seedMap,
        entryRecord,
        readDetailNavGlbUrl(entryId)
      ),
      wish:
        answersForEntry && answersForEntry.q1Wish
          ? String(answersForEntry.q1Wish)
          : null,
      entryRecordGlbUrl: entryRecord && entryRecord.glbUrl ? entryRecord.glbUrl : null,
      inSeedCatalog: seedMap.has(entryId),
    };

    console.log(
      '%c[detail-scene] BOOT DIAGNOSTIC',
      'color:#0f0;background:#111;font-size:14px;font-weight:bold;padding:4px 8px;',
      bootDiagnostic
    );
    console.table(bootDiagnostic);

    showSnapshotFallback(entryId, entryRecord);

    function logLoadResult(loadPath, extra) {
      console.log(
        '%c[detail-scene] LOAD RESULT',
        'color:#9cf;background:#111;font-size:13px;padding:2px 6px;',
        Object.assign({ loadPath: loadPath, entryId: entryId }, extra || {})
      );
    }

    if (!container3D) {
      signalSceneReady();
      return;
    }

    const store = await import('./amulet-glb-store.js');
    await yieldToMain();

    const glbCandidates = collectAuthoritativeGlbUrls(
      entryId,
      seedMap,
      entryRecord,
      readDetailNavGlbUrl(entryId)
    );

    async function loadAndMountBundledGlb(glbUrl, loadPathLabel) {
      if (!glbUrl || bootToken !== sceneBootToken) return false;
      if (!glbUrlMatchesEntryId(glbUrl, entryId)) {
        console.error('[detail-scene] refusing GLB — URL does not match entryId', {
          entryId: entryId,
          glbUrl: glbUrl,
        });
        return false;
      }
      try {
        const seedGlb = await store.loadBundledSeedGlb(glbUrl, entryId);
        if (bootToken !== sceneBootToken) return false;
        if (!seedGlb || !seedGlb.scene) {
          logLoadResult(loadPathLabel + '-empty', { glbUrl: glbUrl });
          return false;
        }
        lockBundledGlbEntry(entryId);
        var seedRs = seedGlb.rendererSettings || {};
        if (!seedRs.lighting && seedGlb.lighting && seedGlb.lighting.length) {
          seedRs.lighting = seedGlb.lighting;
        }
        logLoadResult(loadPathLabel, {
          glbUrl: glbUrl,
          sha256: seedGlb.bufferHash || null,
          bytes: seedGlb.byteLength || null,
        });
        const mounted = await mountBundledSeedGlb(
          seedGlb,
          seedRs,
          seedGlb.materialOverrides || []
        );
        if (mounted) return true;
        logLoadResult(loadPathLabel + '-mount-failed', { glbUrl: glbUrl });
      } catch (err) {
        console.warn('[detail-scene] bundled GLB failed', glbUrl, err);
        logLoadResult(loadPathLabel + '-error', { glbUrl: glbUrl, error: String(err) });
      }
      return false;
    }

    for (let gi = 0; gi < glbCandidates.length; gi += 1) {
      const glbUrl = glbCandidates[gi];
      const mounted = await loadAndMountBundledGlb(
        glbUrl,
        gi === 0 ? 'authoritative-glb' : 'authoritative-glb-retry-' + gi
      );
      if (mounted) return;
    }

    if (isBundledSeed) {
      logLoadResult('seed-glb-unavailable-snapshot-only', {
        entryId: entryId,
        glbCandidates: glbCandidates,
      });
      signalSceneReady();
      return;
    }

    unlockBundledGlbEntry();

    try {
      const userGlb = await store.loadUserEntryGlb(entryId);
      if (userGlb && userGlb.scene) {
        lockBundledGlbEntry(entryId);
        var userRs = userGlb.rendererSettings || {};
        if (!userRs.lighting && userGlb.lighting && userGlb.lighting.length) {
          userRs.lighting = userGlb.lighting;
        }
        logLoadResult('user-idb-glb', {
          idbKey: 'collection-' + entryId,
          sha256: userGlb.bufferHash || null,
          bytes: userGlb.byteLength || null,
        });
        setup3DAmulet(userGlb.scene, userRs, userGlb.materialOverrides || []);
        return;
      }
      logLoadResult('user-idb-glb-missing', { idbKey: 'collection-' + entryId });
    } catch (err) {
      console.warn('[detail-scene] user GLB load failed', err);
    }

    logLoadResult('snapshot-only-no-glb', { entryId: entryId });
    signalSceneReady();
  }

  function setup3DAmulet(glbScene, _rs, materialOverrides, options) {
    options = options || {};
    if (container3D) {
      container3D.style.display = 'block';
      container3D.hidden = false;
    }
    mountDetailAmulet3D(container3D, glbScene, {
      materialOverrides: materialOverrides || [],
      useDetailPresentation: true,
      skipStoneBackCap: Boolean(options.skipStoneBackCap),
      initialRotX: 0,
      initialRotY: 0,
      fitMargin: 1.02,
    });

    window.__pagmarDetailGlbMounted = true;

    const st = getDetailAmuletRenderState();
    amuletRenderer = st.renderer;
    amuletScene = st.scene;
    amuletCamera = st.camera;
    amuletGroup = null;

    if (fallback2D) fallback2D.style.display = 'none';
    markAmulet3DReady();
  }
}
