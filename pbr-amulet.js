/**
 * SVG sigil → fused 3D volume (SDF metaball blend + marching cubes) + PBR chrome/glass.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/environments/RoomEnvironment.js';
import isosurface from 'https://esm.sh/isosurface@1.0.0';

const W = 680;
const H = 680;
const CX = 340;
const CY = 340;
const PATH_STROKE = 45;
const TUBE_RADIUS = PATH_STROKE / 2;
const PATH_STEP = 2.5;
const BLEND_K = TUBE_RADIUS * 0.72;
/** High-contrast studio HDRIs first — jewelry chrome needs dark/neutral env contrast, not flat white fill. */
const HDR_CANDIDATES = [
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr',
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr',
  'https://threejs.org/examples/textures/equirectangular/royal_esplanade_1k.hdr'
];
const RENDER_BG = 0x0a0a0c;
const GRID_RES = [84, 84, 32];

let active = { renderer: null, envMap: null, pmrem: null, hdr: null };

function disposeActive() {
  if (active.renderer) {
    active.renderer.dispose();
    active.renderer = null;
  }
  if (active.envMap) {
    active.envMap.dispose();
    active.envMap = null;
  }
  if (active.pmrem) {
    active.pmrem.dispose();
    active.pmrem = null;
  }
  if (active.hdr) {
    active.hdr.dispose();
    active.hdr = null;
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

function parseViewBox(svg) {
  const p = (svg.getAttribute('viewBox') || '0 0 680 680').trim().split(/\s+/).map(Number);
  return { x: p[0] || 0, y: p[1] || 0, w: p[2] || W, h: p[3] || H };
}

function mountSvg(svgString) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  if (doc.querySelector('parsererror')) throw new Error('SVG parse error');
  const svg = doc.documentElement;
  svg.setAttribute('width', String(W));
  svg.setAttribute('height', String(H));
  svg.style.cssText =
    'position:fixed;left:0;top:0;width:' +
    W +
    'px;height:' +
    H +
    'px;opacity:0;pointer-events:none;z-index:-1;visibility:visible';
  document.body.appendChild(svg);
  return svg;
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

/** כל הנתיבים → קטעי צינור + כדורי חיבור בקודקודים */
function buildVolumePrimitives(layerEl, rootSvg) {
  const capsules = [];
  const spheres = [];
  if (!layerEl) return { capsules, spheres };

  layerEl.querySelectorAll('path').forEach((pathEl) => {
    const pts = samplePath(pathEl, rootSvg);
    if (pts.length < 2) return;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (a.distanceTo(b) < 0.08) continue;
      capsules.push({
        ax: a.x,
        ay: a.y,
        az: a.z,
        bx: b.x,
        by: b.y,
        bz: b.z,
        r: TUBE_RADIUS
      });
    }
    pts.forEach((p) => {
      spheres.push({ x: p.x, y: p.y, z: p.z, r: TUBE_RADIUS });
    });
  });
  return { capsules, spheres };
}

function sdCapsule(px, py, pz, c) {
  const abx = c.bx - c.ax;
  const aby = c.by - c.ay;
  const abz = c.bz - c.az;
  const apx = px - c.ax;
  const apy = py - c.ay;
  const apz = pz - c.az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-8 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = apx - t * abx;
  const qy = apy - t * aby;
  const qz = apz - t * abz;
  return Math.sqrt(qx * qx + qy * qy + qz * qz) - c.r;
}

function sdSphere(px, py, pz, s) {
  const dx = px - s.x;
  const dy = py - s.y;
  const dz = pz - s.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - s.r;
}

/** Inigo Quilez smooth min — מיזוג מטאבולי בחיבורים */
function smin(a, b, k) {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return THREE.MathUtils.lerp(b, a, h) - k * h * (1 - h);
}

function boundsForPrimitives(capsules, spheres) {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  const pad = TUBE_RADIUS + BLEND_K + 8;
  const bump = (x, y, z, r) => {
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r);
    minZ = Math.min(minZ, z - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
    maxZ = Math.max(maxZ, z + r);
  };
  capsules.forEach((c) => {
    bump(c.ax, c.ay, c.az, c.r);
    bump(c.bx, c.by, c.bz, c.r);
  });
  spheres.forEach((s) => bump(s.x, s.y, s.z, s.r));
  if (!isFinite(minX)) {
    return { minX: -200, minY: -200, minZ: -40, maxX: 200, maxY: 200, maxZ: 40 };
  }
  return {
    minX: minX - pad,
    minY: minY - pad,
    minZ: minZ - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
    maxZ: maxZ + pad
  };
}

function makeSdfEvaluator(capsules, spheres) {
  return function evalSdf(x, y, z) {
    let d = 1e9;
    for (let i = 0; i < capsules.length; i++) {
      d = smin(d, sdCapsule(x, y, z, capsules[i]), BLEND_K);
    }
    for (let i = 0; i < spheres.length; i++) {
      d = smin(d, sdSphere(x, y, z, spheres[i]), BLEND_K * 0.85);
    }
    return d;
  };
}

function meshFromSdf(evalSdf, bounds) {
  const iso = isosurface.marchingCubes({
    isovalue: 0,
    xrange: [bounds.minX, bounds.maxX],
    yrange: [bounds.minY, bounds.maxY],
    zrange: [bounds.minZ, bounds.maxZ],
    resolution: GRID_RES,
    potential: evalSdf
  });

  if (!iso?.positions?.length || !iso?.cells?.length) return null;

  const verts = new Float32Array(iso.positions.length * 3);
  for (let i = 0; i < iso.positions.length; i++) {
    verts[i * 3] = iso.positions[i][0];
    verts[i * 3 + 1] = iso.positions[i][1];
    verts[i * 3 + 2] = iso.positions[i][2];
  }
  const indices = [];
  for (let i = 0; i < iso.cells.length; i++) {
    const c = iso.cells[i];
    indices.push(c[0], c[1], c[2]);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function ageToMetalRoughness(age) {
  const a = Math.max(1, Math.min(120, Number(age) || 25));
  return 0.006 + (a / 120) * 0.012;
}

function ageToGlassRoughness(age, surfaceScale) {
  const a = Math.max(1, Math.min(120, Number(age) || 25));
  const base = 0.02 + (a / 120) * 0.04;
  return Math.min(0.07, base + (surfaceScale || 0) * 0.0004);
}

function glassTintColor(hex) {
  const s = String(hex || '#D7A2B4').replace('#', '');
  return new THREE.Color(
    parseInt(s.slice(0, 2), 16) / 255,
    parseInt(s.slice(2, 4), 16) / 255,
    parseInt(s.slice(4, 6), 16) / 255
  );
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
    } catch (e) {
      console.warn('[pbr] HDR failed:', url, e);
    }
  }
  console.warn('[pbr] HDR fallback RoomEnvironment (low contrast — chrome will look flat)');
  const env = new RoomEnvironment(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  active.envMap = tex;
  return tex;
}

function createCamera(vb) {
  const cam = new THREE.OrthographicCamera(
    vb.x - CX,
    vb.x + vb.w - CX,
    CY - vb.y,
    CY - (vb.y + vb.h),
    1,
    4000
  );
  cam.position.set(0, 0, 1200);
  cam.lookAt(0, 0, 0);
  return cam;
}

/** IBL-dominant — direct lights were washing out env reflections into gray gradient bands. */
function addStudioLights(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.02));
}

function buildChromeMaterial(envMap, roughness) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 1.0,
    roughness: Math.min(roughness, 0.018),
    envMap: envMap,
    envMapIntensity: 7.5,
    clearcoat: 1.0,
    clearcoatRoughness: 0.002,
    reflectivity: 1.0,
    ior: 2.5,
    specularIntensity: 2.0,
    specularColor: new THREE.Color(0xffffff),
    anisotropy: 0.0,
    anisotropyRotation: 0.0
  });
}

function buildGlassMaterial(envMap, style3, domainHex) {
  const tint = glassTintColor(domainHex || style3.strokeColor);
  const rough = ageToGlassRoughness(style3.age, style3.surfaceScale);
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0xffffff),
    metalness: 0.0,
    roughness: rough,
    transmission: 1.0,
    thickness: 9.0,
    ior: 1.52,
    transparent: true,
    opacity: 1,
    envMap: envMap,
    envMapIntensity: 2.4,
    attenuationColor: tint,
    attenuationDistance: 3.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.012,
    specularIntensity: 1.6,
    specularColor: new THREE.Color(0xffffff),
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: true
  });
}

function buildFusedMesh(layerEl, rootSvg) {
  const prims = buildVolumePrimitives(layerEl, rootSvg);
  if (!prims.capsules.length) return null;
  const bounds = boundsForPrimitives(prims.capsules, prims.spheres);
  const evalSdf = makeSdfEvaluator(prims.capsules, prims.spheres);
  return {
    geometry: meshFromSdf(evalSdf, bounds),
    segments: prims.capsules.length,
    joints: prims.spheres.length
  };
}

/**
 * @param {{ svg: string, style2: object|null, style3: object, container: HTMLElement, domainHex?: string }} opts
 */
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

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(RENDER_BG, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    active.renderer = renderer;

    const envMap = await loadEnvMap(renderer);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(RENDER_BG);
    scene.environment = envMap;
    scene.environmentIntensity = 2.2;
    addStudioLights(scene);

    const camera = createCamera(vb);
    let statsL2 = { segments: 0, joints: 0 };
    let statsL3 = { segments: 0, joints: 0 };

    if (layer2 && style2) {
      const fused = buildFusedMesh(layer2, mount);
      if (!fused?.geometry) throw new Error('L2 volume mesh failed');
      const mesh = new THREE.Mesh(
        fused.geometry,
        buildChromeMaterial(envMap, ageToMetalRoughness(style2.age))
      );
      mesh.renderOrder = 0;
      scene.add(mesh);
      statsL2 = { segments: fused.segments, joints: fused.joints };
    }

    const fused3 = buildFusedMesh(layer3, mount);
    if (!fused3?.geometry) throw new Error('L3 volume mesh failed');
    const glassMesh = new THREE.Mesh(
      fused3.geometry,
      buildGlassMaterial(envMap, style3, domainHex || style3.strokeColor)
    );
    glassMesh.renderOrder = 1;
    scene.add(glassMesh);
    statsL3 = { segments: fused3.segments, joints: fused3.joints };

    renderer.sortObjects = true;
    renderer.render(scene, camera);
    disposeScene(scene);

    container.innerHTML = '';
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    container.appendChild(canvas);

    return {
      tubesL2: statsL2.segments,
      tubesL3: statsL3.segments,
      jointsL2: statsL2.joints,
      jointsL3: statsL3.joints,
      metalRough: style2 ? ageToMetalRoughness(style2.age) : null,
      glassRough: ageToGlassRoughness(style3.age, style3.surfaceScale),
      fused: true
    };
  } finally {
    if (mount.parentNode) mount.parentNode.removeChild(mount);
  }
}

export function disposePbr() {
  disposeActive();
}
