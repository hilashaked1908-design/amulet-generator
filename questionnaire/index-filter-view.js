/**
 * Filter page (עמוד פילטר) - Figma 2295:28985 filtered amulet grid.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  const GRID_COLS_COUNT = 4;
  const CARD_SIZE = 410;
  const GRID_GAP = 92;
  const FULL_ROW_WIDTH = GRID_COLS_COUNT * CARD_SIZE + (GRID_COLS_COUNT - 1) * GRID_GAP;

  const filterActive = document.getElementById('indexFilterActive');
  const filterGrid = document.getElementById('indexFilterGrid');
  const pagmarCanvas = document.getElementById('pagmarCanvas');

  let activeFilterLabels = [];
  let filterGridResizeRaf = 0;
  let gridLayout = {
    cardSizeU: CARD_SIZE,
  };

  function normalizeFilterLabels(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
      return input.filter(function (label) {
        return typeof label === 'string' && label.trim();
      });
    }
    return typeof input === 'string' && input.trim() ? [input.trim()] : [];
  }

  function specIndexLabel(index) {
    return String(index + 1).padStart(3, '0');
  }

  function getGridU() {
    if (!filterGrid) return 1;
    const style = getComputedStyle(filterGrid);
    const gridU = parseFloat(style.getPropertyValue('--index-filter-grid-u'));
    if (gridU > 0) return gridU;
    if (!pagmarCanvas) return 1;
    const rect = pagmarCanvas.getBoundingClientRect();
    const canvasStyle = getComputedStyle(pagmarCanvas);
    const pagmarW = parseFloat(canvasStyle.getPropertyValue('--pagmar-w')) || 1920;
    const pagmarH = parseFloat(canvasStyle.getPropertyValue('--pagmar-h')) || 1080;
    if (!(rect.width > 0 && rect.height > 0)) return 1;
    return Math.min(rect.width / pagmarW, rect.height / pagmarH);
  }

  function measureGridWidthU() {
    if (!filterGrid) return FULL_ROW_WIDTH;
    const widthPx = filterGrid.getBoundingClientRect().width;
    if (!(widthPx > 0)) return FULL_ROW_WIDTH;
    return widthPx / getGridU();
  }

  function resolveGridMetrics(availableWidthU) {
    const scale = Math.min(1, availableWidthU / FULL_ROW_WIDTH);
    return {
      cardSizeU: CARD_SIZE * scale,
    };
  }

  function applyCardSize(card, cardSizeU) {
    const size = 'calc(' + cardSizeU + ' * var(--index-filter-grid-u))';
    card.style.width = size;
    card.style.height = size;
  }

  function dispatchAmuletHover(detail) {
    window.dispatchEvent(
      new CustomEvent('questionnaire:amulet-hover', { detail: detail || { active: false } })
    );
  }

  function layoutFilterCards() {
    if (!filterGrid) return;
    const cards = filterGrid.querySelectorAll('.pagmar__index-filter-card');
    const totalCards = cards.length;
    const metrics = resolveGridMetrics(measureGridWidthU());

    gridLayout = metrics;

    cards.forEach(function (card) {
      applyCardSize(card, metrics.cardSizeU);
    });
    updateFilterGridScrollHeight(totalCards);
  }

  function scheduleFilterGridLayout() {
    cancelAnimationFrame(filterGridResizeRaf);
    filterGridResizeRaf = requestAnimationFrame(function () {
      syncFilterGridFrame();
      layoutFilterCards();
    });
  }

  function syncFilterGridFrame() {
    if (!filterGrid || !pagmarCanvas || !document.body.classList.contains('is-filter-page')) {
      return;
    }
    const rect = pagmarCanvas.getBoundingClientRect();
    filterGrid.style.setProperty('--index-filter-grid-left', rect.left + 'px');
    filterGrid.style.setProperty('--index-filter-grid-top', rect.top + 'px');
    filterGrid.style.setProperty('--index-filter-grid-width', rect.width + 'px');
    filterGrid.style.setProperty('--index-filter-grid-height', rect.height + 'px');
  }

  function updateFilterGridScrollHeight(cardCount) {
    if (!filterGrid) return;
    if (cardCount <= 0) {
      filterGrid.scrollTop = 0;
    }
  }

  function renderActiveTags(filterLabels) {
    if (!filterActive) return;
    filterActive.innerHTML = '';
    filterLabels.forEach(function (filterLabel) {
      const tag = document.createElement('button');
      tag.type = 'button';
      tag.className = 'pagmar__index-filter-active-tag';
      tag.textContent = '[' + filterLabel + ']';
      tag.dataset.typeText = '[' + filterLabel + ']';
      tag.setAttribute('aria-label', 'הצג פילטרים נוספים - ' + filterLabel);
      tag.setAttribute('aria-pressed', 'true');
      tag.setAttribute('aria-expanded', 'false');
      tag.addEventListener('click', function (e) {
        e.stopPropagation();
        if (typeof window.pagmarToggleIndexFilterList === 'function') {
          window.pagmarToggleIndexFilterList();
        }
      });
      filterActive.appendChild(tag);
    });
  }

  function loadCollection() {
    if (typeof window.gardenLoadCollection === 'function') {
      return window.gardenLoadCollection();
    }
    if (typeof window.pagmarLoadMergedCollection === 'function') {
      return window.pagmarLoadMergedCollection();
    }
    try {
      var raw =
        localStorage.getItem('amuletCollection') || sessionStorage.getItem('amuletCollection');
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (_) {
      return [];
    }
  }

  function snapshotKeyForAmuletIndex(amuletIndex) {
    const base = (window.AMULET_QUESTIONS || []).length;
    if (amuletIndex < base) return null;
    const collectionIndex = amuletIndex - base;
    const collection = loadCollection();
    if (collectionIndex < collection.length) {
      const entry = collection[collectionIndex];
      return entry && entry.id ? 'collection-' + entry.id : null;
    }
    if (collectionIndex === collection.length) return 'user-amulet';
    return null;
  }

  function isLegacyOpaqueSnapshot(dataUrl) {
    return (
      typeof dataUrl === 'string' &&
      (dataUrl.indexOf('data:image/jpeg') === 0 || dataUrl.indexOf('data:image/webp') === 0)
    );
  }

  function applySnapshotToCardImg(img, dataUrl) {
    if (!dataUrl) return;
    img.classList.toggle('pagmar__index-filter-card-img--legacy', isLegacyOpaqueSnapshot(dataUrl));
    img.src = dataUrl;
  }

  function assignCardImage(img, amuletIndex) {
    const fallback =
      typeof window.getAmuletImageSrc === 'function' ? window.getAmuletImageSrc(amuletIndex) : null;
    if (fallback) applySnapshotToCardImg(img, fallback);

    const snapKey = snapshotKeyForAmuletIndex(amuletIndex);
    if (!snapKey) return;

    import('./amulet-glb-store.js')
      .then(function (store) {
        return store.loadSnapshot(snapKey);
      })
      .then(function (hiResUrl) {
        if (hiResUrl) applySnapshotToCardImg(img, hiResUrl);
      })
      .catch(function () {});
  }

  function entryIdForAmuletIndex(amuletIndex) {
    if (typeof window.pagmarEntryIdForAmuletIndex === 'function') {
      return window.pagmarEntryIdForAmuletIndex(amuletIndex);
    }
    const base = (window.AMULET_QUESTIONS || []).length;
    if (amuletIndex < base) return null;
    const collectionIndex = amuletIndex - base;
    const collection = loadCollection();
    if (collectionIndex < collection.length) {
      const entry = collection[collectionIndex];
      return entry && entry.id != null ? entry.id : null;
    }
    return null;
  }

  function glbUrlForEntry(entry) {
    if (!entry || entry.id == null) return null;
    if (
      entry.glbUrl &&
      String(entry.glbUrl).indexOf('/' + entry.id + '.glb') !== -1
    ) {
      return entry.glbUrl;
    }
    if (
      entry.snapshot &&
      String(entry.snapshot).indexOf('/seed/snapshots/' + entry.id) !== -1
    ) {
      return '/questionnaire/seed/glbs/' + entry.id + '.glb';
    }
    return null;
  }

  function navigateToAmuletDetail(amuletIndex) {
    var entryId = entryIdForAmuletIndex(amuletIndex);
    var entry = null;
    var answers = null;
    if (entryId != null && typeof window.pagmarFindCollectionEntryById === 'function') {
      entry = window.pagmarFindCollectionEntryById(entryId);
      if (entry && entry.answers) answers = entry.answers;
    }
    if (!answers && typeof window.getAmuletRecord === 'function') {
      answers = window.getAmuletRecord(amuletIndex);
    }
    var glbUrl = glbUrlForEntry(entry);
    console.log(
      '%c[index-filter] OPEN DETAIL from filter card',
      'color:#fc9;background:#222;font-size:13px;padding:2px 6px;',
      {
        amuletIndex: amuletIndex,
        entryId: entryId,
        glbUrl: glbUrl,
        wish: answers && answers.q1Wish ? String(answers.q1Wish).slice(0, 60) : null,
      }
    );
    if (typeof window.pagmarNavigateToAmuletDetail === 'function') {
      window.pagmarNavigateToAmuletDetail(amuletIndex, entryId, answers, null, glbUrl);
      return;
    }
    if (typeof window.gardenStashIndexReturnState === 'function') {
      window.gardenStashIndexReturnState();
    }
    if (typeof window.pagmarIndexChrome !== 'undefined' && window.pagmarIndexChrome.markTyped) {
      window.pagmarIndexChrome.markTyped();
    }
    try {
      sessionStorage.setItem('pagmarAmuletNavAt', String(Date.now()));
    } catch (_) {}
    if (entryId == null) return;
    var url = 'amulet.html?entry=' + encodeURIComponent(entryId) + '&id=' + encodeURIComponent(amuletIndex);
    try {
      var navPayload = { index: amuletIndex, entryId: entryId };
      if (answers) navPayload.answers = answers;
      if (glbUrl) navPayload.glbUrl = glbUrl;
      sessionStorage.setItem('pagmarAmuletDetailNav', JSON.stringify(navPayload));
    } catch (_) {}
    window.location.href = url;
  }

  function amuletRequestText(amuletIndex) {
    if (typeof window.getAmuletRecord !== 'function') return '';
    const record = window.getAmuletRecord(amuletIndex);
    if (!record || !record.q1Wish) return '';
    return String(record.q1Wish).trim();
  }

  function createGridCard(amuletIndex) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pagmar__index-filter-card';
    applyCardSize(card, gridLayout.cardSizeU);
    card.dataset.index = String(amuletIndex);
    card.setAttribute('aria-label', 'קמע ' + specIndexLabel(amuletIndex));

    ['tl', 'tr', 'bl', 'br'].forEach(function (corner) {
      const el = document.createElement('span');
      el.className = 'pagmar__index-filter-card-corner pagmar__index-filter-card-corner--' + corner;
      el.setAttribute('aria-hidden', 'true');
      card.appendChild(el);
    });

    const img = document.createElement('img');
    img.className = 'pagmar__index-filter-card-img';
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    assignCardImage(img, amuletIndex);
    card.appendChild(img);

    const hoverLabel = '[' + specIndexLabel(amuletIndex) + ']';
    const hoverRequest = amuletRequestText(amuletIndex);

    card.addEventListener('mouseenter', function (e) {
      dispatchAmuletHover({
        active: true,
        label: hoverLabel,
        request: hoverRequest,
        x: e.clientX,
        y: e.clientY,
      });
    });
    card.addEventListener('mousemove', function (e) {
      dispatchAmuletHover({
        active: true,
        label: hoverLabel,
        request: hoverRequest,
        x: e.clientX,
        y: e.clientY,
      });
    });
    card.addEventListener('mouseleave', function () {
      dispatchAmuletHover({ active: false });
    });

    card.addEventListener('click', function () {
      navigateToAmuletDetail(amuletIndex);
    });

    return card;
  }

  function renderGrid(filterLabels) {
    if (!filterGrid) return;
    filterGrid.innerHTML = '';

    const indices =
      typeof window.getMatchingAmuletIndices === 'function'
        ? window.getMatchingAmuletIndices(filterLabels)
        : [];

    syncFilterGridFrame();
    gridLayout = resolveGridMetrics(measureGridWidthU());

    if (!indices.length) {
      updateFilterGridScrollHeight(0);
      return;
    }

    const rows = document.createElement('div');
    rows.className = 'pagmar__index-filter-rows';

    for (let i = 0; i < indices.length; i += GRID_COLS_COUNT) {
      const row = document.createElement('div');
      row.className = 'pagmar__index-filter-row';
      indices.slice(i, i + GRID_COLS_COUNT).forEach(function (amuletIndex) {
        row.appendChild(createGridCard(amuletIndex));
      });
      rows.appendChild(row);
    }

    filterGrid.appendChild(rows);
    scheduleFilterGridLayout();
    filterGrid.scrollTop = 0;
  }

  function setFiltered(filterLabels) {
    const normalized = normalizeFilterLabels(filterLabels);
    activeFilterLabels = normalized.length ? [normalized[0]] : [];
    const isFiltered = activeFilterLabels.length > 0;

    document.body.classList.toggle('is-filter-page', isFiltered);

    if (filterGrid) filterGrid.hidden = !isFiltered;
    if (filterActive) filterActive.hidden = !isFiltered;

    if (isFiltered) {
      renderActiveTags(activeFilterLabels);
      renderGrid(activeFilterLabels);
    } else if (filterGrid) {
      filterGrid.innerHTML = '';
      updateFilterGridScrollHeight(0);
      dispatchAmuletHover({ active: false });
    }

    window.dispatchEvent(
      new CustomEvent('questionnaire:index-filter-change', {
        detail: {
          filter: activeFilterLabels[0] || null,
          filters: activeFilterLabels.slice(),
          active: isFiltered,
        },
      })
    );
  }

  window.addEventListener('questionnaire:index-search', function (evt) {
    const detail = evt.detail || {};
    const labels = detail.filters
      ? normalizeFilterLabels(detail.filters)
      : normalizeFilterLabels(detail.filter || detail.query || '');
    setFiltered(labels);
  });

  window.addEventListener('questionnaire:create-open', function () {
    setFiltered([]);
  });

  window.addEventListener('questionnaire:panel-close', function () {
    if (!activeFilterLabels.length || !filterGrid) return;
    filterGrid.querySelectorAll('.pagmar__index-filter-card').forEach(function (card) {
      card.classList.remove('is-selected');
    });
  });

  window.addEventListener('resize', function () {
    if (!document.body.classList.contains('is-filter-page')) return;
    scheduleFilterGridLayout();
  });

  window.addEventListener('pagmar:collection-changed', function () {
    if (!activeFilterLabels.length) return;
    renderGrid(activeFilterLabels);
  });

  window.pagmarFilterPage = {
    getActiveFilters: function () {
      return activeFilterLabels.slice();
    },
    getActiveFilter: function () {
      return activeFilterLabels[0] || null;
    },
    clear: function () {
      if (typeof window.pagmarExitFilterPage === 'function') {
        window.pagmarExitFilterPage();
        return;
      }
      setFiltered([]);
    },
    setFilter: function (filterLabels) {
      setFiltered(filterLabels);
    },
  };

  window.pagmarIndexFilter = window.pagmarFilterPage;

  function restorePendingFilterViewEarly() {
    try {
      var raw = sessionStorage.getItem('pagmarIndexReturnState');
      if (!raw) return;
      var state = JSON.parse(raw);
      if (state && state.view === 'filter' && state.filters && state.filters.length) {
        setFiltered(normalizeFilterLabels(state.filters));
      }
    } catch (_) {}
  }

  restorePendingFilterViewEarly();
})();
