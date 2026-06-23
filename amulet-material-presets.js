/**
 * Premium amulet material library — stable preset IDs and PBR specs.
 * Used by Q5 ceramic/frame and Q4 stone layers. Do not rename IDs lightly.
 */

export const PREMIUM_MATERIAL_IDS = {
  DRAGON_GLASS: 'dragon_glass',
  CHROME_METAL: 'chrome_metal',
  MATTE_POLYMER: 'matte_polymer',
  DRY_TERRACOTTA: 'dry_terracotta',
  VOLCANIC_STONE: 'volcanic_stone',
  ANCIENT_STONEWARE: 'ancient_stoneware',
  DEEP_STONEWARE: 'deep_stoneware',
  WARM_MOONSTONE: 'warm_moonstone',
  POLISHED_JADE_MARBLE: 'polished_jade_marble',
  POLISHED_SLATE_MARBLE: 'polished_slate_marble',
  SAGE_STONE: 'sage_stone',
  ARCHAEOLOGICAL_DOUBT: 'archaeological_doubt',
};

/** @typedef {'ceramic' | 'stone'} PremiumMaterialKind */

export const PREMIUM_MATERIAL_LIBRARY = {
  [PREMIUM_MATERIAL_IDS.DRAGON_GLASS]: {
    label: 'Dragon Glass',
    kind: 'ceramic',
    dragonGlass: {
      transmission: 1.0,
      roughness: 0.0,
      metalness: 0.0,
      ior: 1.75,
      thickness: 2.3,
      dispersion: 2.04,
      attenuationDistance: 0.15,
      transparent: true,
    },
    envMapIntensity: 1.0,
    defaultAttenuation: [0.75, 0.8, 0.82],
  },
  [PREMIUM_MATERIAL_IDS.CHROME_METAL]: {
    label: 'Chrome Metal',
    kind: 'ceramic',
    color: 0xffffff,
    metalness: 1.0,
    roughness: 0.0,
    envMapIntensity: 2.5,
    clearcoat: 1.0,
    clearcoatRoughness: 0.0,
  },
  [PREMIUM_MATERIAL_IDS.MATTE_POLYMER]: {
    label: 'Matte Polymer',
    kind: 'ceramic',
    color: 0xf2f2ee,
    metalness: 0.0,
    roughness: 0.92,
    clearcoat: 0.0,
    envMapIntensity: 0.3,
  },
  [PREMIUM_MATERIAL_IDS.DRY_TERRACOTTA]: {
    label: 'Dry Terracotta',
    kind: 'stone',
    color: 0xd46f42,
    metalness: 0.0,
    roughness: 1.0,
    clearcoat: 0.0,
    envMapIntensity: 0.05,
    proceduralVariant: 'dry_terracotta',
    erodedArtifact: true,
  },
  [PREMIUM_MATERIAL_IDS.VOLCANIC_STONE]: {
    label: 'Volcanic Stone',
    kind: 'stone',
    color: 0x232525,
    metalness: 0.0,
    roughness: 0.88,
    clearcoat: 0.05,
    clearcoatRoughness: 0.35,
    envMapIntensity: 0.15,
    proceduralVariant: 'volcanic',
    bumpScale: 0.36,
    normalScale: 0.24,
  },
  [PREMIUM_MATERIAL_IDS.ANCIENT_STONEWARE]: {
    label: 'Ancient Stoneware',
    kind: 'stone',
    color: 0x232b27,
    metalness: 0.0,
    roughness: 0.82,
    clearcoat: 0.14,
    clearcoatRoughness: 0.72,
    envMapIntensity: 0.22,
    proceduralVariant: 'soft_stoneware_signs',
    softGeometry: true,
    bumpScale: 0.2,
    normalScale: 0.16,
  },
  [PREMIUM_MATERIAL_IDS.DEEP_STONEWARE]: {
    label: 'Seafoam Jade Gut',
    kind: 'stone',
    color: 0x7aab98,
    metalness: 0.0,
    roughness: 0.48,
    clearcoat: 0.72,
    clearcoatRoughness: 0.28,
    envMapIntensity: 0.58,
    proceduralVariant: 'seafoam_jade_gut',
    softGeometry: true,
    bumpScale: 0.24,
    normalScale: 0.2,
  },
  [PREMIUM_MATERIAL_IDS.WARM_MOONSTONE]: {
    label: 'Basalt',
    kind: 'stone',
    color: 0x1a1a1a,
    metalness: 0.05,
    roughness: 0.85,
    clearcoat: 0.0,
    envMapIntensity: 0.0,
    proceduralVariant: 'basalt',
    displacementScale: 0.25,
    normalScale: 1.2,
    bumpScale: 0.38,
  },
  [PREMIUM_MATERIAL_IDS.POLISHED_JADE_MARBLE]: {
    label: 'Polished Jade Marble',
    kind: 'stone',
    color: 0x4d9178,
    metalness: 0.0,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.8,
    proceduralVariant: 'polished_jade_marble',
    bumpScale: 0.1,
    normalScale: 0.14,
  },
  [PREMIUM_MATERIAL_IDS.POLISHED_SLATE_MARBLE]: {
    label: 'Polished Slate Marble',
    kind: 'stone',
    color: 0x2b383b,
    metalness: 0.0,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.6,
    proceduralVariant: 'polished_slate_marble',
    bumpScale: 0.1,
    normalScale: 0.14,
  },
  [PREMIUM_MATERIAL_IDS.SAGE_STONE]: {
    label: 'Sage Stone',
    kind: 'stone',
    color: 0xb5b1a9,
    metalness: 0.0,
    roughness: 0.96,
    clearcoat: 0.0,
    envMapIntensity: 0.0,
    proceduralVariant: 'sage',
    bumpScale: 0.98,
    normalScale: 0.64,
  },
  [PREMIUM_MATERIAL_IDS.ARCHAEOLOGICAL_DOUBT]: {
    label: 'Polished Warm Marble',
    kind: 'stone',
    color: 0xb6afa5,
    metalness: 0.0,
    roughness: 0.06,
    clearcoat: 1.0,
    clearcoatRoughness: 0.018,
    envMapIntensity: 1.55,
    transmission: 0.34,
    thickness: 2.1,
    ior: 1.56,
    attenuationColor: [0.71, 0.68, 0.63],
    attenuationDistance: 0.88,
    proceduralVariant: 'polished_warm_marble_doubt',
    softGeometry: true,
    bumpScale: 0.05,
    normalScale: 0.1,
    sharpRelief: true,
  },
};

const PRESET_ALIASES = {
  dragon: PREMIUM_MATERIAL_IDS.DRAGON_GLASS,
  chrome: PREMIUM_MATERIAL_IDS.CHROME_METAL,
  matte: PREMIUM_MATERIAL_IDS.MATTE_POLYMER,
  bronze: 'bronze_metal',
  volcanic: PREMIUM_MATERIAL_IDS.VOLCANIC_STONE,
  terracotta: PREMIUM_MATERIAL_IDS.DRY_TERRACOTTA,
  stoneware: PREMIUM_MATERIAL_IDS.ANCIENT_STONEWARE,
  ancient_stoneware: PREMIUM_MATERIAL_IDS.ANCIENT_STONEWARE,
  deep_stoneware: PREMIUM_MATERIAL_IDS.DEEP_STONEWARE,
  jade: PREMIUM_MATERIAL_IDS.ANCIENT_STONEWARE,
  jade_stone: PREMIUM_MATERIAL_IDS.ANCIENT_STONEWARE,
  polished_jade: PREMIUM_MATERIAL_IDS.ANCIENT_STONEWARE,
  slate: PREMIUM_MATERIAL_IDS.DEEP_STONEWARE,
  gut_slate: PREMIUM_MATERIAL_IDS.DEEP_STONEWARE,
  moonstone: PREMIUM_MATERIAL_IDS.WARM_MOONSTONE,
  warm_moonstone: PREMIUM_MATERIAL_IDS.WARM_MOONSTONE,
  sage: PREMIUM_MATERIAL_IDS.SAGE_STONE,
  doubt: PREMIUM_MATERIAL_IDS.ARCHAEOLOGICAL_DOUBT,
  archaeological_doubt: PREMIUM_MATERIAL_IDS.ARCHAEOLOGICAL_DOUBT,
};

/** Resolve legacy shorthand IDs to library preset IDs. */
export function normalizePremiumMaterialId(id) {
  if (!id) return PREMIUM_MATERIAL_IDS.SAGE_STONE;
  return PRESET_ALIASES[id] ?? id;
}

export function getPremiumMaterialSpec(presetId) {
  const key = normalizePremiumMaterialId(presetId);
  return PREMIUM_MATERIAL_LIBRARY[key] ?? PREMIUM_MATERIAL_LIBRARY[PREMIUM_MATERIAL_IDS.SAGE_STONE];
}

export function isErodedStonePreset(presetId) {
  return normalizePremiumMaterialId(presetId) === PREMIUM_MATERIAL_IDS.DRY_TERRACOTTA;
}

export function isAgedTerracottaPreset(_presetId) {
  return false;
}

/** 0 = default, 1 = soft stoneware, 2 = ultra-soft carved jade / moonstone. */
export function softStoneGeometryTier(presetId) {
  const key = normalizePremiumMaterialId(presetId);
  const spec = PREMIUM_MATERIAL_LIBRARY[key];
  if (spec?.softGeometry) return 1;
  return 0;
}

export function isSoftStonewarePreset(presetId) {
  return softStoneGeometryTier(presetId) >= 1;
}

export function isSharpReliefStonePreset(presetId) {
  const key = normalizePremiumMaterialId(presetId);
  const spec = PREMIUM_MATERIAL_LIBRARY[key];
  return !!spec?.sharpRelief || key === PREMIUM_MATERIAL_IDS.ARCHAEOLOGICAL_DOUBT;
}

export function stoneProceduralVariant(presetId) {
  return getPremiumMaterialSpec(presetId).proceduralVariant ?? 'sage';
}
