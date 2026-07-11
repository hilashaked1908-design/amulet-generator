/**
 * Compose the export card frame to a downloadable PNG.
 */
import { exportCanvasAsTransparentPng } from './amulet-export.js';

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

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text || '').trim().split(/\s+/);
  if (!words.length || words[0] === '') return y;

  let line = '';
  let cursorY = y;

  words.forEach(function (word, index) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY);
      line = word;
      cursorY += lineHeight;
    } else {
      line = test;
    }
    if (index === words.length - 1) {
      ctx.fillText(line, x, cursorY);
      cursorY += lineHeight;
    }
  });

  return cursorY;
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
  ctx.clearRect(0, 0, 800, 800);

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
    const slotW = 536;
    const slotH = 536;
    const slotX = (800 - slotW) / 2;
    const slotY = 70.33;
    const fit = Math.min(slotW / amuletSnap.width, slotH / amuletSnap.height) * 0.92;
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
  const vectorX = 29;
  let vectorY = 29;
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
    ctx.font = '700 18px "Narkiss Yair Variable", "Narkiss Yair", sans-serif';
    ctx.fillText(nameEl.textContent, 800 - 29, 52);
  }

  const timingEl = document.getElementById('exportTiming');
  const outcomeEl = document.getElementById('exportOutcome');
  const wishEl = document.getElementById('exportWish');

  if (timingEl?.textContent) {
    ctx.font = '400 18px "Narkiss Yair Variable", "Narkiss Yair", sans-serif';
    ctx.fillText('[תזמון]', 29 + 233, 800 - 168 - 24);
    ctx.font = '400 27px "TheBasics", sans-serif';
    drawWrappedText(ctx, timingEl.textContent, 29 + 233, 800 - 168, 233, 30);
  }

  if (outcomeEl?.textContent) {
    ctx.font = '400 27px "TheBasics", sans-serif';
    drawWrappedText(ctx, outcomeEl.textContent, 29 + 233, 800 - 56, 233, 30);
  }

  if (wishEl?.textContent) {
    const sizePx = parseFloat(getComputedStyle(wishEl).fontSize) / u || 90;
    ctx.font = '100 ' + sizePx + 'px "Lava Pro HL", serif';
    drawWrappedText(ctx, wishEl.textContent, 800 - 29, 800 - 56, 360, sizePx * 1.05);
  }

  exportCanvasAsTransparentPng(canvas, { filename: options.filename || 'amulet-card' });
  return canvas;
}
