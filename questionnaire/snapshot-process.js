/** Shared snapshot crop / compress helpers (garden save + repair tools). */

export const COLLECTION_LS_THUMB_PX = 512;
export const COLLECTION_PREVIEW_PX = 512;
export const COLLECTION_HI_RES_PX = 2048;
export const COLLECTION_LS_MAX_PX = 1024;

export function cropAndSquare(canvas) {
  var w = canvas.width, h = canvas.height;
  if (!w || !h) return canvas;

  var source = canvas;
  var scanW = w;
  var scanH = h;
  var scanCanvas = canvas;
  var maxScan = 512;
  if (Math.max(w, h) > maxScan) {
    var scanScale = maxScan / Math.max(w, h);
    scanW = Math.max(1, Math.round(w * scanScale));
    scanH = Math.max(1, Math.round(h * scanScale));
    scanCanvas = document.createElement('canvas');
    scanCanvas.width = scanW;
    scanCanvas.height = scanH;
    scanCanvas.getContext('2d').drawImage(canvas, 0, 0, scanW, scanH);
  }

  var ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
  var data = ctx.getImageData(0, 0, scanW, scanH).data;
  var minX = scanW, minY = scanH, maxX = -1, maxY = -1;
  for (var y = 0; y < scanH; y++) {
    for (var x = 0; x < scanW; x++) {
      if (data[(y * scanW + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return canvas;

  var scaleX = w / scanW;
  var scaleY = h / scanH;
  var srcMinX = Math.max(0, Math.floor(minX * scaleX));
  var srcMinY = Math.max(0, Math.floor(minY * scaleY));
  var srcMaxX = Math.min(w - 1, Math.ceil((maxX + 1) * scaleX) - 1);
  var srcMaxY = Math.min(h - 1, Math.ceil((maxY + 1) * scaleY) - 1);
  var contentW = srcMaxX - srcMinX + 1;
  var contentH = srcMaxY - srcMinY + 1;
  var side = Math.max(contentW, contentH);
  var pad = Math.round(side * 0.09);
  side += pad * 2;
  var out = document.createElement('canvas');
  out.width = side;
  out.height = side;
  var ox = Math.round((side - contentW) / 2);
  var oy = Math.round((side - contentH) / 2);
  out.getContext('2d').drawImage(source, srcMinX, srcMinY, contentW, contentH, ox, oy, contentW, contentH);
  return out;
}

export function downscaleCanvas(canvas, maxDim) {
  var cropped = cropAndSquare(canvas);
  let w = cropped.width;
  let h = cropped.height;
  if (w <= maxDim && h <= maxDim) return cropped;
  const ratio = Math.min(maxDim / w, maxDim / h);
  w = Math.round(w * ratio);
  h = Math.round(h * ratio);
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(cropped, 0, 0, w, h);
  return out;
}

export function tinyThumbFromCanvas(canvas, maxDim) {
  const scaled = downscaleCanvas(canvas, maxDim || COLLECTION_PREVIEW_PX);
  return scaled.toDataURL('image/png');
}

export function previewSnapshotForLocalStorage(canvas) {
  return downscaleCanvas(canvas, COLLECTION_PREVIEW_PX).toDataURL('image/png');
}

export function compressSnapshotDataUrl(canvas) {
  const hi = downscaleCanvas(canvas, COLLECTION_HI_RES_PX);
  return hi.toDataURL('image/png');
}

export function compressSnapshotForLocalStorage(canvas) {
  const lo = downscaleCanvas(canvas, COLLECTION_LS_MAX_PX);
  return lo.toDataURL('image/png');
}

export function processGardenSnapshotCanvas(canvas) {
  const cropped = cropAndSquare(canvas);
  return {
    cropped: cropped,
    hiResUrl: compressSnapshotDataUrl(cropped),
    previewUrl: previewSnapshotForLocalStorage(cropped),
  };
}
