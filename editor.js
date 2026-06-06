/* Glyph connection editor */

const CX = 340;
const CY = 340;
const GLYPH_SIZE = 150;
const SYMBOL_SIZE = 64;
/** Normalized path stroke in glyph viewBox units (matches א1.svg, ב2.svg, etc.) */
const GLYPH_PATH_STROKE_WIDTH = 46;

const BUILTIN_SYMBOLS = {
  circle: { label: 'עיגול', viewBox: '0 0 100 100' },
  triangle: { label: 'משולש', viewBox: '0 0 100 100' },
  arc: { label: 'קשת', viewBox: '0 0 100 100' },
  dot: { label: 'עיגול קטן', viewBox: '0 0 100 100' }
};

const FILL_MODES = ['stroke', 'fill', 'both'];

let glyphFiles = [];
const svgCache = {};

let fromLetter = 'א';
let toLetter = 'ב';
let intent = 'protection';

const glyphA = { x: CX, y: CY, rot: 0, scale: 1, flipX: false, flipY: false };
const glyphB = { x: CX + 90, y: CY, rot: 0, scale: 1, flipX: false, flipY: false };
let baseSize = GLYPH_SIZE;

/** @type {object[]} */
let symbols = [];
let nextSymbolId = 1;
let selectedSymbolId = null;

let drag = null;

function defaultSymbolProps() {
  return {
    strokeWidth: 2,
    fillMode: 'stroke',
    triangleRatio: 1,
    arcAngle: 180
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function normalizeSymbolFromApi(s) {
  const props = defaultSymbolProps();
  const scale = s.scale > 0 ? s.scale : 1;
  return {
    id: 's' + nextSymbolId++,
    type: s.type,
    x: s.x,
    y: s.y,
    rot: s.rotation || 0,
    scale: 1,
    size: (s.size || SYMBOL_SIZE) / scale,
    flipX: !!s.flipX,
    flipY: !!s.flipY,
    strokeWidth: clamp(s.strokeWidth != null ? s.strokeWidth : props.strokeWidth, 1, 10),
    fillMode: FILL_MODES.includes(s.fillMode) ? s.fillMode : props.fillMode,
    triangleRatio: clamp(s.triangleRatio != null ? s.triangleRatio : props.triangleRatio, 0.5, 2),
    arcAngle: clamp(s.arcAngle != null ? s.arcAngle : props.arcAngle, 30, 330)
  };
}

/** Arc opening angle in degrees (30–330), symmetric above center */
function buildArcPath(cx, cy, r, spanDeg) {
  const span = clamp(spanDeg, 30, 330);
  const half = (span / 2) * (Math.PI / 180);
  const x1 = cx + r * Math.cos(Math.PI + half);
  const y1 = cy + r * Math.sin(Math.PI + half);
  const x2 = cx + r * Math.cos(Math.PI - half);
  const y2 = cy + r * Math.sin(Math.PI - half);
  const large = span > 180 ? 1 : 0;
  return (
    'M' +
    x1.toFixed(2) +
    ' ' +
    y1.toFixed(2) +
    ' A' +
    r +
    ' ' +
    r +
    ' 0 ' +
    large +
    ' 1 ' +
    x2.toFixed(2) +
    ' ' +
    y2.toFixed(2)
  );
}

function buildSymbolInner(sym) {
  const t = sym.type;
  if (t === 'circle') {
    return '<circle cx="50" cy="50" r="40"/>';
  }
  if (t === 'dot') {
    return '<circle cx="50" cy="50" r="14"/>';
  }
  if (t === 'triangle') {
    const ratio = clamp(sym.triangleRatio || 1, 0.5, 2);
    return (
      '<g transform="translate(50 50) scale(' +
      ratio.toFixed(3) +
      ' 1) translate(-50 -50)">' +
      '<path d="M50 12 L88 88 L12 88 Z"/>' +
      '</g>'
    );
  }
  if (t === 'arc') {
    return '<path d="' + buildArcPath(50, 52, 38, sym.arcAngle || 180) + '"/>';
  }
  return '';
}

function $(id) {
  return document.getElementById(id);
}

function setStatus(msg, isError) {
  const bar = $('statusbar');
  if (!bar) return;
  bar.textContent = msg;
  bar.className = isError ? 'err' : msg.indexOf('✓') === 0 ? 'ok' : '';
  bar.style.display = msg ? 'block' : 'none';
}

function letterFromFile(name) {
  return name.replace(/\d+\.svg$/i, '');
}

function fileForLetter(letter) {
  const hit = glyphFiles.find((f) => letterFromFile(f) === letter);
  if (hit) return hit;
  return letter === 'א' ? 'א1.svg' : letter + '2.svg';
}

async function fetchGlyphList() {
  const res = await fetch('/api/glyphs');
  if (!res.ok) throw new Error('/api/glyphs → HTTP ' + res.status);
  const data = await res.json();
  glyphFiles = data.files || [];
  if (!glyphFiles.length) throw new Error('/api/glyphs → empty file list');
}

function fillDropdowns() {
  const letters = [...new Set(glyphFiles.map(letterFromFile))].sort((a, b) =>
    a.localeCompare(b, 'he')
  );
  const selFrom = $('selFrom');
  const selTo = $('selTo');
  selFrom.innerHTML = '';
  selTo.innerHTML = '';
  letters.forEach((ch) => {
    const label = ch + ' — ' + fileForLetter(ch);
    selFrom.appendChild(new Option(label, ch));
    selTo.appendChild(new Option(label, ch));
  });
  selFrom.value = letters.includes(fromLetter) ? fromLetter : letters[0];
  selTo.value = letters.includes(toLetter) ? toLetter : letters[1] || letters[0];
  fromLetter = selFrom.value;
  toLetter = selTo.value;
}

function buildSymbolPalette() {
  const palette = $('symbolPalette');
  palette.innerHTML = '';
  Object.entries(BUILTIN_SYMBOLS).forEach(([type, def]) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn symbol-add-btn';
    btn.textContent = def.label;
    btn.dataset.type = type;
    btn.addEventListener('click', () => addSymbol(type));
    palette.appendChild(btn);
  });
}

function addSymbol(type) {
  const n = symbols.length;
  const id = 's' + nextSymbolId++;
  symbols.push({
    id,
    type,
    x: CX + (n % 3) * 36 - 36,
    y: CY + 80 + Math.floor(n / 3) * 28,
    rot: 0,
    scale: 1,
    size: SYMBOL_SIZE,
    flipX: false,
    flipY: false,
    ...defaultSymbolProps()
  });
  selectedSymbolId = id;
  drawCanvas().catch((err) => setStatus(String(err.message), true));
}

function removeSymbol(id) {
  symbols = symbols.filter((s) => s.id !== id);
  if (selectedSymbolId === id) selectedSymbolId = symbols.length ? symbols[symbols.length - 1].id : null;
  drawCanvas().catch((err) => setStatus(String(err.message), true));
}

function updateSymbolList() {
  const container = $('symbolList');
  container.innerHTML = '';
  symbols.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'symbol-card';
    if (s.id === selectedSymbolId) card.classList.add('active');

    const head = document.createElement('div');
    head.className = 'symbol-card-head';
    const title = document.createElement('span');
    title.textContent = (BUILTIN_SYMBOLS[s.type]?.label || s.type) + ' @ ' + Math.round(s.x) + ',' + Math.round(s.y);
    head.appendChild(title);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn symbol-del-btn';
    del.textContent = '×';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      removeSymbol(s.id);
    });
    head.appendChild(del);
    card.appendChild(head);

    card.addEventListener('click', () => {
      selectedSymbolId = s.id;
      updateSymbolList();
      drawCanvas().catch(() => {});
    });

    const controls = document.createElement('div');
    controls.className = 'symbol-card-controls';

    const swRow = document.createElement('div');
    swRow.className = 'sl-row';
    swRow.innerHTML =
      '<label>עובי קו: <b class="sym-sw-val">' + s.strokeWidth + '</b>px</label>';
    const swIn = document.createElement('input');
    swIn.type = 'range';
    swIn.min = '1';
    swIn.max = '10';
    swIn.step = '0.5';
    swIn.value = String(s.strokeWidth);
    swIn.addEventListener('input', (e) => {
      e.stopPropagation();
      const v = clamp(parseFloat(e.target.value), 1, 10);
      s.strokeWidth = v;
      swRow.querySelector('.sym-sw-val').textContent = v;
      drawCanvas().catch((err) => setStatus(String(err.message), true));
    });
    swRow.appendChild(swIn);
    controls.appendChild(swRow);

    const fillRow = document.createElement('div');
    fillRow.className = 'fill-mode-row';
    [
      { mode: 'stroke', label: 'קו' },
      { mode: 'fill', label: 'מילוי' },
      { mode: 'both', label: 'שניהם' }
    ].forEach(({ mode, label }) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn fill-mode-btn' + (s.fillMode === mode ? ' active' : '');
      btn.textContent = label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        s.fillMode = mode;
        updateSymbolList();
        drawCanvas().catch((err) => setStatus(String(err.message), true));
      });
      fillRow.appendChild(btn);
    });
    controls.appendChild(fillRow);

    const sizeRow = document.createElement('div');
    sizeRow.className = 'sl-row';
    sizeRow.innerHTML = '<label>גודל: <b class="sym-sz-val">' + Math.round(s.size) + '</b>px</label>';
    const szIn = document.createElement('input');
    szIn.type = 'range';
    szIn.min = '24';
    szIn.max = '160';
    szIn.step = '2';
    szIn.value = String(Math.round(s.size));
    szIn.addEventListener('input', (e) => {
      e.stopPropagation();
      s.size = Number(e.target.value);
      sizeRow.querySelector('.sym-sz-val').textContent = Math.round(s.size);
      drawCanvas().catch((err) => setStatus(String(err.message), true));
    });
    sizeRow.appendChild(szIn);
    controls.appendChild(sizeRow);

    if (s.type === 'triangle') {
      const triRow = document.createElement('div');
      triRow.className = 'sl-row';
      triRow.innerHTML =
        '<label>יחס רוחב/גובה: <b class="sym-tri-val">' + s.triangleRatio.toFixed(2) + '</b></label>';
      const triIn = document.createElement('input');
      triIn.type = 'range';
      triIn.min = '50';
      triIn.max = '200';
      triIn.step = '5';
      triIn.value = String(Math.round(s.triangleRatio * 100));
      triIn.addEventListener('input', (e) => {
        e.stopPropagation();
        s.triangleRatio = clamp(Number(e.target.value) / 100, 0.5, 2);
        triRow.querySelector('.sym-tri-val').textContent = s.triangleRatio.toFixed(2);
        drawCanvas().catch((err) => setStatus(String(err.message), true));
      });
      triRow.appendChild(triIn);
      controls.appendChild(triRow);
    }

    if (s.type === 'arc') {
      const arcRow = document.createElement('div');
      arcRow.className = 'sl-row';
      arcRow.innerHTML =
        '<label>זווית קשת: <b class="sym-arc-val">' + Math.round(s.arcAngle) + '</b>°</label>';
      const arcIn = document.createElement('input');
      arcIn.type = 'range';
      arcIn.min = '30';
      arcIn.max = '330';
      arcIn.step = '5';
      arcIn.value = String(Math.round(s.arcAngle));
      arcIn.addEventListener('input', (e) => {
        e.stopPropagation();
        s.arcAngle = clamp(Number(e.target.value), 30, 330);
        arcRow.querySelector('.sym-arc-val').textContent = Math.round(s.arcAngle);
        drawCanvas().catch((err) => setStatus(String(err.message), true));
      });
      arcRow.appendChild(arcIn);
      controls.appendChild(arcRow);
    }

    card.appendChild(controls);
    container.appendChild(card);
  });
}

async function fetchSvgText(filename) {
  if (svgCache[filename]) return svgCache[filename];
  const url = 'glyphs/' + encodeURIComponent(filename);
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' → HTTP ' + res.status);
  const text = await res.text();
  svgCache[filename] = text;
  return text;
}

/** Nested SVG with preserveAspectRatio so glyphs are not stretched */
function shapedMarkup(opts) {
  const {
    x,
    y,
    rot,
    size,
    stroke,
    viewBox,
    inner,
    flipX,
    flipY,
    className,
    role,
    hitR
  } = opts;
  const vb = viewBox.trim().split(/[\s,]+/).map(Number);
  const vw = vb[2] || 100;
  const vh = vb[3] || 100;
  const strokeW = GLYPH_PATH_STROKE_WIDTH;
  const fx = flipX ? -1 : 1;
  const fy = flipY ? -1 : 1;
  const half = size / 2;

  return (
    '<g class="' +
    className +
    '" data-role="' +
    role +
    '">' +
    '<circle class="hit-area" cx="' +
    x +
    '" cy="' +
    y +
    '" r="' +
    hitR +
    '"/>' +
    '<g transform="translate(' +
    x.toFixed(2) +
    ',' +
    y.toFixed(2) +
    ') rotate(' +
    rot.toFixed(2) +
    ') scale(' +
    fx +
    ',' +
    fy +
    ') translate(' +
    (-half).toFixed(2) +
    ',' +
    (-half).toFixed(2) +
    ')" pointer-events="none">' +
    '<svg width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 ' +
    vw +
    ' ' +
    vh +
    '" preserveAspectRatio="xMidYMid meet" overflow="visible">' +
    '<g fill="none" stroke="' +
    stroke +
    '" stroke-width="' +
    strokeW +
    '" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round">' +
    inner +
    '</g></svg></g></g>'
  );
}

/** Normalize path stroke-width; stroke color comes from the wrapper group. */
function sanitizeGlyphInner(html) {
  if (!html) return '';
  const sw = String(GLYPH_PATH_STROKE_WIDTH);
  try {
    const doc = new DOMParser().parseFromString(
      '<svg xmlns="http://www.w3.org/2000/svg"><g id="root">' + html + '</g></svg>',
      'image/svg+xml'
    );
    if (doc.querySelector('parsererror')) return html;
    doc.querySelectorAll('path,circle,ellipse,line,polyline,polygon').forEach((el) => {
      el.setAttribute('fill', 'none');
      el.removeAttribute('stroke');
      el.setAttribute('stroke-width', sw);
      el.removeAttribute('stroke-linecap');
      el.removeAttribute('stroke-linejoin');
      el.removeAttribute('stroke-opacity');
      if (el.hasAttribute('style')) {
        const s = el
          .getAttribute('style')
          .replace(/fill\s*:\s*[^;]+;?/gi, 'fill:none;')
          .replace(/stroke\s*:\s*[^;]+;?/gi, '')
          .replace(/stroke-width\s*:\s*[^;]+;?/gi, 'stroke-width:' + sw + ';');
        el.setAttribute('style', s);
      }
    });
    const root = doc.getElementById('root');
    return root ? root.innerHTML : html;
  } catch (_) {
    return html
      .replace(/\sstroke\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\sstroke-width\s*=\s*["'][^"']*["']/gi, ' stroke-width="' + sw + '"')
      .replace(/fill\s*=\s*["'](?!none)[^"']*["']/gi, 'fill="none"');
  }
}

function glyphSvgMarkup(svgText, x, y, rot, size, stroke, role, flipX, flipY) {
  const clean = svgText
    .trim()
    .replace(/^<\?xml[^>]*>\s*/i, '')
    .replace(/^<!DOCTYPE[^>]*>\s*/i, '');
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  const root = doc.querySelector('svg');
  if (!root) throw new Error('invalid SVG');

  const viewBox = root.getAttribute('viewBox') || '0 0 100 100';
  const inner = sanitizeGlyphInner(root.innerHTML);

  return shapedMarkup({
    x,
    y,
    rot,
    size,
    stroke,
    viewBox,
    inner,
    flipX,
    flipY,
    className: 'glyph-' + role,
    role,
    hitR: Math.max(size / 2, 40)
  });
}

function symbolSvgMarkup(sym) {
  const def = BUILTIN_SYMBOLS[sym.type];
  if (!def) return '';
  const size = sym.size * sym.scale;
  const inner = buildSymbolInner(sym);
  const mode = sym.fillMode || 'stroke';
  const color = '#000';
  const fill = mode === 'stroke' ? 'none' : color;
  const stroke = mode === 'fill' ? 'none' : color;
  const sw = clamp(sym.strokeWidth || 2, 1, 10);
  const vb = def.viewBox.trim().split(/[\s,]+/).map(Number);
  const vw = vb[2] || 100;
  const vh = vb[3] || 100;
  const fx = sym.flipX ? -1 : 1;
  const fy = sym.flipY ? -1 : 1;
  const half = size / 2;
  const hitR = Math.max(size / 2, 28);
  const selected = sym.id === selectedSymbolId ? ' selected' : '';

  return (
    '<g class="symbol-item' +
    selected +
    '" data-role="' +
    sym.id +
    '">' +
    '<circle class="hit-area" cx="' +
    sym.x +
    '" cy="' +
    sym.y +
    '" r="' +
    hitR +
    '"/>' +
    '<g transform="translate(' +
    sym.x.toFixed(2) +
    ',' +
    sym.y.toFixed(2) +
    ') rotate(' +
    sym.rot.toFixed(2) +
    ') scale(' +
    fx +
    ',' +
    fy +
    ') translate(' +
    (-half).toFixed(2) +
    ',' +
    (-half).toFixed(2) +
    ')" pointer-events="none">' +
    '<svg width="' +
    size +
    '" height="' +
    size +
    '" viewBox="0 0 ' +
    vw +
    ' ' +
    vh +
    '" preserveAspectRatio="xMidYMid meet" overflow="visible">' +
    '<g fill="' +
    fill +
    '" stroke="' +
    stroke +
    '" stroke-width="' +
    sw +
    '" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round">' +
    inner +
    '</g></svg></g></g>'
  );
}

async function drawCanvas() {
  const symLayer = $('layerSymbols');
  const glyphLayer = $('layerGlyphs');
  const fileA = fileForLetter(fromLetter);
  const fileB = fileForLetter(toLetter);
  const sizeA = baseSize * glyphA.scale;
  const sizeB = baseSize * glyphB.scale;

  const [textA, textB] = await Promise.all([fetchSvgText(fileA), fetchSvgText(fileB)]);

  symLayer.innerHTML = symbols.map(symbolSvgMarkup).join('');
  glyphLayer.innerHTML =
    glyphSvgMarkup(textA, glyphA.x, glyphA.y, glyphA.rot, sizeA, '#000', 'a', glyphA.flipX, glyphA.flipY) +
    glyphSvgMarkup(textB, glyphB.x, glyphB.y, glyphB.rot, sizeB, '#1565c0', 'b', glyphB.flipX, glyphB.flipY);

  $('infoAx').textContent = Math.round(glyphA.x);
  $('infoAy').textContent = Math.round(glyphA.y);
  $('infoBx').textContent = Math.round(glyphB.x);
  $('infoBy').textContent = Math.round(glyphB.y);
  $('infoARot').textContent = glyphA.rot;
  $('infoBRot').textContent = glyphB.rot;
  $('infoAScale').textContent = glyphA.scale;
  $('infoBScale').textContent = glyphB.scale;
  $('infoAFlip').textContent = (glyphA.flipX ? '↔' : '') + (glyphA.flipY ? '↕' : '') || '—';
  $('infoBFlip').textContent = (glyphB.flipX ? '↔' : '') + (glyphB.flipY ? '↕' : '') || '—';

  updateFlipButtons();
  updateSymbolList();
}

function getGlyphByRole(role) {
  return role === 'a' ? glyphA : role === 'b' ? glyphB : null;
}

function getSymbolById(id) {
  return symbols.find((s) => s.id === id);
}

function updateFlipButtons() {
  const map = {
    flipAX: glyphA.flipX,
    flipAY: glyphA.flipY,
    flipBX: glyphB.flipX,
    flipBY: glyphB.flipY
  };
  Object.entries(map).forEach(([id, on]) => {
    $(id)?.classList.toggle('active', on);
  });
}

function toggleFlip(target, axis) {
  if (target === 'a' || target === 'b') {
    const g = getGlyphByRole(target);
    if (axis === 'x') g.flipX = !g.flipX;
    else g.flipY = !g.flipY;
  } else {
    const s = getSymbolById(target);
    if (!s) return;
    if (axis === 'x') s.flipX = !s.flipX;
    else s.flipY = !s.flipY;
  }
  drawCanvas().catch((err) => setStatus(String(err.message), true));
}

function clientToSvg(clientX, clientY) {
  const svg = $('editorSVG');
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  return ctm ? pt.matrixTransform(ctm.inverse()) : { x: clientX, y: clientY };
}

function setupDrag() {
  const svg = $('editorSVG');

  svg.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('.glyph-a, .glyph-b, .symbol-item');
    if (!g) return;
    e.preventDefault();
    const role = g.dataset.role;
    if (g.classList.contains('symbol-item')) {
      selectedSymbolId = role;
      updateSymbolList();
    }
    let pos;
    if (role === 'a' || role === 'b') {
      pos = getGlyphByRole(role);
    } else {
      pos = getSymbolById(role);
    }
    if (!pos) return;
    const p = clientToSvg(e.clientX, e.clientY);
    drag = { role, dx: p.x - pos.x, dy: p.y - pos.y };
    g.classList.add('dragging');
    svg.setPointerCapture(e.pointerId);
  });

  svg.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = clientToSvg(e.clientX, e.clientY);
    let pos;
    if (drag.role === 'a' || drag.role === 'b') {
      pos = getGlyphByRole(drag.role);
    } else {
      pos = getSymbolById(drag.role);
    }
    if (!pos) return;
    pos.x = p.x - drag.dx;
    pos.y = p.y - drag.dy;
    drawCanvas().catch((err) => setStatus(String(err.message), true));
  });

  const endDrag = (e) => {
    if (!drag) return;
    drag = null;
    document.querySelectorAll('.glyph-a, .glyph-b, .symbol-item').forEach((el) =>
      el.classList.remove('dragging')
    );
    try {
      svg.releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
}

function readUi() {
  fromLetter = $('selFrom').value;
  toLetter = $('selTo').value;
  intent = $('selIntent').value;
  glyphB.rot = Number($('slRot').value);
  glyphB.scale = Number($('slScale').value) / 100;
  baseSize = Number($('slSz').value);
  $('rotVal').textContent = glyphB.rot;
  $('scaleVal').textContent = glyphB.scale.toFixed(2);
  $('szVal').textContent = baseSize;
}

function applyGlyphState(target, g) {
  if (!g) return;
  target.x = g.x;
  target.y = g.y;
  target.rot = g.rotation || 0;
  target.scale = g.scale > 0 ? g.scale : 1;
  target.flipX = !!g.flipX;
  target.flipY = !!g.flipY;
}

function applySavedConnection(conn) {
  if (conn.fromGlyph && conn.toGlyph) {
    applyGlyphState(glyphA, conn.fromGlyph);
    applyGlyphState(glyphB, conn.toGlyph);
    const baseFromSize = conn.fromGlyph.size / (glyphA.scale || 1);
    const baseToSize = conn.toGlyph.size / (glyphB.scale || 1);
    baseSize = Math.round((baseFromSize + baseToSize) / 2) || GLYPH_SIZE;
    $('slRot').value = glyphB.rot;
    $('slScale').value = Math.round(glyphB.scale * 100);
    $('slSz').value = baseSize;
    readUi();
  }
  symbols = (conn.symbols || []).map((s) => normalizeSymbolFromApi(s));
  selectedSymbolId = symbols.length ? symbols[0].id : null;
}

async function loadSavedConnection() {
  try {
    const res = await fetch('/api/connections?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    const matches = (data.connections || []).filter(
      (c) => c.from === fromLetter && c.to === toLetter && c.intent === intent
    );
    if (!matches.length) {
      symbols = [];
      return false;
    }
    applySavedConnection(matches[matches.length - 1]);
    return true;
  } catch (_) {
    return false;
  }
}

function resetLayout() {
  glyphA.x = CX;
  glyphA.y = CY;
  glyphA.rot = 0;
  glyphA.scale = 1;
  glyphA.flipX = false;
  glyphA.flipY = false;
  glyphB.x = CX + 90;
  glyphB.y = CY;
  glyphB.rot = 0;
  glyphB.scale = 1;
  glyphB.flipX = false;
  glyphB.flipY = false;
  symbols = [];
  selectedSymbolId = null;
  $('slRot').value = 0;
  $('slScale').value = 100;
  $('rotVal').textContent = '0';
  $('scaleVal').textContent = '1.00';
}

function symbolPayload() {
  return symbols.map((s) => ({
    type: s.type,
    x: Math.round(s.x * 100) / 100,
    y: Math.round(s.y * 100) / 100,
    rotation: s.rot,
    scale: 1,
    size: Math.round(s.size * s.scale * 100) / 100,
    flipX: s.flipX,
    flipY: s.flipY,
    strokeWidth: clamp(s.strokeWidth, 1, 10),
    fillMode: s.fillMode,
    triangleRatio: clamp(s.triangleRatio, 0.5, 2),
    arcAngle: clamp(s.arcAngle, 30, 330)
  }));
}

async function saveConnection() {
  readUi();

  const connection = {
    from: fromLetter,
    to: toLetter,
    intent: intent,
    fromGlyph: {
      x: Math.round(glyphA.x * 100) / 100,
      y: Math.round(glyphA.y * 100) / 100,
      rotation: glyphA.rot,
      scale: glyphA.scale,
      size: baseSize * glyphA.scale,
      flipX: glyphA.flipX,
      flipY: glyphA.flipY
    },
    toGlyph: {
      x: Math.round(glyphB.x * 100) / 100,
      y: Math.round(glyphB.y * 100) / 100,
      rotation: glyphB.rot,
      scale: glyphB.scale,
      size: baseSize * glyphB.scale,
      flipX: glyphB.flipX,
      flipY: glyphB.flipY
    },
    symbols: symbolPayload()
  };

  const res = await fetch('/api/connections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connection })
  });

  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(bodyText || 'HTTP ' + res.status);
  }

  let data;
  try {
    data = JSON.parse(bodyText);
  } catch (_) {
    throw new Error('תשובת שרת לא תקינה');
  }
  if (!data.ok) {
    throw new Error('השרת לא אישר שמירה');
  }

  const fg = data.connection.fromGlyph;
  const tg = data.connection.toGlyph;
  const symCount = (data.connection.symbols || []).length;
  setStatus(
    '✓ נשמר בהצלחה — ' +
      fromLetter +
      ' → ' +
      toLetter +
      ' (' +
      intent +
      ') | A: ' +
      Math.round(fg.x) +
      ',' +
      Math.round(fg.y) +
      ' | B: ' +
      Math.round(tg.x) +
      ',' +
      Math.round(tg.y) +
      (symCount ? ' | ' + symCount + ' סמלים' : ''),
    false
  );
}

async function onPairChange() {
  readUi();
  const loaded = await loadSavedConnection();
  if (!loaded) {
    resetLayout();
    glyphA.x = CX;
    glyphA.y = CY;
    glyphB.x = CX + 90;
    glyphB.y = CY;
  }
  await drawCanvas();
}

function bindEvents() {
  $('selFrom').addEventListener('change', () => {
    onPairChange().catch((err) => setStatus(String(err.message), true));
  });
  $('selTo').addEventListener('change', () => {
    onPairChange().catch((err) => setStatus(String(err.message), true));
  });
  $('selIntent').addEventListener('change', () => {
    onPairChange().catch((err) => setStatus(String(err.message), true));
  });

  $('slRot').addEventListener('input', () => {
    readUi();
    drawCanvas().catch((err) => setStatus(String(err.message), true));
  });
  $('slScale').addEventListener('input', () => {
    readUi();
    drawCanvas().catch((err) => setStatus(String(err.message), true));
  });
  $('slSz').addEventListener('input', () => {
    readUi();
    drawCanvas().catch((err) => setStatus(String(err.message), true));
  });

  document.querySelectorAll('.flip-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleFlip(btn.dataset.target, btn.dataset.axis));
  });

  $('saveBtn').addEventListener('click', () => {
    setStatus('שומר…');
    saveConnection().catch((err) => setStatus('שמירה נכשלה: ' + err.message, true));
  });

  $('resetBtn').addEventListener('click', () => {
    resetLayout();
    drawCanvas().catch((err) => setStatus(String(err.message), true));
  });

  $('alignCenterA').addEventListener('click', () => {
    glyphA.x = CX;
    glyphA.y = CY;
    drawCanvas().catch((err) => setStatus(String(err.message), true));
  });
  $('alignCenterB').addEventListener('click', () => {
    glyphB.x = CX;
    glyphB.y = CY;
    drawCanvas().catch((err) => setStatus(String(err.message), true));
  });
}

async function start() {
  if (location.protocol === 'file:') {
    setStatus('פתח http://localhost:8080/editor.html', true);
    return;
  }

  try {
    setStatus('טוען רשימת אותיות…');
    await fetchGlyphList();
    fillDropdowns();
    buildSymbolPalette();
    bindEvents();
    setupDrag();
    await loadSavedConnection();
    await drawCanvas();
    setStatus('');
  } catch (err) {
    console.error(err);
    setStatus('שגיאה: ' + err.message, true);
  }
}

start();
