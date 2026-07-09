/**
 * Index chrome buttons - Figma 2601:40649.
 * Terminal-style typewriter on load for CTA + filter labels; about is icon-only.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  /** Frame 336 - filter labels */
  const FILTER_LABELS = [
    { label: 'זוגיות' },
    { label: 'משפחה' },
    { label: 'תקווה' },
    { label: 'מעשים שאני עושה' },
    { label: 'לא מאמין שזה יקרה' },
    { label: 'חוסר סבלנות' },
    { label: 'תמיכה מהסביבה שלי' },
    { label: 'ביטחון עצמי' },
    { label: 'סימנים וצירופי מקרים' },
    { label: 'פרנסה' },
    { label: 'געגוע' },
    { label: 'לקבל החלטה' },
    { label: 'חוסר וודאות' },
    { label: 'בלבול' },
    { label: 'תחושת בטן' },
    { label: 'לא לדעת מה יקרה' },
    { label: 'לחכות', mono: true },
    { label: 'להצליח לשחרר' },
    { label: 'לקבל חוסר שליטה' },
    { label: 'מגורים' },
    { label: 'בריאות' },
  ];

  const TYPING_CHAR_MS = 46;
  const TYPING_LINE_GAP_MS = 100;
  const TYPING_CURSOR = '▌';
  const CHROME_TYPED_KEY = 'pagmarIndexChromeTyped';
  let initialTypingPromise = null;

  const aboutBtn = document.getElementById('indexAboutBtn');
  const filterSidebar = document.getElementById('indexFilterSidebar');
  const filterTrigger = document.getElementById('indexFilterTrigger');
  const filterList = document.getElementById('indexFilterList');
  const cta = document.getElementById('indexCreateCta');
  const ctaLabel = cta ? cta.querySelector('.pagmar__index-cta-pill__label') : null;

  const typeSessions = new Map();
  let filterTypingToken = 0;
  let activeFilterLabels = [];
  let filterHistoryPushed = false;

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function filterItemDisplayText(label) {
    if (!label) return '';
    /* Bracketed labels only in the index picker; filter page uses the active-tag row. */
    if (document.body.classList.contains('is-filter-page')) {
      return label;
    }
    if (activeFilterLabels.indexOf(label) !== -1) {
      return '[' + label + ']';
    }
    return label;
  }

  function reserveFilterItemWidth(btn) {
    const label = btn.dataset.label || '';
    if (!label || !btn) return;
    const plain = measureTextWidth(label, btn);
    const bracketed = measureTextWidth('[' + label + ']', btn);
    btn.style.setProperty('--type-full-width', Math.max(plain, bracketed) + 'px');
  }

  function syncFilterItemDisplay(btn) {
    if (!btn) return;
    const label = btn.dataset.label || '';
    const display = filterItemDisplayText(label);
    btn.dataset.typeText = display;
    btn.setAttribute('aria-label', display);
    if (btn.classList.contains('is-typing')) return;
    if (window.pagmarButtonRoll && window.pagmarButtonRoll.syncFilter) {
      window.pagmarButtonRoll.syncFilter(btn, display);
    } else {
      btn.textContent = display;
    }
  }

  function enhanceButtonRoll(root) {
    if (!window.pagmarButtonRoll) return;
    const scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('.pagmar__index-type-target').forEach(function (el) {
      if (!el.classList.contains('is-typing')) {
        window.pagmarButtonRoll.enhanceTarget(el);
      }
    });
    scope.querySelectorAll('.pagmar__index-filter-item, .pagmar__index-filter-active-tag').forEach(function (btn) {
      if (btn.classList.contains('is-typing')) return;
      const text =
        btn.dataset.typeText ||
        btn.dataset.label ||
        (btn.textContent || '').trim();
      if (text && window.pagmarButtonRoll.syncFilter) {
        window.pagmarButtonRoll.syncFilter(btn, text);
      }
    });
  }

  function getTypeText(el) {
    if (!el) return '';
    return (el.dataset.typeText || el.dataset.label || el.textContent || '').trim();
  }

  function bumpSession(key) {
    const next = (typeSessions.get(key) || 0) + 1;
    typeSessions.set(key, next);
    return next;
  }

  function isSessionActive(key, token) {
    return typeSessions.get(key) === token;
  }

  function measureTextWidth(text, referenceEl) {
    const probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;left:-9999px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;';
    const computed = window.getComputedStyle(referenceEl);
    probe.style.font = computed.font;
    probe.style.fontFamily = computed.fontFamily;
    probe.style.fontSize = computed.fontSize;
    probe.style.fontWeight = computed.fontWeight;
    probe.style.letterSpacing = computed.letterSpacing;
    probe.textContent = text;
    document.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    document.body.removeChild(probe);
    return width;
  }

  function reserveTypeWidth(el) {
    const text = getTypeText(el);
    if (!text || !el) return;
    const width = measureTextWidth(text, el);
    el.style.setProperty('--type-full-width', width + 'px');
  }

  function setTypedText(el, text, withCursor) {
    if (!el) return;
    el.textContent = withCursor ? text + TYPING_CURSOR : text;
  }

  async function typeIntoElement(el, options) {
    if (!el) return;

    const opts = options || {};
    const key = opts.sessionKey || el;
    const token = opts.token != null ? opts.token : bumpSession(key);
    const fullText = opts.text != null ? opts.text : getTypeText(el);
    const charMs = opts.charMs != null ? opts.charMs : TYPING_CHAR_MS;
    const showCursor = opts.showCursor !== false;

    if (!el.dataset.typeText && fullText) {
      el.dataset.typeText = fullText;
    }
    if (fullText) {
      el.setAttribute('aria-label', fullText);
    }

    if (prefersReducedMotion()) {
      el.textContent = fullText;
      el.classList.remove('is-typing');
      el.classList.add('is-typed');
      return;
    }

    el.classList.add('is-typing');
    el.classList.remove('is-typed');

    for (let i = 0; i <= fullText.length; i += 1) {
      if (!isSessionActive(key, token)) return;
      const partial = fullText.slice(0, i);
      setTypedText(el, partial, showCursor && i < fullText.length);
      if (i < fullText.length) {
        await sleep(charMs);
      }
    }

    if (!isSessionActive(key, token)) return;
    el.textContent = fullText;
    el.classList.remove('is-typing');
    el.classList.add('is-typed');
  }

  function startTyping(el, options) {
    if (!el) return Promise.resolve();
    const key = (options && options.sessionKey) || el;
    const token = bumpSession(key);
    return typeIntoElement(el, Object.assign({}, options, { sessionKey: key, token: token }));
  }

  function restoreStaticTypeText(el) {
    if (!el) return;
    bumpSession(el);
    const fullText = getTypeText(el);
    el.textContent = fullText;
    el.classList.remove('is-typing');
    el.classList.add('is-typed');
    if (window.pagmarButtonRoll) {
      window.pagmarButtonRoll.enhanceTarget(el);
    }
  }

  function resetTypeTargetForTyping(el) {
    if (!el) return;
    bumpSession(el);
    if (!el.dataset.typeText) {
      el.dataset.typeText = (el.textContent || '').trim();
    }
    reserveTypeWidth(el);
    el.textContent = '';
    el.classList.remove('is-typed', 'is-typing');
  }

  function hasChromeTypedBefore() {
    try {
      return localStorage.getItem(CHROME_TYPED_KEY) === '1';
    } catch (_) {
      return false;
    }
  }

  function markChromeTyped() {
    try {
      localStorage.setItem(CHROME_TYPED_KEY, '1');
    } catch (_) {}
  }

  function shouldRunInitialChromeTyping() {
    return !hasChromeTypedBefore();
  }

  function cancelInitialChromeTyping() {
    document.querySelectorAll('.pagmar__index-type-target').forEach(function (el) {
      bumpSession(el);
    });
    filterTypingToken += 1;
  }

  function restoreAllChromeText() {
    document.querySelectorAll('.pagmar__index-type-target').forEach(function (el) {
      restoreStaticTypeText(el);
    });
    if (filterList) {
      filterList.querySelectorAll('.pagmar__index-filter-item').forEach(function (btn) {
        syncFilterItemDisplay(btn);
        btn.classList.remove('is-typing');
        btn.classList.add('is-typed');
      });
    }
  }

  function clearTypeText(el) {
    if (!el) return;
    bumpSession(el);
    el.textContent = '';
    el.classList.remove('is-typed');
    el.classList.add('is-typing');
  }

  async function typeSequence(elements, options) {
    const opts = options || {};
    for (let i = 0; i < elements.length; i += 1) {
      const el = elements[i];
      if (!el) continue;
      await startTyping(el, opts);
      if (i < elements.length - 1) {
        await sleep(opts.gapMs != null ? opts.gapMs : TYPING_LINE_GAP_MS);
      }
    }
  }

  function bindHoverRetype(target, onEnter, onLeave) {
    if (!target) return;

    let hoverSession = 0;

    target.addEventListener('mouseenter', function () {
      if (prefersReducedMotion()) return;
      const session = ++hoverSession;

      Promise.resolve(onEnter(session))
        .catch(function () {})
        .finally(function () {
          if (session !== hoverSession) return;
        });
    });

    target.addEventListener('mouseleave', function () {
      hoverSession += 1;
      if (typeof onLeave === 'function') onLeave();
    });
  }

  function bindHoverTyping(target, elements, options) {
    if (!target || !elements || !elements.length) return;

    const typed = elements.filter(Boolean);

    bindHoverRetype(
      target,
      function () {
        typed.forEach(clearTypeText);
        return typeSequence(typed, options);
      },
      function () {
        typed.forEach(restoreStaticTypeText);
      }
    );
  }

  function updateFilterItemStates() {
    if (!filterList) return;
    filterList.querySelectorAll('.pagmar__index-filter-item').forEach(function (btn) {
      const label = btn.dataset.label || '';
      const isActive = activeFilterLabels.indexOf(label) !== -1;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      reserveFilterItemWidth(btn);
      syncFilterItemDisplay(btn);
    });
  }

  function pushFilterHistoryIfNeeded() {
    if (!activeFilterLabels.length) return;
    const state = {
      pagmarView: 'filter',
      filters: activeFilterLabels.slice(),
      returnGarden:
        typeof window.gardenGetViewState === 'function' ? window.gardenGetViewState() : null,
    };
    try {
      if (filterHistoryPushed) {
        history.replaceState(state, '');
      } else {
        history.pushState(state, '');
        filterHistoryPushed = true;
      }
    } catch (_) {}
  }

  function exitFilterPage() {
    activeFilterLabels = [];
    updateFilterItemStates();
    setFilterExpanded(false);
    filterHistoryPushed = false;
    window.dispatchEvent(
      new CustomEvent('questionnaire:index-search', {
        detail: {
          query: '',
          filter: null,
          filters: [],
        },
      })
    );
    window.dispatchEvent(new CustomEvent('questionnaire:index-filter-clear'));
  }

  function closeFilterPage() {
    if (filterHistoryPushed) {
      filterHistoryPushed = false;
      try {
        history.back();
        return;
      } catch (_) {}
    }
    exitFilterPage();
    syncFilterTriggerMode();
  }

  function toggleFilterLabel(label, options) {
    const opts = options || {};
    const hadFilters = activeFilterLabels.length > 0;
    const idx = activeFilterLabels.indexOf(label);

    if (idx !== -1) {
      activeFilterLabels.splice(idx, 1);
    } else {
      activeFilterLabels = [label];
    }
    if (!hadFilters && activeFilterLabels.length > 0) {
      if (typeof window.gardenStashPreFilterState === 'function') {
        window.gardenStashPreFilterState();
      }
    }
    updateFilterItemStates();
    if (opts.collapseSidebar !== false) {
      setFilterExpanded(false);
    }
    if (!activeFilterLabels.length) {
      if (filterHistoryPushed) {
        history.back();
        return;
      }
      dispatchSearch();
      return;
    }
    dispatchSearch();
    pushFilterHistoryIfNeeded();
  }

  function dispatchSearch() {
    window.dispatchEvent(
      new CustomEvent('questionnaire:index-search', {
        detail: {
          query: activeFilterLabels.join(' '),
          filter: activeFilterLabels[0] || null,
          filters: activeFilterLabels.slice(),
        },
      })
    );
  }

  function clearFilterItemTexts() {
    if (!filterList) return;
    filterList.querySelectorAll('.pagmar__index-filter-item').forEach(function (btn) {
      btn.textContent = '';
      btn.classList.remove('is-typed', 'is-typing');
    });
  }

  function resetFilterItemTexts() {
    if (!filterList) return;
    filterList.classList.remove('is-typing');
    clearFilterItemTexts();
  }

  function cancelFilterTyping() {
    filterTypingToken += 1;
    resetFilterItemTexts();
  }

  function showAllFilterItems() {
    if (!filterList) return;
    filterList.classList.remove('is-typing');
    filterList.querySelectorAll('.pagmar__index-filter-item').forEach(function (btn) {
      syncFilterItemDisplay(btn);
      btn.classList.remove('is-typing');
      btn.classList.add('is-typed');
    });
  }

  async function runFilterTypingAnimation() {
    if (!filterList) return;

    if (prefersReducedMotion()) {
      showAllFilterItems();
      return;
    }

    const token = filterTypingToken;
    const items = Array.prototype.slice.call(
      filterList.querySelectorAll('.pagmar__index-filter-item')
    );

    filterList.classList.add('is-typing');
    clearFilterItemTexts();

    for (let lineIndex = 0; lineIndex < items.length; lineIndex += 1) {
      if (token !== filterTypingToken) return;

      const btn = items[lineIndex];
      const label = btn.dataset.label || '';
      const displayText = filterItemDisplayText(label);
      const sessionKey = 'filter-item-' + lineIndex;

      await typeIntoElement(btn, {
        sessionKey: sessionKey,
        token: bumpSession(sessionKey),
        text: displayText,
      });

      if (token !== filterTypingToken) return;
      btn.classList.add('is-typed');

      if (lineIndex < items.length - 1) {
        await sleep(TYPING_LINE_GAP_MS);
      }
    }

    if (token === filterTypingToken && filterList) {
      filterList.classList.remove('is-typing');
      enhanceButtonRoll(filterList);
    }
  }

  function syncFilterTriggerMode() {
    if (!filterTrigger) return;
    const onFilterPage = document.body.classList.contains('is-filter-page');
    filterTrigger.classList.toggle('is-filter-page-close', onFilterPage);
    filterTrigger.setAttribute('aria-label', onFilterPage ? 'חזרה לגן הקמעות' : 'סנן');
  }

  function setFilterExpanded(expanded) {
    if (!filterSidebar || !filterTrigger) return;

    if (!expanded) {
      cancelFilterTyping();
    } else {
      filterTypingToken += 1;
      updateFilterItemStates();
      showAllFilterItems();
    }

    filterSidebar.classList.toggle('is-expanded', expanded);
    filterTrigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const filterActive = document.getElementById('indexFilterActive');
    if (filterActive) {
      filterActive.querySelectorAll('.pagmar__index-filter-active-tag').forEach(function (tag) {
        tag.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      });
    }
  }

  function toggleFilterListExpanded() {
    if (!filterSidebar) return;
    setFilterExpanded(!filterSidebar.classList.contains('is-expanded'));
  }

  function prepareTypeTargets() {
    document.querySelectorAll('.pagmar__index-type-target').forEach(function (el) {
      if (!el.dataset.typeText) {
        el.dataset.typeText = el.textContent.trim();
      }
      reserveTypeWidth(el);
      el.textContent = '';
      el.classList.remove('is-typed', 'is-typing');
    });

    if (filterList) {
      filterList.querySelectorAll('.pagmar__index-filter-item').forEach(function (btn) {
        reserveFilterItemWidth(btn);
      });
    }
  }

  async function runInitialChromeTyping() {
    if (prefersReducedMotion()) {
      document.querySelectorAll('.pagmar__index-type-target').forEach(function (el) {
        el.textContent = getTypeText(el);
        el.classList.add('is-typed');
      });
      return;
    }

    await startTyping(ctaLabel);
  }

  if (filterList) {
    FILTER_LABELS.forEach(function (entry, index) {
      const label = entry.label;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pagmar__index-filter-item' + (entry.mono ? ' pagmar__index-filter-item--mono' : '');
      btn.dataset.label = label;
      btn.setAttribute('aria-label', label);
      btn.textContent = '';
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleFilterLabel(label);
      });
      filterList.appendChild(btn);
    });
  }

  document.querySelectorAll('.pagmar__index-type-target').forEach(function (el) {
    if (!el.dataset.typeText) {
      el.dataset.typeText = (el.textContent || '').trim();
    }
    reserveTypeWidth(el);
  });

  if (filterList) {
    filterList.querySelectorAll('.pagmar__index-filter-item').forEach(function (btn) {
      reserveFilterItemWidth(btn);
    });
  }

  if (shouldRunInitialChromeTyping()) {
    if (filterTrigger) {
      restoreStaticTypeText(filterTrigger.querySelector('.pagmar__index-filter-trigger__label'));
    }
    if (ctaLabel) {
      resetTypeTargetForTyping(ctaLabel);
    }
    initialTypingPromise = runInitialChromeTyping().then(function () {
      markChromeTyped();
      enhanceButtonRoll();
    });
  } else {
    restoreAllChromeText();
    enhanceButtonRoll();
  }

  window.pagmarIndexChrome = {
    markTyped: markChromeTyped,
    restoreStatic: restoreAllChromeText,
    hasTypedBefore: hasChromeTypedBefore,
  };

  window.pagmarToggleIndexFilter = toggleFilterLabel;
  window.pagmarExitFilterPage = closeFilterPage;
  window.pagmarToggleIndexFilterList = toggleFilterListExpanded;

  syncFilterTriggerMode();

  window.addEventListener('popstate', function () {
    const state = history.state;
    if (state && state.pagmarView === 'filter' && Array.isArray(state.filters) && state.filters.length) {
      activeFilterLabels = [state.filters[0]];
      updateFilterItemStates();
      if (typeof window.gardenStashPreFilterState === 'function') {
        window.gardenStashPreFilterState();
      }
      window.dispatchEvent(
        new CustomEvent('questionnaire:index-search', {
          detail: {
            query: activeFilterLabels.join(' '),
            filter: activeFilterLabels[0] || null,
            filters: activeFilterLabels.slice(),
          },
        })
      );
      filterHistoryPushed = true;
      syncFilterTriggerMode();
      return;
    }
    if (document.body.classList.contains('is-filter-page') || activeFilterLabels.length) {
      exitFilterPage();
      syncFilterTriggerMode();
    }
  });

  window.addEventListener('questionnaire:index-filter-change', function (evt) {
    const detail = evt.detail || {};
    if (detail.active && Array.isArray(detail.filters)) {
      activeFilterLabels = detail.filters.length ? [detail.filters[0]] : [];
    } else if (detail.active && detail.filter) {
      activeFilterLabels = [detail.filter];
    } else {
      activeFilterLabels = [];
    }
    updateFilterItemStates();
    syncFilterTriggerMode();
    if (!detail.active && filterSidebar && filterSidebar.classList.contains('is-expanded')) {
      setFilterExpanded(false);
    }
  });

  window.addEventListener('questionnaire:index-filter-clear', function () {
    activeFilterLabels = [];
    updateFilterItemStates();
  });

  window.addEventListener('questionnaire:create-open', function () {
    filterHistoryPushed = false;
    markChromeTyped();
    cancelInitialChromeTyping();
    restoreAllChromeText();
    setFilterExpanded(false);
  });

  window.addEventListener('questionnaire:create-close', function () {
    markChromeTyped();
    cancelInitialChromeTyping();
    restoreAllChromeText();
    enhanceButtonRoll();
  });

  window.addEventListener('pageshow', function () {
    if (!hasChromeTypedBefore()) return;
    cancelInitialChromeTyping();
    restoreAllChromeText();
    enhanceButtonRoll();
  });

  /* Hover typing removed - Figma buttons only shift corners on hover */

  if (filterTrigger) {
    filterTrigger.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      e.stopPropagation();
    });

    filterTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (document.body.classList.contains('is-filter-page')) {
        closeFilterPage();
        return;
      }
      toggleFilterListExpanded();
    });
  }

  if (cta) {
    cta.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof window.startIndexCreateFlow === 'function') {
        window.startIndexCreateFlow();
      }
    });
  }

  if (aboutBtn) {
    aboutBtn.addEventListener('click', function () {
      if (typeof window.openAboutShell === 'function') {
        window.openAboutShell();
      }
    });
  }

  document.addEventListener('click', function (e) {
    if (!filterSidebar || !filterSidebar.classList.contains('is-expanded')) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.pagmar__index-filter-sidebar')) return;
    setFilterExpanded(false);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && filterSidebar && filterSidebar.classList.contains('is-expanded')) {
      setFilterExpanded(false);
    }
  });
})();
