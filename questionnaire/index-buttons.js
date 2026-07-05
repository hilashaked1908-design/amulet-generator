/**
 * Index chrome buttons — Figma 2127:3662 (Frame 336).
 * Terminal-style typewriter on load, hover, and filter open.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  /** Frame 336 — filter labels */
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
  const aboutLabel = aboutBtn ? aboutBtn.querySelector('.pagmar__index-about__label') : null;

  const typeSessions = new Map();
  let filterTypingToken = 0;
  let activeFilterLabels = [];

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
    if (!btn.classList.contains('is-typing')) {
      btn.textContent = display;
    }
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

  async function runFilterTypingAnimation() {
    if (!filterList) return;

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
    }
  }

  function setFilterExpanded(expanded) {
    if (!filterSidebar || !filterTrigger) return;

    if (!expanded) {
      cancelFilterTyping();
    } else {
      filterTypingToken += 1;
      updateFilterItemStates();
      runFilterTypingAnimation();
    }

    filterSidebar.classList.toggle('is-expanded', expanded);
    filterTrigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
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

    await startTyping(aboutLabel);
    await sleep(110);
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
      btn.addEventListener('click', function () {
        const idx = activeFilterLabels.indexOf(label);
        if (idx !== -1) {
          activeFilterLabels.splice(idx, 1);
        } else {
          activeFilterLabels.push(label);
        }
        updateFilterItemStates();
        setFilterExpanded(false);
        dispatchSearch();
      });
      filterList.appendChild(btn);
    });
  }

  prepareTypeTargets();
  if (shouldRunInitialChromeTyping()) {
    initialTypingPromise = runInitialChromeTyping().then(function () {
      markChromeTyped();
    });
  } else {
    restoreAllChromeText();
  }

  window.pagmarIndexChrome = {
    markTyped: markChromeTyped,
    restoreStatic: restoreAllChromeText,
    hasTypedBefore: hasChromeTypedBefore,
  };

  window.addEventListener('questionnaire:index-filter-change', function (evt) {
    const detail = evt.detail || {};
    if (detail.active && Array.isArray(detail.filters)) {
      activeFilterLabels = detail.filters.slice();
    } else if (detail.active && detail.filter) {
      activeFilterLabels = [detail.filter];
    } else {
      activeFilterLabels = [];
    }
    updateFilterItemStates();
    if (!detail.active && filterSidebar && filterSidebar.classList.contains('is-expanded')) {
      setFilterExpanded(false);
    }
  });

  window.addEventListener('questionnaire:index-filter-clear', function () {
    activeFilterLabels = [];
    updateFilterItemStates();
  });

  window.addEventListener('questionnaire:create-open', function () {
    markChromeTyped();
    cancelInitialChromeTyping();
    restoreAllChromeText();
    setFilterExpanded(false);
  });

  window.addEventListener('questionnaire:create-close', function () {
    markChromeTyped();
    cancelInitialChromeTyping();
    restoreAllChromeText();
  });

  window.addEventListener('pageshow', function () {
    if (!hasChromeTypedBefore()) return;
    cancelInitialChromeTyping();
    restoreAllChromeText();
  });

  /* Hover typing removed — Figma buttons only shift corners on hover */

  if (filterTrigger) {
    filterTrigger.addEventListener('click', function (e) {
      e.stopPropagation();
      const expanded = filterSidebar && filterSidebar.classList.contains('is-expanded');
      setFilterExpanded(!expanded);
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
      window.dispatchEvent(new CustomEvent('questionnaire:about-open'));
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
