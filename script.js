/* Amulet Composer — Hebrew letter SVG sigil system */

const HEB = 'אבגדהוזחטיכלמנסעפצקרשת'.split('');
const W = 680;
const H = 680;
const CX = 340;
const CY = 340;

const POS = {
  'top-left': { x: 0.2, y: 0.2 },
  'top-centre': { x: 0.5, y: 0.1 },
  'top-center': { x: 0.5, y: 0.1 },
  'top-right': { x: 0.8, y: 0.2 },
  'centre-left': { x: 0.2, y: 0.5 },
  'center-left': { x: 0.2, y: 0.5 },
  centre: { x: 0.5, y: 0.5 },
  center: { x: 0.5, y: 0.5 },
  'centre-right': { x: 0.8, y: 0.5 },
  'center-right': { x: 0.8, y: 0.5 },
  'bottom-left': { x: 0.2, y: 0.8 },
  'bottom-centre': { x: 0.5, y: 0.9 },
  'bottom-center': { x: 0.5, y: 0.9 },
  'bottom-right': { x: 0.8, y: 0.8 }
};

const DOMINANT_PRIORITY = [
  'outlined_circle',
  'double_arrow',
  'single_triangle',
  'u_arc',
  'arc',
  'vertical_line',
  'endpoint'
];

const LETTER_GEO = {
  א: {
    elements: [
      { type: 'outlined_circle', position: 'top-centre', size: 'medium' },
      { type: 'u_arc', position: 'bottom-centre', size: 'medium' }
    ],
    dominant: 'outlined_circle',
    description: 'אלף — עיגול בראש וקשת U בתחתית'
  },
  ב: {
    elements: [{ type: 'outlined_circle', position: 'top-centre', size: 'medium' }],
    dominant: 'outlined_circle',
    description: 'בית — עיגול בראש'
  },
  ה: {
    elements: [{ type: 'outlined_circle', position: 'top-centre', size: 'medium' }],
    dominant: 'outlined_circle',
    description: 'הא — עיגול בראש'
  },
  ו: {
    elements: [{ type: 'double_arrow', position: 'centre', size: 'medium' }],
    dominant: 'double_arrow',
    description: 'ויו — חץ כפול על קו אנכי'
  },
  ז: {
    elements: [{ type: 'u_arc', position: 'bottom-centre', size: 'medium' }],
    dominant: 'u_arc',
    description: 'זין — קשת U באלכסונים תחתונים'
  },
  י: {
    elements: [{ type: 'outlined_circle', position: 'bottom-centre', size: 'small' }],
    dominant: 'outlined_circle',
    description: 'יוד — עיגול בתחתית'
  },
  כ: {
    elements: [
      { type: 'outlined_circle', position: 'top-centre', size: 'medium' },
      { type: 'double_arrow', position: 'centre-right', size: 'small' }
    ],
    dominant: 'outlined_circle',
    description: 'כף — עיגול בראש וחץ כפול'
  },
  מ: {
    elements: [{ type: 'u_arc', position: 'bottom-centre', size: 'medium' }],
    dominant: 'u_arc',
    description: 'מם — קשת U בתחתית'
  },
  ס: {
    elements: [{ type: 'single_triangle', position: 'centre-right', size: 'small' }],
    dominant: 'single_triangle',
    description: 'סמך — משולש יחיד'
  },
  ע: {
    elements: [
      { type: 'outlined_circle', position: 'bottom-centre', size: 'medium' },
      { type: 'single_triangle', position: 'centre-right', size: 'small' }
    ],
    dominant: 'outlined_circle',
    description: 'עין — עיגול בתחתית ומשולש'
  },
  צ: {
    elements: [
      { type: 'outlined_circle', position: 'bottom-centre', size: 'medium' },
      { type: 'single_triangle', position: 'centre-right', size: 'small' }
    ],
    dominant: 'outlined_circle',
    description: 'צדי — עיגול בתחתית ומשולש'
  },
  ק: {
    elements: [{ type: 'outlined_circle', position: 'top-centre', size: 'medium' }],
    dominant: 'outlined_circle',
    description: 'קוף — עיגול בראש'
  },
  ר: {
    elements: [{ type: 'outlined_circle', position: 'top-centre', size: 'medium' }],
    dominant: 'outlined_circle',
    description: 'ריש — עיגול בראש'
  },
  ש: {
    elements: [
      { type: 'outlined_circle', position: 'bottom-centre', size: 'medium' },
      { type: 'single_triangle', position: 'centre-right', size: 'small' }
    ],
    dominant: 'outlined_circle',
    description: 'שין — עיגול בתחתית ומשולש'
  },
  ת: {
    elements: [{ type: 'outlined_circle', position: 'top-centre', size: 'medium' }],
    dominant: 'outlined_circle',
    description: 'תו — עיגול בראש'
  }
};

const BADGE = {
  outlined_circle: '◯',
  double_arrow: '⇄',
  single_triangle: '▷',
  u_arc: '⌒',
  arc: '◠',
  vertical_line: '|',
  endpoint: '·'
};

const svgStore = {};
const geoStore = {};
let placements = [];
let lastLayout = null;
let lastAvail = [];
let currentCat = 'protection';
let pendingLetter = null;
let ANTHROPIC_KEY = '';
let statusTimer = null;

function init() {
  document.getElementById('sentence').addEventListener('input', updateExtractedPreview);
  document.getElementById('sentence').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doCompose();
  });
  document.getElementById('composeBtn').addEventListener('click', doCompose);
  document.getElementById('saveSvgBtn').addEventListener('click', doSaveSVG);
  document.getElementById('savePngBtn').addEventListener('click', doSavePNG);

  document.querySelectorAll('.catbtn').forEach((btn) => {
    btn.addEventListener('click', () => setCat(btn));
  });

  ['slSz', 'slSW'].forEach((id) => {
    document.getElementById(id).addEventListener('input', onSlider);
  });

  boot();
}

function letterFromGlyphFile(file) {
  return file.replace(/\d+\.svg$/i, '');
}

async function loadGlyphManifest() {
  try {
    const res = await fetch('/api/glyphs');
    if (res.ok) {
      const data = await res.json();
      availableGlyphLetters = [...new Set((data.files || []).map(letterFromGlyphFile))].sort(
        (a, b) => a.localeCompare(b, 'he')
      );
      return;
    }
  } catch (_) {
    /* fallback */
  }
  const res = await fetch(GLYPHS_DIR + '/manifest.json');
  if (!res.ok) throw new Error('לא ניתן לטעון רשימת glyphs');
  const data = await res.json();
  availableGlyphLetters = [...new Set((data.files || []).map(letterFromGlyphFile))].sort((a, b) =>
    a.localeCompare(b, 'he')
  );
}

async function preloadBuiltInGlyphs() {
  await Promise.all(
    availableGlyphLetters.map(async (letter) => {
      try {
        const text = await fetch(
          GLYPHS_DIR + '/' + encodeURIComponent(glyphFilename(letter))
        ).then((r) => {
          if (!r.ok) throw new Error('missing');
          return r.text();
        });
        svgStore[letter] = text;
        glyphSvgCache[letter] = text;
        parsedGlyphCache[letter] = parseGlyphSvg(text);
      } catch (e) {
        console.warn('Glyph preload failed:', letter, e);
      }
    })
  );
}

function getExtractedLetters() {
  const sentence = document.getElementById('sentence').value.trim();
  if (!sentence) return [];
  return getFirstLetters(sentence);
}

function updateExtractedPreview() {
  const letters = getExtractedLetters();
  const el = document.getElementById('extractedPreview');
  if (el) el.textContent = letters.length ? letters.join(' → ') : '—';
}

function invalidateConnectionsCache() {
  connectionsCache = null;
}

/** TEMP: show calculated placement coordinates under the canvas */
function showComposeDebug(placements, anchor) {
  const el = document.getElementById('composeDebug');
  if (!el) return;
  if (!placements?.length) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const rows = placements
    .map((p) => {
      const tag = p.letter === anchor ? ' (hub)' : '';
      return (
        '<li>' +
        p.letter +
        tag +
        ': x=' +
        Number(p.x).toFixed(1) +
        ', y=' +
        Number(p.y).toFixed(1) +
        '</li>'
      );
    })
    .join('');
  el.innerHTML = '<strong>DEBUG — positions</strong><ul>' + rows + '</ul>';
  el.hidden = false;
}

function clearComposeDebug() {
  const el = document.getElementById('composeDebug');
  if (!el) return;
  el.hidden = true;
  el.innerHTML = '';
}

function displayAmuletSvg(svgString) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const parsed = doc.querySelector('svg');
  const main = document.getElementById('mainSVG');
  if (!parsed || !main) return;
  main.setAttribute('width', String(W));
  main.setAttribute('height', String(H));
  main.innerHTML = parsed.innerHTML;
}

async function boot() {
  try {
    await loadGlyphManifest();
    await preloadBuiltInGlyphs();
    await loadConnections();
    updateExtractedPreview();
    setStatus(
      'מוכן — ' + availableGlyphLetters.length + ' סמלים, ' + connectionsCache.length + ' חיבורים'
    );
  } catch (err) {
    setStatus('שגיאת טעינה: ' + err.message, true);
    console.error(err);
  }
}

function onSlider(e) {
  const id = e.target.id;
  if (id === 'slSz') document.getElementById('szVal').textContent = e.target.value;
  if (id === 'slSW')
    document.getElementById('swVal').textContent = (e.target.value / 10).toFixed(1);
  rebuild();
}

function setKey() {
  ANTHROPIC_KEY = document.getElementById('apiKey').value.trim();
  const s = document.getElementById('keyStatus');
  if (ANTHROPIC_KEY) {
    sessionStorage.setItem('anthropic_key', ANTHROPIC_KEY);
    s.textContent = 'מפתח שמור — ניתוח AI זמין';
    s.className = 'ok';
  } else {
    sessionStorage.removeItem('anthropic_key');
    s.textContent = 'ללא מפתח — הרכבה מקומית';
    s.className = '';
  }
}

function setCat(btn) {
  document.querySelectorAll('.catbtn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  currentCat = btn.dataset.cat;
  if (lastComposeLetters.length) rebuild();
}

function letterCell(letter) {
  return document.querySelector('.lc[data-letter="' + letter + '"]');
}

function markAnalysed(letter, geo) {
  const cell = letterCell(letter);
  if (cell) cell.classList.add('analysed');
  const badge = document.getElementById('badge-' + letter);
  if (badge) badge.textContent = summariseBadge(geo);
  updateGeoCard(letter, geo);
}

function onFile(e) {
  const f = e.target.files[0];
  const letter = pendingLetter;
  e.target.value = '';
  pendingLetter = null;
  if (!f || !letter) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    const svgText = ev.target.result;
    if (!svgText || !svgText.includes('<')) {
      setStatus('קובץ SVG לא תקין');
      return;
    }
    svgStore[letter] = ensureSvgString(svgText);
    glyphSvgCache[letter] = svgStore[letter];
    parsedGlyphCache[letter] = parseGlyphSvg(svgStore[letter]);
    const cell = letterCell(letter);
    if (cell) cell.classList.add('loaded');

    const localGeo = inferLocalGeometry(letter);
    geoStore[letter] = localGeo;
    markAnalysed(letter, localGeo);
    setStatus('נטען "' + letter + '" — ניתוח מקומי');

    if (!ANTHROPIC_KEY) return;

    setStatus('<span class="spinner">⟳</span> מנתח "' + letter + '" עם Claude...');
    analyseGlyphWithClaude(letter, svgText)
      .then((analysis) => {
        geoStore[letter] = analysis;
        markAnalysed(letter, analysis);
        setStatus('נותח "' + letter + '": ' + (analysis.description || ''));
      })
      .catch((err) => {
        if (String(err.message).includes('429')) {
          setStatus('מגבלת קצב — נסי שוב מאוחר יותר');
          return;
        }
        console.warn('Image analysis failed, trying text:', err.message);
        analyseGlyphTextOnly(letter, svgText)
          .then((geo) => {
            geoStore[letter] = geo;
            markAnalysed(letter, geo);
            setStatus('נותח "' + letter + '" (טקסט): ' + (geo.description || ''));
          })
          .catch((err2) => {
            setStatus('ניתוח AI נכשל — נשאר ניתוח מקומי ל"' + letter + '"');
            console.error(err2);
          });
      });
  };
  reader.readAsText(f);
}

function inferLocalGeometry(letter) {
  const base = LETTER_GEO[letter];
  if (base) return { letter, ...base };
  return {
    letter,
    elements: [{ type: 'endpoint', position: 'centre', size: 'small' }],
    dominant: 'endpoint',
    description: 'אות ללא טבלת סמלים — נקודת חיבור במרכז'
  };
}

function summariseBadge(geo) {
  if (!geo) return '';
  return BADGE[geo.dominant] || '?';
}

function updateGeoCard(letter, geo) {
  const card = document.getElementById('geoCard');
  if (!geo) return;
  const lines = [
    '<span class="letter-tag">' + letter + '</span> — ' + (geo.description || ''),
    '<span class="geo-line">דומיננטי: ' + (geo.dominant || '?') + '</span>'
  ];
  if (geo.elements && geo.elements.length) {
    geo.elements.slice(0, 5).forEach((el) => {
      lines.push('  ' + el.type + ' @ ' + el.position + ' (' + el.size + ')');
    });
  }
  card.innerHTML = lines.join('<br>');
}

async function doCompose() {
  const sentence = document.getElementById('sentence').value.trim();
  if (!sentence) {
    setStatus('כתבי משפט עברי');
    return;
  }

  const letters = getFirstLetters(sentence);
  if (!letters.length) {
    setStatus('לא נמצאו אותיות עבריות במשפט');
    return;
  }

  updateExtractedPreview();

  const missing = letters.filter((l) => !hasGlyphLoaded(l));
  if (missing.length) {
    console.warn('[doCompose] missing SVG for:', missing.join(' '));
  }

  clearComposeDebug();
  setStatus('<span class="spinner">⟳</span> טוען חיבורים מהשרת...');
  try {
    console.log('[doCompose] start — letters:', letters, 'intent:', currentCat);
    invalidateConnectionsCache();
    const connections = await loadConnections(true);
    console.log('[doCompose] connections ready:', connections.length);
    const result = await buildAmulet(letters, currentCat, connections);
    displayAmuletSvg(result.svg);
    showComposeDebug(result.placements, result.anchor);
    lastComposeLetters = letters;
    lastAvail = letters;
    const hub = result.anchor;
    const linkLabels = result.links.map((l) => l.label).join(', ');
    const drawn = [hub].concat(result.links.map((l) => l.letter)).join(' ');
    const symHint = result.symbolCount ? ' | ' + result.symbolCount + ' סמלים' : '';
    let skipHint = '';
    if (result.skipped?.length) {
      skipHint = ' | ללא חיבור: ' + result.skipped.join(' ');
    }
    if (result.drawErrors?.length) {
      skipHint += ' | לא נטען: ' + result.drawErrors.join(' ');
    }
    setStatus(
      'הושלם — מרכז: ' +
        hub +
        (linkLabels ? ' | ' + linkLabels : '') +
        ' | מוצג: ' +
        drawn +
        symHint +
        skipHint +
        ' (' +
        categoryLabel(currentCat) +
        ')'
    );
  } catch (err) {
    clearComposeDebug();
    setStatus('שגיאת הרכבה: ' + err.message, true);
    console.error(err);
  }
}

function buildComposition(avail) {
  setStatus('<span class="spinner">⟳</span> מרכיב קמע ' + categoryLabel(currentCat) + '...');
  placements = [];
  renderSVG();

  const finish = (layout) => {
    lastLayout = layout;
    placements = buildPlacements(layout, avail);
    renderSVG();
    setStatus('הושלם — ' + avail.length + ' סמלים (' + categoryLabel(currentCat) + ')');
  };

  if (ANTHROPIC_KEY) {
    callComposeAPI(avail, currentCat)
      .then(finish)
      .catch((e) => {
        console.warn('Compose API failed, using local:', e);
        finish(localComposeLayout(avail, currentCat));
      });
  } else {
    finish(localComposeLayout(avail, currentCat));
  }
}

function categoryLabel(cat) {
  return { protection: 'הגנה', summoning: 'זימון', grounding: 'אישור' }[cat] || cat;
}

function getConnectElement(geo) {
  if (!geo || !geo.elements || !geo.elements.length) {
    return { type: 'endpoint', position: 'centre', size: 'small' };
  }
  const types = geo.elements.map((e) => e.type);
  for (const t of DOMINANT_PRIORITY) {
    const found = geo.elements.find((e) => e.type === t);
    if (found) return found;
  }
  return geo.elements[0];
}

function posToPoint(position) {
  return POS[position] || POS.centre;
}

function canConnect(a, b) {
  const forbidden = [
    ['outlined_circle', 'double_arrow'],
    ['outlined_circle', 'u_arc'],
    ['single_triangle', 'u_arc']
  ];
  return !forbidden.some(
    ([x, y]) =>
      (a === x && b === y) || (a === y && b === x)
  );
}

function pickConnection(geoA, geoB) {
  const elA = getConnectElement(geoA);
  const elB = getConnectElement(geoB);
  if (canConnect(elA.type, elB.type)) {
    return { fromEl: elA, toEl: elB };
  }
  return {
    fromEl: { type: 'endpoint', position: 'centre' },
    toEl: { type: 'endpoint', position: 'centre' }
  };
}

function localComposeLayout(letters, cat) {
  const layout = [{ letter: letters[0], angle: 0, flipX: false }];

  for (let i = 1; i < letters.length; i++) {
    const letter = letters[i];
    const gPrev = geoStore[letters[i - 1]] || inferLocalGeometry(letters[i - 1]);
    const gCur = geoStore[letter] || inferLocalGeometry(letter);
    const conn = pickConnection(gPrev, gCur);
    const fromP = posToPoint(conn.fromEl.position);
    const toP = posToPoint(conn.toEl.position);

    let angle = 0;
    let flipX = false;
    if (cat === 'grounding') {
      angle = 0;
    } else if (cat === 'summoning') {
      angle = (i % 2) * 90;
      flipX = i % 2 === 1;
    } else {
      angle = i % 2 === 0 ? 0 : 180;
    }

    layout.push({
      letter,
      connectTo: i - 1,
      fromPoint: fromP,
      toPoint: toP,
      angle,
      flipX
    });
  }
  return layout;
}

function analyseAll() {
  const loaded = Object.keys(svgStore);
  if (!loaded.length) {
    setStatus('העלי SVG קודם');
    return;
  }

  let i = 0;
  function next() {
    if (i >= loaded.length) {
      setStatus('כל הסמלים נותחו');
      return;
    }
    const l = loaded[i++];
    geoStore[l] = inferLocalGeometry(l);
    markAnalysed(l, geoStore[l]);

    if (!ANTHROPIC_KEY) {
      setTimeout(next, 50);
      return;
    }

    setStatus('מנתח "' + l + '" (' + i + '/' + loaded.length + ')...');
    analyseGlyphWithClaude(l, svgStore[l])
      .then((geo) => {
        geo._ai = true;
        geoStore[l] = geo;
        markAnalysed(l, geo);
        setTimeout(next, 800);
      })
      .catch((e) => {
        if (String(e.message).includes('429')) {
          setStatus('מגבלת קצב — עצירה');
          return;
        }
        setTimeout(next, 400);
      });
  }
  next();
}

function rebuild() {
  if (!lastComposeLetters.length) return;
  doCompose();
}

async function analyseGlyphWithClaude(letter, svgText) {
  const b64 = await svgToPNG64(svgText, 400);
  if (!b64 || b64.length < 100) {
    return analyseGlyphTextOnly(letter, svgText);
  }

  const prompt =
    'You are analysing a Hebrew letter glyph built according to this strict symbol system:\n\n' +
    'POSSIBLE SYMBOLS: outlined_circle, double_arrow, single_triangle, u_arc, arc, vertical_line, endpoint\n\n' +
    'LETTER-TO-SYMBOL TABLE:\n' +
    'א: outlined_circle top + u_arc bottom\nב,ה,ק,ר,ת: outlined_circle top\nו: double_arrow\nז,מ: u_arc bottom\nי: outlined_circle bottom\nכ: outlined_circle top + double_arrow\nס: single_triangle\nע,צ,ש: outlined_circle bottom + single_triangle\n\n' +
    'DOMINANT priority: outlined_circle > double_arrow > single_triangle > u_arc > arc > vertical_line > endpoint\n\n' +
    'Respond ONLY with valid JSON:\n' +
    '{"letter":"' +
    letter +
    '","elements":[{"type":"outlined_circle","position":"top-centre","size":"medium"}],"dominant":"outlined_circle","description":"brief"}';

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: b64 } },
            { type: 'text', text: prompt }
          ]
        }
      ]
    })
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(r.status + ': ' + t.slice(0, 200));
  }
  const d = await r.json();
  return parseJsonFromText(d.content.map((b) => b.text || '').join(''));
}

async function analyseGlyphTextOnly(letter, svgText) {
  const paths = extractSvgPaths(svgText);
  const svgSummary =
    'Hebrew letter "' +
    letter +
    '" SVG (' +
    paths.length +
    ' paths):\n' +
    paths.slice(0, 6).join('\n').slice(0, 600);

  const prompt =
    'Analyse Hebrew glyph "' +
    letter +
    '" from SVG paths. Symbols: outlined_circle, double_arrow, single_triangle, u_arc.\n' +
    svgSummary +
    '\nRespond ONLY JSON: {"letter":"' +
    letter +
    '","elements":[],"dominant":"...","description":"..."}';

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 400,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    })
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(r.status + ': ' + t.slice(0, 200));
  }
  const d = await r.json();
  return parseJsonFromText(d.content.map((b) => b.text || '').join(''));
}

function extractSvgPaths(svgText) {
  const paths = [];
  const clean = svgText.trim().replace(/^<\?xml[^>]*>\s*/i, '');
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  if (doc.querySelector('parsererror')) return paths;
  doc.querySelectorAll('path').forEach((p) => {
    const d = (p.getAttribute('d') || '').trim().slice(0, 200);
    if (d) paths.push(d);
  });
  doc.querySelectorAll('circle,ellipse').forEach((c) => {
    paths.push(
      'circle cx=' +
        c.getAttribute('cx') +
        ' cy=' +
        c.getAttribute('cy') +
        ' r=' +
        c.getAttribute('r')
    );
  });
  return paths;
}

async function callComposeAPI(letters, cat) {
  const geoSummary = letters
    .map((l) => {
      const g = geoStore[l];
      if (!g) return '"' + l + '": unknown';
      const elList = (g.elements || [])
        .map((e) => e.type + '@' + e.position + '(' + e.size + ')')
        .join(', ');
      return '"' + l + '": dominant=' + g.dominant + ' | ' + elList;
    })
    .join('\n');

  const catRules = {
    protection:
      'PROTECTION: closed, dense, inward curves, heavy overlap, connect circles and arcs',
    summoning: 'SUMMONING: expansive, outward, spirals/arcs, less overlap',
    grounding: 'GROUNDING: axial, 0/90/180 only, vertical/horizontal alignment, symmetry'
  };

  const example = JSON.stringify(
    [
      { letter: letters[0], angle: 0, flipX: false },
      {
        letter: letters[1] || letters[0],
        connectTo: 0,
        fromPoint: { x: 0.5, y: 0.1 },
        toPoint: { x: 0.5, y: 0.9 },
        angle: 0,
        flipX: false
      }
    ],
    null,
    2
  );

  const prompt =
    'Sigil composer. Pre-analysed glyphs:\n' +
    geoSummary +
    '\n\n' +
    catRules[cat] +
    '\n\nConnection priority: circle-circle, arrow-arrow, triangle-triangle, u_arc-u_arc. ' +
    'Rotation: 0, 90, 180 only. fromPoint/toPoint normalized 0..1.\n' +
    'Respond ONLY JSON array like:\n' +
    example;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }]
    })
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(r.status + ': ' + t.slice(0, 200));
  }
  const d = await r.json();
  const text = d.content.map((b) => b.text || '').join('');
  const s = text.indexOf('[');
  const e = text.lastIndexOf(']');
  if (s === -1 || e === -1) throw new Error('No JSON array in response');
  return JSON.parse(text.slice(s, e + 1));
}

function parseJsonFromText(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON in response');
  return JSON.parse(text.slice(s, e + 1));
}

function buildPlacements(layout, letters) {
  const sz = parseInt(document.getElementById('slSz').value, 10);
  const ov = parseInt(document.getElementById('slOv').value, 10) / 100;
  const result = [];

  const first = layout[0] || {};
  result.push({
    letter: letters[0],
    x: CX,
    y: CY,
    angle: toRad(first.angle || 0),
    flipX: !!first.flipX,
    sz
  });

  for (let i = 1; i < layout.length && i < letters.length; i++) {
    const item = layout[i] || {};
    const letter = item.letter || letters[i];
    if (!svgStore[letter]) continue;

    const ci = Math.min(Math.max(item.connectTo ?? 0, 0), result.length - 1);
    const anchor = result[ci];

    const toP = item.toPoint || { x: 0.5, y: 0.5 };
    const fromP = item.fromPoint || { x: 0.5, y: 0.5 };

    let snapDeg = Math.round((item.angle || 0) / 90) * 90;
    let angle = toRad(snapDeg);

    if (currentCat === 'protection') {
      const toCentreDeg = (Math.atan2(CY - anchor.y, CX - anchor.x) * 180) / Math.PI;
      const snappedInward = Math.round(toCentreDeg / 90) * 90;
      if (Math.abs(snappedInward - snapDeg) <= 90) angle = toRad(snappedInward);
    }

    const fx = !!item.flipX;
    const stepMult =
      currentCat === 'protection' ? 0.65 : currentCat === 'summoning' ? 0.85 : 0.75;
    const step = sz * (1 - ov * stepMult);

    const wx = anchor.x + (toP.x - 0.5) * step;
    const wy = anchor.y + (toP.y - 0.5) * step;

    let lx = (fromP.x - 0.5) * sz;
    let ly = (fromP.y - 0.5) * sz;
    if (fx) lx = -lx;
    const rx = lx * Math.cos(angle) - ly * Math.sin(angle);
    const ry = lx * Math.sin(angle) + ly * Math.cos(angle);

    result.push({
      letter,
      x: wx - rx,
      y: wy - ry,
      angle,
      flipX: fx,
      sz
    });
  }

  return centreComp(result, sz);
}

function centreComp(pl) {
  if (!pl.length) return pl;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  pl.forEach((p) => {
    minX = Math.min(minX, p.x - p.sz / 2);
    maxX = Math.max(maxX, p.x + p.sz / 2);
    minY = Math.min(minY, p.y - p.sz / 2);
    maxY = Math.max(maxY, p.y + p.sz / 2);
  });
  const ox = CX - (minX + maxX) / 2;
  const oy = CY - (minY + maxY) / 2;
  return pl.map((p) => ({
    letter: p.letter,
    x: p.x + ox,
    y: p.y + oy,
    angle: p.angle,
    flipX: p.flipX,
    sz: p.sz
  }));
}

function toRad(d) {
  return (d * Math.PI) / 180;
}

function renderSVG() {
  const parts = ['<rect width="680" height="680" fill="white"/>'];

  if (!placements.length) {
    parts.push(
      '<text x="340" y="340" text-anchor="middle" fill="#bbb" font-family="monospace" font-size="13">העלי SVG והרכיבי</text>'
    );
    document.getElementById('mainSVG').innerHTML = parts.join('\n');
    return;
  }

  placements.forEach((p) => {
    const glyph = parsedGlyphCache[p.letter];
    if (!glyph) return;
    parts.push(
      glyphShapedMarkup({
        x: p.x,
        y: p.y,
        rot: (p.angle * 180) / Math.PI,
        size: p.sz,
        stroke: STROKE_BLACK,
        viewBox: glyph.viewBox || '0 0 ' + glyph.vw + ' ' + glyph.vh,
        inner: glyph.inner,
        flipX: p.flipX,
        flipY: p.flipY,
        className: 'amulet-glyph'
      })
    );
  });

  document.getElementById('mainSVG').innerHTML = parts.join('\n');
}

function doSaveSVG() {
  const svgEl = document.getElementById('mainSVG');
  const str =
    '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svgEl);
  const url = URL.createObjectURL(new Blob([str], { type: 'image/svg+xml' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'amulet_' + currentCat + '.svg';
  a.click();
  URL.revokeObjectURL(url);
}

function doSavePNG() {
  const str = new XMLSerializer().serializeToString(document.getElementById('mainSVG'));
  const img = new Image();
  img.onload = () => {
    const oc = document.createElement('canvas');
    oc.width = W;
    oc.height = H;
    const ctx = oc.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0);
    const a = document.createElement('a');
    a.href = oc.toDataURL('image/png');
    a.download = 'amulet_' + currentCat + '.png';
    a.click();
  };
  img.src = 'data:image/svg+xml;base64,' + svgToBase64Safe(str);
}

function svgToPNG64(svgText, size) {
  return new Promise((resolve) => {
    let clean = svgText
      .trim()
      .replace(/^<\?xml[^>]*\?>\s*/i, '')
      .replace(/^<!DOCTYPE[^>]*>\s*/i, '');
    clean = clean.replace(/^(<svg[^>]*)\sfill="none"/i, '$1');
    if (!/xmlns/i.test(clean)) {
      clean = clean.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    clean = clean.replace(/(<svg[^>]*)\swidth="[^"]*"/i, '$1');
    clean = clean.replace(/(<svg[^>]*)\sheight="[^"]*"/i, '$1');
    clean = clean.replace('<svg', '<svg width="' + size + '" height="' + size + '"');

    const draw = (src, onFail) => {
      const img = new Image();
      img.onload = () => {
        const oc = document.createElement('canvas');
        oc.width = size;
        oc.height = size;
        const ctx = oc.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        const data = oc.toDataURL('image/png').split(',')[1];
        resolve(data && data.length > 100 ? data : null);
      };
      img.onerror = onFail;
      img.src = src;
    };

    const blob = new Blob([clean], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    draw(url, () => {
      URL.revokeObjectURL(url);
      const fr = new FileReader();
      fr.onload = (ev) => {
        draw(ev.target.result, () => resolve(null));
      };
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  });
}

function svgToBase64Safe(str) {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin);
  }
}

/**
 * One Hebrew letter per word: first available letter in the word that is not
 * already used by an earlier word (if the first letter repeats, use the second, etc.).
 */
function getFirstLetters(str) {
  const avail = new Set(availableGlyphLetters.length ? availableGlyphLetters : HEB);
  const used = new Set();
  const out = [];

  for (const word of str.split(/\s+/).filter((w) => w.length > 0)) {
    if (out.length >= MAX_COMPOSE_LETTERS) break;
    let picked = null;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      if (!avail.has(ch) || used.has(ch)) continue;
      picked = ch;
      break;
    }
    if (picked) {
      used.add(picked);
      out.push(picked);
    }
  }
  return out;
}

function setStatus(msg) {
  const sb = document.getElementById('statusbar');
  sb.innerHTML = msg;
  sb.style.display = 'block';
  clearTimeout(statusTimer);
  if (!msg.includes('spinner')) {
    statusTimer = setTimeout(() => {
      sb.style.display = 'none';
    }, 7000);
  }
}

// --- connections.json + glyphs/ amulet builder ---
// Each connection: { from, to, intent, x, y, scale, rotation, flipX, flipY, flipXFrom, flipYFrom }
// x/y/rotation are relative to the previous glyph; scale multiplies the previous scale.

const GLYPHS_DIR = 'glyphs';
const DEFAULT_CONNECTION = { x: 90, y: 0, scale: 1, rotation: 0 };
const DEFAULT_GLYPH_SIZE = 150;
const STROKE_BLACK = '#000';

const BUILTIN_SYMBOLS = {
  circle: { viewBox: '0 0 100 100' },
  triangle: { viewBox: '0 0 100 100' },
  arc: { viewBox: '0 0 100 100' },
  dot: { viewBox: '0 0 100 100' }
};

function clampNum(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function buildArcPath(cx, cy, r, spanDeg) {
  const span = clampNum(spanDeg, 30, 330);
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
  if (t === 'circle') return '<circle cx="50" cy="50" r="40"/>';
  if (t === 'dot') return '<circle cx="50" cy="50" r="14"/>';
  if (t === 'triangle') {
    const ratio = clampNum(sym.triangleRatio || 1, 0.5, 2);
    return (
      '<g transform="translate(50 50) scale(' +
      ratio.toFixed(3) +
      ' 1) translate(-50 -50)"><path d="M50 12 L88 88 L12 88 Z"/></g>'
    );
  }
  if (t === 'arc') {
    return '<path d="' + buildArcPath(50, 52, 38, sym.arcAngle || 180) + '"/>';
  }
  return '';
}

function getRawConnection(connections, from, to, intent) {
  const matches = (connections || []).filter(
    (c) => c.from === from && c.to === to && c.intent === intent
  );
  return matches.length ? matches[matches.length - 1] : null;
}

/** Symbols from each hub link, shifted by the same relative offset as glyphs */
function collectConnectionSymbols(usedPairs, connections, intent, byLetter) {
  const CC = window.ConnectionCore;
  const out = [];
  const seen = new Set();
  for (const pair of usedPairs) {
    const key = pair.from + '\u2192' + pair.to;
    if (seen.has(key)) continue;
    seen.add(key);
    const raw = getRawConnection(connections, pair.from, pair.to, intent);
    if (!raw?.symbols?.length) continue;

    const norm = CC.normalizeConnection(raw);
    const refPl = byLetter?.get(pair.from);
    if (!norm || !refPl) {
      out.push(...raw.symbols);
      continue;
    }

    const ox = norm.fromGlyph.x;
    const oy = norm.fromGlyph.y;
    for (const sym of raw.symbols) {
      out.push({
        ...sym,
        x: refPl.x + (Number(sym.x) - ox),
        y: refPl.y + (Number(sym.y) - oy)
      });
    }
  }
  return out;
}

function symbolGroupMarkup(sym) {
  const def = BUILTIN_SYMBOLS[sym.type];
  if (!def) return '';
  const size = Number(sym.size) || 64;
  const inner = buildSymbolInner(sym);
  const mode = sym.fillMode || 'stroke';
  const fill = mode === 'stroke' ? 'none' : STROKE_BLACK;
  const stroke = mode === 'fill' ? 'none' : STROKE_BLACK;
  const sw = clampNum(sym.strokeWidth != null ? sym.strokeWidth : 2, 1, 10);
  const rot = Number(sym.rotation) || 0;
  const fx = sym.flipX ? -1 : 1;
  const fy = sym.flipY ? -1 : 1;
  const vb = def.viewBox.trim().split(/[\s,]+/).map(Number);
  const vw = vb[2] || 100;
  const vh = vb[3] || 100;
  const half = size / 2;

  return (
    '<g class="amulet-symbol" data-type="' +
    sym.type +
    '">' +
    '<g transform="translate(' +
    sym.x.toFixed(2) +
    ',' +
    sym.y.toFixed(2) +
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
    '<g fill="' +
    fill +
    '" stroke="' +
    stroke +
    '" stroke-width="' +
    sw +
    '" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" color="' +
    STROKE_BLACK +
    '">' +
    inner +
    '</g></svg></g></g>'
  );
}

let connectionsCache = null;
const glyphSvgCache = {};
const parsedGlyphCache = {};
let availableGlyphLetters = [];
let lastComposeLetters = [];
const MAX_COMPOSE_LETTERS = 8;

async function loadConnections(force) {
  if (connectionsCache && !force) {
    console.log('[connections] using cache:', connectionsCache.length, 'entries');
    return connectionsCache;
  }
  console.log('[connections] loading' + (force ? ' (forced refresh)' : '') + '...');
  if (location.protocol === 'file:') {
    throw new Error('פתחי את הדף דרך http://localhost:8080 (python3 server.py)');
  }
  try {
    const api = await fetch('/api/connections?t=' + Date.now(), { cache: 'no-store' });
    if (api.ok) {
      const data = await api.json();
      connectionsCache = data.connections || [];
      console.log('[connections] loaded from GET /api/connections:', connectionsCache.length, 'entries');
      return connectionsCache;
    }
    throw new Error('GET /api/connections → HTTP ' + api.status);
  } catch (err) {
    console.warn('[connections] API failed, trying connections.json:', err.message);
  }
  const res = await fetch('connections.json?t=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load connections.json');
  const data = await res.json();
  connectionsCache = data.connections || [];
  console.log('[connections] loaded from connections.json fallback:', connectionsCache.length, 'entries');
  return connectionsCache;
}

function lookupConnection(connections, from, to, intent) {
  console.log('[connections] lookup:', from, '→', to, 'intent=', intent);
  const CC = window.ConnectionCore;
  const found = CC.findConnection(connections, from, to, intent);
  if (found) {
    console.log('[connections] MATCH:', found);
    return found;
  }
  const fallback = CC.normalizeConnection({
    from,
    to,
    intent,
    fromGlyph: { x: CC.CANVAS.CX, y: CC.CANVAS.CY, rotation: 0, scale: 1, size: DEFAULT_GLYPH_SIZE },
    toGlyph: {
      x: CC.CANVAS.CX + 90,
      y: CC.CANVAS.CY,
      rotation: 0,
      scale: 1,
      size: DEFAULT_GLYPH_SIZE
    }
  });
  console.warn('[connections] NO MATCH — defaults:', fallback);
  return fallback;
}

function normalizeConnection(conn) {
  return window.ConnectionCore.normalizeConnection(conn);
}

function glyphFilename(letter) {
  if (letter === 'א') return 'א1.svg';
  return letter + '2.svg';
}

function ensureSvgString(svgText) {
  if (typeof svgText === 'string') return svgText;
  throw new Error('Glyph SVG must be a string, got ' + typeof svgText);
}

function hasGlyphLoaded(letter) {
  return (
    typeof glyphSvgCache[letter] === 'string' ||
    typeof svgStore[letter] === 'string' ||
    !!parsedGlyphCache[letter]
  );
}

async function loadGlyphSvg(letter) {
  if (glyphSvgCache[letter] != null && typeof glyphSvgCache[letter] !== 'string') {
    delete glyphSvgCache[letter];
  }
  if (typeof svgStore[letter] === 'string') {
    glyphSvgCache[letter] = svgStore[letter];
    return svgStore[letter];
  }
  const file = glyphFilename(letter);
  const url = GLYPHS_DIR + '/' + encodeURIComponent(file) + '?t=' + Date.now();
  console.log('[glyphs] filename:', file, 'fetch URL:', url);
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Glyph not found: ' + file + ' (HTTP ' + res.status + ')');
  }
  const text = ensureSvgString(await res.text());
  glyphSvgCache[letter] = text;
  svgStore[letter] = text;
  delete parsedGlyphCache[letter];
  return text;
}

async function getParsedGlyph(letter) {
  const text = await loadGlyphSvg(letter);
  const parsed = parseGlyphSvg(text);
  parsedGlyphCache[letter] = parsed;
  return parsed;
}

function parseGlyphSvg(svgText) {
  if (svgText && typeof svgText === 'object' && svgText.inner != null) {
    return svgText;
  }
  const clean = ensureSvgString(svgText)
    .trim()
    .replace(/^<\?xml[^>]*>\s*/i, '')
    .replace(/^<!DOCTYPE[^>]*>\s*/i, '');
  const doc = new DOMParser().parseFromString(clean, 'image/svg+xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid glyph SVG');
  }
  const el = doc.querySelector('svg');
  if (!el) throw new Error('No <svg> in glyph');
  const vb = el.getAttribute('viewBox') || '0 0 100 100';
  const vbp = vb.trim().split(/[\s,]+/).map(Number);
  const vw = vbp[2] || 100;
  const vh = vbp[3] || 100;
  const viewBox = el.getAttribute('viewBox') || '0 0 ' + vw + ' ' + vh;
  const inner = el.innerHTML
    .replace(/fill\s*=\s*["'](?!none)[^"']*["']/gi, 'fill="none"')
    .replace(/fill\s*:\s*(?!none)[^;}"']+/gi, 'fill:none');
  return {
    inner,
    vw,
    vh,
    viewBox
  };
}

/** Same nested-SVG rendering as editor — preserves original aspect ratio */
function glyphShapedMarkup(opts) {
  const { x, y, rot, size, stroke, viewBox, inner, flipX, flipY, className } = opts;
  const vb = viewBox.trim().split(/[\s,]+/).map(Number);
  const vw = vb[2] || 100;
  const vh = vb[3] || 100;
  const strokeW = ((2 * Math.max(vw, vh)) / size).toFixed(3);
  const fx = flipX ? -1 : 1;
  const fy = flipY ? -1 : 1;
  const half = size / 2;

  return (
    '<g class="' +
    (className || 'amulet-glyph') +
    '">' +
    '<g transform="translate(' +
    x.toFixed(2) +
    ',' +
    y.toFixed(2) +
    ') rotate(' +
    Number(rot).toFixed(2) +
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

function glyphGroupMarkup(placement, glyph) {
  const viewBox = glyph.viewBox || '0 0 ' + (glyph.vw || 100) + ' ' + (glyph.vh || 100);
  return glyphShapedMarkup({
    x: placement.x,
    y: placement.y,
    rot: Number(placement.rotation) || 0,
    size: placement.sz,
    stroke: STROKE_BLACK,
    viewBox,
    inner: glyph.inner,
    flipX: placement.flipX,
    flipY: placement.flipY,
    className: 'amulet-glyph amulet-glyph-' + placement.letter
  });
}

/** Fisher–Yates shuffle (in place) */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

const HUB_OVERLAP_DIST = 80;

function hubPositionOverlaps(x, y, byLetter, skipLetter) {
  for (const [letter, pl] of byLetter) {
    if (letter === skipLetter) continue;
    if (Math.hypot(x - pl.x, y - pl.y) < HUB_OVERLAP_DIST) return true;
  }
  return false;
}

/** Placement options for one letter: anchor link first, then links to other placed letters. */
function hubCandidatesForLetter(letter, anchor, byLetter, connections, intent, CC) {
  const candidates = [];
  const anchorPl = byLetter.get(anchor);
  const anchorConn = CC.findConnectionBetween(connections, anchor, letter, intent);
  if (anchorConn) {
    const pos = CC.placementRelativeTo(anchorConn, anchor, letter, anchorPl.x, anchorPl.y);
    if (pos) candidates.push({ pos, via: anchor, viaAnchor: true });
  }
  for (const [ref, refPl] of byLetter) {
    if (ref === anchor) continue;
    const conn = CC.findConnectionBetween(connections, ref, letter, intent);
    if (!conn) continue;
    const pos = CC.placementRelativeTo(conn, ref, letter, refPl.x, refPl.y);
    if (pos) candidates.push({ pos, via: ref, viaAnchor: false });
  }
  return candidates;
}

/**
 * Prefer anchor placement if it does not overlap; else first non-overlapping alternative;
 * else best-effort (anchor, then first candidate).
 */
function pickHubPlacement(candidates, byLetter, letter) {
  const viaAnchor = candidates.find((c) => c.viaAnchor);
  if (viaAnchor && !hubPositionOverlaps(viaAnchor.pos.x, viaAnchor.pos.y, byLetter, letter)) {
    return viaAnchor;
  }
  for (const c of candidates) {
    if (c.viaAnchor) continue;
    if (!hubPositionOverlaps(c.pos.x, c.pos.y, byLetter, letter)) return c;
  }
  if (viaAnchor) return viaAnchor;
  return candidates.length ? candidates[0] : null;
}

/**
 * Hub layout: anchor at center; each other letter via saved link to anchor when possible,
 * with overlap avoidance (80px) using alternate links to already-placed letters.
 */
function buildHubPlacements(letters, connections, intent) {
  const CC = window.ConnectionCore;
  const anchor = CC.pickHubAnchor(letters, connections, intent);
  const cx = CC.CANVAS.CX;
  const cy = CC.CANVAS.CY;
  const defaultSz = CC.CANVAS.DEFAULT_SIZE;

  const byLetter = new Map();
  byLetter.set(anchor, {
    letter: anchor,
    x: cx,
    y: cy,
    rotation: 0,
    sz: defaultSz,
    flipX: false,
    flipY: false
  });

  const links = [];
  const usedPairs = [];
  const skipped = [];

  const remaining = letters.filter((ch) => ch !== anchor);
  for (const letter of remaining) {
    const candidates = hubCandidatesForLetter(letter, anchor, byLetter, connections, intent, CC);
    const chosen = pickHubPlacement(candidates, byLetter, letter);
    if (!chosen) {
      skipped.push(letter);
      console.warn('[buildAmulet] no connection to place', letter);
      continue;
    }

    const pos = chosen.pos;
    const anchorCand = candidates.find((c) => c.viaAnchor);
    if (anchorCand && !chosen.viaAnchor) {
      console.log('[buildAmulet] overlap —', letter, 'placed via', chosen.via, 'not anchor');
    }

    byLetter.set(letter, {
      letter: pos.letter,
      x: pos.x,
      y: pos.y,
      rotation: pos.rotation,
      sz: pos.sz,
      flipX: pos.flipX,
      flipY: pos.flipY
    });
    usedPairs.push(pos.pair);
    links.push({ letter, label: pos.pair.from + '+' + pos.pair.to });
  }

  const placements = [byLetter.get(anchor)];
  for (const ch of letters) {
    if (ch !== anchor && byLetter.has(ch)) placements.push(byLetter.get(ch));
  }

  console.log(
    '[buildAmulet] hub',
    anchor,
    'placed:',
    placements.map((p) => p.letter).join(' '),
    skipped.length ? 'skipped:' + skipped.join(' ') : ''
  );
  return { placements, anchor, links, usedPairs, skipped, byLetter };
}

/**
 * Build amulet: hub at center (best-connected letter), linked letters from saved offsets.
 * @returns {Promise<{ svg: string, anchor: string, links: {letter:string,label:string}[] }>}
 */
async function buildAmulet(letters, intent, connectionsIn) {
  if (!letters || !letters.length) {
    throw new Error('buildAmulet: letters array is required');
  }

  const connections = connectionsIn || (await loadConnections(true));
  const uniqueLetters = [];
  for (const ch of letters) {
    if (!uniqueLetters.includes(ch)) uniqueLetters.push(ch);
  }
  console.log('[buildAmulet] letters:', uniqueLetters.join(' '), 'intent:', intent);

  const { placements, anchor, links, usedPairs, skipped, byLetter } = buildHubPlacements(
    uniqueLetters,
    connections,
    intent
  );
  console.log('[buildAmulet] glyphs to draw:', placements.length, placements);

  const connectionSymbols = collectConnectionSymbols(
    usedPairs,
    connections,
    intent,
    byLetter
  );
  console.log('[buildAmulet] connection symbols:', connectionSymbols.length);

  const groups = [];
  connectionSymbols.forEach((sym) => {
    groups.push(symbolGroupMarkup(sym));
  });

  const drawErrors = [];
  for (const p of placements) {
    try {
      const glyph = await getParsedGlyph(p.letter);
      groups.push(glyphGroupMarkup(p, glyph));
    } catch (err) {
      drawErrors.push(p.letter);
      console.warn('[buildAmulet] skip glyph', p.letter, err);
    }
  }

  if (!groups.length) {
    throw new Error(
      'לא ניתן לצייר אף אות — בדקי חיבורים וקבצי SVG' +
        (skipped.length ? ' (דולגו: ' + skipped.join(' ') + ')' : '')
    );
  }

  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    W +
    '" height="' +
    H +
    '" viewBox="0 0 ' +
    W +
    ' ' +
    H +
    '">\n' +
    '<rect width="' +
    W +
    '" height="' +
    H +
    '" fill="white"/>\n' +
    groups.join('\n') +
    '\n</svg>';

  return {
    svg,
    anchor,
    placements,
    links,
    skipped,
    drawErrors,
    symbolCount: connectionSymbols.length,
    placedCount: placements.length
  };
}

function centreGlyphPlacements(pl) {
  if (!pl.length) return pl;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  pl.forEach((p) => {
    minX = Math.min(minX, p.x - p.sz / 2);
    maxX = Math.max(maxX, p.x + p.sz / 2);
    minY = Math.min(minY, p.y - p.sz / 2);
    maxY = Math.max(maxY, p.y + p.sz / 2);
  });
  const ox = CX - (minX + maxX) / 2;
  const oy = CY - (minY + maxY) / 2;
  return pl.map((p) => ({ ...p, x: p.x + ox, y: p.y + oy }));
}

window.buildAmulet = buildAmulet;
window.loadConnections = loadConnections;
window.invalidateConnectionsCache = invalidateConnectionsCache;

init();
