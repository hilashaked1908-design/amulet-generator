/**
 * Shared 3D presentation lighting — amulet detail page is the source of truth.
 * Used by amulet.html and the questionnaire result overlay / garden snapshots.
 */
import * as THREE from './vendor/three.module.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

/** Detail-page renderer tuning (Calacatta / שיש marble reference). */
export const PRESENT_TONE_MAPPING_EXPOSURE = 0.62;
export const PRESENT_ENVIRONMENT_INTENSITY = 0.1;

export function buildStudioEnvMap(targetRenderer) {
  const pmrem = new THREE.PMREMGenerator(targetRenderer);
  pmrem.compileEquirectangularShader();
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x606068);
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xa0a0a8, metalness: 0, roughness: 0.9, side: THREE.BackSide })
  );
  room.scale.setScalar(80);
  envScene.add(room);
  const k = new THREE.DirectionalLight(0xffffff, 2.5);
  k.position.set(4, 8, 6);
  envScene.add(k);
  const f = new THREE.DirectionalLight(0xe8eeff, 1.2);
  f.position.set(-6, 2, 4);
  envScene.add(f);
  const r = new THREE.DirectionalLight(0xffeedd, 0.8);
  r.position.set(0, -4, -6);
  envScene.add(r);
  const tex = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
  return tex;
}

export function buildRoomEnvironmentMap(targetRenderer) {
  const pmrem = new THREE.PMREMGenerator(targetRenderer);
  const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return tex;
}

/** Stone + metal rig from amulet detail page — tuned for שיש / marble read. */
export function addCreationLights(parent) {
  parent.add(new THREE.AmbientLight(0xd0cec8, 0.05));
  parent.add(new THREE.HemisphereLight(0xe8e6e0, 0x585650, 0.03));

  const stoneKey = new THREE.DirectionalLight(0xf0f0ec, 1.4);
  stoneKey.position.set(0.8, 2.6, 1.2);
  const stoneFill = new THREE.DirectionalLight(0x9a9894, 0.03);
  stoneFill.position.set(-0.45, 0.9, 1.3);
  parent.add(stoneKey, stoneFill);

  parent.add(new THREE.HemisphereLight(0xffffff, 0x505060, 0.08));
  const metalKey = new THREE.DirectionalLight(0xffffff, 1.0);
  metalKey.position.set(-480, 720, 880);
  const metalFill = new THREE.DirectionalLight(0x90a8e0, 0.4);
  metalFill.position.set(580, 160, 520);
  const metalRim = new THREE.DirectionalLight(0xfff4e0, 0.5);
  metalRim.position.set(420, -580, 700);
  const metalUnder = new THREE.DirectionalLight(0x707080, 0.2);
  metalUnder.position.set(0, -800, 400);
  parent.add(metalKey, metalFill, metalRim, metalUnder);
}

export function applyPresentRendererSettings(renderer, scene) {
  if (renderer) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = PRESENT_TONE_MAPPING_EXPOSURE;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  if (scene && 'environmentIntensity' in scene) {
    scene.environmentIntensity = PRESENT_ENVIRONMENT_INTENSITY;
  }
}

/** Calacatta / שיש·חם (archaeological_doubt) — narrow match so other stones stay untouched. */
function isCalacattaSheshMaterial(m) {
  const metalness = m.metalness ?? 0;
  const roughness = m.roughness ?? 1;
  const clearcoat = m.clearcoat ?? 0;
  if (metalness > 0.2) return false;
  if (clearcoat < 0.12 || clearcoat > 0.42) return false;
  if (roughness < 0.22 || roughness > 0.42) return false;
  return true;
}

export function applyPresentMaterialMaps(glbScene, roomEnvTex, studioEnv, materialOverrides, options) {
  materialOverrides = materialOverrides || [];
  const sheshOnly = Boolean(options && options.sheshPresentation);
  glbScene.traverse(function (obj) {
    if (!obj.isMesh || !obj.material) return;
    const m = obj.material;
    if (m.metalness > 0.5) {
      m.envMap = studioEnv;
      m.envMapIntensity = 1.2;
      const ov = materialOverrides.find(function (o) {
        return o.meshName === obj.name || o.meshName === obj.uuid;
      });
      if (ov) {
        if (ov.envMapIntensity != null) m.envMapIntensity = Math.min(ov.envMapIntensity, 1.5);
        if (ov.clearcoat != null) m.clearcoat = ov.clearcoat;
        if (ov.clearcoatRoughness != null) m.clearcoatRoughness = ov.clearcoatRoughness;
        if (ov.reflectivity != null) m.reflectivity = ov.reflectivity;
      } else {
        m.clearcoat = m.clearcoat || 0.6;
        m.clearcoatRoughness = m.clearcoatRoughness || 0.15;
        m.reflectivity = 0.8;
      }
      m.needsUpdate = true;
      return;
    }

    if (!sheshOnly) return;

    const isPhysical =
      m.isMeshPhysicalMaterial || m.isMeshStandardMaterial || m.type === 'MeshPhysicalMaterial';
    if (!isPhysical || !isCalacattaSheshMaterial(m)) return;

    m.envMap = roomEnvTex;
    if (m.envMapIntensity == null || m.envMapIntensity <= 0.01) {
      m.envMapIntensity = 1.15;
    }
    m.needsUpdate = true;
  });
}
