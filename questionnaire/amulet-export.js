/**
 * Export interactive amulet canvas as PNG (transparent background when possible).
 */

function buildExportFilename(name) {
  const date = new Date().toISOString().slice(0, 10);
  const base = (name || 'amulet').replace(/[^\w\u0590-\u05FF-]+/g, '_').replace(/^_+|_+$/g, '');
  return (base || 'amulet') + '_' + date + '.png';
}

function triggerPngDownload(dataUrl, filename) {
  if (!dataUrl || dataUrl === 'data:,') {
    throw new Error('נתוני PNG ריקים');
  }
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = buildExportFilename(filename);
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(function () {
    if (a.parentNode) a.parentNode.removeChild(a);
  }, 200);
}

function canvasToTransparentPngDataUrl(sourceCanvas, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(sourceCanvas, 0, 0, width, height);
  return canvas.toDataURL('image/png');
}

export function exportCanvasAsTransparentPng(canvas, options) {
  options = options || {};
  if (!canvas?.width || !canvas?.height) throw new Error('קנבס ריק');

  const w = canvas.width;
  const h = canvas.height;
  try {
    triggerPngDownload(canvas.toDataURL('image/png'), options.filename);
  } catch (_directErr) {
    triggerPngDownload(canvasToTransparentPngDataUrl(canvas, w, h), options.filename);
  }
}

export function exportRendererTransparentPng(renderer, scene, camera, options) {
  options = options || {};
  const targetPx = options.targetPx || 2048;
  if (!renderer || !scene || !camera) throw new Error('אין קמע לייצוא');

  const dom = renderer.domElement;
  const origDPR = renderer.getPixelRatio();
  const cssW = dom.clientWidth || dom.width / Math.max(origDPR, 1);
  const cssH = dom.clientHeight || dom.height / Math.max(origDPR, 1);

  renderer.setPixelRatio(1);
  renderer.setSize(targetPx, targetPx, false);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);

  try {
    exportCanvasAsTransparentPng(dom, options);
  } finally {
    renderer.setPixelRatio(origDPR);
    renderer.setSize(cssW, cssH, false);
    renderer.render(scene, camera);
  }
}

export function exportAmuletCanvasPng(container, options) {
  options = options || {};
  const canvas = container?.querySelector('canvas');
  if (!canvas) throw new Error('אין קמע לייצוא');
  exportCanvasAsTransparentPng(canvas, options);
}
