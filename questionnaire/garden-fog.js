/**
 * Luca fog — back: autonomous only. Front (over amulets): mouse shifts fog, no hole.
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
uniform float uTopFadeLo;
uniform float uTopFadeHi;
uniform float uBottomBoost;
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
  baseN = smoothstep(0.22, 0.82, baseN);
  float baseVertical =
    smoothstep(0.0, 0.2, fogUvDeep.y) *
    (1.0 - smoothstep(0.75, 1.0, fogUvDeep.y));
  float baseHorizontal =
    smoothstep(0.0, 0.1, fogUvDeep.x) *
    (1.0 - smoothstep(0.9, 1.0, fogUvDeep.x));
  float baseFog = baseVertical * baseHorizontal * mix(0.65, 1.0, baseN);

  vec2 smP = fogUvLift * (uNoiseScale * 1.1) + vec2(0.17, -0.09);
  float smQx = fbm(smP + vec2(0.0, t * 0.14));
  float smQy = fbm(smP + vec2(4.7, -t * 0.1));
  vec2 smQ = vec2(smQx, smQy);
  vec2 smR;
  smR.x = fbm(smP + smQ + vec2(1.7, 9.2) + t * 0.11);
  smR.y = fbm(smP + smQ + vec2(8.3, 2.8) - t * 0.08);
  float smRawN = fbm(smP + smR * 2.2);
  float smShapedN = smoothstep(0.32, 0.88, smRawN);
  float smVertical =
    smoothstep(0.0, 0.18, fogUvLift.y) *
    (1.0 - smoothstep(0.72, 1.0, fogUvLift.y));
  float smHorizontal =
    smoothstep(0.0, 0.08, fogUvLift.x) *
    (1.0 - smoothstep(0.92, 1.0, fogUvLift.x));
  float smFog = smVertical * smHorizontal * mix(0.68, 1.0, smShapedN);

  float topFade = 1.0 - smoothstep(uTopFadeLo, uTopFadeHi, vUv.y);
  float bottomPool = smoothstep(uTopFadeLo + 0.06, 0.0, vUv.y);
  baseFog *= topFade;
  smFog *= topFade;

  vec2 texUvDeep = fogUvDeep * 1.28 + vec2(t * 0.012, -t * 0.008);
  vec2 texUvLift = fogUvLift * 1.42 + vec2(-t * 0.018, t * 0.014);
  float texDeep = texture2D(uSmokeTex, texUvDeep).r;
  float texLift = texture2D(uSmokeTex, texUvLift).r;
  texDeep = smoothstep(0.32, 0.72, texDeep);
  texLift = smoothstep(0.38, 0.78, texLift);
  float texMaskDeep = mix(0.32, 1.0, texDeep);
  float texMaskLift = mix(0.36, 1.0, texLift);

  float aDeep = baseFog * texMaskDeep * uDensity * uOpacity * uLayerDeep;
  float aLift = smFog * texMaskLift * uDensity * uOpacity * uLayerLift;
  aDeep *= mix(1.0, uBottomBoost, bottomPool);
  aLift *= mix(1.0, uBottomBoost * 1.1, bottomPool);
  aDeep = clamp(aDeep, 0.0, 1.0);
  aLift = clamp(aLift, 0.0, 1.0);
  float alpha = 1.0 - (1.0 - aDeep) * (1.0 - aLift);
  alpha = clamp(alpha, 0.0, 1.0);

  float colorMask = mix(baseN, smShapedN, 0.55) * mix(0.85, 1.0, max(texDeep, texLift));
  vec3 fogColor = mix(uColorDark, uColorLight, clamp(colorMask, 0.0, 1.0));
  gl_FragColor = vec4(fogColor, alpha);
}
`;

const PARAMS = {
  x: 0,
  y: -0.18,
  z: 0.35,
  width: 15,
  height: 10,
  mouseRadius: 0.22,
  mousePush: 0.068,
  back: {
    renderOrder: 0,
    distance: 5.2,
    scale: 1.22,
    opacity: 0.82,
    density: 0.52,
    speed: 0.118,
    noiseScale: 2.15,
    timeOffset: 0,
    layerDeep: 0.82,
    layerLift: 0.48,
    colorDark: '#000000',
    colorLight: '#b8bcc6',
    topFadeLo: 0.32,
    topFadeHi: 0.96,
    bottomBoost: 1.7,
  },
  front: {
    renderOrder: 3,
    distance: 1.75,
    scale: 1.0,
    opacity: 0.96,
    density: 0.6,
    speed: 0.128,
    noiseScale: 2.85,
    timeOffset: 8.6,
    layerDeep: 0.62,
    layerLift: 1.0,
    colorDark: '#000000',
    colorLight: '#e8eaef',
    topFadeLo: 0.08,
    topFadeHi: 0.78,
    bottomBoost: 2.75,
  },
};

/** Detail page — full fog strength; lives behind UI (z-index 0) so both layers are safe */
const DETAIL_FOG_PARAMS = {
  ...PARAMS,
  mousePush: PARAMS.mousePush,
};

/** Result overlay — stronger lift on black background */
const RESULT_FOG_PARAMS = {
  ...PARAMS,
  y: -0.12,
  back: {
    ...PARAMS.back,
    opacity: 0.94,
    density: 0.62,
    colorLight: '#c8ccd4',
    layerLift: 0.58,
  },
  front: {
    ...PARAMS.front,
    opacity: 1,
    density: 0.68,
    colorLight: '#eef0f4',
    layerLift: 1.08,
    bottomBoost: 3.1,
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
      uTopFadeLo: { value: opts.topFadeLo },
      uTopFadeHi: { value: opts.topFadeHi },
      uBottomBoost: { value: opts.bottomBoost },
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
      : profile === 'detail'
        ? DETAIL_FOG_PARAMS
        : PARAMS;
  const useFrontLayer = true;
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
    const frontPush = fogParams.mousePush ?? PARAMS.mousePush;
    frontMaterial = makeFogMaterial(smokeTex, fogParams.front, true, fogParams.mouseRadius, frontPush);
    frontMaterial.uniforms.uMouse.value = frontMouse;
    frontMesh = new THREE.Mesh(geometry.clone(), frontMaterial);
    frontMesh.scale.setScalar(fogParams.front.scale);
    frontMesh.renderOrder = fogParams.front.renderOrder;
  }

  const backMesh = new THREE.Mesh(geometry.clone(), backMaterial);
  backMesh.scale.setScalar(fogParams.back.scale);
  backMesh.renderOrder = fogParams.back.renderOrder;

  const group = new THREE.Group();
  group.add(backMesh);
  if (frontMesh) group.add(frontMesh);
  scene.add(group);

  const raycaster = new THREE.Raycaster();
  const mouseNdc = new THREE.Vector2(9999, 9999);
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
    if (!frontMaterial || !frontMesh) return;
    if (!pointerOnScreen) return;
    raycaster.setFromCamera(mouseNdc, camera);
    const hits = raycaster.intersectObject(frontMesh, false);
    if (hits.length > 0 && hits[0].uv) {
      frontMouse.set(hits[0].uv.x, hits[0].uv.y);
    } else {
      frontMouse.set(9999, 9999);
    }
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
    update(timeSec) {
      backMaterial.uniforms.uTime.value = timeSec;
      if (frontMaterial) frontMaterial.uniforms.uTime.value = timeSec;

      camera.getWorldPosition(camPos);
      group.position.copy(camPos);
      group.position.x += fogParams.x;
      group.position.y += fogParams.y;
      group.position.z += fogParams.z;
      group.quaternion.copy(camera.quaternion);

      backMesh.position.set(0, 0, -fogParams.back.distance);
      if (frontMesh) frontMesh.position.set(0, 0, -fogParams.front.distance);
      group.updateMatrixWorld(true);
      backMesh.updateMatrixWorld(true);
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
      if (frontMesh) {
        frontMesh.geometry.dispose();
        frontMaterial.dispose();
      }
      smokeTex.dispose();
      scene.remove(group);
    },
  };
}
