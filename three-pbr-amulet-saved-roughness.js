/**
 * גרסה שמורה — עם חספוס (SVG bump + PBR displacement לפי עיסוק).
 * L3: גוש אחיד (ללא בועות gap). להשוואה מול three-pbr-amulet.js.
 * מקור: three-pbr-amulet-checkpoint.js (commit checkpoint יציב).
 */
import * as THREE from 'https://esm.sh/three@0.160.0';
import { RoomEnvironment } from 'https://esm.sh/three@0.160.0/examples/jsm/environments/RoomEnvironment.js';
import { buildStoneSculptureMeshFromMask } from './stone-sdf-mesh.js';
import { buildStoneMaterial, addStoneLights } from './three-pbr-amulet.js';
const W = 680;
const H = 680;
const CX = 340;
const CY = 340;
const TUBE_RADIUS = 6;
const PATH_STEP = 0.8;
/** תואם ל-PATH_MAIN_STROKE ב-prototype-v2 */
const L3_STROKE_WIDTH = 45;
/** תואם ל-prototype-v2 */
const FRAME_PAD = 40;
const MASK_SCALE = 2;
const MASK_MESH_STEP = 2;
/** Stone L2 tube radius scale — matches three-pbr-amulet.js */
const STONE_L2_THICKNESS = 0.95;

/** L2 tube test — identical tuned stone maps/params as L3, without vertexColors. */
function buildL2StoneTubeMaterial(stoneTone) {
  const l2StoneMat = buildStoneMaterial().material.clone();
  l2StoneMat.vertexColors = false;
  if (stoneTone != null) {
    l2StoneMat.color.setHex(stoneTone);
  }
  return l2StoneMat;
}

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
  scene.background = null;
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

/** 1 = חלק, 0 = קוצני — תואם ל-prototype-v2-saved-roughness.html */
const OCCUPATION_SMOOTHNESS = {
  tech_finance: 1,
  governance_security: 0.82,
  knowledge_teaching: 0.62,
  care_health: 0.42,
  agriculture: 0.22,
  creation_spirit: 0
};

function occupationRoughness(style2) {
  const key = style2?.occupationKey || 'care_health';
  const smooth = OCCUPATION_SMOOTHNESS[key] ?? 0.5;
  return 1 - smooth;
}

function metalRoughnessFromStyle2(style2) {
  const key = style2?.occupationKey || 'care_health';
  if (key === 'tech_finance') return 0.002;
  const rough = occupationRoughness(style2);
  return Math.min(0.25, 0.01 + rough * rough * 0.14 + rough * 0.1);
}

const bumpTextureCache = {};

function createOccupationBumpTexture(occupationKey) {
  if (occupationKey === 'tech_finance') return null;
  const rough = 1 - (OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5);
  if (rough < 0.1) return null;
  if (bumpTextureCache[occupationKey]) return bumpTextureCache[occupationKey];

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const n =
        Math.sin(x * 0.31 + y * 0.17) * 0.35 +
        Math.sin(x * 0.71 - y * 0.43) * 0.25 +
        Math.random() * 0.4;
      const v = 128 + n * rough * 110;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  bumpTextureCache[occupationKey] = tex;
  return tex;
}

function buildMetalMaterial(style2, forFrame = false) {
  const key = style2?.occupationKey || 'care_health';
  const rough = occupationRoughness(style2);
  const polished = key === 'tech_finance';
  const mat = polished
    ? new THREE.MeshPhysicalMaterial({
        color: 0x9a9aa8,
        metalness: 1.0,
        roughness: 0.002,
        clearcoat: 1.0,
        clearcoatRoughness: 0.01,
        envMapIntensity: 2.5
      })
    : new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 1.0,
        roughness: forFrame
          ? Math.min(0.06, 0.025 + rough * 0.025)
          : metalRoughnessFromStyle2(style2),
        envMapIntensity: 1.5
      });
  if (!forFrame && !polished) {
    const bumpTex = createOccupationBumpTexture(key);
    if (bumpTex) {
      mat.bumpMap = bumpTex;
      mat.bumpScale = rough * rough * 0.24 + rough * 0.09;
    }
  }
  return mat;
}

function buildCeramicMaterial(hexColor, style3, ageNum, l3Spike) {
  const age = Math.max(1, Math.min(120, Number(ageNum) || 25));
  const ageFactor = (age - 1) / 119;
  const spike = l3Spike != null ? Math.max(0, Math.min(1, l3Spike)) : null;
  const roughness = spike != null
    ? 0.02 + spike * 0.42
    : 0.02 + ageFactor * 0.18;
  const thickness = 4 + ageFactor * 10;
  const transmission = spike != null
    ? Math.max(0.25, 0.55 - spike * 0.35)
    : 0.5 - ageFactor * 0.15;

  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hexColor || '#D7A2B4'),
    metalness: 0.0,
    roughness,
    transmission,
    thickness,
    ior: 1.8,
    clearcoat: 1.0,
    clearcoatRoughness: roughness * 0.4,
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
    const scrCtm = pathEl.getScreenCTM();
    const rootCtm = rootSvg.getScreenCTM();
    if (!scrCtm || !rootCtm) {
      return new THREE.Vector3(x - CX, -(y - CY), 0);
    }
    const scr = pt.matrixTransform(scrCtm);
    const g = scr.matrixTransform(rootCtm.inverse());
    gx = g.x;
    gy = g.y;
  }
  return new THREE.Vector3(gx - CX, -(gy - CY), 0);
}

function sampleGeometryLength(el, rootSvg) {
  if (!el || typeof el.getTotalLength !== 'function' || typeof el.getPointAtLength !== 'function') {
    return [];
  }
  const len = el.getTotalLength();
  if (!isFinite(len) || len < 4) return [];
  const steps = Math.max(48, Math.ceil(len / PATH_STEP));
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = steps <= 1 ? 0 : i / (steps - 1);
    const p = el.getPointAtLength(len * t);
    pts.push(pathPointToRoot(rootSvg, el, p.x, p.y));
  }
  return pts;
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

function sampleCircle(circleEl, rootSvg) {
  const geomPts = sampleGeometryLength(circleEl, rootSvg);
  if (geomPts.length >= 2) return geomPts;
  const cx = Number(circleEl.getAttribute('cx')) || 0;
  const cy = Number(circleEl.getAttribute('cy')) || 0;
  const r = Number(circleEl.getAttribute('r')) || 0;
  if (r < 1) return [];
  const steps = Math.max(48, Math.ceil((2 * Math.PI * r) / PATH_STEP));
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push(pathPointToRoot(rootSvg, circleEl, cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  return pts;
}

function sampleEllipse(ellipseEl, rootSvg) {
  const geomPts = sampleGeometryLength(ellipseEl, rootSvg);
  if (geomPts.length >= 2) return geomPts;
  const cx = Number(ellipseEl.getAttribute('cx')) || 0;
  const cy = Number(ellipseEl.getAttribute('cy')) || 0;
  const rx = Number(ellipseEl.getAttribute('rx')) || 0;
  const ry = Number(ellipseEl.getAttribute('ry')) || 0;
  if (rx < 1 || ry < 1) return [];
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const steps = Math.max(48, Math.ceil(perimeter / PATH_STEP));
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push(pathPointToRoot(rootSvg, ellipseEl, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return pts;
}

function metalRadialSegs(style2, style3, isFrame = false) {
  const key = style2?.occupationKey;
  if (key === 'tech_finance') return 40;
  const smooth = OCCUPATION_SMOOTHNESS[key] ?? 0.5;
  const rough = 1 - smooth;
  if (!isFrame) {
    if (rough >= 0.95) return 6;
    if (rough >= 0.7) return 8;
    if (rough >= 0.5) return 10;
    if (rough >= 0.3) return 16;
    return 22;
  }
  return 32;
}

function frameTubeBaseRadius(style3) {
  const gender = style3?.gender || 'female';
  if (gender === 'nonbinary') return TUBE_RADIUS * 1.4;
  if (gender === 'male') return TUBE_RADIUS * 2.2;
  return TUBE_RADIUS * 0.7;
}

function buildStrokeCurve(pts, style3, straight, occupationKey, isFrame = false) {
  if (pts.length < 2) return null;
  const unique = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].distanceTo(pts[i - 1]) > 0.05) unique.push(pts[i]);
  }
  if (unique.length < 2) return null;

  if (straight) {
    return new THREE.CatmullRomCurve3(unique, false, 'centripetal', 0.02);
  }

  const rough = occupationKey != null ? 1 - (OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5) : 0;
  const smoothPasses = isFrame
    ? Math.max(0, Math.round(2 - rough * 2))
    : Math.max(1, Math.round(6 - rough * 5));
  let s = unique;
  for (let pass = 0; pass < smoothPasses; pass++) {
    const next = [s[0]];
    for (let i = 1; i < s.length - 1; i++) {
      next.push(
        new THREE.Vector3(
          (s[i - 1].x + s[i].x * 2 + s[i + 1].x) / 4,
          (s[i - 1].y + s[i].y * 2 + s[i + 1].y) / 4,
          (s[i - 1].z + s[i].z * 2 + s[i + 1].z) / 4
        )
      );
    }
    next.push(s[s.length - 1]);
    s = next;
  }
  const gender = style3?.gender || 'female';
  const baseAmp = gender === 'female' ? 2.5 : gender === 'male' ? 1.2 : 1.8;
  const nPts = s.length;
  const pathAmp =
    !isFrame && occupationKey != null ? baseAmp * (0.08 + rough * 0.55) : !isFrame ? baseAmp * 0.5 : 0;
  for (let i = 1; i < nPts - 1; i++) {
    const t = i / (nPts - 1);
    const x = s[i].x;
    const y = s[i].y;
    let dx = 0;
    let dy = 0;
    if (!isFrame) {
      const n = Math.sin(x * 0.08 + y * 0.13) * Math.cos(y * 0.11 - x * 0.07);
      dx = n * pathAmp;
      dy = n * pathAmp * 0.8;
    } else if (rough > 0.08) {
      const twistAmp = baseAmp * (0.04 + rough * 0.12);
      const curl =
        Math.sin(t * Math.PI * 2 * (0.9 + rough * 1.1)) *
        Math.cos(t * Math.PI * (1.8 + rough * 1.8) + rough * 1.1);
      dx = curl * twistAmp;
      dy = Math.sin(t * Math.PI * 2.5 + rough * 0.6) * twistAmp * 0.48;
    }
    s[i].x += dx;
    s[i].y += dy;
  }
  const tension = isFrame
    ? 0.28
    : occupationKey != null
      ? 0.02 + rough * 0.46
      : 0.5;
  return new THREE.CatmullRomCurve3(s, false, 'catmullrom', tension);
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += pts[i].distanceTo(pts[i - 1]);
  return len;
}

function applyOrganicDisplacement(
  geom,
  gender,
  tubeRadius,
  ageNum,
  occupationKey,
  metalLayer,
  surfaceScale,
  isFrame = false
) {
  const pos = geom.attributes.position;
  const normal = geom.attributes.normal;
  if (!occupationKey && metalLayer) return;
  if (occupationKey === 'tech_finance') return;

  const smooth = OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5;
  if (smooth >= 0.95) return;
  const rough = 1 - smooth;
  const age = Math.max(1, Math.min(120, Number(ageNum) || 25));
  const ageAmp = 0.1 + (age / 120) * 4.0;
  let amp;
  let freq;

  if (isFrame) {
    amp = tubeRadius * (rough * 0.45 + 0.08);
    freq = 0.018 + rough * 0.14;
  } else if (metalLayer) {
    const occMul = rough * 2.8;
    amp =
      (gender === 'female' ? tubeRadius * 0.3 : gender === 'male' ? tubeRadius * 0.2 : tubeRadius * 0.25) *
      ageAmp *
      occMul;
    freq = 0.015 + rough * 0.2 + (age / 120) * 0.08;
  } else {
    if (surfaceScale != null && surfaceScale <= 0) return;
    const ageFactor = surfaceScale != null && surfaceScale > 0 ? Math.min(1, surfaceScale / 22) : ageAmp / 4;
    if (ageFactor < 0.03) return;
    amp = tubeRadius * ageFactor * rough * 0.5;
    freq = 0.04 + ageFactor * 0.16;
  }

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = normal.getX(i);
    const ny = normal.getY(i);
    const nz = normal.getZ(i);
    const s = Math.sin(x * freq * 1.7 + y * freq * 3.1) * 0.5 + 0.5;
    const t = Math.cos(y * freq * 2.3 - z * freq * 1.9) * 0.5 + 0.5;
    const u = Math.sin(z * freq * 2.7 + x * freq * 1.3) * 0.5 + 0.5;
    const n = (s * t * u - 0.125) * 2.0;
    let dx = nx * n * amp;
    let dy = ny * n * amp;
    let dz = nz * n * amp;
    if (metalLayer && !isFrame) {
      const maxLocalZ = 3.2;
      if (z + dz > maxLocalZ) dz = maxLocalZ - z;
    }
    pos.setXYZ(i, x + dx, y + dy, z + dz);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
}

function downsamplePoints(pts, maxPts) {
  if (pts.length <= maxPts) return pts;
  const step = pts.length / maxPts;
  const out = [];
  for (let i = 0; i < maxPts; i++) out.push(pts[Math.floor(i * step)]);
  return out;
}

function addTubeFromPoints(
  pts,
  material,
  scene,
  z,
  renderOrder,
  style3,
  ageNum,
  closed,
  radiusScale = 1,
  style2 = null,
  isFrame = false,
  worldUvBounds = null
) {
  if (pts.length < 2) return false;
  const occupationKey = style2?.occupationKey ?? null;
  const isL2Metal = !!style2 && !isFrame;
  const polishedL2 = isL2Metal && occupationKey === 'tech_finance';
  const curve = buildStrokeCurve(
    pts,
    style3,
    polishedL2,
    occupationKey,
    isFrame
  );
  if (!curve) return false;
  if (closed) curve.closed = true;
  const pathLen = polylineLength(pts);
  const tubularSegs = Math.min(400, Math.max(48, Math.ceil(pathLen / 2)));
  const gender = style3?.gender || 'female';
  const base = isFrame
    ? frameTubeBaseRadius(style3)
    : gender === 'nonbinary'
      ? TUBE_RADIUS * 2.2
      : gender === 'male'
        ? TUBE_RADIUS * 1.4
        : TUBE_RADIUS * 0.7;
  const radius = base * radiusScale;
  const radialSegs = style2
    ? metalRadialSegs(style2, style3, isFrame)
    : polishedL2
      ? 40
      : gender === 'nonbinary'
        ? 4
        : gender === 'male'
          ? 10
          : 26;
  const geom = new THREE.TubeGeometry(curve, tubularSegs, radius, radialSegs, closed);
  const smooth = occupationKey ? OCCUPATION_SMOOTHNESS[occupationKey] ?? 0.5 : 0.5;
  const skipDisp = polishedL2 || smooth >= 0.95;
  if (!skipDisp && occupationKey) {
    applyOrganicDisplacement(
      geom,
      gender,
      radius,
      ageNum,
      occupationKey,
      isL2Metal || isFrame,
      style3?.surfaceScale,
      isFrame
    );
  }
  if (worldUvBounds) {
    applyWorldSpaceStoneUvs(geom, worldUvBounds);
  }
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.z = z;
  mesh.renderOrder = renderOrder;
  scene.add(mesh);
  return true;
}

function unionLayersBBox(mount) {
  const els = [mount.querySelector('.layer-2'), mount.querySelector('.layer-3')].filter(Boolean);
  if (!els.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of els) {
    const b = el.getBBox();
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  if (!isFinite(minX)) return null;
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    halfW: (maxX - minX) / 2,
    halfH: (maxY - minY) / 2
  };
}

function scenePointsOnEllipse(mount, anchorEl, cx, cy, rx, ry) {
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const steps = Math.max(64, Math.ceil(perimeter / PATH_STEP));
  const pts = [];
  const el = anchorEl || mount;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push(pathPointToRoot(mount, el, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return pts;
}

function scenePointsOnCircle(mount, anchorEl, cx, cy, r) {
  return scenePointsOnEllipse(mount, anchorEl, cx, cy, r, r);
}

function tryFrameTube(pts, material, scene, z, renderOrder, style3, ageNum, style2) {
  if (pts.length < 2) return false;
  const reduced = downsamplePoints(pts, 160);
  return addTubeFromPoints(reduced, material, scene, z, renderOrder, style3, ageNum, true, 1.15, style2, true);
}

/** מסגרת מ-SVG — מעגל (הגנה) או נתיב מותאם (זימון), עם fallback מ-bbox של L2+L3 */
function addFrameRing(mount, material, scene, z, renderOrder, style3, ageNum, style2) {
  const strokePad = L3_STROKE_WIDTH / 2;
  const frameRoot = mount.querySelector('.layer-frame');
  const intent = frameRoot?.getAttribute('data-intent') || style3?.intent || 'protection';
  const anchorEl = mount.querySelector('.layer-2') || mount.querySelector('.layer-3');

  const pathEl = mount.querySelector('.layer-frame path');
  if (pathEl) {
    let pts = sampleGeometryLength(pathEl, mount);
    if (pts.length < 2) pts = samplePath(pathEl, mount);
    if (tryFrameTube(pts, material, scene, z, renderOrder, style3, ageNum, style2)) return 1;
  }

  const circleEl = mount.querySelector('.layer-frame circle');
  if (circleEl) {
    let pts = sampleGeometryLength(circleEl, mount);
    if (pts.length < 2) pts = sampleCircle(circleEl, mount);
    if (tryFrameTube(pts, material, scene, z, renderOrder, style3, ageNum, style2)) return 1;
  }

  if (intent === 'summoning') {
    console.warn('[pbr] summoning frame path missing or invalid');
    return 0;
  }
  const bb = unionLayersBBox(mount);
  if (!bb) return 0;
  const r = Math.max(bb.halfW, bb.halfH) + strokePad + FRAME_PAD;
  const pts = scenePointsOnCircle(mount, anchorEl, bb.cx, bb.cy, r);
  return tryFrameTube(pts, material, scene, z, renderOrder, style3, ageNum, style2) ? 1 : 0;
}

function maskBoundsFromPolylines(polylines, strokeScene) {
  const margin = strokeScene * 0.7 + 16;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { pts } of polylines) {
    for (const pt of pts) {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }
  }
  if (!isFinite(minX)) return null;
  return {
    minX: minX - margin,
    maxX: maxX + margin,
    minY: minY - margin,
    maxY: maxY + margin
  };
}

function buildStrokeSegments(polylines) {
  const segments = [];
  const downsample = (pts, max = 64) => {
    if (pts.length <= max) return pts;
    const out = [];
    const step = (pts.length - 1) / (max - 1);
    for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
    return out;
  };
  for (const { pts, closed } of polylines) {
    if (pts.length < 2) continue;
    const draw = downsample(pts);
    const arcLengths = [0];
    for (let i = 1; i < draw.length; i++) {
      arcLengths.push(
        arcLengths[i - 1] + Math.hypot(draw[i].x - draw[i - 1].x, draw[i].y - draw[i - 1].y)
      );
    }
    const segCount = closed ? draw.length : draw.length - 1;
    const closing =
      closed && draw.length > 2
        ? Math.hypot(draw[0].x - draw[draw.length - 1].x, draw[0].y - draw[draw.length - 1].y)
        : 0;
    const total = (arcLengths[arcLengths.length - 1] || 0) + closing || 1;
    for (let i = 0; i < segCount; i++) {
      const j = (i + 1) % draw.length;
      const ax = draw[i].x;
      const ay = draw[i].y;
      const bx = draw[j].x;
      const by = draw[j].y;
      const segLen = Math.hypot(bx - ax, by - ay);
      const arcStart = arcLengths[i] / total;
      segments.push({ ax, ay, bx, by, arcStart, arcEnd: arcStart + segLen / total });
    }
  }
  return segments;
}

function drawPolylinesMask(ctx, polylines, maskOrigin, strokeW) {
  const toCanvas = (v) => ({
    x: (v.x - maskOrigin.minX) * MASK_SCALE,
    y: (maskOrigin.maxY - v.y) * MASK_SCALE
  });
  const drawDiscs = (pts) => {
    const r = strokeW / 2;
    for (const pt of pts) {
      const p = toCanvas(pt);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  for (const { pts, closed } of polylines) {
    drawDiscs(pts);
    ctx.beginPath();
    const p0 = toCanvas(pts[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = toCanvas(pts[i]);
      ctx.lineTo(p.x, p.y);
    }
    if (closed) ctx.closePath();
    ctx.stroke();
  }
}

function rasterizePolylinesToGrid(polylines, strokeScene, maskOrigin) {
  const strokeW = strokeScene * MASK_SCALE;
  const w = Math.max(64, Math.ceil((maskOrigin.maxX - maskOrigin.minX) * MASK_SCALE));
  const h = Math.max(64, Math.ceil((maskOrigin.maxY - maskOrigin.minY) * MASK_SCALE));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = strokeW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawPolylinesMask(ctx, polylines, maskOrigin, strokeW);
  return readMaskGrid(canvas);
}

function collectPolylinesFromLayer(layerEl, rootSvg) {
  const polylines = [];
  const add = (pts, closed) => {
    if (pts.length >= 2) polylines.push({ pts, closed });
  };
  if (!layerEl) return polylines;
  layerEl.querySelectorAll('path').forEach((el) => add(samplePath(el, rootSvg), false));
  layerEl.querySelectorAll('circle').forEach((el) => add(sampleCircle(el, rootSvg), true));
  layerEl.querySelectorAll('ellipse').forEach((el) => add(sampleEllipse(el, rootSvg), true));
  return polylines;
}

function l2TubeRadius(style3) {
  const gender = style3?.gender || 'female';
  if (gender === 'nonbinary') return TUBE_RADIUS * 2.2;
  if (gender === 'male') return TUBE_RADIUS * 1.4;
  return TUBE_RADIUS * 0.7;
}

function addStoneSculptureFromPolylines(polylines, tubeRadius, material, scene, z, renderOrder) {
  if (!polylines.length) return 0;
  const strokeScene = tubeRadius * 2.15;
  const maskOrigin = maskBoundsFromPolylines(polylines, strokeScene);
  if (!maskOrigin) return 0;
  const { grid, w, h } = rasterizePolylinesToGrid(polylines, strokeScene, maskOrigin);
  let filled = 0;
  for (let i = 0; i < grid.length; i++) filled += grid[i];
  if (filled < 40) return 0;
  const segments = buildStrokeSegments(polylines);
  const geom = buildStoneSculptureMeshFromMask(
    grid,
    w,
    h,
    maskOrigin,
    tubeRadius * STONE_L2_THICKNESS,
    MASK_SCALE,
    null,
    segments
  );
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.z = z;
  mesh.renderOrder = renderOrder;
  scene.add(mesh);
  return 1;
}

function addStoneSculptureFromLayer(layerEl, rootSvg, material, scene, z, renderOrder, tubeRadius) {
  const polylines = collectPolylinesFromLayer(layerEl, rootSvg);
  return addStoneSculptureFromPolylines(polylines, tubeRadius, material, scene, z, renderOrder);
}

function computeLayerStrokeBounds(layerEl, rootSvg) {
  const polylines = collectPolylinesFromLayer(layerEl, rootSvg);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { pts } of polylines) {
    for (const pt of pts) {
      minX = Math.min(minX, pt.x);
      maxX = Math.max(maxX, pt.x);
      minY = Math.min(minY, pt.y);
      maxY = Math.max(maxY, pt.y);
    }
  }
  if (!isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}

/** World-space XY UVs — same mapping as addSculptureUvs() on the SDF stone mesh. */
function applyWorldSpaceStoneUvs(geom, bounds) {
  const pos = geom.attributes.position;
  const spanX = bounds.maxX - bounds.minX || 1;
  const spanY = bounds.maxY - bounds.minY || 1;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = (pos.getX(i) - bounds.minX) / spanX;
    uvs[i * 2 + 1] = (bounds.maxY - pos.getY(i)) / spanY;
  }
  geom.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

function addL2StoneTubesFromLayer(layerEl, rootSvg, material, scene, z, renderOrder, style3, ageNum, style2) {
  if (!layerEl) return 0;
  const worldUvBounds = computeLayerStrokeBounds(layerEl, rootSvg);
  if (!worldUvBounds) return 0;
  let count = 0;
  layerEl.querySelectorAll('path').forEach((pathEl) => {
    const pts = samplePath(pathEl, rootSvg);
    if (
      addTubeFromPoints(
        pts,
        material,
        scene,
        z,
        renderOrder,
        style3,
        ageNum,
        false,
        1,
        style2,
        false,
        worldUvBounds
      )
    ) {
      count++;
    }
  });
  layerEl.querySelectorAll('circle').forEach((circleEl) => {
    const pts = sampleCircle(circleEl, rootSvg);
    if (
      addTubeFromPoints(
        pts,
        material,
        scene,
        z,
        renderOrder,
        style3,
        ageNum,
        true,
        1,
        style2,
        false,
        worldUvBounds
      )
    ) {
      count++;
    }
  });
  layerEl.querySelectorAll('ellipse').forEach((ellipseEl) => {
    const pts = sampleEllipse(ellipseEl, rootSvg);
    if (
      addTubeFromPoints(
        pts,
        material,
        scene,
        z,
        renderOrder,
        style3,
        ageNum,
        true,
        1,
        style2,
        false,
        worldUvBounds
      )
    ) {
      count++;
    }
  });
  return count;
}

function addTubesFromLayer(layerEl, rootSvg, material, scene, z, renderOrder, style3, ageNum, style2) {
  if (!layerEl) return 0;
  let count = 0;
  layerEl.querySelectorAll('path').forEach((pathEl) => {
    const pts = samplePath(pathEl, rootSvg);
    if (addTubeFromPoints(pts, material, scene, z, renderOrder, style3, ageNum, false, 1, style2)) count++;
  });
  layerEl.querySelectorAll('circle').forEach((circleEl) => {
    const pts = sampleCircle(circleEl, rootSvg);
    if (addTubeFromPoints(pts, material, scene, z, renderOrder, style3, ageNum, true, 1, style2)) count++;
  });
  layerEl.querySelectorAll('ellipse').forEach((ellipseEl) => {
    const pts = sampleEllipse(ellipseEl, rootSvg);
    if (addTubeFromPoints(pts, material, scene, z, renderOrder, style3, ageNum, true, 1, style2)) count++;
  });
  return count;
}

function scenePointToCanvas(v) {
  return { x: (v.x + CX) * MASK_SCALE, y: (CY - v.y) * MASK_SCALE };
}

/** Raster union mask by drawing sampled strokes directly — ignores SVG filters/groups. */
function rasterizeLayerMaskCanvas(layerEl, rootSvg) {
  const texW = W * MASK_SCALE;
  const texH = H * MASK_SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = texW;
  canvas.height = texH;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, texW, texH);
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = L3_STROKE_WIDTH * MASK_SCALE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawPolyline = (pts, closed) => {
    if (pts.length < 2) return;
    ctx.beginPath();
    const p0 = scenePointToCanvas(pts[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < pts.length; i++) {
      const p = scenePointToCanvas(pts[i]);
      ctx.lineTo(p.x, p.y);
    }
    if (closed) ctx.closePath();
    ctx.stroke();
  };

  layerEl.querySelectorAll('path').forEach((el) => drawPolyline(samplePath(el, rootSvg), false));
  layerEl.querySelectorAll('circle').forEach((el) => drawPolyline(sampleCircle(el, rootSvg), true));
  layerEl.querySelectorAll('ellipse').forEach((el) => drawPolyline(sampleEllipse(el, rootSvg), true));
  return canvas;
}

function readMaskGrid(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      grid[y * w + x] = data[i + 3] > 24 || data[i] > 24 ? 1 : 0;
    }
  }
  return { grid, w, h };
}

function l3TubeRadius(style3) {
  const gender = style3?.gender || 'female';
  if (gender === 'nonbinary') return L3_STROKE_WIDTH * 0.52;
  if (gender === 'male') return L3_STROKE_WIDTH * 0.42;
  return L3_STROKE_WIDTH * 0.5;
}

/** Chamfer distance transform — distance in px to nearest empty pixel. */
function distanceTransform(grid, w, h) {
  const INF = 1e7;
  const dist = new Float32Array(w * h);
  for (let i = 0; i < grid.length; i++) dist[i] = grid[i] ? INF : 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!grid[i]) continue;
      let m = dist[i];
      if (x > 0) m = Math.min(m, dist[i - 1] + 1);
      if (y > 0) m = Math.min(m, dist[i - w] + 1);
      if (x > 0 && y > 0) m = Math.min(m, dist[i - w - 1] + 1.414213562);
      if (x < w - 1 && y > 0) m = Math.min(m, dist[i - w + 1] + 1.414213562);
      dist[i] = m;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!grid[i]) continue;
      let m = dist[i];
      if (x < w - 1) m = Math.min(m, dist[i + 1] + 1);
      if (y < h - 1) m = Math.min(m, dist[i + w] + 1);
      if (x < w - 1 && y < h - 1) m = Math.min(m, dist[i + w + 1] + 1.414213562);
      if (x > 0 && y < h - 1) m = Math.min(m, dist[i + w - 1] + 1.414213562);
      dist[i] = m;
    }
  }
  return dist;
}

function domeHeight(distPx, radiusScene) {
  const d = distPx / MASK_SCALE;
  const dd = Math.min(d, radiusScene);
  const h = Math.sqrt(Math.max(0, radiusScene * radiusScene - (radiusScene - dd) * (radiusScene - dd)));
  return h * 0.92;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(edge1 - edge0, 1e-6)));
  return t * t * (3 - 2 * t);
}

/** Distance from each mask pixel to nearest medial ridge (local max of distance transform). */
function medialRidgeDistance(distIn, grid, w, h) {
  const ridge = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!grid[i]) continue;
      const d = distIn[i];
      let isRidge = true;
      for (let oy = -1; oy <= 1 && isRidge; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const j = (y + oy) * w + (x + ox);
          if (grid[j] && distIn[j] > d + 0.05) isRidge = false;
        }
      }
      if (isRidge) ridge[i] = 1;
    }
  }

  const crestDist = new Float32Array(w * h);
  crestDist.fill(1e7);
  const queue = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (ridge[i]) {
        crestDist[i] = 0;
        queue.push(i);
      }
    }
  }
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi];
    const x = i % w;
    const y = (i / w) | 0;
    const base = crestDist[i];
    const neighbors = [i - 1, i + 1, i - w, i + w];
    for (const j of neighbors) {
      if (j < 0 || j >= w * h) continue;
      if (!grid[j]) continue;
      const nx = j % w;
      const ny = (j / w) | 0;
      if (Math.abs(nx - x) + Math.abs(ny - y) !== 1) continue;
      if (crestDist[j] > base + 1) {
        crestDist[j] = base + 1;
        queue.push(j);
      }
    }
  }
  return crestDist;
}

/** Cluster stroke endpoints — junctions where two or more paths meet. */
function collectJunctionNodes(layerEl, rootSvg) {
  const raw = [];
  const pushPt = (v) => raw.push({ x: v.x, y: v.y });

  layerEl.querySelectorAll('path').forEach((el) => {
    const pts = samplePath(el, rootSvg);
    if (pts.length >= 1) {
      pushPt(pts[0]);
      pushPt(pts[pts.length - 1]);
    }
  });
  layerEl.querySelectorAll('circle').forEach((el) => {
    const pts = sampleCircle(el, rootSvg);
    if (pts.length >= 2) {
      pushPt(pts[0]);
      pushPt(pts[Math.floor(pts.length / 2)]);
    }
  });
  layerEl.querySelectorAll('ellipse').forEach((el) => {
    const pts = sampleEllipse(el, rootSvg);
    if (pts.length >= 2) {
      pushPt(pts[0]);
      pushPt(pts[Math.floor(pts.length / 2)]);
    }
  });

  const clusterR = L3_STROKE_WIDTH * 0.42;
  const clusters = [];
  for (const pt of raw) {
    let found = null;
    for (const c of clusters) {
      if (Math.hypot(c.x - pt.x, c.y - pt.y) <= clusterR) {
        found = c;
        break;
      }
    }
    if (found) {
      found.count++;
      found.x = (found.x * (found.count - 1) + pt.x) / found.count;
      found.y = (found.y * (found.count - 1) + pt.y) / found.count;
    } else {
      clusters.push({ x: pt.x, y: pt.y, count: 1 });
    }
  }
  return clusters.filter((c) => c.count >= 2);
}

function buildJunctionHeatMap(layerEl, rootSvg, w, h) {
  const heat = new Float32Array(w * h);
  const nodes = collectJunctionNodes(layerEl, rootSvg);
  const radiusPx = L3_STROKE_WIDTH * 0.34 * MASK_SCALE;
  for (const node of nodes) {
    const c = scenePointToCanvas(node);
    const cx = c.x;
    const cy = c.y;
    const r = Math.ceil(radiusPx);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.round(cx + dx);
        const y = Math.round(cy + dy);
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 > radiusPx * radiusPx) continue;
        const t = 1 - Math.sqrt(d2) / radiusPx;
        const i = y * w + x;
        heat[i] = Math.max(heat[i], t * t);
      }
    }
  }
  return heat;
}

/** Tube crest on stroke spines + subtle junction grooves (metal-toned shadows, not white slots). */
function metalReliefHeight(distIn, crestDist, junctionHeat, radius) {
  const edgeScene = distIn / MASK_SCALE;
  const crestScene = crestDist / MASK_SCALE;
  const crestNorm = crestScene / Math.max(edgeScene * 0.46, 0.28);
  const crestFactor = smoothstep(0.08, 0.76, crestNorm);
  const tube = domeHeight(distIn, radius) * (0.2 + 0.55 * crestFactor);
  const gapCarve =
    (1 - crestFactor) * radius * 0.2 * smoothstep(radius * 0.12, radius * 0.72, edgeScene);
  const junctionCarve = Math.pow(junctionHeat, 1.4) * radius * 0.18;
  return Math.max(radius * 0.035, tube - gapCarve - junctionCarve);
}

/**
 * Union mask → one inflated volume (rounded tube cross-section) + organic displacement.
 */
function buildInflatedMeshFromMask(grid, w, h, style3, ageNum, opts = {}) {
  const radius = l3TubeRadius(style3);
  const dist = distanceTransform(grid, w, h);
  const crestDist = opts?.junctionRelief ? medialRidgeDistance(dist, grid, w, h) : null;
  const junctionHeat = opts?.junctionRelief && opts?.junctionHeat ? opts.junctionHeat : null;
  const step = MASK_MESH_STEP;
  const vertMap = new Map();
  const positions = [];

  const vertKey = (x, y) => x + ',' + y;
  const addVertex = (x, y) => {
    const key = vertKey(x, y);
    if (vertMap.has(key)) return vertMap.get(key);
    const i = y * w + x;
    const z =
      crestDist && junctionHeat
        ? metalReliefHeight(dist[i], crestDist[i], junctionHeat[i], radius)
        : domeHeight(dist[i], radius);
    const idx = positions.length / 3;
    positions.push((x / MASK_SCALE) - CX, CY - y / MASK_SCALE, z);
    vertMap.set(key, idx);
    return idx;
  };

  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (grid[y * w + x]) addVertex(x, y);
    }
  }

  const indices = [];
  for (let y = 0; y < h - step; y += step) {
    for (let x = 0; x < w - step; x += step) {
      const k00 = vertKey(x, y);
      const k10 = vertKey(x + step, y);
      const k01 = vertKey(x, y + step);
      const k11 = vertKey(x + step, y + step);
      if (!vertMap.has(k00) || !vertMap.has(k10) || !vertMap.has(k01) || !vertMap.has(k11)) continue;
      const v00 = vertMap.get(k00);
      const v10 = vertMap.get(k10);
      const v01 = vertMap.get(k01);
      const v11 = vertMap.get(k11);
      indices.push(v00, v10, v01, v10, v11, v01);
    }
  }

  if (positions.length < 9 || indices.length < 3) throw new Error('L3 inflated mesh empty');

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();

  const gender = style3?.gender || 'female';
  if (!opts?.skipOrganic) {
    applyOrganicDisplacement(geom, gender, radius, ageNum);
    geom.computeVertexNormals();
  }
  return geom;
}

function buildUnifiedLayer3Geometry(layerEl, rootSvg, style3, ageNum, opts = {}) {
  const canvas = rasterizeLayerMaskCanvas(layerEl, rootSvg);
  let { grid, w, h } = readMaskGrid(canvas);
  if (opts?.fuseBridge) {
    const bridgePx = typeof opts.fuseBridge === 'number' ? opts.fuseBridge : 5;
    for (let i = 0; i < bridgePx; i++) grid = dilateMaskGrid1px(grid, w, h);
  }
  let filled = 0;
  for (let i = 0; i < grid.length; i++) filled += grid[i];
  if (filled < 80) throw new Error('L3 union mask empty (' + filled + ' px)');
  const meshOpts = { ...opts };
  if (opts?.junctionRelief) {
    meshOpts.junctionHeat = buildJunctionHeatMap(layerEl, rootSvg, w, h);
  }
  return buildInflatedMeshFromMask(grid, w, h, style3, ageNum, meshOpts);
}

function dilateMaskGrid1px(grid, w, h) {
  const out = new Uint8Array(grid.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!grid[i]) continue;
      out[i] = 1;
      if (x > 0) out[i - 1] = 1;
      if (x < w - 1) out[i + 1] = 1;
      if (y > 0) out[i - w] = 1;
      if (y < h - 1) out[i + w] = 1;
    }
  }
  return out;
}

function addUnifiedSolidFromLayer(layerEl, rootSvg, material, scene, z, renderOrder, style3, ageNum) {
  const geom = buildUnifiedLayer3Geometry(layerEl, rootSvg, style3, ageNum);
  const mesh = new THREE.Mesh(geom, material);
  mesh.position.z = z;
  mesh.renderOrder = renderOrder;
  scene.add(mesh);
  return 1;
}

/** Small margin so tubes are not clipped at canvas edges. */
const CANVAS_BLEED = 1.05;

function createCameraFromViewBox(vb) {
  const midX = vb.x + vb.w / 2 - CX;
  const midY = CY - (vb.y + vb.h / 2);
  const half = (Math.max(vb.w, vb.h) / 2) * CANVAS_BLEED;
  const cam = new THREE.OrthographicCamera(
    midX - half,
    midX + half,
    midY + half,
    midY - half,
    0.1,
    3000
  );
  cam.position.set(midX, midY, 1000);
  cam.lookAt(midX, midY, 0);
  return cam;
}

function createCameraFromScene(scene, fallbackVb) {
  const box = new THREE.Box3();
  let meshCount = 0;
  scene.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    const meshBox = obj.geometry.boundingBox.clone();
    meshBox.applyMatrix4(obj.matrixWorld);
    box.union(meshBox);
    meshCount++;
  });
  const vbHalf = (Math.max(fallbackVb.w, fallbackVb.h) / 2) * CANVAS_BLEED;
  if (meshCount === 0 || box.isEmpty()) return createCameraFromViewBox(fallbackVb);

  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = box.getSize(new THREE.Vector3());
  const half = Math.max((Math.max(size.x, size.y) / 2) * CANVAS_BLEED, vbHalf);
  const cam = new THREE.OrthographicCamera(
    center.x - half,
    center.x + half,
    center.y + half,
    center.y - half,
    0.1,
    3000
  );
  cam.position.set(center.x, center.y, 1000);
  cam.lookAt(center);
  return cam;
}

async function renderPbrCore(svg, opts) {
  const { style2, style3, domainHex } = opts;
  const mount = mountSvg(svg);

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const layer3 = mount.querySelector('.layer-3');
  if (!layer3) throw new Error('layer 3 missing');
  const layer2 = mount.querySelector('.layer-2');
  const vb = parseViewBox(mount);

  disposeActive();

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: true
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  active.renderer = renderer;

  const scene = new THREE.Scene();
  active.envMap = setupEnvironment(renderer, scene);
  addStoneLights(scene);
  renderer.toneMappingExposure = 1.12;

  renderer.sortObjects = true;

  const metalRough = style2 ? metalRoughnessFromStyle2(style2) : 0;
  const q = opts.questionnaire || {};
  const ceramicMat = buildCeramicMaterial(domainHex, style3, opts.ageNum, q.l3Spike);

  let tubesL2 = 0;
  if (layer2 && style2) {
    const l2StoneMat = buildL2StoneTubeMaterial(q.stoneTone);
    tubesL2 = addL2StoneTubesFromLayer(layer2, mount, l2StoneMat, scene, -2, 0, style3, opts.ageNum, style2);
  }

  const tubesL3 = addUnifiedSolidFromLayer(
    layer3,
    mount,
    ceramicMat,
    scene,
    2,
    1,
    style3,
    opts.ageNum
  );
  if (!tubesL3) throw new Error('no L3 paths');

  const frameMat = style2
    ? buildMetalMaterial(style2, true)
    : new THREE.MeshStandardMaterial({
        color: 0x888888,
        metalness: 1.0,
        roughness: 0.15,
        envMapIntensity: 1.5,
        transparent: true,
        opacity: 1,
        depthWrite: true
      });
  const tubesFrame = addFrameRing(mount, frameMat, scene, 10, 12, style3, opts.ageNum, style2);
  if (!tubesFrame) console.warn('[pbr] frame ring failed');

  scene.updateMatrixWorld(true);
  const camera = createCameraFromScene(scene, vb);
  const age = Math.max(1, Math.min(120, Number(opts.ageNum) || 25));
  const rotationY = ((age - 1) / 119) * 0.25 - 0.125;
  scene.rotation.y = rotationY;
  renderer.render(scene, camera);

  return { mount, renderer, scene, tubesL2, tubesL3, tubesFrame, metalRough, stoneL2: true };
}

/**
 * @param {{ svg: string, style2: object|null, style3: object, container: HTMLElement }} opts
 */
export async function renderThreePbrAmulet(opts) {
  const q = opts.questionnaire;
  console.log('ageNum:', opts.ageNum, 'domainHex:', opts.domainHex, 'questionnaire:', q);
  let mount = null;
  try {
    const core = await renderPbrCore(opts.svg, opts);
    mount = core.mount;
    disposeScene(core.scene);

    opts.container.innerHTML = '';
    const canvas = core.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    opts.container.appendChild(canvas);

    return {
      tubesL2: core.tubesL2,
      tubesL3: core.tubesL3,
      tubesFrame: core.tubesFrame,
      metalRough: core.metalRough,
      stoneL2: !!core.stoneL2,
      pbr: true
    };
  } finally {
    if (mount?.parentNode) mount.parentNode.removeChild(mount);
  }
}

/** רינדור PBR חד-פעמי לייצוא PNG עם רקע שקוף */
export async function exportPbrAmuletPng(opts) {
  let mount = null;
  let scene = null;
  try {
    const core = await renderPbrCore(opts.svg, opts);
    mount = core.mount;
    scene = core.scene;
    return core.renderer.domElement.toDataURL('image/png');
  } finally {
    if (scene) disposeScene(scene);
    if (mount?.parentNode) mount.parentNode.removeChild(mount);
    disposeActive();
  }
}

export function disposeThreePbr() {
  disposeActive();
}

/** Same inflated L3 solid used by prototype-v2-saved-roughness.html (z=2, no slab scale). */
export { buildUnifiedLayer3Geometry as buildSavedRoughnessL3Geometry };
