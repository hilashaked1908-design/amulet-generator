/**
 * Generate a scannable QR code that opens the composed export card image on mobile.
 */
import { composeExportCardPng } from './export-card-compose.js?v=20250712-barcode-glass3';
import { saveExportSharePng } from './export-share-store.js?v=20250712-barcode-glass3';

const QR_FG = '#f4f4e8';
const QR_MODULE_GAP = 0.12;
const QR_MODULE_RADIUS = 0.1;

let refreshToken = 0;
let serverExportReady = null;
let serverShareOrigin = null;

function getQrFactory() {
  const factory = globalThis.qrcode;
  if (typeof factory !== 'function') {
    throw new Error('qrcode generator missing');
  }
  return factory;
}

function createShareId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  }
  return (
    Date.now().toString(16) +
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, '0')
  ).slice(0, 16);
}

function isLocalOnlyHost(hostname) {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.local')
  );
}

function getShareOrigin() {
  if (serverShareOrigin) return serverShareOrigin;
  try {
    const stored = sessionStorage.getItem('pagmarShareOrigin');
    if (stored) return stored.replace(/\/$/, '');
  } catch (_) {}
  return window.location.origin;
}

function buildShareViewUrl(shareId) {
  return getShareOrigin() + '/questionnaire/export-share.html?id=' + shareId;
}

function waitForExportCardLayout(timeoutMs) {
  const deadline = performance.now() + (timeoutMs || 5000);
  return new Promise(function (resolve) {
    function tick() {
      const card = document.getElementById('exportCard');
      const width = card?.getBoundingClientRect().width || 0;
      if (width > 0 || performance.now() >= deadline) {
        resolve(width);
        return;
      }
      requestAnimationFrame(tick);
    }
    tick();
  });
}

async function checkServerExportReady() {
  if (serverExportReady !== null) return serverExportReady;
  try {
    const res = await fetch('/api/server-info', { cache: 'no-store' });
    if (!res.ok) {
      serverExportReady = false;
      return false;
    }
    const data = await res.json();
    serverExportReady = Boolean(data?.exportShare);
    if (data?.shareOrigin) {
      serverShareOrigin = String(data.shareOrigin).replace(/\/$/, '');
    }
    return serverExportReady;
  } catch (_) {
    serverExportReady = false;
    return false;
  }
}

function blobFromDataUrl(canvas) {
  const dataUrl = canvas.toDataURL('image/png');
  const comma = dataUrl.indexOf(',');
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'image/png' });
}

function canvasToBlob(canvas) {
  if (!canvas?.width || !canvas?.height) {
    return Promise.reject(new Error('canvas has zero size'));
  }

  return new Promise(function (resolve, reject) {
    if (canvas.toBlob) {
      canvas.toBlob(function (blob) {
        if (blob) {
          resolve(blob);
          return;
        }
        try {
          resolve(blobFromDataUrl(canvas));
        } catch (err) {
          reject(err);
        }
      }, 'image/png');
      return;
    }
    try {
      resolve(blobFromDataUrl(canvas));
    } catch (err) {
      reject(err);
    }
  });
}

function fillRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fill();
}

function drawQrToCanvas(text, size) {
  const qr = getQrFactory()(0, 'M');
  qr.addData(text);
  qr.make();

  const count = qr.getModuleCount();
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cell = size / count;
  const gap = cell * QR_MODULE_GAP;
  const dot = cell - gap;
  const radius = dot * QR_MODULE_RADIUS;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = QR_FG;
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (!qr.isDark(row, col)) continue;
      fillRoundRect(
        ctx,
        col * cell + gap / 2,
        row * cell + gap / 2,
        dot,
        dot,
        radius
      );
    }
  }
  return canvas;
}

async function tryUploadToServer(canvas) {
  const ready = await checkServerExportReady();
  if (!ready) return null;

  let dataUrl;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch (err) {
    console.warn('[export-barcode] server upload skipped (canvas export blocked)', err);
    return null;
  }

  const res = await fetch('/api/export-share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl }),
  });
  if (!res.ok) return null;
  const payload = await res.json();
  if (!payload?.ok || !payload.imageUrl) return null;
  return payload;
}

async function publishExportShare(canvas, shareId) {
  const localId = shareId || createShareId();
  let serverReady = false;

  try {
    const blob = await canvasToBlob(canvas);
    await saveExportSharePng(localId, blob);
  } catch (err) {
    console.warn('[export-barcode] local share save failed', err);
  }

  const uploaded = await tryUploadToServer(canvas);
  if (uploaded?.id) {
    serverReady = true;
  }

  const finalId = uploaded?.id || localId;
  const qrUrl = buildShareViewUrl(finalId);
  const usingLanOrigin =
    Boolean(serverShareOrigin) &&
    serverShareOrigin !== window.location.origin;

  return {
    id: finalId,
    qrUrl,
    serverReady,
    localOnly: isLocalOnlyHost(window.location.hostname) && !usingLanOrigin,
  };
}

function setBarcodeLoading(slot, loading) {
  if (!slot) return;
  slot.classList.toggle('is-loading', loading);
  if (loading) slot.replaceChildren();
}

function renderBarcodeImage(slot, qrUrl) {
  if (!slot) return;
  const qrCanvas = drawQrToCanvas(qrUrl, 512);
  const img = document.createElement('img');
  img.src = qrCanvas.toDataURL('image/png');
  img.alt = 'ברקוד לפתיחת התמונה בטלפון';
  img.draggable = false;
  slot.replaceChildren(img);
  slot.classList.remove('is-loading');

  const glass = slot.closest('.pagmar__export-barcode-glass');
  if (glass && window.pagmarGlassLens?.register) {
    window.pagmarGlassLens.register(glass);
  }
}

export async function refreshExportBarcode(presentMod, options) {
  options = options || {};
  const slot = document.getElementById('exportBarcodeSlot');
  if (!slot) return null;

  const token = ++refreshToken;
  setBarcodeLoading(slot, true);

  try {
    await waitForExportCardLayout();

    const shareId = createShareId();
    const qrUrl = buildShareViewUrl(shareId);
    if (token !== refreshToken) return null;

    renderBarcodeImage(slot, qrUrl);

    let snap = null;
    if (presentMod?.capturePresentedAmuletSnapshot) {
      snap = presentMod.capturePresentedAmuletSnapshot({ targetPx: 2048 });
    }

    const cardCanvas = await composeExportCardPng({
      amuletSnapshot: snap,
      download: false,
      scale: options.scale || 2,
      composeUnit: 1,
      skipFog: true,
    });

    if (token !== refreshToken) return null;

    const share = await publishExportShare(cardCanvas, shareId);
    if (token !== refreshToken) return null;

    if (share.qrUrl !== qrUrl) {
      renderBarcodeImage(slot, share.qrUrl);
    }
    return share;
  } catch (err) {
    if (token === refreshToken) {
      try {
        renderBarcodeImage(slot, buildShareViewUrl(createShareId()));
      } catch (_) {}
      slot.classList.remove('is-loading');
      console.warn('[export-barcode] refresh failed', err);
    }
    return null;
  }
}
