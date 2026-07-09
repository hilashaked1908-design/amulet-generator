(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-amulet-detail')) return;

  const questions = window.AMULET_QUESTIONS || [];
  const USER_AMULET_INDEX = questions.length;

  const detailNum = document.getElementById('detailNum');
  const detailNumText = detailNum
    ? detailNum.querySelector('.pagmar__detail-num__text')
    : null;
  const detailName = document.getElementById('detailName');
  const detailStory = document.getElementById('detailStory');
  const detailTiming = document.getElementById('detailTiming');
  const detailRequestCriterion = document.getElementById('detailRequestCriterion');
  const detailComponents = document.getElementById('detailComponents');
  const detailTags = document.getElementById('detailTags');
  const detailAmuletImg = document.getElementById('detailAmuletImg');
  const detailCloseBtn = document.getElementById('detailCloseBtn');
  const detailCreateCta = document.getElementById('detailCreateCta');

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

  var INDEX_RETURN_KEY = 'pagmarIndexReturnState';

  var TAG_DISPLAY_TO_FILTER = {
    אהבה: 'זוגיות',
    'המעשים שאני עושה': 'מעשים שאני עושה',
    'תמיכה מאנשים סביבי': 'תמיכה מהסביבה שלי',
    'אני עדיין לא מאמין שזה אפשרי': 'לא מאמין שזה יקרה',
  };

  function resolveFilterLabelForTag(tag, amuletIndex) {
    if (!tag) return null;
    if (TAG_DISPLAY_TO_FILTER[tag]) return TAG_DISPLAY_TO_FILTER[tag];
    var filters =
      typeof window.getAmuletFilterLabels === 'function'
        ? window.getAmuletFilterLabels(amuletIndex)
        : [];
    if (filters.indexOf(tag) !== -1) return tag;
    return tag;
  }

  function navigateToFilterPage(filterLabel) {
    if (!filterLabel) return;
    try {
      sessionStorage.setItem(
        INDEX_RETURN_KEY,
        JSON.stringify({
          view: 'filter',
          filters: [filterLabel],
          filterScrollTop: 0,
        })
      );
    } catch (_) {}
    window.location.href = 'index.html';
  }

  function fillTagList(el, items, amuletIndex) {
    if (!el) return;
    el.innerHTML = '';
    (items || []).forEach(function (text) {
      var filterLabel = resolveFilterLabelForTag(text, amuletIndex);
      var li = document.createElement('li');
      li.className = 'pagmar__detail-list-item';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pagmar__detail-tag-btn';
      btn.textContent = text;
      btn.setAttribute('aria-label', 'סינון לפי ' + text);
      if (filterLabel) {
        btn.addEventListener('click', function () {
          navigateToFilterPage(filterLabel);
        });
      }
      li.appendChild(btn);
      el.appendChild(li);
    });
  }

  var COMPONENT_ITEM_CLASSES = { 1: 'pagmar__detail-list-item--material' };
  var resolvedDetailEntryId = null;

  function parseEntryId() {
    try {
      var params = new URLSearchParams(window.location.search);
      var raw = params.get('entry');
      if (raw == null || raw === '') return null;
      var n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : null;
    } catch (_) {
      return null;
    }
  }

  function readNavEntryId() {
    try {
      var raw = sessionStorage.getItem('pagmarAmuletDetailNav');
      if (!raw) return null;
      var nav = JSON.parse(raw);
      return nav && nav.entryId != null ? nav.entryId : null;
    } catch (_) {
      return null;
    }
  }

  async function preloadDetailContext(index) {
    resolvedDetailEntryId = parseEntryId() || readNavEntryId();
    if (resolvedDetailEntryId == null && typeof window.pagmarEntryIdForAmuletIndex === 'function') {
      resolvedDetailEntryId = window.pagmarEntryIdForAmuletIndex(index);
    }

    await import('./seed-bootstrap.js')
      .then(function (mod) {
        return mod.ensureSeedCollectionLoaded();
      })
      .catch(function () {});

    if (resolvedDetailEntryId == null && typeof window.pagmarResolveCollectionEntry === 'function') {
      var resolved = window.pagmarResolveCollectionEntry(index);
      if (resolved && resolved.id != null) resolvedDetailEntryId = resolved.id;
    }
    if (resolvedDetailEntryId == null) return;

    var entryId = resolvedDetailEntryId;

    window.__pagmarDetailAnswersByEntryId = window.__pagmarDetailAnswersByEntryId || {};

    try {
      var store = await import('./amulet-glb-store.js');
      var answersRaw = await store.loadSnapshot('answers-collection-' + entryId);
      if (answersRaw) {
        window.__pagmarDetailAnswersByEntryId[entryId] = JSON.parse(answersRaw);
      }
    } catch (_) {}

    try {
      var storeMod = await import('./amulet-glb-store.js');
      var snapRaw = await storeMod.loadSnapshot('collection-' + entryId);
      if (snapRaw) {
        window.__pagmarDetailSnapshotByEntryId = window.__pagmarDetailSnapshotByEntryId || {};
        window.__pagmarDetailSnapshotByEntryId[entryId] = snapRaw;
      }
    } catch (_) {}
  }

  function resolveEntryForDetail() {
    var entryId = resolvedDetailEntryId || parseEntryId() || readNavEntryId();
    if (entryId == null) return null;
    if (typeof window.pagmarFindCollectionEntryById === 'function') {
      return window.pagmarFindCollectionEntryById(entryId);
    }
    return null;
  }

  function formatStoryQuote(text) {
    var raw = window.pagmarNormalizeDashes ? window.pagmarNormalizeDashes(text) : text;
    var t = String(raw || '').trim();
    if (!t || t === '-') return '-';
    t = t.replace(/^[\u05F4"\u201C\u05F3]+|[\u05F4"\u201D\u05F3]+$/g, '').trim();
    return '\u05F4' + t + '\u05F4';
  }

  function renderDetail(index, entry) {
    if (typeof window.getAmuletSpec !== 'function') return;

    var entryId = entry && entry.id != null ? entry.id : resolvedDetailEntryId || parseEntryId() || readNavEntryId();
    var recordOverride =
      entry && entry.answers
        ? entry.answers
        : entryId != null &&
            window.__pagmarDetailAnswersByEntryId &&
            window.__pagmarDetailAnswersByEntryId[entryId]
          ? window.__pagmarDetailAnswersByEntryId[entryId]
          : null;

    const spec = window.getAmuletSpec(index, null, recordOverride || undefined);
    var imgSrc = null;
    if (
      entryId != null &&
      window.__pagmarDetailSnapshotByEntryId &&
      window.__pagmarDetailSnapshotByEntryId[entryId]
    ) {
      imgSrc = window.__pagmarDetailSnapshotByEntryId[entryId];
    } else if (entry && entry.snapshot) {
      imgSrc = entry.snapshot;
    } else if (typeof window.getAmuletImageSrc === 'function') {
      imgSrc = window.getAmuletImageSrc(index);
    }

    if (detailNumText) detailNumText.textContent = indexLabel(index);
    if (detailName) detailName.textContent = spec.name || '-';
    if (detailStory) {
      detailStory.textContent = formatStoryQuote(spec.story || spec.wish || '-');
      var storyTest = new URLSearchParams(window.location.search).get('storyTest');
      if (storyTest === 'short') {
        detailStory.textContent = '״קו קצר לבדיקת פריסה.״';
      } else if (storyTest === 'long') {
        detailStory.textContent =
          '״הלוואי שאצליח למצוא עבודה אחרי התואר. השתדלתי הרבה הסמסטר הזה והשקעתי כל מה שיכלתי. ' +
          'ואני חושב שמגיע לי אחרי כל ההשקעה הקשה. אם זה יקרה אהיה מאושר וגאה בעצמי.״';
      }
    }
    if (detailTiming) {
      var timing = window.pagmarNormalizeDashes
        ? window.pagmarNormalizeDashes(spec.whyNow)
        : spec.whyNow;
      detailTiming.textContent = timing || '-';
    }
    if (detailRequestCriterion) {
      var wishText = (spec.wish || '').replace(/^[״"]|[״"]$/g, '').trim();
      if (window.pagmarNormalizeDashes) wishText = window.pagmarNormalizeDashes(wishText).trim();
      detailRequestCriterion.textContent = wishText || '-';
    }
    fillList(detailComponents, spec.components, COMPONENT_ITEM_CLASSES);
    fillTagList(detailTags, spec.tags, index);

    try {
      window.dispatchEvent(new CustomEvent('pagmar:detail-rendered'));
    } catch (_) {}

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

      await preloadDetailContext(index);
      renderDetail(index, resolveEntryForDetail());
      await Promise.all([
        waitForImage(detailAmuletImg),
        waitForImage(document.getElementById('detailAmuletImgBack')),
      ]);
    } catch (_) {
      /* fall through - always release loader */
    } finally {
      if (window.pagmarDetailBoot) window.pagmarDetailBoot.done('content');
    }
  }

  /* ── Vector rendering is handled by amulet-detail-vectors.js (module) ── */

  /* ── Navigation ── */
  function leaveDetailPage(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    window.location.href = 'index.html';
  }

  if (detailCloseBtn) {
    detailCloseBtn.addEventListener('click', leaveDetailPage);
  }

  if (detailCreateCta) {
    detailCreateCta.addEventListener('click', function (e) {
      e.preventDefault();
      try {
        sessionStorage.setItem('pagmarOpenCreateOnLoad', '1');
      } catch (_) {}
      window.location.href = 'index.html';
    });
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
