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
    if (raw != null && raw !== '') {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n >= USER_AMULET_INDEX) return n;
    }
    const entryId = parseEntryId();
    if (
      entryId != null &&
      typeof window.pagmarIndexForEntryId === 'function'
    ) {
      var fromEntry = window.pagmarIndexForEntryId(entryId);
      if (fromEntry != null) return fromEntry;
    }
    return USER_AMULET_INDEX;
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

  function readNavPayload(forIndex) {
    try {
      var raw = sessionStorage.getItem('pagmarAmuletDetailNav');
      if (!raw) return null;
      var nav = JSON.parse(raw);
      if (!nav) return null;
      var urlEntry = parseEntryId();
      if (urlEntry != null && nav.entryId == urlEntry) return nav;
      if (nav.entryId != null && nav.index === forIndex) return nav;
      return null;
    } catch (_) {
      return null;
    }
  }

  function readNavPayloadForEntry(entryId) {
    if (entryId == null) return null;
    try {
      var raw = sessionStorage.getItem('pagmarAmuletDetailNav');
      if (!raw) return null;
      var nav = JSON.parse(raw);
      if (nav && nav.entryId == entryId) return nav;
    } catch (_) {}
    return null;
  }

  function readNavEntryId(forIndex) {
    var urlEntry = parseEntryId();
    if (urlEntry != null) return urlEntry;
    var nav = readNavPayload(forIndex);
    return nav && nav.entryId != null ? nav.entryId : null;
  }

  function resolveDetailIndex(urlIndex, entryId) {
    if (
      entryId != null &&
      typeof window.pagmarIndexForEntryId === 'function'
    ) {
      var fromEntry = window.pagmarIndexForEntryId(entryId);
      if (fromEntry != null) return fromEntry;
    }
    return urlIndex;
  }

  async function preloadDetailContext(index) {
    await import('./seed-bootstrap.js')
      .then(function (mod) {
        return mod.ensureSeedCollectionLoaded();
      })
      .catch(function () {});

    resolvedDetailEntryId = parseEntryId() || readNavEntryId(index);
    if (resolvedDetailEntryId == null && typeof window.pagmarEntryIdForAmuletIndex === 'function') {
      resolvedDetailEntryId = window.pagmarEntryIdForAmuletIndex(index);
    }

    if (resolvedDetailEntryId == null && typeof window.pagmarResolveCollectionEntry === 'function') {
      var resolved = window.pagmarResolveCollectionEntry(index);
      if (resolved && resolved.id != null) resolvedDetailEntryId = resolved.id;
    }
    if (resolvedDetailEntryId == null) return;

    var entryId = resolvedDetailEntryId;
    window.__pagmarDetailAnswersByEntryId = window.__pagmarDetailAnswersByEntryId || {};
    var navPayload = readNavPayloadForEntry(entryId) || readNavPayload(index);
    var navAnswers =
      navPayload &&
      navPayload.entryId == entryId &&
      navPayload.answers &&
      navPayload.answers.q1Wish
        ? navPayload.answers
        : null;
    if (navAnswers) {
      window.__pagmarDetailAnswersByEntryId[entryId] = navAnswers;
    }

    try {
      var storeMod = await import('./amulet-glb-store.js');
      var idbReads = [];
      if (!navAnswers) {
        idbReads.push(
          storeMod.loadSnapshot('answers-collection-' + entryId).then(function (answersRaw) {
            if (answersRaw) {
              window.__pagmarDetailAnswersByEntryId[entryId] = JSON.parse(answersRaw);
            }
          })
        );
      }
      idbReads.push(
        storeMod.loadSnapshot('collection-' + entryId).then(function (snapRaw) {
          if (snapRaw) {
            window.__pagmarDetailSnapshotByEntryId = window.__pagmarDetailSnapshotByEntryId || {};
            window.__pagmarDetailSnapshotByEntryId[entryId] = snapRaw;
          }
        })
      );
      idbReads.push(
        storeMod.loadSnapshot('composed3d-' + entryId).then(function (composedRaw) {
          if (!composedRaw) return;
          try {
            var composedParsed = JSON.parse(composedRaw);
            if (composedParsed && composedParsed.svg) {
              window.__pagmarDetailComposedByEntryId = window.__pagmarDetailComposedByEntryId || {};
              window.__pagmarDetailComposedByEntryId[entryId] = composedParsed;
            }
          } catch (_) {}
        })
      );
      await Promise.all(idbReads);
    } catch (_) {}

    var composeAnswers =
      window.__pagmarDetailAnswersByEntryId[entryId] ||
      navAnswers ||
      (typeof window.pagmarFindCollectionEntryById === 'function'
        ? (window.pagmarFindCollectionEntryById(entryId) || {}).answers
        : null);
    if (composeAnswers && composeAnswers.q1Wish) {
      try {
        var vectorsMod = await import('./amulet-detail-vectors.js?v=20250711-fast-glb');
        window.pagmarDetailComposePreload = vectorsMod.preloadDetailCompose(entryId, composeAnswers);
      } catch (err) {
        console.warn('[amulet-detail] compose preload failed', err);
      }
    }
  }

  function authoritativeAnswersForEntry(entryId) {
    if (entryId == null) return null;
    if (
      window.__pagmarDetailAnswersByEntryId &&
      window.__pagmarDetailAnswersByEntryId[entryId] &&
      window.__pagmarDetailAnswersByEntryId[entryId].q1Wish
    ) {
      return window.__pagmarDetailAnswersByEntryId[entryId];
    }
    var nav = readNavPayloadForEntry(entryId);
    if (nav && nav.answers && nav.answers.q1Wish) return nav.answers;
    if (typeof window.pagmarFindCollectionEntryById === 'function') {
      var entry = window.pagmarFindCollectionEntryById(entryId);
      if (entry && entry.answers && entry.answers.q1Wish) return entry.answers;
    }
    return null;
  }

  function buildDetailEntry(entryId, collectionEntry) {
    var answers = authoritativeAnswersForEntry(entryId);
    if (answers) {
      return Object.assign({}, collectionEntry || { id: entryId }, { id: entryId, answers: answers });
    }
    return collectionEntry;
  }

  function resolveEntryForDetail(index) {
    var entryId = resolvedDetailEntryId || parseEntryId() || readNavEntryId(index);
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

    var entryId =
      entry && entry.id != null
        ? entry.id
        : resolvedDetailEntryId || parseEntryId() || readNavEntryId(index);
    var recordOverride = authoritativeAnswersForEntry(entryId);
    if (!recordOverride) {
      recordOverride =
        entry && entry.answers
          ? entry.answers
          : entryId != null &&
              window.__pagmarDetailAnswersByEntryId &&
              window.__pagmarDetailAnswersByEntryId[entryId]
            ? window.__pagmarDetailAnswersByEntryId[entryId]
            : null;
    }

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
    } else if (typeof window.getAmuletImageSrc === 'function' && entryId != null) {
      var entryIndex =
        typeof window.pagmarIndexForEntryId === 'function'
          ? window.pagmarIndexForEntryId(entryId)
          : index;
      if (entryIndex != null) imgSrc = window.getAmuletImageSrc(entryIndex);
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
    scheduleDetailContentSpacingFit();

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
    await import('./seed-bootstrap.js')
      .then(function (mod) {
        return mod.ensureSeedCollectionLoaded();
      })
      .catch(function () {});

    const entryId = parseEntryId();
    if (entryId == null) {
      window.location.replace('index.html');
      return;
    }

    resolvedDetailEntryId = entryId;
    const index = parseIndex();

    try {
      if (index < USER_AMULET_INDEX) {
        window.location.replace('index.html');
        return;
      }

      await preloadDetailContext(index);
      var displayIndex = index;
      var collectionEntry = null;
      if (typeof window.pagmarFindCollectionEntryById === 'function') {
        collectionEntry = window.pagmarFindCollectionEntryById(resolvedDetailEntryId);
      }
      var entry = buildDetailEntry(resolvedDetailEntryId, collectionEntry);
      if (!entry) entry = resolveEntryForDetail(displayIndex);
      if (entry && entry.id != null) resolvedDetailEntryId = entry.id;
      renderDetail(displayIndex, entry);
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

  /* ── Dynamic spacing: shrink gaps when content is tall ── */
  var DETAIL_SPACING_SCALE_MIN = 0.18;
  var DETAIL_STORY_SCALE_MIN = 0.82;
  var detailSpacingFitQueued = false;
  var detailSpacingObserver = null;
  var detailSpacingFitLock = false;
  var lastDetailSpacingScale = 1;
  var lastDetailStoryScale = 1;

  function setDetailLayoutScales(spacingScale, storyScale, force) {
    if (
      !force &&
      Math.abs(spacingScale - lastDetailSpacingScale) < 0.004 &&
      Math.abs(storyScale - lastDetailStoryScale) < 0.004
    ) {
      return;
    }
    lastDetailSpacingScale = spacingScale;
    lastDetailStoryScale = storyScale;
    document.body.style.setProperty('--detail-spacing-scale', String(spacingScale));
    document.body.style.setProperty('--detail-story-scale', String(storyScale));
  }

  function getDetailContentBottomLimit() {
    var margin = 6;
    var amulet = document.querySelector('.pagmar__detail-amulet');
    if (amulet) return amulet.getBoundingClientRect().bottom - margin;

    var canvas = document.getElementById('detailCanvas');
    if (canvas) return canvas.getBoundingClientRect().bottom - margin;

    return window.innerHeight - margin;
  }

  function measureDetailContentBottom() {
    var meta = document.querySelector('.pagmar__detail-meta');
    var content = document.querySelector('.pagmar__detail-content');
    if (meta) return meta.getBoundingClientRect().bottom;
    if (content) return content.getBoundingClientRect().bottom;
    return 0;
  }

  function detailContentOverflows(limitBottom) {
    return measureDetailContentBottom() > limitBottom + 0.5;
  }

  function binarySearchScale(min, max, applyScale, overflows) {
    var lo = min;
    var hi = max;
    applyScale(hi);
    if (!overflows()) return hi;

    for (var i = 0; i < 16; i++) {
      var mid = (lo + hi) / 2;
      applyScale(mid);
      if (overflows()) hi = mid;
      else lo = mid;
    }
    applyScale(lo);
    return lo;
  }

  function fitDetailContentSpacing() {
    if (detailSpacingFitLock || document.body.classList.contains('is-detail-loading')) return;

    var content = document.querySelector('.pagmar__detail-content');
    if (!content) return;

    detailSpacingFitLock = true;
    if (detailSpacingObserver) detailSpacingObserver.disconnect();

    try {
      var limitBottom = getDetailContentBottomLimit();
      if (limitBottom <= 0) return;

      setDetailLayoutScales(1, 1, true);
      void content.offsetHeight;

      if (!detailContentOverflows(limitBottom)) return;

      var spacingScale = binarySearchScale(
        DETAIL_SPACING_SCALE_MIN,
        1,
        function (scale) {
          setDetailLayoutScales(scale, 1, true);
          void content.offsetHeight;
        },
        function () {
          return detailContentOverflows(limitBottom);
        }
      );

      if (!detailContentOverflows(limitBottom)) return;

      binarySearchScale(
        DETAIL_STORY_SCALE_MIN,
        1,
        function (storyScale) {
          setDetailLayoutScales(spacingScale, storyScale, true);
          void content.offsetHeight;
        },
        function () {
          return detailContentOverflows(limitBottom);
        }
      );
    } finally {
      detailSpacingFitLock = false;
      watchDetailContentLayout();
    }
  }

  function scheduleDetailContentSpacingFit() {
    if (detailSpacingFitQueued) return;
    detailSpacingFitQueued = true;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        detailSpacingFitQueued = false;
        fitDetailContentSpacing();
      });
    });
  }

  function watchDetailContentLayout() {
    var content = document.querySelector('.pagmar__detail-content');
    if (!content || typeof ResizeObserver === 'undefined') return;
    if (detailSpacingObserver) detailSpacingObserver.disconnect();
    detailSpacingObserver = new ResizeObserver(function () {
      scheduleDetailContentSpacingFit();
    });
    detailSpacingObserver.observe(content);
  }

  function bootDetailSpacingFit() {
    watchDetailContentLayout();
    scheduleDetailContentSpacingFit();
  }

  window.addEventListener('pagmar:detail-rendered', scheduleDetailContentSpacingFit);
  window.addEventListener('pagmar:detail-vectors-ready', scheduleDetailContentSpacingFit);
  window.addEventListener('resize', scheduleDetailContentSpacingFit);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(scheduleDetailContentSpacingFit).catch(function () {});
  }

  if (document.body.classList.contains('is-detail-loading')) {
    var detailBootObserver = new MutationObserver(function () {
      if (!document.body.classList.contains('is-detail-loading')) {
        detailBootObserver.disconnect();
        bootDetailSpacingFit();
      }
    });
    detailBootObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  } else {
    bootDetailSpacingFit();
  }

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
