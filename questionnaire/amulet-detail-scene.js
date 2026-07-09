/**
 * Detail page: fog background + interactive 3D amulet from saved GLB.
 */
import {
  mountDetailAmulet3D,
  getDetailAmuletRenderState,
} from './amulet-detail-mount.js';
import { exportRendererTransparentPng, exportAmuletCanvasPng } from './amulet-export.js';

console.log('%c[detail-scene] v20250708-detail-loader-fog loaded', 'color:lime;font-size:14px');

if (document.body.classList.contains('pagmar-amulet-detail')) {

  /* ── Determine GLB key for this amulet ─────────────── */
  function parseIndex() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('id');
    if (raw == null || raw === '') return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function loadDetailCollection() {
    if (typeof window.gardenLoadCollection === 'function') {
      return window.gardenLoadCollection();
    }
    try {
      const raw =
        localStorage.getItem('amuletCollection') || sessionStorage.getItem('amuletCollection');
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function parseEntryIdFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get('entry');
      if (raw == null || raw === '') return null;
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : null;
    } catch (_) {
      return null;
    }
  }

  function readNavEntryId() {
    try {
      const raw = sessionStorage.getItem('pagmarAmuletDetailNav');
      if (!raw) return null;
      const nav = JSON.parse(raw);
      return nav && nav.entryId != null ? nav.entryId : null;
    } catch (_) {
      return null;
    }
  }

  function getGlbKey(index) {
    const entryId = resolvedSceneEntryId || parseEntryIdFromUrl() || readNavEntryId();
    if (entryId != null) return 'collection-' + entryId;

    const questions = window.AMULET_QUESTIONS || [];
    const USER_AMULET_INDEX = questions.length;
    if (index < USER_AMULET_INDEX) return null;

    const collectionIndex = index - USER_AMULET_INDEX;
    const collection = loadDetailCollection();
    if (collectionIndex < collection.length && collection[collectionIndex]?.id != null) {
      return 'collection-' + collection[collectionIndex].id;
    }
    return 'user-amulet';
  }

  /* ── 3D amulet from GLB ────────────────────────────── */
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

  const amuletIndex = parseIndex();
  let resolvedSceneEntryId = parseEntryIdFromUrl() || readNavEntryId();
  if (resolvedSceneEntryId == null && typeof window.pagmarEntryIdForAmuletIndex === 'function') {
    resolvedSceneEntryId = window.pagmarEntryIdForAmuletIndex(amuletIndex);
  }

  import('./seed-bootstrap.js').then(function (seedMod) {
    return seedMod.ensureSeedCollectionLoaded();
  }).then(function () {
    bootDetailScene();
  }).catch(function () {
    bootDetailScene();
  });

  function getAnswersForIndex(index) {
    if (typeof window.getAmuletRecord === 'function') {
      return window.getAmuletRecord(index);
    }
    return null;
  }

  function bootDetailScene() {
    const glbKeyNow = getGlbKey(amuletIndex);

  function fallbackPbrRender(answers) {
    if (!answers || !container3D) {
      signalSceneReady();
      return;
    }
    Promise.all([
      import('./amulet-detail-vectors.js?v=20250708-vector-raster-fix').then(function (vectors) {
        return vectors.getSharedDetailCompose(answers);
      }),
      import('../three-pbr-amulet.js'),
    ]).then(function (modules) {
      var composed = modules[0];
      var pbr = modules[1];
      if (!composed) throw new Error('compose failed');
      container3D.innerHTML = '';
      container3D.style.display = '';
      if (fallback2D) fallback2D.style.display = 'none';
      return pbr.renderThreePbrAmuletInteractive({
        svg: composed.svg,
        style2: composed.style2,
        style3: Object.assign({}, composed.style3, { l3MassScale: 0.37 }),
        container: container3D,
        questionnaire: composed.questionnaire,
        domainHex: composed.domainHex,
        ageNum: composed.ageNum,
        l3MaterialMode: 'stone',
      });
    }).then(function () {
      var cvs = container3D.querySelector('canvas');
      if (cvs) {
        cvs.style.pointerEvents = 'auto';
        cvs.style.cursor = 'grab';
        cvs.style.touchAction = 'none';
      }
      markAmulet3DReady();
    }).catch(function (err) {
      console.warn('[detail-scene] PBR fallback render failed', err);
      signalSceneReady();
    });
  }

  if (glbKeyNow && container3D) {
    import('./amulet-glb-store.js')
      .then(function (store) {
        return store.loadGlb(glbKeyNow);
      })
      .then(function (result) {
        if (!result) {
          var answers = getAnswersForIndex(amuletIndex);
          if (answers) fallbackPbrRender(answers);
          else signalSceneReady();
          return;
        }
        var rs = result.rendererSettings || {};
        if (!rs.lighting && result.lighting && result.lighting.length) {
          rs.lighting = result.lighting;
        }
        setup3DAmulet(result.scene, rs, result.materialOverrides || []);
      })
      .catch(function (err) {
        console.warn('[detail-scene] GLB load failed, trying PBR fallback', err);
        var answers = getAnswersForIndex(amuletIndex);
        if (answers) fallbackPbrRender(answers);
        else signalSceneReady();
      });
  } else if (container3D) {
    var answers = getAnswersForIndex(amuletIndex);
    if (answers) fallbackPbrRender(answers);
    else signalSceneReady();
  } else {
    signalSceneReady();
  }
  } /* bootDetailScene */

  function setup3DAmulet(glbScene, _rs, materialOverrides) {
    mountDetailAmulet3D(container3D, glbScene, {
      materialOverrides: materialOverrides || [],
      useDetailPresentation: true,
    });

    const st = getDetailAmuletRenderState();
    amuletRenderer = st.renderer;
    amuletScene = st.scene;
    amuletCamera = st.camera;
    amuletGroup = null;

    if (fallback2D) fallback2D.style.display = 'none';
    markAmulet3DReady();
  }

  /* ── Mouse/touch rotation (fallback PBR only; GLB uses detail-mount) ── */
  var userRotX = 0.2;
  var userRotY = 0;
  var dragging = false;
  var lastX = 0;
  var lastY = 0;

  function applyAmuletRotation() {
    if (!amuletGroup) return;
    amuletGroup.rotation.x = userRotX;
    amuletGroup.rotation.y = userRotY;
  }

  function setupDragRotation() {
    var canvas = amuletRenderer.domElement;

    canvas.addEventListener('pointerdown', function (e) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      e.preventDefault();
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      userRotY += dx * 0.008;
      userRotX = Math.max(-1.2, Math.min(1.2, userRotX - dy * 0.005));
      applyAmuletRotation();
    });

    canvas.addEventListener('pointerup', function () {
      dragging = false;
      canvas.style.cursor = 'grab';
    });

    canvas.addEventListener('lostpointercapture', function () {
      dragging = false;
      canvas.style.cursor = 'grab';
    });
  }

  function startAmuletRenderLoop() {
    if (startAmuletRenderLoop._started) return;
    startAmuletRenderLoop._started = true;
    function frame() {
      requestAnimationFrame(frame);
      if (amuletRenderer && amuletScene && amuletCamera) {
        applyAmuletRotation();
        amuletRenderer.render(amuletScene, amuletCamera);
      }
    }
    frame();
  }

  /* ── Resize ────────────────────────────────────────── */
  function resizeAmuletRenderer() {
    if (!amuletRenderer || !container3D) return;
    var w = container3D.clientWidth || 300;
    var h = container3D.clientHeight || 300;
    amuletRenderer.setSize(w, h);
    amuletCamera.aspect = w / h;
    amuletCamera.updateProjectionMatrix();
  }

  window.addEventListener('resize', resizeAmuletRenderer);
}
