/**
 * SVG sigil masks → one-click AI-style 3D render (chrome cage + ceramic core).
 * Geometry unchanged — exact path silhouettes only.
 */
const W = 680;
const H = 680;
const RENDER_SCALE = 2.5;
const BG = [1.0, 1.0, 1.0];

let active = { gl: null, program: null, textures: [], buffers: [] };

const VERT = `#version 300 es
precision highp float;
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uMetalMask;
uniform sampler2D uCoreMask;
uniform vec2 uTexel;
uniform vec3 uCoreTint;
uniform float uChromeGloss;
uniform float uCoreGloss;
uniform vec3 uBg;

float maskA(sampler2D tex, vec2 uv) {
  return texture(tex, uv).r;
}

vec3 maskNormal(sampler2D tex, vec2 uv, vec2 px, float zScale) {
  float l = maskA(tex, uv - vec2(px.x, 0.0));
  float r = maskA(tex, uv + vec2(px.x, 0.0));
  float d = maskA(tex, uv - vec2(0.0, px.y));
  float u = maskA(tex, uv + vec2(0.0, px.y));
  return normalize(vec3(l - r, d - u, zScale));
}

float tubeRim(sampler2D tex, vec2 uv, vec2 px) {
  float gx = maskA(tex, uv + vec2(px.x, 0.0)) - maskA(tex, uv - vec2(px.x, 0.0));
  float gy = maskA(tex, uv + vec2(0.0, px.y)) - maskA(tex, uv - vec2(0.0, px.y));
  return clamp(length(vec2(gx, gy)) * 14.0, 0.0, 1.0);
}

vec3 chromeReflection(vec3 ref, float gloss) {
  vec3 L1 = normalize(vec3(-0.6, 0.85, 0.5));
  vec3 L2 = normalize(vec3(0.75, 0.3, 0.65));
  vec3 L3 = normalize(vec3(-0.2, -0.5, 0.85));
  float p = mix(160.0, 720.0, gloss);
  float s1 = pow(max(dot(ref, L1), 0.0), p);
  float s2 = pow(max(dot(ref, L2), 0.0), p * 0.9);
  float s3 = pow(max(dot(ref, L3), 0.0), p * 0.75);
  vec3 env = mix(vec3(0.04, 0.045, 0.06), vec3(0.75, 0.78, 0.82), ref.y * 0.5 + 0.5);
  return env + vec3(1.0) * s1 * 2.2 + vec3(0.9, 0.95, 1.0) * (s2 + s3) * 1.4;
}

vec3 shadeChrome(vec2 uv) {
  float m = maskA(uMetalMask, uv);
  if (m < 0.01) return uBg;

  vec3 n = maskNormal(uMetalMask, uv, uTexel * 0.7, 0.14);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 R = reflect(-V, n);

  vec3 col = chromeReflection(R, uChromeGloss);
  col = mix(vec3(0.06, 0.065, 0.08), col, 0.92);

  vec3 Lk = normalize(vec3(-0.38, 0.92, 0.58));
  float spec = pow(max(dot(reflect(-Lk, n), V), 0.0), mix(280.0, 900.0, uChromeGloss));
  col += vec3(1.0) * spec * 3.5;

  float rim = tubeRim(uMetalMask, uv, uTexel);
  col *= mix(0.45, 1.15, 1.0 - rim * 0.55);
  col += vec3(0.85, 0.9, 1.0) * pow(1.0 - max(dot(n, V), 0.0), 2.5) * 0.5;

  return clamp(col, 0.0, 1.0);
}

vec3 shadeCore(vec2 uv) {
  float m = maskA(uCoreMask, uv);
  if (m < 0.01) return vec3(-1.0);

  vec3 n = maskNormal(uCoreMask, uv, uTexel * 0.65, 0.16);
  vec3 V = vec3(0.0, 0.0, 1.0);

  vec3 base = mix(vec3(0.99, 0.93, 0.82), uCoreTint, 0.82);
  vec3 Ld = normalize(vec3(-0.3, 0.8, 0.5));
  float diff = 0.55 + 0.45 * max(dot(n, Ld), 0.0);
  vec3 col = base * diff;

  vec3 Ls = normalize(vec3(0.2, 0.9, 0.42));
  float spec = pow(max(dot(reflect(-Ls, n), V), 0.0), mix(100.0, 280.0, uCoreGloss));
  col += vec3(1.0, 0.98, 0.94) * spec * 1.1;

  float rim = tubeRim(uCoreMask, uv, uTexel);
  col *= mix(0.7, 1.08, 1.0 - rim * 0.4);
  col += uCoreTint * pow(1.0 - max(dot(n, V), 0.0), 1.5) * 0.55;
  col += vec3(1.0, 0.97, 0.92) * pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.35;

  return clamp(col, 0.0, 1.0);
}

void main() {
  float metalM = maskA(uMetalMask, vUv);
  float coreM = maskA(uCoreMask, vUv);

  vec3 col = uBg;
  if (metalM > 0.01) col = shadeChrome(vUv);

  vec3 coreCol = shadeCore(vUv);
  if (coreCol.x >= 0.0) {
    float blend = smoothstep(0.02, 0.98, coreM);
    col = mix(col, coreCol, blend);
  }

  fragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.92)), 1.0);
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
    throw new Error('Shader: ' + log);
  }
  return sh;
}

function createProgram(gl) {
  const prog = gl.createProgram();
  const vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
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

function prepareMaskLayer(layerEl) {
  const clone = layerEl.cloneNode(true);
  clone.querySelectorAll('[filter]').forEach((el) => el.removeAttribute('filter'));
  const pathMain = clone.querySelector('.path-main');
  if (pathMain) {
    pathMain.setAttribute('stroke', '#ffffff');
    pathMain.setAttribute('stroke-opacity', '1');
    pathMain.removeAttribute('filter');
  }
  clone.querySelectorAll('path').forEach((p) => {
    p.removeAttribute('filter');
    if (!pathMain) {
      p.setAttribute('stroke', '#ffffff');
      p.setAttribute('fill', 'none');
    }
  });
  return clone;
}

function buildMaskSvg(mount, layerSelector, texW, texH) {
  const vb = mount.getAttribute('viewBox') || '0 0 680 680';
  const parts = vb.trim().split(/\s+/).map(Number);
  const layer = mount.querySelector(layerSelector);
  if (!layer) return null;
  const prepared = prepareMaskLayer(layer);
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    texW +
    '" height="' +
    texH +
    '" viewBox="' +
    vb +
    '">' +
    '<rect x="' +
    (parts[0] || 0) +
    '" y="' +
    (parts[1] || 0) +
    '" width="' +
    (parts[2] || W) +
    '" height="' +
    (parts[3] || H) +
    '" fill="#000000"/>' +
    prepared.outerHTML +
    '</svg>'
  );
}

async function rasterizeSvg(svgString, texW, texH) {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.width = texW;
    img.height = texH;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('SVG rasterize failed'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = texW;
    canvas.height = texH;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, texW, texH);
    ctx.drawImage(img, 0, 0, texW, texH);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function softenCoreMask(canvas) {
  const c2 = document.createElement('canvas');
  c2.width = canvas.width;
  c2.height = canvas.height;
  const ctx = c2.getContext('2d');
  ctx.filter = 'blur(1.5px)';
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = 'none';
  return c2;
}

function uploadCanvas(gl, canvas) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  active.textures.push(tex);
  return tex;
}

function hexToRgb(hex) {
  const s = String(hex || '#D7A2B4').replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16) / 255,
    parseInt(s.slice(2, 4), 16) / 255,
    parseInt(s.slice(4, 6), 16) / 255
  ];
}

function coreTint(hex) {
  const d = hexToRgb(hex);
  const cream = [0.99, 0.92, 0.8];
  return [d[0] * 0.72 + cream[0] * 0.28, d[1] * 0.72 + cream[1] * 0.28, d[2] * 0.72 + cream[2] * 0.28];
}

function ageToGloss(ageNum, kind) {
  const a = Math.max(1, Math.min(120, Number(ageNum) || 25));
  if (kind === 'metal') return 0.88 + (1 - a / 120) * 0.12;
  return 0.75 + (1 - a / 120) * 0.2;
}

function emptyMaskCanvas(texW, texH) {
  const c = document.createElement('canvas');
  c.width = texW;
  c.height = texH;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, texW, texH);
  return c;
}

/**
 * One-click 3D-style render from exact SVG sigil.
 * @param {{ svg: string, style2: object|null, style3: object, container: HTMLElement, domainHex?: string, ageNum?: number }} opts
 */
export async function renderMetalAmulet(opts) {
  const { svg, style2, style3, container, domainHex, ageNum } = opts;
  const mount = mountSvg(svg);

  try {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const texW = Math.round(W * RENDER_SCALE);
    const texH = Math.round(H * RENDER_SCALE);

    const metalSvg = mount.querySelector('.layer-2')
      ? buildMaskSvg(mount, '.layer-2', texW, texH)
      : null;
    const coreSvg = buildMaskSvg(mount, '.layer-3', texW, texH);
    if (!coreSvg) throw new Error('L3 mask missing');

    const [metalCanvas, coreRaw] = await Promise.all([
      metalSvg ? rasterizeSvg(metalSvg, texW, texH) : Promise.resolve(emptyMaskCanvas(texW, texH)),
      rasterizeSvg(coreSvg, texW, texH)
    ]);
    const coreCanvas = softenCoreMask(coreRaw);

    disposeActive();

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';

    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    });
    if (!gl) throw new Error('WebGL2 required');

    active.gl = gl;
    const program = createProgram(gl);
    active.program = program;
    gl.useProgram(program);

    const buf = gl.createBuffer();
    active.buffers.push(buf);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const metalTex = uploadCanvas(gl, metalCanvas);
    const coreTex = uploadCanvas(gl, coreCanvas);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const bindTex = (unit, name, tex) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(program, name), unit);
    };

    const age = ageNum ?? 25;
    bindTex(0, 'uMetalMask', metalTex);
    bindTex(1, 'uCoreMask', coreTex);
    gl.uniform2f(gl.getUniformLocation(program, 'uTexel'), 1 / texW, 1 / texH);
    gl.uniform3fv(gl.getUniformLocation(program, 'uCoreTint'), coreTint(domainHex || style3.strokeColor));
    gl.uniform1f(gl.getUniformLocation(program, 'uChromeGloss'), ageToGloss(age, 'metal'));
    gl.uniform1f(gl.getUniformLocation(program, 'uCoreGloss'), ageToGloss(age, 'core'));
    gl.uniform3fv(gl.getUniformLocation(program, 'uBg'), BG);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    container.innerHTML = '';
    canvas.style.display = 'block';
    canvas.style.maxWidth = '100%';
    canvas.style.height = 'auto';
    container.appendChild(canvas);

    return { render3d: true, texW, texH, hasMetal: !!metalSvg };
  } finally {
    if (mount.parentNode) mount.parentNode.removeChild(mount);
  }
}

export function disposeMetalRender() {
  disposeActive();
}
