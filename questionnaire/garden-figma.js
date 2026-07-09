/**
 * Figma 1763:25756 - amulets at exact artboard x/y/w/h + garden interactions.
 */
(function () {
  'use strict';

  const ART_W = 1920;
  const ART_H = 1080;
  const CLICK_DRAG_PX = 8;
  const HOVER_SCALE = 1.05;
  const SELECTED_SCALE = 1.05;
  const GRID_TRAVEL_SCALE = 0.0045;

  /** Figma image 120 / Frame 84+ composition @ 1920×1080 */
  const AMULETS = [
    { tex: 6, x: -245.76953125, y: 601.642578125, w: 603.12890625, h: 603.12890625 },
    { tex: 0, x: 28.0771484375, y: 506.9833984375, w: 398.0166015625, h: 398.0166015625 },
    { tex: 5, x: 460, y: 502.2083740234375, w: 783, h: 783 },
    { tex: 1, x: 380.8310546875, y: 365.0234375, w: 225.443359375, h: 225.443359375 },
    { tex: 2, x: 977.18017578125, y: 350.1875, w: 188.8125, h: 188.8125 },
    { tex: 4, x: 1169.4638671875, y: 346.6214599609375, w: 658.4755859375, h: 658.4755859375 },
  ];

  const USER_AMULET_SLOT = { x: 663.16650390625, y: 650.1572265625, w: 588.7396850585938, h: 588.7396850585938 };

  const mount = document.getElementById('questionGarden');
  const canvas = document.getElementById('pagmarCanvas');
  if (!mount || !canvas) return;

  const field = document.createElement('div');
  field.className = 'pagmar__figma-field';
  field.id = 'amuletField';
  mount.appendChild(field);

  const entries = [];
  let userEntry = null;
  let controlsEnabled = !document.body.classList.contains('is-site-intro-open');
  let dragging = false;
  let pointerDown = null;
  let panX = 0;
  let panY = 0;
  let initialPanSet = false;
  let gridTravel = 0;
  let hoverTex = null;
  let selectedTex = null;

  function unit() {
    return window.innerWidth / ART_W;
  }

  function specIndexLabel(tex) {
    return String(tex + 1).padStart(4, '0');
  }

  function createAmuletEntry(item, isUser) {
    const wrap = document.createElement('button');
    wrap.type = 'button';
    wrap.className = 'pagmar__figma-amulet-wrap';
    if (isUser) wrap.classList.add('pagmar__figma-amulet-wrap--user');
    wrap.dataset.tex = String(item.tex != null ? item.tex : 'user');
    wrap.setAttribute('aria-label', 'קמע ' + (item.tex != null ? specIndexLabel(item.tex) : 'אישי'));

    const img = document.createElement('img');
    img.className = 'pagmar__figma-amulet';
    img.src = item.src || 'assets/garden/amulet-' + item.tex + '.png';
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    if (!isUser) {
      img.addEventListener('error', function () {
        img.src = '/public/amulets/amulet-' + item.tex + '.png';
      });
    }

    const label = document.createElement('span');
    label.className = 'pagmar__figma-amulet-label';
    label.textContent = '[ ' + specIndexLabel(item.tex != null ? item.tex : 0) + ' ]';
    if (isUser) label.hidden = true;

    wrap.appendChild(img);
    wrap.appendChild(label);
    field.appendChild(wrap);

    return { wrap: wrap, img: img, label: label, figma: item, isUser: Boolean(isUser) };
  }

  AMULETS.forEach(function (item) {
    entries.push(createAmuletEntry(item, false));
  });

  function layoutEntry(entry) {
    const u = unit();
    if (!u) return;
    const f = entry.figma;
    entry.wrap.style.left = f.x * u + 'px';
    entry.wrap.style.top = f.y * u + 'px';
    entry.wrap.style.width = f.w * u + 'px';
    entry.wrap.style.height = (f.h + (entry.isUser ? 0 : 49.52)) * u + 'px';
    entry.img.style.width = f.w * u + 'px';
    entry.img.style.height = f.h * u + 'px';
  }

  function layout() {
    const u = unit();
    if (!u) return;
    field.style.width = ART_W * u + 'px';
    field.style.height = ART_H * u + 'px';
    entries.forEach(layoutEntry);
    if (userEntry) layoutEntry(userEntry);
    centerFieldVertically();
    applyPan();
  }

  function centerFieldVertically() {
    if (initialPanSet) return;
    const u = unit();
    if (!u) return;
    const fieldH = ART_H * u;
    const extra = mount.clientHeight - fieldH;
    if (extra > 0) {
      panY = extra * 0.5;
      initialPanSet = true;
    }
  }

  function applyPan() {
    field.style.transform =
      'translate(' + panX + 'px, ' + panY + 'px) scale(' + fieldScale + ')';
    field.style.transformOrigin = '50% 45%';
  }

  let fieldScale = 1;
  const MIN_FIELD_SCALE = 0.72;
  const MAX_FIELD_SCALE = 1.55;
  const WHEEL_ZOOM_SPEED = 0.00115;

  function notifyCameraMove(sync) {
    window.dispatchEvent(
      new CustomEvent('questionnaire:camera-move', {
        detail: { travel: gridTravel, sync: sync || 'pan' },
      })
    );
  }

  function entryTex(entry) {
    if (entry.isUser) return (window.AMULET_QUESTIONS || []).length;
    return entry.figma.tex;
  }

  function getEntryByTex(tex) {
    if (userEntry && tex === entryTex(userEntry)) return userEntry;
    return entries.find(function (entry) {
      return entry.figma.tex === tex;
    }) || null;
  }

  function updateFocusVisuals() {
    entries.forEach(function (entry) {
      const tex = entryTex(entry);
      const isSelected = selectedTex === tex;
      const isHover = hoverTex === tex;
      entry.wrap.classList.toggle('is-selected', isSelected);
      entry.wrap.classList.toggle('is-hover', isHover && !isSelected);
      const scale = isSelected ? SELECTED_SCALE : isHover ? HOVER_SCALE : 1;
      entry.img.style.transform = scale === 1 ? '' : 'scale(' + scale + ')';
    });
    if (userEntry) {
      const tex = entryTex(userEntry);
      const isSelected = selectedTex === tex;
      userEntry.wrap.classList.toggle('is-selected', isSelected);
    }
  }

  function anchorForEntry(entry) {
    const rect = entry.wrap.getBoundingClientRect();
    const halfW = rect.width * 0.38;
    const halfH = entry.img.getBoundingClientRect().height * 0.38;
    return {
      x: rect.left + rect.width * 0.5 - canvas.getBoundingClientRect().left,
      y: rect.top + entry.img.getBoundingClientRect().height * 0.42 - canvas.getBoundingClientRect().top,
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.top + entry.img.getBoundingClientRect().height * 0.42,
      visualHalfW: halfW,
      visualHalfH: halfH,
      halfW: halfW,
      halfH: halfH,
    };
  }

  function pickEntry(clientX, clientY) {
    let best = null;
    let bestArea = Infinity;
    const all = userEntry ? entries.concat([userEntry]) : entries.slice();
    all.forEach(function (entry) {
      const rect = entry.wrap.getBoundingClientRect();
      if (
        clientX < rect.left ||
        clientX > rect.right ||
        clientY < rect.top ||
        clientY > rect.bottom
      ) {
        return;
      }
      const area = rect.width * rect.height;
      if (area < bestArea) {
        bestArea = area;
        best = entry;
      }
    });
    return best;
  }

  function dispatchAmuletClick(entry) {
    const tex = entryTex(entry);
    selectedTex = tex;
    hoverTex = tex;
    updateFocusVisuals();
    window.dispatchEvent(
      new CustomEvent('questionnaire:star-click', {
        detail: {
          anchor: anchorForEntry(entry),
          index: tex,
          tex: entry.isUser ? undefined : entry.figma.tex,
          answers: entry.isUser
            ? (typeof window.gardenLoadUserAmuletAnswers === 'function'
                ? window.gardenLoadUserAmuletAnswers()
                : null)
            : entry.wrap.dataset.answers || null,
        },
      })
    );
  }

  function attachGalleryAnswers(entry) {
    const tex = entry.figma.tex;
    if (typeof window.loadGalleryAmuletAnswers !== 'function') return;
    window.loadGalleryAmuletAnswers(tex).then(function (data) {
      if (data) entry.wrap.dataset.answers = JSON.stringify(data);
    });
  }

  entries.forEach(attachGalleryAnswers);

  mount.addEventListener('pointerdown', function (e) {
    if (!controlsEnabled || e.button !== 0) return;
    if (e.target.closest('.pagmar__figma-amulet-wrap')) return;
    pointerDown = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
    mount.setPointerCapture(e.pointerId);
    mount.classList.add('is-dragging');
  });

  mount.addEventListener('pointermove', function (e) {
    if (controlsEnabled && (!pointerDown || e.buttons !== 1)) {
      const hit = pickEntry(e.clientX, e.clientY);
      hoverTex = hit ? entryTex(hit) : null;
      updateFocusVisuals();
      mount.style.cursor = hit ? 'pointer' : 'grab';
    }

    if (!controlsEnabled || !pointerDown || e.buttons !== 1) return;

    const dx = e.clientX - pointerDown.x;
    const dy = e.clientY - pointerDown.y;
    if (Math.hypot(dx, dy) > CLICK_DRAG_PX) pointerDown.moved = true;

    const deltaX = e.clientX - pointerDown.lastX;
    const deltaY = e.clientY - pointerDown.lastY;
    pointerDown.lastX = e.clientX;
    pointerDown.lastY = e.clientY;
    panX += deltaX;
    panY += deltaY;
    gridTravel -= deltaY * GRID_TRAVEL_SCALE;
    applyPan();
    notifyCameraMove('pan');
  });

  mount.addEventListener('pointerup', function (e) {
    if (!pointerDown) return;
    const moved = pointerDown.moved;
    pointerDown = null;
    mount.classList.remove('is-dragging');
    if (mount.hasPointerCapture(e.pointerId)) mount.releasePointerCapture(e.pointerId);

    if (moved) return;

    const specOpen = document.body.classList.contains('is-spec-panel-open');
    const hit = pickEntry(e.clientX, e.clientY);

    if (specOpen && !hit) {
      window.dispatchEvent(new CustomEvent('questionnaire:close-panel'));
      return;
    }
    if (!hit) return;

    const tex = entryTex(hit);
    if (specOpen && selectedTex === tex) {
      window.dispatchEvent(new CustomEvent('questionnaire:close-panel'));
      return;
    }
    dispatchAmuletClick(hit);
  });

  mount.addEventListener('pointercancel', function () {
    pointerDown = null;
    mount.classList.remove('is-dragging');
  });

  mount.addEventListener('pointerleave', function () {
    hoverTex = null;
    updateFocusVisuals();
    if (controlsEnabled) mount.style.cursor = 'grab';
  });

  function handleGardenWheel(e) {
    if (!controlsEnabled) return;
    if (e.target && e.target.closest && e.target.closest('.pagmar__index-filter-sidebar')) return;
    e.preventDefault();
    const factor = 1 - e.deltaY * WHEEL_ZOOM_SPEED;
    fieldScale = Math.min(MAX_FIELD_SCALE, Math.max(MIN_FIELD_SCALE, fieldScale * factor));
    gridTravel -= e.deltaY * GRID_TRAVEL_SCALE * 1.6;
    applyPan();
    notifyCameraMove('wheel');
  }

  mount.addEventListener('wheel', handleGardenWheel, { passive: false });
  window.addEventListener('wheel', handleGardenWheel, { passive: false, capture: true });

  entries.forEach(function (entry) {
    entry.wrap.addEventListener('click', function (e) {
      e.stopPropagation();
      if (document.body.classList.contains('is-site-intro-open')) return;
      const specOpen = document.body.classList.contains('is-spec-panel-open');
      const tex = entryTex(entry);
      if (specOpen && selectedTex === tex) {
        window.dispatchEvent(new CustomEvent('questionnaire:close-panel'));
        return;
      }
      dispatchAmuletClick(entry);
    });
  });

  window.addEventListener('questionnaire:panel-open', function () {
    controlsEnabled = false;
    hoverTex = null;
    updateFocusVisuals();
    mount.style.cursor = 'default';
  });

  window.addEventListener('questionnaire:panel-close', function () {
    if (!document.body.classList.contains('is-site-intro-open')) {
      controlsEnabled = true;
      mount.style.cursor = 'grab';
    }
    selectedTex = null;
    updateFocusVisuals();
  });

  window.addEventListener('questionnaire:intro-open', function () {
    controlsEnabled = false;
  });

  window.addEventListener('questionnaire:intro-close', function () {
    controlsEnabled = true;
    mount.style.cursor = 'grab';
  });

  function readStoredItem(key) {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  }

  function writeStoredItem(key, value) {
    sessionStorage.setItem(key, value);
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn('[garden-figma] storage mirror failed', err);
    }
  }

  function hasUserAmuletSnapshot() {
    return Boolean(readStoredItem('amuletUserSnapshot'));
  }

  function loadUserAmuletAnswers() {
    try {
      const raw = readStoredItem('amuletUserAnswers');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function addUserAmuletFromCanvas(sourceCanvas, options) {
    if (!sourceCanvas?.width) return null;
    if (userEntry) {
      userEntry.wrap.remove();
      userEntry = null;
    }
    try {
      writeStoredItem('amuletUserSnapshot', sourceCanvas.toDataURL('image/png'));
      if (options?.answers) {
        writeStoredItem('amuletUserAnswers', JSON.stringify(options.answers));
      }
    } catch (err) {
      console.warn('[garden-figma] failed to persist user amulet', err);
    }

    userEntry = createAmuletEntry(
      Object.assign({}, USER_AMULET_SLOT, {
        tex: null,
        src: sourceCanvas.toDataURL('image/png'),
      }),
      true
    );
    layoutEntry(userEntry);
    return userEntry;
  }

  function restoreUserAmulet() {
    const dataUrl = readStoredItem('amuletUserSnapshot');
    if (!dataUrl) return;
    const img = new Image();
    img.onload = function () {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      addUserAmuletFromCanvas(c, { restore: true, answers: loadUserAmuletAnswers() });
      document.body.classList.add('has-user-amulet');
    };
    img.src = dataUrl;
  }

  window.gardenAddUserAmulet = addUserAmuletFromCanvas;
  window.gardenCapturePlacementAnchor = function () {};
  window.gardenFocusUserAmulet = function () { return false; };
  window.gardenPersistUserAmuletSnapshot = function () {};
  window.gardenPersistUserAmuletAnswers = function (answers) {
    if (answers) writeStoredItem('amuletUserAnswers', JSON.stringify(answers));
  };
  window.gardenLoadUserAmuletAnswers = loadUserAmuletAnswers;
  window.gardenHasUserAmuletSnapshot = hasUserAmuletSnapshot;
  window.gardenAnchorForTex = function (texIndex) {
    const entry = getEntryByTex(texIndex);
    return entry ? anchorForEntry(entry) : null;
  };
  window.gardenAnchorForUserAmulet = function () {
    return userEntry ? anchorForEntry(userEntry) : null;
  };
  window.gardenClearUserAmulet = function () {
    if (userEntry) {
      userEntry.wrap.remove();
      userEntry = null;
    }
  };

  window.questionnaireStar = {
    getAnchorCanvasPoint: function () {
      return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
    },
    pauseFloat: function () {},
    resumeFloat: function () {},
    placeAtCenter: function () {},
  };

  layout();
  restoreUserAmulet();
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) {
    new ResizeObserver(layout).observe(canvas);
  }
})();
