/**
 * Fantik Studio–style flowing gradient — amulet detail page background.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-amulet-detail')) return;

  const PIXEL_DENSITY = 0.85;

  const DETAIL_PALETTE = [
    [0.72, 0.74, 0.78, 1.0],
    [0.22, 0.2, 0.18, 0.0],
    [0.5, 0.5, 0.52, 0.0],
    [0.12, 0.12, 0.15, 0.0],
  ];

  const canvas = document.createElement('canvas');
  canvas.id = 'detail-atmosphere-back';
  canvas.className = 'pagmar__atmosphere pagmar__atmosphere--back pagmar__detail-atmosphere';
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
    'uniform float uTime;',
    'uniform float uScrollProgress;',
    'uniform vec3 uColourA;',
    'uniform vec3 uColourB;',
    'uniform vec3 uColourC;',
    'uniform vec3 uColourD;',
    'uniform float uUvScale;',
    'uniform float uUvDistortionIntensity;',
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
    '  for(float i=0.0;i<6.0;i++){',
    '    uv+=noise(vec3(uv-i*0.2,uTime+i*32.0))*uUvDistortionIntensity;',
    '  }',
    '  float colourInput=noise(vec3(uv,sin(uTime)))*0.5+0.5;',
    '  vec3 colour=cosineGradientColour(colourInput,uColourA,uColourB,uColourC,uColourD);',
    '  gl_FragColor=vec4(colour,1.0);',
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
  const uTime = gl.getUniformLocation(prog, 'uTime');
  const uScroll = gl.getUniformLocation(prog, 'uScrollProgress');
  const uColourA = gl.getUniformLocation(prog, 'uColourA');
  const uColourB = gl.getUniformLocation(prog, 'uColourB');
  const uColourC = gl.getUniformLocation(prog, 'uColourC');
  const uColourD = gl.getUniformLocation(prog, 'uColourD');
  const uUvScale = gl.getUniformLocation(prog, 'uUvScale');
  const uDistInt = gl.getUniformLocation(prog, 'uUvDistortionIntensity');

  let W = 1;
  let H = 1;
  let t = 0;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2) * PIXEL_DENSITY;
    W = Math.max(1, Math.floor(innerWidth * dpr));
    H = Math.max(1, Math.floor(innerHeight * dpr));
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = innerWidth + 'px';
    canvas.style.height = innerHeight + 'px';
    gl.viewport(0, 0, W, H);
  }

  function draw() {
    const pal = DETAIL_PALETTE;
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(uTime, t * 0.1);
    gl.uniform1f(uScroll, t * 0.015);
    gl.uniform3f(uColourA, pal[0][0], pal[0][1], pal[0][2]);
    gl.uniform3f(uColourB, pal[1][0], pal[1][1], pal[1][2]);
    gl.uniform3f(uColourC, pal[2][0], pal[2][1], pal[2][2]);
    gl.uniform3f(uColourD, pal[3][0], pal[3][1], pal[3][2]);
    gl.uniform1f(uUvScale, 1.0);
    gl.uniform1f(uDistInt, 0.3);
    gl.clearColor(pal[0][0], pal[0][1], pal[0][2], 1);
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
})();
