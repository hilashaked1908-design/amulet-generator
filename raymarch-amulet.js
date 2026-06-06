/**
 * SVG sigil → GPU raymarched SDF (liquid chrome + optical glass).
 * Stylized AI-aesthetic shading — visual impact over physical accuracy.
 */
const W = 680;
const H = 680;
const CX = 340;
const CY = 340;
const PATH_STROKE = 45;
const TUBE_RADIUS = PATH_STROKE / 2;
const PATH_STEP = 2.5;
const BLEND_K = TUBE_RADIUS * 0.72;
const CAM_Z = 1200.0;
const MAX_CAPS = 192;
const MAX_SPHERES = 384;
const RENDER_BG = [0.04, 0.04, 0.06];

let active = { gl: null, program: null, textures: [], buffers: [] };

const VERT_SRC = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uResolution;
uniform vec4 uCamRect;
uniform float uCamZ;
uniform float uBlendK;

uniform int uMetalCapCount;
uniform int uMetalSphCount;
uniform sampler2D uMetalCaps;
uniform sampler2D uMetalSph;

uniform int uGlassCapCount;
uniform int uGlassSphCount;
uniform sampler2D uGlassCaps;
uniform sampler2D uGlassSph;

uniform vec3 uGlassTint;
uniform float uChromeGloss;
uniform float uGlassGloss;

const int MAX_CAPS = ${MAX_CAPS};
const int MAX_SPHERES = ${MAX_SPHERES};
const float PI = 3.14159265;

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float sdSphere(vec3 p, vec3 c, float r) {
  return length(p - c) - r;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float mapLayer(vec3 p, int capCount, int sphCount, sampler2D capTex, sampler2D sphTex) {
  float d = 1e6;
  for (int i = 0; i < MAX_CAPS; i++) {
    if (i >= capCount) break;
    vec4 a = texelFetch(capTex, ivec2(0, i), 0);
    vec4 b = texelFetch(capTex, ivec2(1, i), 0);
    d = smin(d, sdCapsule(p, a.xyz, b.xyz, a.w), uBlendK);
  }
  for (int i = 0; i < MAX_SPHERES; i++) {
    if (i >= sphCount) break;
    vec4 s = texelFetch(sphTex, ivec2(i, 0), 0);
    d = smin(d, sdSphere(p, s.xyz, s.w), uBlendK * 0.85);
  }
  return d;
}

vec2 mapScene(vec3 p) {
  float dMetal = mapLayer(p, uMetalCapCount, uMetalSphCount, uMetalCaps, uMetalSph);
  float dGlass = mapLayer(p, uGlassCapCount, uGlassSphCount, uGlassCaps, uGlassSph);
  float d = min(dMetal, dGlass);
  float mat = dGlass < dMetal ? 1.0 : 0.0;
  if (uMetalCapCount == 0) mat = 1.0;
  return vec2(d, mat);
}

vec3 calcNormalLayer(vec3 p, int capCount, int sphCount, sampler2D capTex, sampler2D sphTex) {
  const vec2 e = vec2(0.55, 0.0);
  float d = mapLayer(p, capCount, sphCount, capTex, sphTex);
  return normalize(vec3(
    mapLayer(p + e.xyy, capCount, sphCount, capTex, sphTex) - d,
    mapLayer(p + e.yxy, capCount, sphCount, capTex, sphTex) - d,
    mapLayer(p + e.yyx, capCount, sphCount, capTex, sphTex) - d
  ));
}

vec3 aiEnvironment(vec3 r, float gloss) {
  float y = r.y * 0.5 + 0.5;
  vec3 base = mix(vec3(0.02, 0.025, 0.05), vec3(0.12, 0.14, 0.22), y);
  vec3 r2 = r;

  vec3 L1 = normalize(vec3(-0.55, 0.82, 0.65));
  vec3 L2 = normalize(vec3(0.72, 0.38, 0.58));
  vec3 L3 = normalize(vec3(0.1, -0.55, 0.82));
  vec3 L4 = normalize(vec3(-0.35, -0.2, 0.92));

  float pwr = mix(48.0, 420.0, gloss);
  float s1 = pow(max(dot(r2, L1), 0.0), pwr) * 4.2;
  float s2 = pow(max(dot(r2, L2), 0.0), pwr * 0.85) * 3.1;
  float s3 = pow(max(dot(r2, L3), 0.0), pwr * 0.7) * 2.4;
  float s4 = pow(max(dot(r2, L4), 0.0), pwr * 1.1) * 2.8;

  vec3 warm = vec3(1.0, 0.92, 0.82);
  vec3 cool = vec3(0.75, 0.88, 1.0);
  vec3 bloom = warm * s1 + cool * (s2 + s3) + vec3(0.95, 0.7, 1.0) * s4;

  float band = pow(abs(sin(r2.x * 3.2 + r2.y * 5.1)), 12.0) * 0.35;
  float iris = 0.5 + 0.5 * sin(dot(r2, vec3(2.1, 3.7, 1.9)) * 4.0);
  vec3 irid = mix(vec3(0.85, 0.92, 1.0), vec3(1.0, 0.82, 0.95), iris) * 0.08;

  return base + bloom + irid + band;
}

vec3 shadeChrome(vec3 p, vec3 n, vec3 rd, vec3 ro) {
  vec3 V = normalize(-rd);
  vec3 R = reflect(rd, n);
  vec3 env = aiEnvironment(R, uChromeGloss);

  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  env += vec3(0.85, 0.9, 1.0) * fres * 1.8;

  vec3 Lk = normalize(vec3(-0.4, 0.9, 0.55));
  float spec = pow(max(dot(reflect(-Lk, n), V), 0.0), mix(180.0, 520.0, uChromeGloss));
  env += vec3(1.0) * spec * 3.5;

  float rim = pow(1.0 - max(dot(n, V), 0.0), 1.6);
  env += vec3(0.55, 0.65, 0.95) * rim * 0.45;

  float ao = clamp(0.35 + 0.65 * smoothstep(-8.0, 0.0, mapLayer(p + n * 2.5, uMetalCapCount, uMetalSphCount, uMetalCaps, uMetalSph)), 0.0, 1.0);
  return env * (0.55 + 0.45 * ao);
}

float rayMarchLayer(vec3 ro, vec3 rd, int capCount, int sphCount, sampler2D capTex, sampler2D sphTex, float tMax) {
  float t = 0.0;
  for (int i = 0; i < 96; i++) {
    vec3 p = ro + rd * t;
    float d = mapLayer(p, capCount, sphCount, capTex, sphTex);
    if (d < 0.0012) return t;
    if (t > tMax) break;
    t += max(d * 0.72, 0.015);
  }
  return -1.0;
}

vec3 shadeGlass(vec3 p, vec3 n, vec3 rd, vec3 ro) {
  vec3 V = normalize(-rd);
  float eta = 1.0 / 1.48;
  vec3 refr = refract(rd, n, eta);
  vec3 refl = reflect(rd, n);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 2.8);

  vec3 bg = aiEnvironment(refl, uGlassGloss) * (0.35 + 0.65 * fres);

  vec3 transmit = vec3(0.0);
  if (dot(refr, refr) > 0.001) {
    float tHit = rayMarchLayer(p + n * 0.04, refr, uMetalCapCount, uMetalSphCount, uMetalCaps, uMetalSph, 140.0);
    if (tHit > 0.0) {
      vec3 hp = p + n * 0.04 + refr * tHit;
      vec3 hn = calcNormalLayer(hp, uMetalCapCount, uMetalSphCount, uMetalCaps, uMetalSph);
      transmit = shadeChrome(hp, hn, refr, ro) * 0.85;
    } else {
      transmit = aiEnvironment(refr, uGlassGloss) * 0.25;
    }
  }

  float thick = max(0.0, -mapLayer(p - n * 3.5, uGlassCapCount, uGlassSphCount, uGlassCaps, uGlassSph));
  float absorb = exp(-thick * 0.018);
  vec3 tint = mix(vec3(1.0), uGlassTint, 0.72);
  transmit = transmit * tint * absorb;
  transmit += uGlassTint * (1.0 - absorb) * 0.35;

  float caustic = pow(max(dot(n, normalize(vec3(0.3, 0.85, 0.5))), 0.0), 6.0);
  transmit += uGlassTint * caustic * 0.55;

  vec3 col = mix(transmit, bg, fres * 0.82);
  float edge = pow(1.0 - max(dot(n, V), 0.0), 1.2);
  col += vec3(1.0, 0.98, 1.0) * edge * 1.35;
  col += vec3(0.6, 0.85, 1.0) * edge * edge * 0.9;

  return col;
}

void main() {
  float left = uCamRect.x;
  float right = uCamRect.y;
  float top = uCamRect.z;
  float bottom = uCamRect.w;

  vec3 ro = vec3(
    mix(left, right, vUv.x),
    mix(top, bottom, 1.0 - vUv.y),
    uCamZ
  );
  vec3 rd = vec3(0.0, 0.0, -1.0);

  float t = 0.0;
  float hitMat = 0.0;
  bool hit = false;
  vec3 p = ro;

  for (int i = 0; i < 160; i++) {
    p = ro + rd * t;
    vec2 scene = mapScene(p);
    float d = scene.x;
    if (d < 0.001) {
      hit = true;
      hitMat = scene.y;
      break;
    }
    if (t > 2200.0) break;
    t += max(d * 0.68, 0.012);
  }

  vec3 col = vec3(0.04, 0.04, 0.06);
  float vig = smoothstep(1.25, 0.25, length(vUv - 0.5) * 1.35);
  col *= mix(0.65, 1.0, vig);

  if (hit) {
    if (hitMat > 0.5) {
      vec3 n = calcNormalLayer(p, uGlassCapCount, uGlassSphCount, uGlassCaps, uGlassSph);
      col = shadeGlass(p, n, rd, ro);
    } else {
      vec3 n = calcNormalLayer(p, uMetalCapCount, uMetalSphCount, uMetalCaps, uMetalSph);
      col = shadeChrome(p, n, rd, ro);
    }
    col = col / (col + 0.55);
    col = pow(col, vec3(0.92));
  }

  float grain = fract(sin(dot(vUv * uResolution, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.015;

  fragColor = vec4(col, 1.0);
}`;

function disposeActive() {
  if (!active.gl) return;
  const gl = active.gl;
  active.textures.forEach((t) => gl.deleteTexture(t));
  active.buffers.forEach((b) => gl.deleteBuffer(b));
  if (active.program) gl.deleteProgram(active.program);
  active = { gl: null, program: null, textures: [], buffers: [] };
}

function compileShader(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile: ' + log);
  }
  return sh;
}

function createProgram(gl, vs, fs) {
  const prog = gl.createProgram();
  const vsh = compileShader(gl, gl.VERTEX_SHADER, vs);
  const fsh = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);
  gl.linkProgram(prog);
  gl.deleteShader(vsh);
  gl.deleteShader(fsh);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error('Program link: ' + log);
  }
  return prog;
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
  return { x: gx - CX, y: -(gy - CY), z: 0 };
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
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      if (dx * dx + dy * dy + dz * dz < 0.0064) continue;
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

function hexToRgb(hex) {
  const s = String(hex || '#D7A2B4').replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16) / 255,
    parseInt(s.slice(2, 4), 16) / 255,
    parseInt(s.slice(4, 6), 16) / 255
  ];
}

function ageToGloss(age, kind) {
  const a = Math.max(1, Math.min(120, Number(age) || 25));
  if (kind === 'metal') return 0.88 + (1 - a / 120) * 0.12;
  return 0.72 + (1 - a / 120) * 0.22;
}

function createDataTexture(gl, width, height, data) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    width,
    height,
    0,
    gl.RGBA,
    gl.FLOAT,
    data
  );
  active.textures.push(tex);
  return tex;
}

function uploadCapsules(gl, capsules) {
  const count = Math.min(capsules.length, MAX_CAPS);
  const data = new Float32Array(MAX_CAPS * 2 * 4);
  for (let i = 0; i < count; i++) {
    const c = capsules[i];
    const o = i * 8;
    data[o] = c.ax;
    data[o + 1] = c.ay;
    data[o + 2] = c.az;
    data[o + 3] = c.r;
    data[o + 4] = c.bx;
    data[o + 5] = c.by;
    data[o + 6] = c.bz;
    data[o + 7] = 0;
  }
  return { tex: createDataTexture(gl, 2, MAX_CAPS, data), count };
}

function uploadSpheres(gl, spheres) {
  const count = Math.min(spheres.length, MAX_SPHERES);
  const data = new Float32Array(MAX_SPHERES * 4);
  for (let i = 0; i < count; i++) {
    const s = spheres[i];
    const o = i * 4;
    data[o] = s.x;
    data[o + 1] = s.y;
    data[o + 2] = s.z;
    data[o + 3] = s.r;
  }
  return { tex: createDataTexture(gl, MAX_SPHERES, 1, data), count };
}

function initGl(canvas) {
  const gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance'
  });
  if (!gl) throw new Error('WebGL2 required for raymarch renderer');
  const ext = gl.getExtension('EXT_color_buffer_float');
  if (!ext) console.warn('[raymarch] EXT_color_buffer_float missing — may fail on some GPUs');
  return gl;
}

/**
 * @param {{ svg: string, style2: object|null, style3: object, container: HTMLElement, domainHex?: string }} opts
 */
export async function renderRaymarchAmulet(opts) {
  const { svg, style2, style3, container, domainHex } = opts;
  const mount = mountSvg(svg);

  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const layer3 = mount.querySelector('.layer-3');
    if (!layer3) throw new Error('layer 3 missing');
    const layer2 = mount.querySelector('.layer-2');
    const vb = parseViewBox(mount);

    const metalPrims = layer2 && style2 ? buildVolumePrimitives(layer2, mount) : { capsules: [], spheres: [] };
    const glassPrims = buildVolumePrimitives(layer3, mount);
    if (!glassPrims.capsules.length) throw new Error('L3 volume primitives missing');

    disposeActive();

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const gl = initGl(canvas);
    active.gl = gl;

    const program = createProgram(gl, VERT_SRC, FRAG_SRC);
    active.program = program;
    gl.useProgram(program);

    const quad = gl.createBuffer();
    active.buffers.push(quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const metalCaps = uploadCapsules(gl, metalPrims.capsules);
    const metalSph = uploadSpheres(gl, metalPrims.spheres);
    const glassCaps = uploadCapsules(gl, glassPrims.capsules);
    const glassSph = uploadSpheres(gl, glassPrims.spheres);

    const left = vb.x - CX;
    const right = vb.x + vb.w - CX;
    const top = CY - vb.y;
    const bottom = CY - (vb.y + vb.h);
    const tint = hexToRgb(domainHex || style3.strokeColor);
    const chromeGloss = style2 ? ageToGloss(style2.age, 'metal') : 0.95;
    const glassGloss = ageToGloss(style3.age, 'glass');

    const setTex = (unit, name, tex) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(program, name), unit);
    };

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(RENDER_BG[0], RENDER_BG[1], RENDER_BG[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(gl.getUniformLocation(program, 'uResolution'), canvas.width, canvas.height);
    gl.uniform4f(gl.getUniformLocation(program, 'uCamRect'), left, right, top, bottom);
    gl.uniform1f(gl.getUniformLocation(program, 'uCamZ'), CAM_Z);
    gl.uniform1f(gl.getUniformLocation(program, 'uBlendK'), BLEND_K);

    gl.uniform1i(gl.getUniformLocation(program, 'uMetalCapCount'), metalCaps.count);
    gl.uniform1i(gl.getUniformLocation(program, 'uMetalSphCount'), metalSph.count);
    gl.uniform1i(gl.getUniformLocation(program, 'uGlassCapCount'), glassCaps.count);
    gl.uniform1i(gl.getUniformLocation(program, 'uGlassSphCount'), glassSph.count);

    setTex(0, 'uMetalCaps', metalCaps.tex);
    setTex(1, 'uMetalSph', metalSph.tex);
    setTex(2, 'uGlassCaps', glassCaps.tex);
    setTex(3, 'uGlassSph', glassSph.tex);

    gl.uniform3fv(gl.getUniformLocation(program, 'uGlassTint'), tint);
    gl.uniform1f(gl.getUniformLocation(program, 'uChromeGloss'), chromeGloss);
    gl.uniform1f(gl.getUniformLocation(program, 'uGlassGloss'), glassGloss);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    container.innerHTML = '';
    canvas.style.display = 'block';
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    container.appendChild(canvas);

    return {
      tubesL2: metalPrims.capsules.length,
      tubesL3: glassPrims.capsules.length,
      jointsL2: metalPrims.spheres.length,
      jointsL3: glassPrims.spheres.length,
      metalRough: style2 ? 1 - chromeGloss : null,
      glassRough: 1 - glassGloss,
      fused: true,
      raymarch: true
    };
  } finally {
    if (mount.parentNode) mount.parentNode.removeChild(mount);
  }
}

export function disposeRaymarch() {
  disposeActive();
}
