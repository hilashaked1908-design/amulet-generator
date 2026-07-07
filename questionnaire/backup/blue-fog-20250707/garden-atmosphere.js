/**
 * Fantik Studio ScrollingBackgroundGradient — copied from fantik.studio bundle (BG).
 * palette (0.2,.2,.2)(0.3,.3,.3)(0.5,.5,.5)(0.2,.2,.2)
 * screens=.5 timeMultiplier=.1 scale=1 distortionIterations=6 distortionIntensity=.3
 */
(function () {
  'use strict';

  if (
    !document.body.classList.contains('pagmar-index') &&
    !document.body.classList.contains('pagmar-create')
  ) {
    return;
  }

  const PIXEL_DENSITY = 0.85;
  const PALETTE = [
    [0.2, 0.2, 0.2],
    [0.3, 0.3, 0.3],
    [0.5, 0.5, 0.5],
    [0.2, 0.2, 0.2],
  ];
  const SCREENS = 0.5;
  const TIME_MULTIPLIER = 0.1;
  const UV_SCALE = 1;
  const DISTORTION_ITERATIONS = 6;
  const DISTORTION_INTENSITY = 0.3;
  const SCROLL_SPEED = 0.015;
  const BASE_BLUE = [21 / 255, 0, 225 / 255];

  const canvas = document.createElement('canvas');
  canvas.id = 'garden-atmosphere-back';
  canvas.className = 'pagmar__atmosphere pagmar__atmosphere--back pagmar__atmosphere--fantik';
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

  // Loop bound must be a constant for WebGL1 — Fantik uses 6 iterations.
  const fragSrc = [
    'precision highp float;',
    'uniform float uTime;',
    'uniform float uScrollProgress;',
    'uniform vec3 uColourA;',
    'uniform vec3 uColourB;',
    'uniform vec3 uColourC;',
    'uniform vec3 uColourD;',
    'uniform float uUvScale;',
    'uniform float uUvDistortionIntensity;',
    'uniform vec3 uBaseBlue;',
    'varying vec2 vUv;',
    'float noise(vec3 v){',
    '  const vec2 C=vec2(1.0/6.0,1.0/3.0);',
    '  const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    '  vec3 i=floor(v+dot(v,C.yyy));',
    '  vec3 x0=v-i+dot(i,C.xxx);',
    '  vec3 g=step(x0.yzx,x0.xyz);',
    '  vec3 l=1.0-g;',
    '  vec3 i1=min(g.xyz,l.zxy);',
    '  vec3 i2=max(g.xyz,l.zxy);',
    '  vec3 x1=x0-i1+1.0*C.xxx;',
    '  vec3 x2=x0-i2+2.0*C.xxx;',
    '  vec3 x3=x0-1.0+3.0*C.xxx;',
    '  i=mod(i,289.0);',
    '  vec4 p=mod(((i.z+vec4(0.0,i1.z,i2.z,1.0))*34.0+1.0)*(i.z+vec4(0.0,i1.z,i2.z,1.0)),289.0);',
    '  p=mod(((p+i.y+vec4(0.0,i1.y,i2.y,1.0))*34.0+1.0)*(p+i.y+vec4(0.0,i1.y,i2.y,1.0)),289.0);',
    '  p=mod(((p+i.x+vec4(0.0,i1.x,i2.x,1.0))*34.0+1.0)*(p+i.x+vec4(0.0,i1.x,i2.x,1.0)),289.0);',
    '  float n_=1.0/7.0;',
    '  vec3 ns=n_*D.wyz-D.xzx;',
    '  vec4 j=p-49.0*floor(p*ns.z*ns.z);',
    '  vec4 x_=floor(j*ns.z);',
    '  vec4 y_=floor(j-7.0*x_);',
    '  vec4 x=x_*ns.x+ns.yyyy;',
    '  vec4 y=y_*ns.x+ns.yyyy;',
    '  vec4 h=1.0-abs(x)-abs(y);',
    '  vec4 b0=vec4(x.xy,y.xy);',
    '  vec4 b1=vec4(x.zw,y.zw);',
    '  vec4 s0=floor(b0)*2.0+1.0;',
    '  vec4 s1=floor(b1)*2.0+1.0;',
    '  vec4 sh=-step(h,vec4(0.0));',
    '  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;',
    '  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    '  vec3 p0=vec3(a0.xy,h.x);',
    '  vec3 p1=vec3(a0.zw,h.y);',
    '  vec3 p2=vec3(a1.xy,h.z);',
    '  vec3 p3=vec3(a1.zw,h.w);',
    '  vec4 norm=1.79284291400159-0.85373472095314*',
    '    vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3));',
    '  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;',
    '  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);',
    '  m=m*m;',
    '  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}',
    'vec3 cosineGradientColour(float t,vec3 a,vec3 b,vec3 c,vec3 d){',
    '  return clamp(a+b*cos(6.28318*(c*t+d)),0.0,1.0);',
    '}',
    'void main(){',
    '  vec2 uv=vUv;',
    '  uv.y-=uScrollProgress;',
    '  uv*=uUvScale;',
    '  for(float i=0.0;i<6.0;i+=1.0){',
    '    uv+=noise(vec3(uv-i*0.2,uTime+i*32.0))*uUvDistortionIntensity;',
    '  }',
    '  float colourInput=noise(vec3(uv,sin(uTime)))*0.5+0.5;',
    '  vec3 colour=cosineGradientColour(colourInput,uColourA,uColourB,uColourC,uColourD);',
  // Fantik on #111 shows 0.2–0.5 gray wisps — map same signal onto #1500E1.
    '  vec3 lift=(colour-vec3(0.2))/0.3;',
    '  lift=clamp(lift,0.0,1.0);',
    '  vec3 fogLight=vec3(0.88,0.9,1.0);',
    '  vec3 finalColour=mix(uBaseBlue,fogLight,lift*0.78);',
    '  gl_FragColor=vec4(finalColour,1.0);',
    '}',
  ].join('\n');

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[garden-atmosphere] shader compile failed:', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  const gl =
    canvas.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false }) ||
    canvas.getContext('experimental-webgl');
  if (!gl) {
    console.warn('[garden-atmosphere] WebGL unavailable');
    canvas.classList.add('pagmar__atmosphere--fallback');
    return;
  }

  const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vs || !fs) {
    canvas.classList.add('pagmar__atmosphere--fallback');
    return;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[garden-atmosphere] program link failed:', gl.getProgramInfoLog(prog));
    canvas.classList.add('pagmar__atmosphere--fallback');
    return;
  }

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  const aPos = gl.getAttribLocation(prog, 'aPos');
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uScroll = gl.getUniformLocation(prog, 'uScrollProgress');
  const uColourA = gl.getUniformLocation(prog, 'uColourA');
  const uColourB = gl.getUniformLocation(prog, 'uColourB');
  const uColourC = gl.getUniformLocation(prog, 'uColourC');
  const uColourD = gl.getUniformLocation(prog, 'uColourD');
  const uUvScale = gl.getUniformLocation(prog, 'uUvScale');
  const uDistInt = gl.getUniformLocation(prog, 'uUvDistortionIntensity');
  const uBaseBlue = gl.getUniformLocation(prog, 'uBaseBlue');

  let W = 1;
  let H = 1;
  let t = 0;
  let fade = 1;

  function isQuestionnaireBgMode() {
    const body = document.body;
    return body.classList.contains('is-create-mode') || body.classList.contains('pagmar-create');
  }

  function on() {
    const body = document.body;
    return (
      !body.classList.contains('is-site-intro-open') &&
      !body.classList.contains('is-amulet-ready') &&
      !body.classList.contains('is-spec-panel-open') &&
      (isQuestionnaireBgMode() || !body.classList.contains('is-panel-open'))
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
    gl.uniform1f(uTime, t * TIME_MULTIPLIER);
    gl.uniform1f(uScroll, t * SCROLL_SPEED * SCREENS);
    gl.uniform3f(uColourA, PALETTE[0][0], PALETTE[0][1], PALETTE[0][2]);
    gl.uniform3f(uColourB, PALETTE[1][0], PALETTE[1][1], PALETTE[1][2]);
    gl.uniform3f(uColourC, PALETTE[2][0], PALETTE[2][1], PALETTE[2][2]);
    gl.uniform3f(uColourD, PALETTE[3][0], PALETTE[3][1], PALETTE[3][2]);
    gl.uniform3f(uBaseBlue, BASE_BLUE[0], BASE_BLUE[1], BASE_BLUE[2]);
    gl.uniform1f(uUvScale, UV_SCALE);
    gl.uniform1f(uDistInt, DISTORTION_INTENSITY);
    gl.clearColor(BASE_BLUE[0], BASE_BLUE[1], BASE_BLUE[2], 1);
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
