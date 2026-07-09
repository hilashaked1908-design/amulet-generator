/**
 * Luca fog - back: autonomous only. Front (over amulets): mouse gently repels fog.
 */
import * as THREE from './vendor/three.module.js';

const FOG_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

const FOG_FRAG = `
precision highp float;
uniform float uTime;
uniform float uTimeOffset;
uniform float uOpacity;
uniform float uDensity;
uniform float uSpeed;
uniform float uNoiseScale;
uniform float uLayerDeep;
uniform float uLayerLift;
uniform vec3 uColorDark;
uniform vec3 uColorLight;
uniform sampler2D uSmokeTex;
uniform vec2 uMouse;
uniform vec2 uMouseVel;
uniform float uMouseRadius;
uniform float uMousePush;
uniform float uMouseRepel;
uniform float uTopFadeLo;
uniform float uTopFadeHi;
uniform float uBottomBoost;
uniform float uTexMaskLoDeep;
uniform float uTexMaskLoLift;
uniform float uBaseFogLo;
uniform float uSmFogLo;
uniform float uColorLift;
uniform float uBaseNoiseLo;
uniform float uBaseNoiseHi;
uniform float uSmNoiseLo;
uniform float uSmNoiseHi;
uniform float uTexNoiseLoDeep;
uniform float uTexNoiseHiDeep;
uniform float uTexNoiseLoLift;
uniform float uTexNoiseHiLift;
uniform float uFogBandLo;
uniform float uFogBandHi;
uniform vec2 uMouseParallax;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.45);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += noise(p) * a;
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  float t = (uTime + uTimeOffset) * uSpeed;

  // Gentle repel: UV shifts away from cursor so fog drifts aside, disturbed by movement.
  vec2 mouseOffset = vec2(0.0);
  if (uMouse.x < 9000.0 && uMousePush > 0.0) {
    vec2 diff = vUv - uMouse;
    float d = length(diff);
    float influence = 1.0 - smoothstep(0.02, uMouseRadius, d);
    influence = influence * influence * 0.72;

    float velLen = length(uMouseVel);
    if (velLen > 0.00001) {
      vec2 velN = uMouseVel / velLen;
      float velAmt = min(velLen * 18.0, 1.0);
      mouseOffset += velN * (uMousePush * influence * velAmt);
    }

    vec2 dir = d > 0.0001 ? normalize(diff) : vec2(0.0);
    mouseOffset += dir * (uMousePush * 0.28 * influence);
  }

  vec2 fogUvDeep = vUv + mouseOffset * 0.42;
  vec2 fogUvLift = vUv + mouseOffset;

  vec2 baseP = fogUvDeep * uNoiseScale + vec2(t * 0.08, -t * 0.04);
  float baseN = fbm(baseP);
  baseN = smoothstep(uBaseNoiseLo, uBaseNoiseHi, baseN);
  float baseVertical =
    smoothstep(0.0, 0.06, fogUvDeep.y) *
    (1.0 - smoothstep(0.78, 1.0, fogUvDeep.y));
  float baseHorizontal =
    smoothstep(0.0, 0.1, fogUvDeep.x) *
    (1.0 - smoothstep(0.9, 1.0, fogUvDeep.x));
  float baseFog = baseVertical * baseHorizontal * mix(uBaseFogLo, 1.0, baseN);

  vec2 smP = fogUvLift * (uNoiseScale * 1.1) + vec2(0.17, -0.09);
  float smQx = fbm(smP + vec2(0.0, t * 0.14));
  float smQy = fbm(smP + vec2(4.7, -t * 0.1));
  vec2 smQ = vec2(smQx, smQy);
  vec2 smR;
  smR.x = fbm(smP + smQ + vec2(1.7, 9.2) + t * 0.11);
  smR.y = fbm(smP + smQ + vec2(8.3, 2.8) - t * 0.08);
  float smRawN = fbm(smP + smR * 2.2);
  float smShapedN = smoothstep(uSmNoiseLo, uSmNoiseHi, smRawN);
  float smVertical =
    smoothstep(0.0, 0.06, fogUvLift.y) *
    (1.0 - smoothstep(0.76, 1.0, fogUvLift.y));
  float smHorizontal =
    smoothstep(0.0, 0.08, fogUvLift.x) *
    (1.0 - smoothstep(0.92, 1.0, fogUvLift.x));
  float smFog = smVertical * smHorizontal * mix(uSmFogLo, 1.0, smShapedN);

  float topFade = 1.0 - smoothstep(uTopFadeLo, uTopFadeHi, vUv.y);
  float bottomPool = smoothstep(uTopFadeLo + 0.06, 0.0, vUv.y);
  baseFog *= topFade;
  smFog *= topFade;

  vec2 texUvDeep = fogUvDeep * 1.28 + vec2(t * 0.012, -t * 0.008);
  vec2 texUvLift = fogUvLift * 1.42 + vec2(-t * 0.018, t * 0.014);
  float texDeep = texture2D(uSmokeTex, texUvDeep).r;
  float texLift = texture2D(uSmokeTex, texUvLift).r;
  texDeep = smoothstep(uTexNoiseLoDeep, uTexNoiseHiDeep, texDeep);
  texLift = smoothstep(uTexNoiseLoLift, uTexNoiseHiLift, texLift);
  float texMaskDeep = mix(uTexMaskLoDeep, 1.0, texDeep);
  float texMaskLift = mix(uTexMaskLoLift, 1.0, texLift);

  float aDeep = baseFog * texMaskDeep * uDensity * uOpacity * uLayerDeep;
  float aLift = smFog * texMaskLift * uDensity * uOpacity * uLayerLift;
  aDeep *= mix(1.0, uBottomBoost, bottomPool);
  aLift *= mix(1.0, uBottomBoost * 1.1, bottomPool);
  aDeep = clamp(aDeep, 0.0, 1.0);
  aLift = clamp(aLift, 0.0, 1.0);
  float alpha = 1.0 - (1.0 - aDeep) * (1.0 - aLift);
  alpha = clamp(alpha, 0.0, 1.0);
  float bottomBand = uFogBandHi > uFogBandLo
    ? 1.0 - smoothstep(uFogBandLo, uFogBandHi, vUv.y)
    : 1.0;
  alpha *= bottomBand;

  float colorMask = mix(baseN, smShapedN, 0.55) * mix(0.85, 1.0, max(texDeep, texLift));
  vec3 fogColor = mix(uColorDark, uColorLight, clamp(colorMask * uColorLift, 0.0, 1.0));
  gl_FragColor = vec4(fogColor, alpha);
}
`;

const VEIL_FRAG = `
precision highp float;
uniform float uTime;
uniform float uTimeOffset;
uniform float uOpacity;
uniform float uSpeed;
uniform float uNoiseScale;
uniform vec3 uColorDark;
uniform vec3 uColorLight;
varying vec2 vUv;

float vHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float vNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = vHash(i);
  float b = vHash(i + vec2(1.0, 0.0));
  float c = vHash(i + vec2(0.0, 1.0));
  float d = vHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float vFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += vNoise(p) * a;
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  float t = (uTime + uTimeOffset) * uSpeed;
  float n = vFbm(vUv * uNoiseScale + vec2(t * 0.035, -t * 0.025));
  n = smoothstep(0.38, 0.62, n);
  float alpha = uOpacity * mix(0.94, 1.0, n);
  vec3 col = mix(uColorDark, uColorLight, n * 0.18);
  gl_FragColor = vec4(col, alpha);
}
`;

const GARDEN_FOG_PARAMS = {
  x: 0,
  y: -0.18,
  z: 0.35,
  width: 15,
  height: 10,
  mouseRadius: 0.28,
  mousePush: 0.085,
  useFrontLayer: true,
  veil: {
    renderOrder: 5,
    distance: 14.2,
    scale: 2.12,
    opacity: 0.992,
    speed: 0.055,
    noiseScale: 1.65,
    timeOffset: 0,
    colorDark: '#000000',
    colorLight: '#1a1a1a',
  },
  back: {
    renderOrder: 0,
    distance: 5.6,
    scale: 1.38,
    opacity: 0.36,
    density: 0.32,
    speed: 0.062,
    noiseScale: 2.35,
    timeOffset: 0,
    layerDeep: 0.55,
    layerLift: 0.22,
    colorDark: '#c4c8d4',
    colorLight: '#F4F4E8',
    topFadeLo: 0.46,
    topFadeHi: 0.62,
    bottomBoost: 1.1,
    texMaskLoDeep: 0,
    texMaskLoLift: 0,
    baseFogLo: 0,
    smFogLo: 0,
    colorLift: 0.9,
    baseNoiseLo: 0.4,
    baseNoiseHi: 0.9,
    smNoiseLo: 0.45,
    smNoiseHi: 0.92,
    texNoiseLoDeep: 0.38,
    texNoiseHiDeep: 0.78,
    texNoiseLoLift: 0.42,
    texNoiseHiLift: 0.82,
  },
  front: {
    renderOrder: 7,
    distance: 2.8,
    scale: 1.28,
    opacity: 0.58,
    density: 0.5,
    speed: 0.118,
    noiseScale: 2.45,
    timeOffset: 8.6,
    layerDeep: 0.76,
    layerLift: 0.85,
    colorDark: '#c8ccd8',
    colorLight: '#F4F4E8',
    topFadeLo: 0.5,
    topFadeHi: 0.66,
    bottomBoost: 1.4,
    mousePush: 0.1,
    texMaskLoDeep: 0.12,
    texMaskLoLift: 0.16,
    baseFogLo: 0.08,
    smFogLo: 0.12,
    colorLift: 1,
  },
};

/** Questionnaire vector preview - soft cloudy veil over amulet frame only. */
const VECTOR_PREVIEW_FOG_PARAMS = {
  x: 0,
  y: -0.06,
  z: 0.24,
  width: 13,
  height: 13,
  mouseRadius: 0.22,
  mousePush: 0.045,
  useFrontLayer: true,
  back: {
    renderOrder: 0,
    distance: 5.4,
    scale: 1.28,
    opacity: 0.62,
    density: 0.66,
    speed: 0.088,
    noiseScale: 2.25,
    timeOffset: 0,
    layerDeep: 0.9,
    layerLift: 0.72,
    colorDark: '#000000',
    colorLight: '#F4F4E8',
    topFadeLo: 0.0,
    topFadeHi: 1.0,
    bottomBoost: 1.65,
    texMaskLoDeep: 0.16,
    texMaskLoLift: 0.2,
    baseFogLo: 0.1,
    smFogLo: 0.14,
    colorLift: 1,
  },
  front: {
    renderOrder: 2,
    distance: 1.65,
    scale: 1.06,
    opacity: 0.42,
    density: 0.58,
    speed: 0.102,
    noiseScale: 2.35,
    timeOffset: 4.8,
    layerDeep: 0.66,
    layerLift: 1.02,
    colorDark: '#000000',
    colorLight: '#F4F4E8',
    topFadeLo: 0.0,
    topFadeHi: 1.0,
    bottomBoost: 1.9,
    mousePush: 0.035,
  },
};

/** Loader - strong white fog on black (detail + create full-page). */
const LOADER_FOG_PARAMS = {
  x: 0,
  y: -0.18,
  z: 0.35,
  width: 15,
  height: 10,
  mouseRadius: 0.28,
  mousePush: 0.085,
  back: {
    renderOrder: 0,
    distance: 5.0,
    scale: 1.46,
    opacity: 1.0,
    density: 0.82,
    speed: 0.118,
    noiseScale: 2.05,
    timeOffset: 0,
    layerDeep: 1.0,
    layerLift: 0.76,
    colorDark: '#000000',
    colorLight: '#F4F4E8',
    topFadeLo: 0.0,
    topFadeHi: 1.0,
    bottomBoost: 2.2,
  },
  front: {
    renderOrder: 3,
    distance: 1.55,
    scale: 1.14,
    opacity: 1.0,
    density: 0.78,
    speed: 0.128,
    noiseScale: 2.65,
    timeOffset: 8.6,
    layerDeep: 0.72,
    layerLift: 1.12,
    colorDark: '#000000',
    colorLight: '#F4F4E8',
    topFadeLo: 0.0,
    topFadeHi: 1.0,
    bottomBoost: 2.9,
  },
};

/** Detail page - full fog strength; lives behind UI (z-index 0). */
const DETAIL_FOG_PARAMS = {
  ...GARDEN_FOG_PARAMS,
  useFrontLayer: true,
  veil: {
    renderOrder: 5,
    distance: 14.2,
    scale: 2.12,
    opacity: 0.992,
    speed: 0.055,
    noiseScale: 1.65,
    timeOffset: 0,
    colorDark: '#000000',
    colorLight: '#1a1a1a',
  },
  back: {
    ...GARDEN_FOG_PARAMS.back,
    opacity: 0.96,
    density: 0.74,
    layerDeep: 0.98,
    layerLift: 0.7,
    colorDark: '#c4c8d4',
    colorLight: '#F4F4E8',
    bottomBoost: 2.2,
    texMaskLoDeep: 0.32,
    texMaskLoLift: 0.36,
    baseFogLo: 0.65,
    smFogLo: 0.68,
    colorLift: 1,
  },
  front: {
    ...GARDEN_FOG_PARAMS.front,
    renderOrder: 7,
    opacity: 0.88,
    density: 0.74,
    layerDeep: 0.76,
    layerLift: 1.14,
    colorDark: '#c8ccd8',
    colorLight: '#F4F4E8',
    bottomBoost: 2.15,
    texMaskLoDeep: 0.32,
    texMaskLoLift: 0.36,
    baseFogLo: 0.65,
    smFogLo: 0.68,
    colorLift: 1,
  },
};

/** Result overlay - stronger lift on black background */
const RESULT_FOG_PARAMS = {
  ...GARDEN_FOG_PARAMS,
  y: -0.12,
  useFrontLayer: true,
  back: {
    ...GARDEN_FOG_PARAMS.back,
    opacity: 0.94,
    density: 0.62,
    layerLift: 0.58,
    texMaskLoDeep: 0.32,
    texMaskLoLift: 0.36,
    baseFogLo: 0.65,
    smFogLo: 0.68,
    colorLift: 1,
  },
  front: {
    ...GARDEN_FOG_PARAMS.front,
    opacity: 1,
    density: 0.68,
    layerLift: 1.08,
    bottomBoost: 3.1,
    texMaskLoDeep: 0.32,
    texMaskLoLift: 0.36,
    baseFogLo: 0.65,
    smFogLo: 0.68,
    colorLift: 1,
  },
};

function makeFogMaterial(smokeTex, opts, interactive, mouseRadius, mousePush) {
  return new THREE.ShaderMaterial({
    vertexShader: FOG_VERT,
    fragmentShader: FOG_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uTimeOffset: { value: opts.timeOffset },
      uOpacity: { value: opts.opacity },
      uDensity: { value: opts.density },
      uSpeed: { value: opts.speed },
      uNoiseScale: { value: opts.noiseScale },
      uLayerDeep: { value: opts.layerDeep },
      uLayerLift: { value: opts.layerLift },
      uSmokeTex: { value: smokeTex },
      uColorDark: { value: new THREE.Color(opts.colorDark) },
      uColorLight: { value: new THREE.Color(opts.colorLight) },
      uMouse: { value: new THREE.Vector2(9999, 9999) },
      uMouseVel: { value: new THREE.Vector2(0, 0) },
      uMouseRadius: { value: mouseRadius },
      uMousePush: { value: interactive ? mousePush : 0 },
      uMouseRepel: { value: interactive ? (opts.mouseRepel ?? 0) : 0 },
      uTopFadeLo: { value: opts.topFadeLo },
      uTopFadeHi: { value: opts.topFadeHi },
      uBottomBoost: { value: opts.bottomBoost },
      uTexMaskLoDeep: { value: opts.texMaskLoDeep ?? 0.32 },
      uTexMaskLoLift: { value: opts.texMaskLoLift ?? 0.36 },
      uBaseFogLo: { value: opts.baseFogLo ?? 0.65 },
      uSmFogLo: { value: opts.smFogLo ?? 0.68 },
      uColorLift: { value: opts.colorLift ?? 1 },
      uBaseNoiseLo: { value: opts.baseNoiseLo ?? 0.22 },
      uBaseNoiseHi: { value: opts.baseNoiseHi ?? 0.82 },
      uSmNoiseLo: { value: opts.smNoiseLo ?? 0.32 },
      uSmNoiseHi: { value: opts.smNoiseHi ?? 0.88 },
      uTexNoiseLoDeep: { value: opts.texNoiseLoDeep ?? 0.32 },
      uTexNoiseHiDeep: { value: opts.texNoiseHiDeep ?? 0.72 },
      uTexNoiseLoLift: { value: opts.texNoiseLoLift ?? 0.38 },
      uTexNoiseHiLift: { value: opts.texNoiseHiLift ?? 0.78 },
      uFogBandLo: { value: opts.fogBandLo ?? 0 },
      uFogBandHi: { value: opts.fogBandHi ?? 0 },
      uMouseParallax: { value: new THREE.Vector2(0, 0) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

function makeVeilMaterial(opts) {
  return new THREE.ShaderMaterial({
    vertexShader: FOG_VERT,
    fragmentShader: VEIL_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uTimeOffset: { value: opts.timeOffset ?? 0 },
      uOpacity: { value: opts.opacity ?? 0.93 },
      uSpeed: { value: opts.speed ?? 0.055 },
      uNoiseScale: { value: opts.noiseScale ?? 1.65 },
      uColorDark: { value: new THREE.Color(opts.colorDark) },
      uColorLight: { value: new THREE.Color(opts.colorLight) },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

function loadSmokeTexture() {
  const loader = new THREE.TextureLoader();
  const base = new URL('.', import.meta.url);
  const urls = [
    new URL('assets/atmosphere/cloud.png', base).href,
    new URL('assets/atmosphere/clouds.jpg', base).href,
    '/questionnaire/assets/atmosphere/cloud.png',
    '/questionnaire/assets/atmosphere/clouds.jpg',
  ];
  return new Promise((resolve, reject) => {
    const tryAt = (i) => {
      if (i >= urls.length) {
        reject(new Error('smoke texture load failed'));
        return;
      }
      loader.load(
        urls[i],
        (tex) => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.colorSpace = THREE.NoColorSpace;
          resolve(tex);
        },
        undefined,
        () => tryAt(i + 1)
      );
    };
    tryAt(0);
  });
}

export async function createLucaFog({ scene, camera, domElement, profile = 'garden' }) {
  const fogParams =
    profile === 'result'
      ? RESULT_FOG_PARAMS
      : profile === 'vector-preview'
        ? VECTOR_PREVIEW_FOG_PARAMS
        : profile === 'loader'
          ? LOADER_FOG_PARAMS
          : profile === 'detail'
            ? DETAIL_FOG_PARAMS
            : GARDEN_FOG_PARAMS;
  const useVeilLayer = profile === 'garden' && !!fogParams.veil;
  const useFrontLayer = !!fogParams.front && (
    fogParams.useFrontLayer === true ||
    (!useVeilLayer && fogParams.useFrontLayer !== false)
  );
  const smokeTex = await loadSmokeTexture();
  const geometry = new THREE.PlaneGeometry(fogParams.width, fogParams.height, 1, 1);

  const backMouse = new THREE.Vector2(9999, 9999);
  const frontMouse = new THREE.Vector2(9999, 9999);
  const frontMousePrev = new THREE.Vector2(9999, 9999);
  const frontMouseVel = new THREE.Vector2(0, 0);
  const frontMouseVelSmooth = new THREE.Vector2(0, 0);

  const backMaterial = makeFogMaterial(smokeTex, fogParams.back, false, fogParams.mouseRadius, 0);
  backMaterial.uniforms.uMouse.value = backMouse;

  let frontMaterial = null;
  let frontMesh = null;
  if (useFrontLayer) {
    const frontPush = fogParams.front.mousePush ?? fogParams.mousePush ?? GARDEN_FOG_PARAMS.mousePush;
    const frontRadius = fogParams.front.mouseRadius ?? fogParams.mouseRadius ?? GARDEN_FOG_PARAMS.mouseRadius;
    frontMaterial = makeFogMaterial(smokeTex, fogParams.front, true, frontRadius, frontPush);
    frontMaterial.uniforms.uMouse.value = frontMouse;
    frontMesh = new THREE.Mesh(geometry.clone(), frontMaterial);
    frontMesh.scale.setScalar(fogParams.front.scale);
    frontMesh.renderOrder = fogParams.front.renderOrder;
  }

  let veilMesh = null;
  let veilMaterial = null;
  if (useVeilLayer) {
    const veil = fogParams.veil;
    veilMaterial = makeVeilMaterial(veil);
    veilMesh = new THREE.Mesh(geometry.clone(), veilMaterial);
    veilMesh.scale.setScalar(veil.scale);
    veilMesh.renderOrder = veil.renderOrder;
  }

  const backMesh = new THREE.Mesh(geometry.clone(), backMaterial);
  backMesh.scale.setScalar(fogParams.back.scale);
  backMesh.renderOrder = fogParams.back.renderOrder;

  const group = new THREE.Group();
  group.add(backMesh);
  if (veilMesh) group.add(veilMesh);
  if (frontMesh) group.add(frontMesh);
  scene.add(group);

  const mouseNdc = new THREE.Vector2(9999, 9999);
  const raycaster = new THREE.Raycaster();
  const camPos = new THREE.Vector3();
  let pointerOnScreen = false;

  function pointerToNdc(clientX, clientY) {
    const rect = domElement.getBoundingClientRect();
    mouseNdc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    mouseNdc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
  }

  function hideMouse() {
    pointerOnScreen = false;
    if (!frontMaterial) return;
    frontMouse.set(9999, 9999);
    frontMousePrev.set(9999, 9999);
    frontMouseVel.set(0, 0);
    frontMouseVelSmooth.set(0, 0);
    frontMaterial.uniforms.uMouseVel.value.set(0, 0);
    mouseNdc.set(9999, 9999);
  }

  function updateFrontMouse() {
    if (!frontMaterial) return;
    if (!pointerOnScreen) return;

    let uvX = (mouseNdc.x + 1) * 0.5;
    let uvY = (mouseNdc.y + 1) * 0.5;

    if (frontMesh) {
      raycaster.setFromCamera(mouseNdc, camera);
      const hits = raycaster.intersectObject(frontMesh, false);
      if (hits.length > 0 && hits[0].uv) {
        uvX = hits[0].uv.x;
        uvY = hits[0].uv.y;
      }
    }

    frontMouse.set(uvX, uvY);
  }

  function onPointerMove(e) {
    if (!useFrontLayer) return;
    pointerOnScreen = true;
    pointerToNdc(e.clientX, e.clientY);
    updateFrontMouse();
  }

  function onPointerLeave() {
    hideMouse();
  }

  if (useFrontLayer) {
    domElement.addEventListener('pointermove', onPointerMove, { passive: true });
    domElement.addEventListener('pointerleave', onPointerLeave, { passive: true });
    document.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
    document.addEventListener('pointerleave', onPointerLeave, { passive: true, capture: true });
  }

  return {
    group,
    setPointer(clientX, clientY) {
      if (!useFrontLayer) return;
      pointerOnScreen = true;
      pointerToNdc(clientX, clientY);
      updateFrontMouse();
    },
    update(timeSec) {
      backMaterial.uniforms.uTime.value = timeSec;
      if (frontMaterial) frontMaterial.uniforms.uTime.value = timeSec;
      if (veilMaterial) veilMaterial.uniforms.uTime.value = timeSec;

      camera.getWorldPosition(camPos);
      group.position.copy(camPos);
      group.position.x += fogParams.x;
      group.position.y += fogParams.y;
      group.position.z += fogParams.z;
      group.quaternion.copy(camera.quaternion);

      backMesh.position.set(0, 0, -fogParams.back.distance);
      if (veilMesh) veilMesh.position.set(0, 0, -fogParams.veil.distance);
      if (frontMesh) frontMesh.position.set(0, 0, -fogParams.front.distance);
      group.updateMatrixWorld(true);
      backMesh.updateMatrixWorld(true);
      if (veilMesh) veilMesh.updateMatrixWorld(true);
      if (frontMesh) frontMesh.updateMatrixWorld(true);

      if (!useFrontLayer) return;

      updateFrontMouse();

      if (pointerOnScreen && frontMouse.x < 9000) {
        if (frontMousePrev.x > 9000) {
          frontMousePrev.copy(frontMouse);
          frontMouseVel.set(0, 0);
        } else {
          frontMouseVel.subVectors(frontMouse, frontMousePrev);
        }
        frontMouseVelSmooth.lerp(frontMouseVel, 0.42);
        frontMousePrev.copy(frontMouse);
      } else {
        frontMouseVel.set(0, 0);
        frontMouseVelSmooth.multiplyScalar(0.45);
      }
      frontMaterial.uniforms.uMouseVel.value.copy(frontMouseVelSmooth);
    },
    dispose() {
      if (useFrontLayer) {
        domElement.removeEventListener('pointermove', onPointerMove);
        domElement.removeEventListener('pointerleave', onPointerLeave);
        document.removeEventListener('pointermove', onPointerMove, true);
        document.removeEventListener('pointerleave', onPointerLeave, true);
      }
      geometry.dispose();
      backMesh.geometry.dispose();
      backMaterial.dispose();
      if (veilMesh) {
        veilMesh.geometry.dispose();
        veilMaterial?.dispose();
      }
      if (frontMesh) {
        frontMesh.geometry.dispose();
        frontMaterial.dispose();
      }
      smokeTex.dispose();
      scene.remove(group);
    },
  };
}
