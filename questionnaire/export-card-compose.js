/**
 * Compose the export card frame to a downloadable PNG.
 */
import { exportCanvasAsTransparentPng } from './amulet-export.js';
import {
  drawFittedTextBlock,
  EXPORT_CARD_LAYOUT,
  fitExportText,
  getExportTextSpec,
} from './export-text-fit.js?v=20250711-export-text-fit';

function loadImage(src) {
  return new Promise(function (resolve, reject) {
    const img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

function svgElementToImage(svgEl, width, height) {
  if (!svgEl) return Promise.resolve(null);
  const clone = svgEl.cloneNode(true);
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  const serialized = new XMLSerializer().serializeToString(clone);
  const url =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized);
  return loadImage(url);
}

function drawWrappedText(ctx, text, x, boxBottom, maxWidth, maxHeight, specKey) {
  const spec = getExportTextSpec(specKey);
  const fit = fitExportText(text, maxWidth, maxHeight, specKey);
  ctx.font = spec.weight + ' ' + fit.fontSize + 'px ' + spec.family;
  if (typeof ctx.letterSpacing === 'string' && spec.letterSpacingEm) {
    ctx.letterSpacing = fit.fontSize * spec.letterSpacingEm + 'px';
  }
  drawFittedTextBlock(ctx, fit, x, boxBottom, true);
}

function getUnitScale(cardEl) {
  const rect = cardEl.getBoundingClientRect();
  return rect.width / 800;
}

export async function composeExportCardPng(options) {
  options = options || {};
  const card = document.getElementById('exportCard');
  if (!card) throw new Error('export card missing');

  const u = getUnitScale(card);
  const outW = Math.round(800 * u * (options.scale || 2));
  const outH = Math.round(800 * u * (options.scale || 2));
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  const scale = outW / 800;

  ctx.scale(scale, scale);
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, 800, 800);

  const fogCanvas = document.querySelector('#exportFogHost .pagmar__detail-fog-canvas');
  if (fogCanvas?.width) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(fogCanvas, -80, -80, 960, 960);
    ctx.restore();
  }

  ctx.strokeStyle = '#f4f4e8';
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, 799, 799);

  const amuletSnap = options.amuletSnapshot;
  if (amuletSnap?.width) {
    const slotW = EXPORT_CARD_LAYOUT.amuletWidth;
    const slotH = EXPORT_CARD_LAYOUT.amuletHeight;
    const slotX = (800 - slotW) / 2;
    const slotY = EXPORT_CARD_LAYOUT.amuletTop;
    const fit =
      Math.min(slotW / amuletSnap.width, slotH / amuletSnap.height) *
      EXPORT_CARD_LAYOUT.amuletDrawFit;
    const drawW = amuletSnap.width * fit;
    const drawH = amuletSnap.height * fit;
    ctx.drawImage(
      amuletSnap,
      slotX + (slotW - drawW) / 2,
      slotY + (slotH - drawH) / 2,
      drawW,
      drawH
    );
  }

  const vectorIds = ['exportVectorQ1', 'exportVectorQ2', 'exportVectorQ3'];
  const vectorX = EXPORT_CARD_LAYOUT.vectorLeft;
  let vectorY = EXPORT_CARD_LAYOUT.vectorTop;
  for (let i = 0; i < vectorIds.length; i++) {
    const slot = document.getElementById(vectorIds[i]);
    const svg = slot?.querySelector('svg');
    if (svg) {
      const img = await svgElementToImage(svg, 94.083, 90.895);
      if (img) ctx.drawImage(img, vectorX, vectorY, 94.083, 90.895);
    }
    vectorY += 90.895 + 30;
  }

  ctx.fillStyle = '#f4f4e8';
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';

  const nameEl = document.getElementById('exportName');
  if (nameEl?.textContent) {
    ctx.fillStyle = '#060607';
    ctx.fillRect(583.05, 0, 102.77, 40.52);
    ctx.fillStyle = '#f4f4e8';
    ctx.font = '700 18px "Narkiss Yair Variable", "Narkiss Yair", sans-serif';
    ctx.fillText(nameEl.textContent, 800 - EXPORT_CARD_LAYOUT.rightInset, EXPORT_CARD_LAYOUT.nameTop + 18);
  }

  const wishEl = document.getElementById('exportWish');
  const L = EXPORT_CARD_LAYOUT;

  if (wishEl?.textContent) {
    ctx.fillStyle = '#ffffff';
    const wishSpec = getExportTextSpec('wish');
    const wishFit = fitExportText(
      wishEl.textContent,
      L.wishWidth,
      L.wishHeight,
      'wish'
    );
    ctx.font = wishSpec.weight + ' ' + wishFit.fontSize + 'px ' + wishSpec.family;
    if (typeof ctx.letterSpacing === 'string' && wishSpec.letterSpacingEm) {
      ctx.letterSpacing = wishFit.fontSize * wishSpec.letterSpacingEm + 'px';
    }
    drawFittedTextBlock(
      ctx,
      wishFit,
      L.wishLeft + L.wishWidth,
      L.wishTop + L.wishHeight,
      true
    );
  }

  exportCanvasAsTransparentPng(canvas, { filename: options.filename || 'amulet-card' });
  return canvas;
}
