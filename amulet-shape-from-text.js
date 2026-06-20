/**
 * Deterministic amulet shape params from questionnaire free-text fields.
 * Same input text always yields the same geometry seeds and scalars.
 *
 * Layer mapping:
 *   Q2 name letters  → stone shape (fused glyph mask)
 *   Q3 why now     → stone engraving pattern
 *   Q4 belief      → metal plate ellipse aspect
 *   Q1 wish        → metal emboss pattern
 */

/** FNV-1a 32-bit hash — stable across runs. */
export function hashString(str) {
  let h = 2166136261;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededUnit(seed, salt) {
  const x = Math.sin((seed + salt * 127.1) * 43758.5453) * 43758.5453;
  return x - Math.floor(x);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Q4 belief → metal ellipse aspect (round/wide ↔ narrow/elongated). */
export const METAL_ELLIPSE_BY_BELIEF = {
  concrete_actions: { aspectX: 1.16, aspectY: 1.1, radiusScale: 0.5 },
  signs: { aspectX: 1.1, aspectY: 1.06, radiusScale: 0.48 },
  gut: { aspectX: 1.0, aspectY: 0.94, radiusScale: 0.46 },
  support: { aspectX: 0.96, aspectY: 0.9, radiusScale: 0.44 },
  doubt: { aspectX: 0.72, aspectY: 1.12, radiusScale: 0.4 },
};

/**
 * @param {string} wishText — Q1 wish
 * @param {string} requesterName — Q2 name (stone shape seed)
 * @param {string} timingReason — Q3 why now (stone engraving seed)
 * @param {string} [beliefKey] — Q4 belief (metal ellipse)
 */
export function deriveAmuletShapeParams(wishText, requesterName, timingReason, beliefKey = 'signs') {
  const wish = String(wishText || '').trim();
  const name = String(requesterName || '').trim();
  const timing = String(timingReason || '').trim();

  const nSeed = hashString(name || 'default-name');
  const tSeed = hashString(timing || 'default-timing');
  const wSeed = hashString(wish || 'default-wish');

  const stoneShapeParams = {
    seed: nSeed,
    lobeCount: 3 + Math.floor(seededUnit(nSeed, 1) * 5),
    wobbleAmp: lerp(0.12, 0.42, seededUnit(nSeed, 2)),
    aspectX: lerp(0.88, 1.28, seededUnit(nSeed, 3)),
    aspectY: lerp(0.92, 1.32, seededUnit(nSeed, 4)),
    baseRadius: lerp(165, 235, seededUnit(nSeed, 5)),
    pinch: seededUnit(nSeed, 6),
    noiseFreq: lerp(2, 6, seededUnit(nSeed, 7)),
    sourceText: name,
  };

  const stoneEngravingPattern = {
    seed: tSeed,
    text: timing,
    decorativeScale: lerp(0.72, 1.08, seededUnit(tSeed, 1)),
    grooveDepthMul: lerp(0.85, 1.25, seededUnit(tSeed, 2)),
    ornamentDensity: seededUnit(tSeed, 3),
  };

  const belief = METAL_ELLIPSE_BY_BELIEF[beliefKey] ?? METAL_ELLIPSE_BY_BELIEF.signs;
  const metalPlateParams = {
    belief: beliefKey,
    aspectX: belief.aspectX,
    aspectY: belief.aspectY,
    radiusScale: belief.radiusScale,
  };

  const metalEmbossPattern = {
    seed: hashString(wish + '|emboss'),
    text: wish,
    embossScale: lerp(0.62, 0.98, seededUnit(wSeed, 5)),
    embossHeightMul: lerp(0.85, 1.35, seededUnit(wSeed, 6)),
    embossRipple: lerp(0.08, 0.22, seededUnit(wSeed, 7)),
  };

  return { stoneShapeParams, stoneEngravingPattern, metalPlateParams, metalEmbossPattern };
}
