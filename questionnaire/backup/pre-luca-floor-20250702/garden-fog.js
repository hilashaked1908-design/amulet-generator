/**
 * Luca Nardi fog — aboutluca.com bundle (class g_, modules 860/666).
 * Camera-attached dual planes, fixed rotation, raycast mouse → fog UV.
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
uniform float uTime;
uniform float uOpacity;
uniform float uDensity;
uniform float uSpeed;
uniform float uNoiseScale;
uniform vec3 uColorDark;
uniform vec3 uColorLight;
uniform sampler2D uSmokeTex;
uniform vec2 uMouse;
uniform float uMouseRadius;
uniform float uMouseStrength;
uniform float uMouseHoleStrength;
uniform float uMouseWarp;
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
  vec2 uv = vUv;
  float t = uTime * uSpeed;
  vec2 mouseUv = uMouse;
  vec2 diff = uv - mouseUv;
  float warp1 = fbm(uv * 6.0 + vec2(0.0, uTime * 0.015));
  float warp2 = fbm(uv.yx * 7.5 + vec2(4.7, -uTime * 0.012));
  vec2 warpedDiff = diff + (vec2(warp1, warp2) - 0.5) * uMouseWarp;
  float radiusJitter = 1.0 + (fbm(uv * 9.0 + 3.7) - 0.5) * 0.35;
  float localRadius = uMouseRadius * radiusJitter;
  float distMouse = length(warpedDiff);
  float mouseInfluence = 1.0 - smoothstep(0.0, localRadius, distMouse);
  mouseInfluence = pow(mouseInfluence, 1.35);
  float centerSoft = 1.0 - smoothstep(0.0, localRadius * 0.35, distMouse);
  float antiHole = 1.0 - centerSoft * 0.4;
  mouseInfluence *= antiHole;
  vec2 dir = distMouse > 0.0001 ? normalize(warpedDiff) : vec2(0.0);
  vec2 tangent = vec2(-dir.y, dir.x);
  float swirlNoise = fbm(uv * 10.0 + uTime * 0.012 + vec2(7.3, 1.1));
  float swirl = (swirlNoise - 0.5) * 1.2;
  vec2 fogUv = uv;
  fogUv += dir * (uMouseStrength * 0.35 * mouseInfluence);
  fogUv += tangent * (uMouseStrength * swirl * mouseInfluence);
  vec2 baseP = fogUv * uNoiseScale;
  baseP += vec2(t * 0.08, -t * 0.04);
  float baseN = fbm(baseP);
  baseN = smoothstep(0.25, 0.85, baseN);
  float baseVertical = smoothstep(0.0, 0.2, fogUv.y) * (1.0 - smoothstep(0.75, 1.0, fogUv.y));
  float baseHorizontal = smoothstep(0.0, 0.1, fogUv.x) * (1.0 - smoothstep(0.9, 1.0, fogUv.x));
  float baseFog = baseVertical * baseHorizontal * mix(0.65, 1.0, baseN);
  vec2 smP = fogUv * uNoiseScale;
  float smQx = fbm(smP + vec2(0.0, t * 0.12));
  float smQy = fbm(smP + vec2(4.7, -t * 0.08));
  vec2 smQ = vec2(smQx, smQy);
  vec2 smR;
  smR.x = fbm(smP + smQ + vec2(1.7, 9.2) + t * 0.10);
  smR.y = fbm(smP + smQ + vec2(8.3, 2.8) - t * 0.07);
  float smRawN = fbm(smP + smR * 2.2);
  float smShapedN = smoothstep(0.35, 0.9, smRawN);
  float smVertical = smoothstep(0.0, 0.18, fogUv.y) * (1.0 - smoothstep(0.72, 1.0, fogUv.y));
  float smHorizontal = smoothstep(0.0, 0.08, fogUv.x) * (1.0 - smoothstep(0.92, 1.0, fogUv.x));
  float smFog = smVertical * smHorizontal * mix(0.68, 1.0, smShapedN);
  float fog = mix(baseFog, smFog, 0.45);
  float topFade = 1.0 - smoothstep(0.55, 1.0, fogUv.y);
  fog *= topFade;
  vec2 texUv = fogUv * 1.35 + vec2(t * 0.015, -t * 0.01);
  float tex = texture2D(uSmokeTex, texUv).r;
  tex = smoothstep(0.35, 0.75, tex);
  float texMask = mix(0.15, 1.0, tex);
  float localThin = 1.0 - mouseInfluence * uMouseHoleStrength;
  float alpha = fog * texMask * uDensity * uOpacity * localThin;
  alpha = clamp(alpha, 0.0, 1.0);
  float colorMask = mix(baseN, smShapedN, 0.5);
  colorMask *= mix(0.85, 1.0, tex);
  colorMask += mouseInfluence * 0.05;
  vec3 fogColor = mix(uColorDark, uColorLight, clamp(colorMask, 0.0, 1.0));
  gl_FragColor = vec4(fogColor, alpha);
}
`;

/** Luca defaults — opacity scaled for our scene (Luca uses 0.015 in a darker compositing stack). */
const PARAMS = {
  x: 0,
  y: 0.88,
  z: 0.5,
  width: 9,
  height: 6,
  opacityFront: 0.28,
  opacityBack: 0.16,
  densityFront: 0.36,
  densityBack: 0.24,
  speedFront: 0.111,
  speedBack: 0.07,
  noiseScaleFront: 2.5,
  noiseScaleBack: 2.5,
  frontDistance: 3.5,
  backDistance: 6.25,
  colorDark: '#000000',
  colorLight: '#ffffff',
  mouseRadius: 3.5,
  mouseStrength: 0.35,
  mouseHoleStrength: 0.22,
  mouseWarp: 0.06,
  camrot: { x: 0, y: 0, z: 0 },
};

function makeFogMaterial(smokeTex, opts) {
  return new THREE.ShaderMaterial({
    vertexShader: FOG_VERT,
    fragmentShader: FOG_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: opts.opacity },
      uDensity: { value: opts.density },
      uSpeed: { value: opts.speed },
      uNoiseScale: { value: opts.noiseScale },
      uSmokeTex: { value: smokeTex },
      uColorDark: { value: new THREE.Color(PARAMS.colorDark) },
      uColorLight: { value: new THREE.Color(PARAMS.colorLight) },
      uMouse: { value: new THREE.Vector2(9999, 9999) },
      uMouseRadius: { value: PARAMS.mouseRadius },
      uMouseStrength: { value: opts.mouseStrength },
      uMouseHoleStrength: { value: opts.mouseHoleStrength },
      uMouseWarp: { value: opts.mouseWarp },
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
  const urls = [
    new URL('assets/atmosphere/cloud.png', import.meta.url).href,
    new URL('assets/atmosphere/clouds.jpg', import.meta.url).href,
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

export async function createLucaFog({ scene, camera, domElement }) {
  const smokeTex = await loadSmokeTexture();
  const geometry = new THREE.PlaneGeometry(PARAMS.width, PARAMS.height, 1, 1);

  const frontMouse = new THREE.Vector2(9999, 9999);
  const backMouse = new THREE.Vector2(9999, 9999);

  const frontMaterial = makeFogMaterial(smokeTex, {
    opacity: PARAMS.opacityFront,
    density: PARAMS.densityFront,
    speed: PARAMS.speedFront,
    noiseScale: PARAMS.noiseScaleFront,
    mouseStrength: PARAMS.mouseStrength,
    mouseHoleStrength: PARAMS.mouseHoleStrength,
    mouseWarp: PARAMS.mouseWarp,
  });
  frontMaterial.uniforms.uMouse.value = frontMouse;

  const backMaterial = makeFogMaterial(smokeTex, {
    opacity: PARAMS.opacityBack,
    density: PARAMS.densityBack,
    speed: PARAMS.speedBack,
    noiseScale: PARAMS.noiseScaleBack,
    mouseStrength: PARAMS.mouseStrength * 0.7,
    mouseHoleStrength: PARAMS.mouseHoleStrength * 0.8,
    mouseWarp: PARAMS.mouseWarp * 1.1,
  });
  backMaterial.uniforms.uMouse.value = backMouse;

  const frontMesh = new THREE.Mesh(geometry, frontMaterial);
  const backMesh = new THREE.Mesh(geometry, backMaterial);
  backMesh.scale.set(1.2, 1.2, 1);
  backMesh.renderOrder = 1;
  frontMesh.renderOrder = 5;

  const group = new THREE.Group();
  group.add(backMesh);
  group.add(frontMesh);
  scene.add(group);

  const raycaster = new THREE.Raycaster();
  const mouseNdc = new THREE.Vector2(9999, 9999);
  const camPos = new THREE.Vector3();

  function pointerToNdc(clientX, clientY) {
    const rect = domElement.getBoundingClientRect();
    mouseNdc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    mouseNdc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
  }

  function updateMouseUniforms() {
    raycaster.setFromCamera(mouseNdc, camera);
    const frontHits = raycaster.intersectObject(frontMesh, false);
    const backHits = raycaster.intersectObject(backMesh, false);
    if (frontHits.length > 0 && frontHits[0].uv) {
      frontMouse.set(frontHits[0].uv.x, frontHits[0].uv.y);
    } else {
      frontMouse.set(9999, 9999);
    }
    if (backHits.length > 0 && backHits[0].uv) {
      backMouse.set(backHits[0].uv.x, backHits[0].uv.y);
    } else {
      backMouse.set(9999, 9999);
    }
  }

  function onPointerMove(e) {
    pointerToNdc(e.clientX, e.clientY);
    updateMouseUniforms();
  }

  domElement.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });

  return {
    group,
    update(timeSec) {
      frontMaterial.uniforms.uTime.value = timeSec;
      backMaterial.uniforms.uTime.value = timeSec;

      camera.getWorldPosition(camPos);
      group.position.copy(camPos);
      group.position.x += PARAMS.x;
      group.position.y += PARAMS.y;
      group.position.z += PARAMS.z;
      group.rotation.set(PARAMS.camrot.x, PARAMS.camrot.y, PARAMS.camrot.z);

      frontMesh.position.set(0, 0, -PARAMS.frontDistance);
      backMesh.position.set(0, 0, -PARAMS.backDistance);
      group.updateMatrixWorld(true);
      frontMesh.updateMatrixWorld(true);
      backMesh.updateMatrixWorld(true);

      updateMouseUniforms();
    },
    dispose() {
      domElement.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointermove', onPointerMove, true);
      geometry.dispose();
      frontMaterial.dispose();
      backMaterial.dispose();
      smokeTex.dispose();
      scene.remove(group);
    },
  };
}
