/**
 * Filter page (עמוד פילטר) — Figma 2295:28985 filtered amulet grid.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  const GRID_COLS_COUNT = 4;
  const GRID_ROW_TOPS = [263.5, 754];
  const CARD_SIZE = 410;
  const GRID_GAP = 92;
  const GRID_ROW_STEP = CARD_SIZE + 80.5;
  const GRID_BOTTOM_PAD = 200;
  const FULL_ROW_WIDTH = GRID_COLS_COUNT * CARD_SIZE + (GRID_COLS_COUNT - 1) * GRID_GAP;

  const filterActive = document.getElementById('indexFilterActive');
  const filterGrid = document.getElementById('indexFilterGrid');
  const pagmarCanvas = document.getElementById('pagmarCanvas');

  let activeFilterLabels = [];
  let filterGridResizeRaf = 0;
  let gridLayout = {
    cardSizeU: CARD_SIZE,
    gapU: GRID_GAP,
    stepU: CARD_SIZE + GRID_GAP,
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

  function getIndexU() {
    if (!pagmarCanvas) return 1;
    const rect = pagmarCanvas.getBoundingClientRect();
    const style = getComputedStyle(pagmarCanvas);
    const pagmarW = parseFloat(style.getPropertyValue('--pagmar-w')) || 1920;
    const pagmarH = parseFloat(style.getPropertyValue('--pagmar-h')) || 1080;
    if (!(rect.width > 0 && rect.height > 0)) return 1;
    return Math.min(rect.width / pagmarW, rect.height / pagmarH);
  }

  function measureGridWidthU() {
    if (!filterGrid) return FULL_ROW_WIDTH;
    const widthPx = filterGrid.getBoundingClientRect().width;
    if (!(widthPx > 0)) return FULL_ROW_WIDTH;
    return widthPx / getIndexU();
  }

  function resolveGridMetrics(availableWidthU) {
    const scale = Math.min(1, availableWidthU / FULL_ROW_WIDTH);
    const cardSizeU = CARD_SIZE * scale;
    const gapU = GRID_GAP * scale;
    return {
      cardSizeU: cardSizeU,
      gapU: gapU,
      stepU: cardSizeU + gapU,
    };
  }

  function gridColumnLeft(col, metrics) {
    return col * metrics.stepU;
  }

  function cardPosition(index, metrics) {
    const col = index % GRID_COLS_COUNT;
    const row = Math.floor(index / GRID_COLS_COUNT);
    return {
      left: gridColumnLeft(col, metrics),
      top:
        GRID_ROW_TOPS[row] != null
          ? GRID_ROW_TOPS[row]
          : GRID_ROW_TOPS[GRID_ROW_TOPS.length - 1] +
            (row - GRID_ROW_TOPS.length + 1) * GRID_ROW_STEP,
    };
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

    cards.forEach(function (card, gridIndex) {
      const pos = cardPosition(gridIndex, metrics);
      card.style.left = 'calc(' + pos.left + ' * var(--index-u))';
      card.style.top = 'calc(' + pos.top + ' * var(--index-u))';
      card.style.width = 'calc(' + metrics.cardSizeU + ' * var(--index-u))';
      card.style.height = 'calc(' + metrics.cardSizeU + ' * var(--index-u))';
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

  function gridContentHeight(cardCount) {
    if (cardCount <= 0) return 0;
    const pos = cardPosition(cardCount - 1, gridLayout);
    return pos.top + gridLayout.cardSizeU + GRID_BOTTOM_PAD;
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

    let spacer = filterGrid.querySelector('.pagmar__index-filter-grid-spacer');
    if (cardCount <= 0) {
      if (spacer) spacer.remove();
      filterGrid.scrollTop = 0;
      return;
    }

    if (!spacer) {
      spacer = document.createElement('div');
      spacer.className = 'pagmar__index-filter-grid-spacer';
      spacer.setAttribute('aria-hidden', 'true');
      filterGrid.appendChild(spacer);
    }

    spacer.style.height = 'calc(' + gridContentHeight(cardCount) + ' * var(--index-u))';
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
      tag.setAttribute('aria-label', 'הצג פילטרים נוספים — ' + filterLabel);
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

  function navigateToAmuletDetail(amuletIndex) {
    if (typeof window.pagmarNavigateToAmuletDetail === 'function') {
      window.pagmarNavigateToAmuletDetail(amuletIndex);
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
    var entryId = entryIdForAmuletIndex(amuletIndex);
    var url = 'amulet.html?id=' + encodeURIComponent(amuletIndex);
    if (entryId != null) {
      url += '&entry=' + encodeURIComponent(entryId);
      try {
        sessionStorage.setItem(
          'pagmarAmuletDetailNav',
          JSON.stringify({ index: amuletIndex, entryId: entryId })
        );
      } catch (_) {}
    }
    window.location.href = url;
  }

  function createGridCard(amuletIndex, gridIndex) {
    const metrics = gridLayout;
    const pos = cardPosition(gridIndex, metrics);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pagmar__index-filter-card';
    card.style.left = 'calc(' + pos.left + ' * var(--index-u))';
    card.style.top = 'calc(' + pos.top + ' * var(--index-u))';
    card.style.width = 'calc(' + metrics.cardSizeU + ' * var(--index-u))';
    card.style.height = 'calc(' + metrics.cardSizeU + ' * var(--index-u))';
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

    card.addEventListener('mouseenter', function (e) {
      dispatchAmuletHover({ active: true, label: hoverLabel, x: e.clientX, y: e.clientY });
    });
    card.addEventListener('mousemove', function (e) {
      dispatchAmuletHover({ active: true, label: hoverLabel, x: e.clientX, y: e.clientY });
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
    filterGrid.querySelectorAll('.pagmar__index-filter-card').forEach(function (card) {
      card.remove();
    });
    const spacer = filterGrid.querySelector('.pagmar__index-filter-grid-spacer');
    if (spacer) spacer.remove();

    const indices =
      typeof window.getMatchingAmuletIndices === 'function'
        ? window.getMatchingAmuletIndices(filterLabels)
        : [];

    syncFilterGridFrame();
    gridLayout = resolveGridMetrics(measureGridWidthU());

    indices.forEach(function (amuletIndex, gridIndex) {
      filterGrid.appendChild(createGridCard(amuletIndex, gridIndex));
    });
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
