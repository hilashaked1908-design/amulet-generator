(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  const HEB_GRID_CELLS = [
    { letter: 'ח', ml: 0, mt: 0 },
    { letter: 'ז', ml: 71.53, mt: 0 },
    { letter: 'ו', ml: 143.05, mt: 0 },
    { letter: 'ה', ml: 214.58, mt: 0 },
    { letter: 'ד', ml: 286.1, mt: 0 },
    { letter: 'ג', ml: 357.63, mt: 0 },
    { letter: 'ב', ml: 429.15, mt: 0 },
    { letter: 'א', ml: 500.68, mt: 0 },
    { letter: 'ע', ml: 0, mt: 71.52 },
    { letter: 'ס', ml: 71.52, mt: 71.52 },
    { letter: 'נ', ml: 143.05, mt: 71.52 },
    { letter: 'מ', ml: 214.57, mt: 71.52 },
    { letter: 'ל', ml: 286.1, mt: 71.52 },
    { letter: 'כ', ml: 357.63, mt: 71.52 },
    { letter: 'י', ml: 429.15, mt: 71.52 },
    { letter: 'ט', ml: 500.67, mt: 71.52 },
    { letter: 'ת', ml: 143.39, mt: 143.05 },
    { letter: 'ש', ml: 214.92, mt: 143.05 },
    { letter: 'ר', ml: 286.44, mt: 143.05 },
    { letter: 'ק', ml: 357.97, mt: 143.05 },
    { letter: 'צ', ml: 429.49, mt: 143.05 },
    { letter: 'פ', ml: 501.02, mt: 143.05 }
  ];
  const GLYPHS_DIR = '../glyphs';
  const PANEL_W = 880;
  const PANEL_H = 924;
  const CANVAS_W = 820;
  const CANVAS_H = 820;
  const PANEL_PAD_X = (PANEL_W - CANVAS_W) / 2;
  const PANEL_PAD_Y = (PANEL_H - CANVAS_H) / 2;
  const INTENT = 'protection';
  const STROKE_W = 4;
  const GLYPH_SCALE = 1.42;
  const CANVAS_PAD = 24;

  let connections = [];
  let glyphCache = {};
  let parsedCache = {};
  let selected = [];
  let ready = false;
  let renderToken = 0;

  function glyphFilename(letter) {
    return letter === 'א' ? 'א1.svg' : letter + '2.svg';
  }

  function sanitizePathsInner(html) {
    if (!html) return '';
    try {
      const doc = new DOMParser().parseFromString(
        '<svg xmlns="http://www.w3.org/2000/svg"><g id="root">' + html + '</g></svg>',
        'image/svg+xml'
      );
      if (doc.querySelector('parsererror')) return html;
      doc.querySelectorAll('path,circle,ellipse,line,polyline,polygon').forEach((el) => {
        el.setAttribute('fill', 'none');
        el.removeAttribute('stroke');
        el.removeAttribute('stroke-width');
      });
      const root = doc.getElementById('root');
      return root ? root.innerHTML : html;
    } catch (_) {
      return html;
    }
  }

  async function loadConnections() {
    if (connections.length) return;
    try {
      const api = await fetch('/api/connections');
      if (api.ok) {
        const data = await api.json();
        connections = data.connections || [];
        return;
      }
    } catch (_) { /* fallback */ }
    const res = await fetch('../connections.json');
    if (!res.ok) throw new Error('connections.json לא נטען');
    const data = await res.json();
    connections = data.connections || [];
  }

  async function loadGlyphSvg(letter) {
    if (glyphCache[letter]) return glyphCache[letter];
    const url = GLYPHS_DIR + '/' + encodeURIComponent(glyphFilename(letter));
    const res = await fetch(url);
    if (!res.ok) throw new Error('חסר SVG: ' + letter);
    glyphCache[letter] = await res.text();
    return glyphCache[letter];
  }

  async function getParsedGlyph(letter) {
    if (parsedCache[letter]) return parsedCache[letter];
    const clean = (await loadGlyphSvg(letter))
      .trim()
      .replace(/^<\?xml[^>]*>\s*/i, '')
      .replace(/^<!DOCTYPE[^>]*>\s*/i, '');
    const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
    const el = doc.querySelector('svg');
    if (!el) throw new Error('אין svg: ' + letter);
    const vb = el.getAttribute('viewBox') || '0 0 100 100';
    const vbp = vb.trim().split(/[\s,]+/).map(Number);
    parsedCache[letter] = {
      inner: sanitizePathsInner(el.innerHTML),
      vw: vbp[2] || 100,
      vh: vbp[3] || 100
    };
    return parsedCache[letter];
  }

  function placementsForPair(a, b) {
    const CC = window.ConnectionCore;
    const conn = CC.findConnectionBetweenWithFallback(connections, a, b, INTENT);
    if (!conn) return null;
    return [
      CC.placementFromGlyph(conn.from, conn.fromGlyph),
      CC.placementFromGlyph(conn.to, conn.toGlyph)
    ];
  }

  function connectionStrokeAttrs() {
    return (
      'fill="none" stroke="#1E1E1E" stroke-width="' +
      STROKE_W +
      '" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"'
    );
  }

  function measureDrawBBox(drawContent) {
    const vb = '0 0 ' + CANVAS_W + ' ' + CANVAS_H;
    const doc = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' +
        vb +
        '"><g id="measure-root" ' +
        connectionStrokeAttrs() +
        '>' +
        drawContent +
        '</g></svg>',
      'image/svg+xml'
    );
    if (doc.querySelector('parsererror')) {
      return { cx: CANVAS_W / 2, cy: CANVAS_H / 2, width: 0, height: 0 };
    }
    const svg = doc.documentElement;
    svg.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
    document.body.appendChild(svg);
    let bb;
    try {
      const root = svg.querySelector('#measure-root');
      bb = root ? root.getBBox() : { x: 0, y: 0, width: 0, height: 0 };
    } catch (_) {
      bb = { x: 0, y: 0, width: 0, height: 0 };
    }
    document.body.removeChild(svg);
    return {
      cx: bb.x + bb.width / 2,
      cy: bb.y + bb.height / 2,
      width: bb.width,
      height: bb.height
    };
  }

  function centerDrawInCanvas(drawContent) {
    const bb = measureDrawBBox(drawContent);
    const targetCx = CANVAS_W / 2;
    const targetCy = CANVAS_H / 2;
    const availW = CANVAS_W - CANVAS_PAD * 2;
    const availH = CANVAS_H - CANVAS_PAD * 2;
    const scale =
      bb.width > 0 && bb.height > 0
        ? Math.min(1, availW / bb.width, availH / bb.height)
        : 1;

    if (
      Math.abs(bb.cx - targetCx) < 0.01 &&
      Math.abs(bb.cy - targetCy) < 0.01 &&
      Math.abs(scale - 1) < 0.0001
    ) {
      return drawContent;
    }

    return (
      '<g transform="translate(' +
      targetCx.toFixed(2) +
      ',' +
      targetCy.toFixed(2) +
      ') scale(' +
      scale.toFixed(4) +
      ') translate(' +
      (-bb.cx).toFixed(2) +
      ',' +
      (-bb.cy).toFixed(2) +
      ')">' +
      drawContent +
      '</g>'
    );
  }

  function scalePlacements(placements, factor) {
    return placements.map((p) => ({
      ...p,
      sz: p.sz * factor
    }));
  }

  function glyphPathsMarkup(placement, glyph) {
    const fx = placement.flipX ? -1 : 1;
    const fy = placement.flipY ? -1 : 1;
    const half = placement.sz / 2;
    const rot = Number(placement.rotation) || 0;
    const scaleX = ((placement.sz / glyph.vw) * fx).toFixed(4);
    const scaleY = ((placement.sz / glyph.vh) * fy).toFixed(4);
    return (
      '<g class="about-glyph about-glyph-' +
      placement.letter +
      '">' +
      '<g transform="translate(' +
      placement.x.toFixed(2) +
      ',' +
      placement.y.toFixed(2) +
      ') rotate(' +
      rot.toFixed(2) +
      ') translate(' +
      (-half).toFixed(2) +
      ',' +
      (-half).toFixed(2) +
      ') scale(' +
      scaleX +
      ',' +
      scaleY +
      ')">' +
      glyph.inner +
      '</g></g>'
    );
  }

  function wrapSymmetric(content) {
    return (
      '<g class="about-symmetric">' +
      '<g class="about-half about-original">' +
      content +
      '</g>' +
      '<g class="about-half about-mirror" transform="translate(' +
      CANVAS_W +
      ',0) scale(-1,1)">' +
      content +
      '</g>' +
      '</g>'
    );
  }

  async function buildConnectionMarkup(letterA, letterB) {
    const placements = placementsForPair(letterA, letterB);
    if (!placements) return null;

    const scaled = scalePlacements(placements, GLYPH_SCALE);
    const glyphs = await Promise.all(scaled.map((p) => getParsedGlyph(p.letter)));
    const paths = scaled.map((p, i) => glyphPathsMarkup(p, glyphs[i])).join('');
    const centeredDraw = centerDrawInCanvas(wrapSymmetric(paths));

    return {
      viewBox: '0 0 ' + PANEL_W + ' ' + PANEL_H,
      inner:
        '<rect width="' +
        PANEL_W +
        '" height="' +
        PANEL_H +
        '" fill="#F4F4E8"/>' +
        '<g transform="translate(' +
        PANEL_PAD_X +
        ',' +
        PANEL_PAD_Y +
        ')">' +
        '<g class="about-connection-draw" ' +
        connectionStrokeAttrs() +
        '>' +
        centeredDraw +
        '</g></g>'
    };
  }

  function setPanelMode(host, mode) {
    host.classList.remove('is-default', 'is-live', 'has-connection');
    host.classList.add('is-' + mode);
    if (mode === 'live') host.classList.add('has-connection');
  }

  async function renderPreview(letterA, letterB, animate) {
    const host = document.getElementById('aboutConnectionPreview');
    if (!host) return;

    const token = ++renderToken;
    const svgEl = host.querySelector('.pagmar__about-connection-svg');

    if (!letterA || !letterB) {
      if (svgEl) {
        svgEl.innerHTML = '';
        svgEl.setAttribute('viewBox', '0 0 ' + PANEL_W + ' ' + PANEL_H);
      }
      setPanelMode(host, 'default');
      return;
    }

    const built = await buildConnectionMarkup(letterA, letterB);
    if (token !== renderToken) return;

    if (!built) {
      if (svgEl) svgEl.innerHTML = '';
      setPanelMode(host, 'default');
      return;
    }

    setPanelMode(host, 'live');

    if (!svgEl) return;

    if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      host.classList.add('is-swapping');
      await new Promise((r) => setTimeout(r, 140));
      if (token !== renderToken) return;
    }

    svgEl.setAttribute('viewBox', built.viewBox);
    svgEl.innerHTML = built.inner;

    if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      requestAnimationFrame(function () {
        host.classList.remove('is-swapping');
        const draw = svgEl.querySelector('.about-connection-draw');
        if (draw) draw.classList.add('is-drawn');
      });
    } else {
      const draw = svgEl.querySelector('.about-connection-draw');
      if (draw) draw.classList.add('is-drawn');
    }
  }

  function updateCellStates() {
    const grid = document.getElementById('aboutLetterGrid');
    if (!grid) return;
    grid.querySelectorAll('.pagmar__about-letter-cell').forEach((cell) => {
      const letter = cell.dataset.letter;
      const isSelected = selected.includes(letter);
      cell.classList.toggle('is-selected', isSelected);
      cell.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    });
  }

  function onLetterClick(letter) {
    if (!letter) return;

    const idx = selected.indexOf(letter);
    if (idx !== -1) {
      selected.splice(idx, 1);
    } else if (selected.length < 2) {
      selected.push(letter);
    } else {
      selected.shift();
      selected.push(letter);
    }

    updateCellStates();

    if (selected.length === 2) {
      renderPreview(selected[0], selected[1], true);
    } else {
      renderPreview(null, null, false);
    }
  }

  function buildGrid() {
    const grid = document.getElementById('aboutLetterGrid');
    if (!grid || grid.childElementCount) return;

    HEB_GRID_CELLS.forEach(({ letter, ml, mt }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pagmar__about-letter-cell';
      btn.dataset.letter = letter;
      btn.style.setProperty('--cell-ml', String(ml));
      btn.style.setProperty('--cell-mt', String(mt));
      btn.setAttribute('aria-pressed', 'false');
      btn.setAttribute('aria-label', 'אות ' + letter);
      btn.innerHTML = '<span class="pagmar__about-letter-glyph" dir="rtl" aria-hidden="true">' + letter + '</span>';
      btn.addEventListener('click', function () {
        onLetterClick(letter);
      });
      grid.appendChild(btn);
    });
  }

  async function ensureReady() {
    if (ready) return;
    if (!window.ConnectionCore) throw new Error('connection-core.js לא נטען');
    await loadConnections();
    buildGrid();
    ready = true;
    await renderPreview(null, null, false);
  }

  window.addEventListener('questionnaire:about-closed', function () {
    selected = [];
    updateCellStates();
    renderPreview(null, null, false);
  });

  window.addEventListener('questionnaire:about-opened', function () {
    ensureReady().catch(function (err) {
      console.error('[about-letters]', err);
    });
  });

  if (document.getElementById('aboutOverlay') && !document.getElementById('aboutOverlay').hidden) {
    ensureReady().catch(function (err) {
      console.error('[about-letters]', err);
    });
  }
})();
