/**
 * SVG stroke paths → Three.js TubeGeometry + PBR metal / ceramic.
 * RoomEnvironment IBL + dramatic directional lights.
 */
import * as THREE from 'https://esm.sh/three@0.160.0';
import { RoomEnvironment } from 'https://esm.sh/three@0.160.0/examples/jsm/environments/RoomEnvironment.js';

const W = 680;
const H = 680;
const CX = 340;
const CY = 340;
const TUBE_RADIUS = 6;
const PATH_STEP = 2.5;

let active = { renderer: null, envMap: null };

function disposeActive() {
  if (active.envMap) {
    active.envMap.dispose();
    active.envMap = null;
  }
  if (active.renderer) {
    active.renderer.dispose();
    active.renderer = null;
  }
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

function setupEnvironment(renderer, scene) {
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment(renderer);
  const envMap = pmremGenerator.fromScene(room, 0.04).texture;
  scene.background = new THREE.Color(0xffffff);
  scene.environment = envMap;
  pmremGenerator.dispose();
  return envMap;
}

function addLights(scene) {
  const dir1 = new THREE.DirectionalLight(0xffffff, 5.0);
  dir1.position.set(1, 2, 3);
  const dir2 = new THREE.DirectionalLight(0x4488ff, 2.0);
  dir2.position.set(-2, -1, 1);
  const dir3 = new THREE.DirectionalLight(0xffdd88, 1.5);
  dir3.position.set(0, -3, -1);
  scene.add(dir1, dir2, dir3);
}

function buildMetalMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 1.0,
    roughness: 0.15,
    envMapIntensity: 3.0
  });
}

function buildCeramicMaterial(hexColor) {
  const c = new THREE.Color(hexColor || '#D7A2B4');
  return new THREE.MeshPhysicalMaterial({
    color: c,
    metalness: 0.0,
    roughness: 0.05,
    transmission: 0.3,
    thickness: 8.0,
    ior: 1.8,
    clearcoat: 1.0,
    clearcoatRoughness: 0.0,
    envMapIntensity: 3.0,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
}

function mountSvg(svgString) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('SVG parse error');
  const svg = doc.documentElement;
  svg.style.cssText =
    'position:fixed;left:0;top:0;width:' +
    W +
    'px;height:' +
    H +
    'px;opacity:0;pointer-events:none;z-index:-1';
  document.body.appendChild(svg);
  return svg;
}

function parseViewBox(svg) {
  const p = (svg.getAttribute('viewBox') || '0 0 680 680').trim().split(/\s+/).map(Number);
  return { x: p[0] || 0, y: p[1] || 0, w: p[2] || W, h: p[3] || H };
}

function pathPointToRoot(rootSvg, pathEl, x, y) {
  const pt = pathEl.ownerSVGElement.createSVGPoint();
  pt.x = x;
  pt.y = y;
  let gx;
  let gy;
  if (typeof pathEl.getTransformToElement === 'function') {
    const g = pt.matrixTransform(pathEl.getTransformToElement(rootSvg));
    gx = g.x;
    gy = g.y;
  } else {
    const scr = pt.matrixTransform(pathEl.getScreenCTM());
    const g = scr.matrixTransform(rootSvg.getScreenCTM().inverse());
    gx = g.x;
    gy = g.y;
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

function buildStrokeCurve(pts) {
  if (pts.length < 2) return null;
  const unique = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].distanceTo(pts[i - 1]) > 0.05) unique.push(pts[i]);
  }
  if (unique.length < 2) return null;
  return new THREE.CatmullRomCurve3(unique, false, 'catmullrom', 0.5);
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  return len;
}

function addTubesFromLayer(layerEl, rootSvg, material, scene, z, renderOrder) {
  if (!layerEl) return 0;
  let count = 0;
  layerEl.querySelectorAll('path').forEach((pathEl) => {
    const pts = samplePath(pathEl, rootSvg);
    if (pts.length < 2) return;
    const curve = buildStrokeCurve(pts);
    if (!curve) return;
    const pathLen = polylineLength(pts);
    const tubularSegs = Math.min(400, Math.max(48, Math.ceil(pathLen / 2)));
    const geom = new THREE.TubeGeometry(curve, tubularSegs, TUBE_RADIUS, 16, false);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.z = z;
    mesh.renderOrder = renderOrder;
    scene.add(mesh);
    count++;
  });
  return count;
}

function createCamera(vb) {
  const scale = 0.6;
  const hw = (vb.w / 2) / scale;
  const hh = (vb.h / 2) / scale;
  const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.1, 3000);
  cam.position.set(0, 0, 1000);
  cam.lookAt(0, 0, 0);
  return cam;
}

/**
 * @param {{ svg: string, style2: object|null, style3: object, container: HTMLElement }} opts
 */
export async function renderThreePbrAmulet(opts) {
  const { svg, style2, style3, container, domainHex } = opts;
  const mount = mountSvg(svg);

  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const layer3 = mount.querySelector('.layer-3');
    if (!layer3) throw new Error('layer 3 missing');
    const layer2 = mount.querySelector('.layer-2');
    const vb = parseViewBox(mount);

    disposeActive();

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    active.renderer = renderer;

    const scene = new THREE.Scene();
    active.envMap = setupEnvironment(renderer, scene);
    addLights(scene);

    renderer.sortObjects = true;

    const metalMat = buildMetalMaterial();
    const ceramicMat = buildCeramicMaterial(domainHex);

    let tubesL2 = 0;
    if (layer2 && style2) {
      tubesL2 = addTubesFromLayer(layer2, mount, metalMat, scene, -2, 0);
    }

    const tubesL3 = addTubesFromLayer(layer3, mount, ceramicMat, scene, 2, 1);
    if (!tubesL3) throw new Error('no L3 paths');

    const camera = createCamera(vb);
    renderer.render(scene, camera);
    disposeScene(scene);

    container.innerHTML = '';
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    container.appendChild(canvas);

    return { tubesL2, tubesL3, metalRough: 0.05, pbr: true };
  } finally {
    if (mount.parentNode) mount.parentNode.removeChild(mount);
  }
}

export function disposeThreePbr() {
  disposeActive();
}
