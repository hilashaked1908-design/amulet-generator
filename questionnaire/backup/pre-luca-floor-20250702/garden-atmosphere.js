/**
 * Background film grain only — fog lives in garden-fog.js (Three.js, like aboutluca.com).
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  const PIXEL_DENSITY = 0.85;

  const canvas = document.createElement('canvas');
  canvas.id = 'garden-atmosphere-back';
  canvas.className = 'pagmar__atmosphere pagmar__atmosphere--back';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);

  const vertSrc = [
    'attribute vec2 aPos;',
    'varying vec2 vUv;',
    'void main(){',
    '  vUv=aPos*0.5+0.5;',
    '  gl_Position=vec4(aPos,0.0,1.0);',
    '}',
  ].join('\n');

  const fragSrc = [
    'precision highp float;',
    'uniform vec2 iResolution;',
    'uniform float iTime;',
    'varying vec2 vUv;',
    'float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}',
    'void main(){',
    '  vec2 frag=vUv*iResolution;',
    '  vec2 res=max(iResolution,vec2(1.0));',
    '  vec2 uv=frag/res;',
    '  vec3 col=vec3(0.039,0.039,0.043);',
    '  float r=length((uv-0.5)*vec2(res.x/res.y,1.0));',
    '  float vig=smoothstep(0.12,1.35,r);',
    '  vig=vig*vig*(3.0-2.0*vig);',
    '  col=mix(col*0.42,col*1.08,vig*0.55);',
    '  float floorLift=smoothstep(0.5,0.0,uv.y)*0.045;',
    '  col+=vec3(0.68,0.7,0.76)*floorLift;',
    '  float gt=floor(iTime*12.0);',
    '  vec2 cell=floor(frag*0.38);',
    '  float coarse=(hash(cell+vec2(gt,0.0))+hash(cell*0.61+vec2(0.0,gt))-1.0)*0.055;',
    '  col+=vec3(coarse)*mix(0.4,0.65,vig);',
    '  float x=(uv.x+hash(uv))*(uv.y+hash(uv+1.7))*(iTime*9.0);',
    '  col+=vec3(mod((mod(x,13.0)+1.0)*(mod(x,123.0)+1.0),0.012)-0.006)*16.0*mix(0.4,0.65,vig);',
    '  gl_FragColor=vec4(clamp(col,0.0,1.0),1.0);',
    '}',
  ].join('\n');

  const gl =
    canvas.getContext('webgl', { alpha: false, antialias: false }) ||
    canvas.getContext('experimental-webgl');
  if (!gl) {
    canvas.classList.add('pagmar__atmosphere--fallback');
    return;
  }

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
    return sh;
  }

  const vs = compile(gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) {
    canvas.classList.add('pagmar__atmosphere--fallback');
    return;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    canvas.classList.add('pagmar__atmosphere--fallback');
    return;
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, 'aPos');
  const uRes = gl.getUniformLocation(prog, 'iResolution');
  const uTime = gl.getUniformLocation(prog, 'iTime');

  let W = 1;
  let H = 1;
  let t = 0;
  let fade = 1;

  function on() {
    return (
      !document.body.classList.contains('is-site-intro-open') &&
      !document.body.classList.contains('is-create-mode') &&
      !document.body.classList.contains('pagmar-create') &&
      !document.body.classList.contains('is-amulet-ready') &&
      !document.body.classList.contains('is-panel-open') &&
      !document.body.classList.contains('is-spec-panel-open')
    );
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2) * PIXEL_DENSITY;
    W = Math.max(1, Math.floor(innerWidth * dpr));
    H = Math.max(1, Math.floor(innerHeight * dpr));
    canvas.width = W;
    canvas.height = H;
    gl.viewport(0, 0, W, H);
  }

  function draw() {
    fade += ((on() ? 1 : 0) - fade) * 0.08;
    canvas.style.opacity = String(fade);
    if (fade < 0.01) return;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(uRes, W, H);
    gl.uniform1f(uTime, t);
    gl.clearColor(0.039, 0.039, 0.043, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  let last = performance.now();
  function loop(now) {
    t += Math.min(40, now - last) * 0.001;
    last = now;
    draw();
    requestAnimationFrame(loop);
  }

  addEventListener('resize', resize);
  resize();
  draw();
  requestAnimationFrame(loop);

  window.gardenAtmosphere = { on };
})();
