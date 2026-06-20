import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/environments/RoomEnvironment.js';

const W = 680, H = 680, CX = 340, CY = 340;
const PATH_STEP = 2.5;
const TUBE_RADIUS = 2.8;
const TUBE_SEGMENTS = 200;
const TUBE_RADIAL = 10;

const HDR_CANDIDATES = [
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr',
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr',
  'https://threejs.org/examples/textures/equirectangular/royal_esplanade_1k.hdr'
];

let active = { renderer: null, envMap: null, pmrem: null, hdr: null };

function disposeActive() {
  if (active.renderer) { active.renderer.dispose(); active.renderer = null; }
  if (active.envMap) { active.envMap.dispose(); active.envMap = null; }
  if (active.pmrem) { active.pmrem.dispose(); active.pmrem = null; }
  if (active.hdr) { active.hdr.dispose(); active.hdr = null; }
}

function disposeScene(scene) {
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

function parseViewBox(svg) {
  const p = (svg.getAttribute('viewBox') || '0 0 680 680').trim().split(/\s+/).map(Number);
  return { x: p[0]||0, y: p[1]||0, w: p[2]||W, h: p[3]||H };
}

function mountSvg(svgString) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('SVG parse error');
  const svg = doc.documentElement;
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.style.cssText = 'position:fixed;left:0;top:0;width:'+W+'px;height:'+H+'px;opacity:0;pointer-events:none;z-index:-1;visibility:visible';
  document.body.appendChild(svg);
  return svg;
}

function pathPointToRoot(rootSvg, pathEl, x, y) {
  const pt = pathEl.ownerSVGElement.createSVGPoint();
  pt.x = x; pt.y = y;
  let gx, gy;
  if (typeof pathEl.getTransformToElement === 'function') {
    const g = pt.matrixTransform(pathEl.getTransformToElement(rootSvg));
    gx = g.x; gy = g.y;
  } else {
    const scr = pt.matrixTransform(pathEl.getScreenCTM());
    const g = scr.matrixTransform(rootSvg.getScreenCTM().inverse());
    gx = g.x; gy = g.y;
  }
  return new THREE.Vector3(gx - CX, -(gy - CY), 0);
}

function samplePath(pathEl, rootSvg) {
  const len = pathEl.getTotalLength();
  if (!isFinite(len) || len < 4) return [];
  const steps = Math.max(4, Math.ceil(len / PATH_STEP));
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = steps <= 1 ? 0 : i / (steps - 1);
    const p = pathEl.getPointAtLength(len * t);
    pts.push(pathPointToRoot(rootSvg, pathEl, p.x, p.y));
  }
  return pts;
}

function buildTubesFromLayer(layerEl, rootSvg, material, scene, zOffset) {
  if (!layerEl) return 0;
  let count = 0;
  layerEl.querySelectorAll('path').forEach((pathEl) => {
    const pts = samplePath(pathEl, rootSvg);
    if (pts.length < 2) return;
    const unique = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      if (pts[i].distanceTo(pts[i-1]) > 0.05) unique.push(pts[i]);
    }
    if (unique.length < 2) return;
    try {
      const curve = new THREE.CatmullRomCurve3(unique, false, 'catmullrom', 0.5);
      const segs = Math.min(TUBE_SEGMENTS, Math.max(20, unique.length * 3));
      const geom = new THREE.TubeGeometry(curve, segs, TUBE_RADIUS, TUBE_RADIAL, false);
      const mesh = new THREE.Mesh(geom, material);
      mesh.position.z = zOffset;
      scene.add(mesh);
      count++;
    } catch(e) {}
  });
  return count;
}

function ageToMetalRoughness(age) {
  const a = Math.max(1, Math.min(120, Number(age)||25));
  return 0.006 + (a/120) * 0.012;
}

function ageToGlassRoughness(age, surfaceScale) {
  const a = Math.max(1, Math.min(120, Number(age)||25));
  return Math.min(0.07, 0.02 + (a/120)*0.04 + (surfaceScale||0)*0.0004);
}

function glassTintColor(hex) {
  const s = String(hex||'#D7A2B4').replace('#','');
  return new THREE.Color(parseInt(s.slice(0,2),16)/255, parseInt(s.slice(2,4),16)/255, parseInt(s.slice(4,6),16)/255);
}

async function loadEnvMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  active.pmrem = pmrem;
  const loader = new RGBELoader();
  for (const url of HDR_CANDIDATES) {
    try {
      const hdr = await loader.loadAsync(url);
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      active.hdr = hdr;
      const tex = pmrem.fromEquirectangular(hdr).texture;
      active.envMap = tex;
      return tex;
    } catch(e) { console.warn('[pbr] HDR failed:', url, e); }
  }
  const env = new RoomEnvironment(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  active.envMap = tex;
  return tex;
}

function createCamera(vb) {
  const cam = new THREE.OrthographicCamera(vb.x-CX, vb.x+vb.w-CX, CY-vb.y, CY-(vb.y+vb.h), 1, 4000);
  cam.position.set(0, 0, 1200);
  cam.lookAt(0, 0, 0);
  return cam;
}

function buildChromeMaterial(envMap, roughness) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 1.0, roughness: Math.min(roughness, 0.018),
    envMap, envMapIntensity: 7.5, clearcoat: 1.0, clearcoatRoughness: 0.002,
    reflectivity: 1.0, ior: 2.5, specularIntensity: 2.0, specularColor: new THREE.Color(0xffffff)
  });
}

function buildGlassMaterial(envMap, style3, domainHex) {
  const tint = glassTintColor(domainHex || style3.strokeColor);
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff), metalness: 0.0,
    roughness: ageToGlassRoughness(style3.age, style3.surfaceScale),
    transmission: 1.0, thickness: 6.0, ior: 1.52, transparent: true, opacity: 1,
    envMap, envMapIntensity: 2.4, attenuationColor: tint, attenuationDistance: 3.2,
    clearcoat: 1.0, clearcoatRoughness: 0.012, specularIntensity: 1.6,
    specularColor: new THREE.Color(0xffffff), side: THREE.DoubleSide, depthWrite: false
  });
}

export async function renderPbrAmulet(opts) {
  const { svg, style2, style3, container, domainHex } = opts;
  const mount = mountSvg(svg);
  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const layer3 = mount.querySelector('.layer-3');
    if (!layer3) throw new Error('layer 3 missing');
    const layer2 = mount.querySelector('.layer-2');
    const vb = parseViewBox(mount);
    disposeActive();
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, 2));
    renderer.setClearColor(0x1a1a1a, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    active.renderer = renderer;
    const envMap = await loadEnvMap(renderer);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.environment = envMap;
    scene.environmentIntensity = 2.2;
    scene.add(new THREE.AmbientLight(0xffffff, 0.02));
    const camera = createCamera(vb);
    let tubesL2 = 0, tubesL3 = 0;
    if (layer2 && style2) {
      tubesL2 = buildTubesFromLayer(layer2, mount, buildChromeMaterial(envMap, ageToMetalRoughness(style2.age)), scene, 0);
    }
    tubesL3 = buildTubesFromLayer(layer3, mount, buildGlassMaterial(envMap, style3, domainHex||style3.strokeColor), scene, 2);
    if (!tubesL3) throw new Error('L3 no tubes');
    renderer.sortObjects = true;
    renderer.render(scene, camera);
    disposeScene(scene);
    container.innerHTML = '';
    const canvas = renderer.domElement;
    canvas.style.cssText = 'display:block;max-width:100%;height:auto';
    container.appendChild(canvas);
    return { tubesL2, tubesL3, metalRough: style2 ? ageToMetalRoughness(style2.age) : null, glassRough: ageToGlassRoughness(style3.age, style3.surfaceScale), fused: false };
  } finally {
    if (mount.parentNode) mount.parentNode.removeChild(mount);
  }
}

export function disposePbr() { disposeActive(); }
