(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-amulet-detail')) return;

  const questions = window.AMULET_QUESTIONS || [];
  const USER_AMULET_INDEX = questions.length;

  const detailNum = document.getElementById('detailNum');
  const detailName = document.getElementById('detailName');
  const detailStory = document.getElementById('detailStory');
  const detailTiming = document.getElementById('detailTiming');
  const detailRequestCriterion = document.getElementById('detailRequestCriterion');
  const detailComponents = document.getElementById('detailComponents');
  const detailTags = document.getElementById('detailTags');
  const detailAmuletImg = document.getElementById('detailAmuletImg');
  const detailCloseBtn = document.getElementById('detailCloseBtn');

  function parseIndex() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('id');
    if (raw == null || raw === '') return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }

  function indexLabel(index) {
    return '[' + String(index + 1).padStart(3, '0') + ']';
  }

  function fillList(el, items, extraClassesByIndex) {
    if (!el) return;
    el.innerHTML = '';
    (items || []).forEach(function (text, index) {
      const li = document.createElement('li');
      li.className = 'pagmar__detail-list-item';
      const extra = extraClassesByIndex && extraClassesByIndex[index];
      if (extra) li.classList.add(extra);
      li.textContent = text;
      el.appendChild(li);
    });
  }

  var COMPONENT_ITEM_CLASSES = { 1: 'pagmar__detail-list-item--material' };

  function loadCollectionForDetail() {
    try {
      var raw = localStorage.getItem('amuletCollection') || sessionStorage.getItem('amuletCollection');
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function loadUserAnswers() {
    try {
      const raw =
        sessionStorage.getItem('amuletUserAnswers') ||
        localStorage.getItem('amuletUserAnswers') ||
        sessionStorage.getItem('amuletQuestionnaire') ||
        localStorage.getItem('amuletQuestionnaire');
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : null;
    } catch (_) {
      return null;
    }
  }

  function getRecordForIndex(index, recordOverride) {
    if (typeof window.getAmuletRecord === 'function') {
      return window.getAmuletRecord(index, null, recordOverride);
    }
    const isUser = index >= USER_AMULET_INDEX;
    if (isUser) {
      var collectionIndex = index - USER_AMULET_INDEX;
      var collection = loadCollectionForDetail();
      if (collectionIndex < collection.length) {
        return collection[collectionIndex].answers;
      }
      return loadUserAnswers();
    }
    return null;
  }

  function renderDetail(index) {
    const isUser = index >= USER_AMULET_INDEX;
    let recordOverride = null;
    let collectionImgSrc = null;
    if (isUser) {
      var collectionIndex = index - USER_AMULET_INDEX;
      var collection = loadCollectionForDetail();
      if (collectionIndex < collection.length) {
        recordOverride = collection[collectionIndex].answers;
        collectionImgSrc = collection[collectionIndex].snapshot;
      } else {
        recordOverride = loadUserAnswers();
      }
    }

    if (typeof window.getAmuletSpec !== 'function') return;

    const spec = window.getAmuletSpec(index, null, recordOverride);

    if (detailNum) detailNum.textContent = indexLabel(index);
    if (detailName) detailName.textContent = spec.name || '—';
    if (detailStory) detailStory.textContent = spec.story || spec.wish || '—';
    if (detailTiming) detailTiming.textContent = spec.whyNow || '—';
    if (detailRequestCriterion) {
      var wishText = (spec.wish || '').replace(/^[״"]|[״"]$/g, '').trim();
      detailRequestCriterion.textContent = wishText || '—';
    }
    fillList(detailComponents, spec.components, COMPONENT_ITEM_CLASSES);
    fillList(detailTags, spec.tags);

    const imgSrc = collectionImgSrc
      || (typeof window.getAmuletImageSrc === 'function'
        ? window.getAmuletImageSrc(index)
        : null);

    if (detailAmuletImg && imgSrc) {
      detailAmuletImg.src = imgSrc;
      detailAmuletImg.alt = 'קמע ' + indexLabel(index);
    }
    var backImg = document.getElementById('detailAmuletImgBack');
    if (backImg && imgSrc) {
      backImg.src = imgSrc;
      backImg.alt = '';
    }
  }

  function waitForImage(img) {
    return new Promise(function (resolve) {
      if (!img || !img.src) {
        resolve();
        return;
      }
      if (img.complete) {
        resolve();
        return;
      }
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }

  async function bootContent() {
    const index = parseIndex();
    try {
      if (index < USER_AMULET_INDEX) {
        window.location.replace('index.html');
        return;
      }

      renderDetail(index);
      await Promise.all([
        waitForImage(detailAmuletImg),
        waitForImage(document.getElementById('detailAmuletImgBack')),
      ]);
    } catch (_) {
      /* fall through — always release loader */
    } finally {
      if (window.pagmarDetailBoot) window.pagmarDetailBoot.done('content');
    }
  }

  /* ── Vector rendering is handled by amulet-detail-vectors.js (module) ── */

  /* ── Navigation ── */
  const NAV_GUARD_MS = 900;
  let landedAt = Date.now();
  try {
    const stored = sessionStorage.getItem('pagmarAmuletNavAt');
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (Number.isFinite(parsed)) landedAt = parsed;
      sessionStorage.removeItem('pagmarAmuletNavAt');
    }
  } catch (_) {}

  function canLeaveDetailPage() {
    return Date.now() - landedAt >= NAV_GUARD_MS;
  }

  function leaveDetailPage(e) {
    if (!canLeaveDetailPage()) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    window.location.href = './';
  }

  if (detailCloseBtn) {
    detailCloseBtn.addEventListener('click', leaveDetailPage);
  }

  bootContent().catch(function () {
    if (window.pagmarDetailBoot) window.pagmarDetailBoot.done('content');
  });

  /* ── Drag to rotate the 3D coin ── */
  var coin = document.querySelector('.pagmar__detail-amulet-coin');
  if (coin) {
    var rotY = 20;
    var rotX = 12;
    var dragging = false;
    var lastX = 0;
    var lastY = 0;

    function applyCoinRotation() {
      coin.style.transform = 'rotateX(' + rotX + 'deg) rotateY(' + rotY + 'deg)';
    }

    coin.addEventListener('pointerdown', function (e) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      coin.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      rotY += dx * 0.5;
      rotX = Math.max(-40, Math.min(40, rotX - dy * 0.3));
      applyCoinRotation();
    });

    window.addEventListener('pointerup', function () {
      dragging = false;
    });
  }
})();
