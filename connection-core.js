/* Shared connection model — absolute glyph positions on 680×680 canvas */

const CANVAS = { W: 680, H: 680, CX: 340, CY: 340, DEFAULT_SIZE: 150 };

/** Final Hebrew letters → regular forms (for connection lookup and glyphs). */
const SOFIT_TO_REGULAR = Object.freeze({
  '\u05DD': '\u05DE', // ם → מ
  '\u05DF': '\u05E0', // ן → נ
  '\u05E5': '\u05E6', // ץ → צ
  '\u05DA': '\u05DB', // ך → כ
  '\u05E3': '\u05E4' // ף → פ
});

function normalizeSofitLetter(ch) {
  return SOFIT_TO_REGULAR[ch] || ch;
}

/** Dev cap — max letters per connected glyph chain (reduces SDF / render load). */
const MAX_CONNECTED_LETTERS = 3;

function limitConnectedLetters(letters, max = MAX_CONNECTED_LETTERS) {
  if (!letters?.length) return [];
  return letters.slice(0, Math.max(0, max));
}

const DEFAULT_GLYPH = () => ({
  x: CANVAS.CX,
  y: CANVAS.CY,
  rotation: 0,
  scale: 1,
  size: CANVAS.DEFAULT_SIZE,
  flipX: false,
  flipY: false
});

function round2(n) {
  return Math.round(n * 100) / 100;
}

function normalizeGlyph(g, fallback) {
  const base = fallback || DEFAULT_GLYPH();
  if (!g || typeof g !== 'object') return { ...base };
  const scale = Number(g.scale) > 0 ? Number(g.scale) : 1;
  const size = Number(g.size) > 0 ? Number(g.size) : CANVAS.DEFAULT_SIZE * scale;
  return {
    x: round2(Number(g.x) ?? base.x),
    y: round2(Number(g.y) ?? base.y),
    rotation: round2(Number(g.rotation) || 0),
    scale: round2(scale),
    size: round2(size),
    flipX: !!g.flipX,
    flipY: !!g.flipY
  };
}

/**
 * Normalize a connection record (new nested format or legacy relative).
 */
function normalizeConnection(conn) {
  if (!conn) return null;

  if (conn.fromGlyph && conn.toGlyph) {
    return {
      from: conn.from,
      to: conn.to,
      intent: conn.intent,
      fromGlyph: normalizeGlyph(conn.fromGlyph),
      toGlyph: normalizeGlyph(conn.toGlyph)
    };
  }

  const fromX = Number(conn.fromX) || 0;
  const fromY = Number(conn.fromY) || 0;
  let ax = CANVAS.CX + fromX;
  let ay = CANVAS.CY + fromY;

  if (conn.fromAbsoluteX != null) ax = Number(conn.fromAbsoluteX);
  if (conn.fromAbsoluteY != null) ay = Number(conn.fromAbsoluteY);

  let bx;
  let by;
  if (conn.toAbsoluteX != null && conn.toAbsoluteY != null) {
    bx = Number(conn.toAbsoluteX);
    by = Number(conn.toAbsoluteY);
  } else if (conn.toX != null && conn.toY != null) {
    bx = Number(conn.toX);
    by = Number(conn.toY);
  } else {
    bx = ax + (Number(conn.x) || 0);
    by = ay + (Number(conn.y) || 0);
  }

  const baseSize = CANVAS.DEFAULT_SIZE;
  const bScale = Number(conn.scale) > 0 ? Number(conn.scale) : 1;

  return {
    from: conn.from,
    to: conn.to,
    intent: conn.intent,
    fromGlyph: normalizeGlyph({
      x: ax,
      y: ay,
      rotation: Number(conn.fromRotation) || 0,
      scale: Number(conn.fromScale) > 0 ? Number(conn.fromScale) : 1,
      size: Number(conn.fromSize) || baseSize,
      flipX: conn.flipXFrom,
      flipY: conn.flipYFrom
    }),
    toGlyph: normalizeGlyph({
      x: bx,
      y: by,
      rotation: Number(conn.rotation) || 0,
      scale: bScale,
      size: baseSize * bScale,
      flipX: conn.flipX,
      flipY: conn.flipY
    })
  };
}

function findConnection(connections, from, to, intent) {
  const matches = (connections || []).filter(
    (c) => c.from === from && c.to === to && c.intent === intent
  );
  if (!matches.length) return null;
  return normalizeConnection(matches[matches.length - 1]);
}

/** Saved link between two letters in either direction (normalized). */
function findConnectionBetween(connections, a, b, intent) {
  return findConnection(connections, a, b, intent) || findConnection(connections, b, a, intent);
}

/** שכבת שם — אם אין חיבור בכוונה הנוכחית (למשל זימון), מנסה גם הגנה */
function findConnectionBetweenWithFallback(connections, a, b, intent) {
  const primary = findConnectionBetween(connections, a, b, intent);
  if (primary) return primary;
  if (intent !== 'protection') {
    return findConnectionBetween(connections, a, b, 'protection');
  }
  return null;
}

/**
 * Among `letters`, pick the one with the most saved connections (this intent)
 * to another letter in the same set. Ties keep the earlier entry in `letters`.
 */
function pickHubAnchor(letters, connections, intent) {
  if (!letters?.length) return null;
  const set = new Set(letters);
  let best = letters[0];
  let bestCount = -1;
  for (const letter of letters) {
    let count = 0;
    for (const c of connections || []) {
      if (c.intent !== intent) continue;
      const other = c.from === letter ? c.to : c.to === letter ? c.from : null;
      if (other && other !== letter && set.has(other)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = letter;
    }
  }
  return best;
}

function placementFromGlyph(letter, g) {
  return {
    letter,
    x: g.x,
    y: g.y,
    rotation: g.rotation,
    sz: g.size,
    flipX: g.flipX,
    flipY: g.flipY
  };
}

/** Offset of `to` glyph from `from` in a normalized connection (editor-absolute → relative). */
function connectionOffset(conn) {
  const n = normalizeConnection(conn);
  if (!n) return null;
  return {
    dx: n.toGlyph.x - n.fromGlyph.x,
    dy: n.toGlyph.y - n.fromGlyph.y
  };
}

/**
 * Place `targetLetter` relative to `refLetter` at (refX, refY) using saved offsets.
 * Uses toGlyph − fromGlyph along the stored edge; works when the link is reversed.
 */
function placementRelativeTo(conn, refLetter, targetLetter, refX, refY) {
  const n = normalizeConnection(conn);
  if (!n) return null;
  const f = n.fromGlyph;
  const t = n.toGlyph;
  const dx = t.x - f.x;
  const dy = t.y - f.y;

  if (n.from === refLetter && n.to === targetLetter) {
    return {
      letter: targetLetter,
      x: refX + dx,
      y: refY + dy,
      rotation: t.rotation,
      sz: t.size,
      flipX: t.flipX,
      flipY: t.flipY,
      pair: { from: n.from, to: n.to }
    };
  }
  if (n.from === targetLetter && n.to === refLetter) {
    return {
      letter: targetLetter,
      x: refX - dx,
      y: refY - dy,
      rotation: f.rotation,
      sz: f.size,
      flipX: f.flipX,
      flipY: f.flipY,
      pair: { from: n.from, to: n.to }
    };
  }
  return null;
}

/**
 * Build placements for a letter sequence using relative offsets chained from center.
 */
function getPlacementsForLetters(letters, connections, intent) {
  letters = limitConnectedLetters(letters);
  const placements = [];
  const n = letters.length;
  if (!n) return placements;

  if (n === 1) {
    placements.push(placementFromGlyph(letters[0], DEFAULT_GLYPH()));
    return placements;
  }

  placements.push(placementFromGlyph(letters[0], DEFAULT_GLYPH()));

  for (let i = 1; i < n; i++) {
    const prev = placements[i - 1];
    const conn = findConnectionBetween(connections, letters[i - 1], letters[i], intent);
    if (!conn) {
      console.warn('[connection-core] missing', letters[i - 1], '↔', letters[i], intent);
      placements.push(placementFromGlyph(letters[i], DEFAULT_GLYPH()));
      continue;
    }
    const pos = placementRelativeTo(conn, letters[i - 1], letters[i], prev.x, prev.y);
    if (!pos) {
      placements.push(placementFromGlyph(letters[i], DEFAULT_GLYPH()));
    } else {
      placements.push({
        letter: pos.letter,
        x: pos.x,
        y: pos.y,
        rotation: pos.rotation,
        sz: pos.sz,
        flipX: pos.flipX,
        flipY: pos.flipY
      });
    }
  }
  return placements;
}

/** Payload for POST /api/connections from editor canvas state */
function buildConnectionPayload(from, to, intent, glyphA, glyphB) {
  return {
    from,
    to,
    intent,
    fromGlyph: {
      x: round2(glyphA.x),
      y: round2(glyphA.y),
      rotation: round2(glyphA.rotation || 0),
      scale: round2(glyphA.scale > 0 ? glyphA.scale : 1),
      size: round2(glyphA.size),
      flipX: !!glyphA.flipX,
      flipY: !!glyphA.flipY
    },
    toGlyph: {
      x: round2(glyphB.x),
      y: round2(glyphB.y),
      rotation: round2(glyphB.rotation || 0),
      scale: round2(glyphB.scale > 0 ? glyphB.scale : 1),
      size: round2(glyphB.size),
      flipX: !!glyphB.flipX,
      flipY: !!glyphB.flipY
    }
  };
}

window.ConnectionCore = {
  CANVAS,
  SOFIT_TO_REGULAR,
  MAX_CONNECTED_LETTERS,
  limitConnectedLetters,
  normalizeSofitLetter,
  normalizeConnection,
  normalizeGlyph,
  findConnection,
  findConnectionBetween,
  findConnectionBetweenWithFallback,
  pickHubAnchor,
  connectionOffset,
  placementRelativeTo,
  getPlacementsForLetters,
  buildConnectionPayload,
  placementFromGlyph
};
