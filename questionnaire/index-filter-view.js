/**
 * Filter page (עמוד פילטר) — Figma 2295:28985 filtered amulet grid.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  const GRID_COLS = [
    50.56005859375,
    516.56005859375,
    983.1201171875,
    1449.679931640625,
  ];
  const GRID_ROW_TOPS = [263.5, 754];
  const CARD_SIZE = 410;
  const GRID_BOTTOM_PAD = 200;

  const filterActive = document.getElementById('indexFilterActive');
  const filterGrid = document.getElementById('indexFilterGrid');
  const pagmarCanvas = document.getElementById('pagmarCanvas');

  let activeFilterLabels = [];
  let filterGridResizeRaf = 0;

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

  function cardPosition(index) {
    const col = index % GRID_COLS.length;
    const row = Math.floor(index / GRID_COLS.length);
    return {
      left: GRID_COLS[col],
      top:
        GRID_ROW_TOPS[row] != null
          ? GRID_ROW_TOPS[row]
          : GRID_ROW_TOPS[GRID_ROW_TOPS.length - 1] +
            (row - GRID_ROW_TOPS.length + 1) * (CARD_SIZE + 80.5),
    };
  }

  function gridContentHeight(cardCount) {
    if (cardCount <= 0) return 0;
    const pos = cardPosition(cardCount - 1);
    return pos.top + CARD_SIZE + GRID_BOTTOM_PAD;
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
    window.location.href = 'amulet.html?id=' + encodeURIComponent(amuletIndex);
  }

  function createGridCard(amuletIndex, gridIndex) {
    const pos = cardPosition(gridIndex);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pagmar__index-filter-card';
    card.style.left = 'calc(' + pos.left + ' * var(--index-u))';
    card.style.top = 'calc(' + pos.top + ' * var(--index-u))';
    card.style.width = 'calc(' + CARD_SIZE + ' * var(--index-u))';
    card.style.height = 'calc(' + CARD_SIZE + ' * var(--index-u))';
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

    const label = document.createElement('span');
    label.className = 'pagmar__index-filter-card-label';
    label.textContent = '[' + specIndexLabel(amuletIndex) + ']';
    card.appendChild(label);

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

    indices.forEach(function (amuletIndex, gridIndex) {
      filterGrid.appendChild(createGridCard(amuletIndex, gridIndex));
    });
    updateFilterGridScrollHeight(indices.length);
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
    cancelAnimationFrame(filterGridResizeRaf);
    filterGridResizeRaf = requestAnimationFrame(syncFilterGridFrame);
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
