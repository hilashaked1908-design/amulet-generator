/**
 * Figma preset outlines for choice questions (Q4 belief / Q5 feeling).
 * Shown in thumb slots instead of letter-derived vector layers.
 */
const ASSET_BASE = 'assets/create/choice-vectors/';
const VECTOR_COLOR = '#F4F4E8';
const VECTOR_STROKE = 1.5;
const THUMB_BOX_W = 90.3;
const THUMB_BOX_H = 89.813;

/** Q4 [אמונה] → stone silhouette (Figma bottom row). */
export const Q4_BELIEF_VECTOR = {
  concrete_actions: 'q4-concrete-basalt.svg',
  signs: 'q4-signs-gravel.svg',
  gut: 'q4-gut-kurkar.svg',
  support: 'q4-support-basalt.svg',
  doubt: 'q4-doubt-marble.svg',
};

/** Q5 [תחושה] → ceramic silhouette (Figma top row). */
export const Q5_FEELING_VECTOR = {
  hope: 'q5-hope-white-polymer.svg',
  fear: 'q5-fear-black-metal.svg',
  longing: 'q5-longing-glass.svg',
  excitement: 'q5-confusion-metal.svg',
  impatience: 'q5-impatience-black-polymer.svg',
  confusion: 'q5-confusion-metal.svg',
};

const svgTextCache = Object.create(null);

function thumbContainer(questionNum) {
  return document.getElementById('vectorThumbQ' + questionNum);
}

async function loadSvgText(fileName) {
  if (svgTextCache[fileName]) return svgTextCache[fileName];
  const res = await fetch(ASSET_BASE + fileName);
  if (!res.ok) throw new Error('missing choice vector: ' + fileName);
  const text = await res.text();
  svgTextCache[fileName] = text;
  return text;
}

function extractPathD(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const path =
    doc.querySelector('path[id="Vector"]') ||
    doc.querySelector('path[stroke]') ||
    doc.querySelector('path');
  return path?.getAttribute('d') || '';
}

function measurePathBounds(pathD) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.visibility = 'hidden';
  svg.style.pointerEvents = 'none';
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', pathD);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', VECTOR_COLOR);
  path.setAttribute('stroke-width', String(VECTOR_STROKE));
  svg.appendChild(path);
  document.body.appendChild(svg);
  let box;
  try {
    box = path.getBBox();
  } catch (_err) {
    box = { x: 0, y: 0, width: 90, height: 90 };
  }
  svg.remove();
  return {
    minX: box.x,
    minY: box.y,
    maxX: box.x + box.width,
    maxY: box.y + box.height,
  };
}

function thumbLayout(bounds) {
  const minX = bounds.minX;
  const minY = bounds.minY;
  const maxX = bounds.maxX;
  const maxY = bounds.maxY;
  const cw = Math.max(maxX - minX, 1);
  const ch = Math.max(maxY - minY, 1);
  const pad = 8;
  const innerW = THUMB_BOX_W - pad * 2;
  const innerH = THUMB_BOX_H - pad * 2;
  const scale = Math.min(innerW / cw, innerH / ch);
  const scaledW = cw * scale;
  const scaledH = ch * scale;
  const tx = pad + (innerW - scaledW) * 0.5 - minX * scale;
  const ty = pad + (innerH - scaledH) * 0.5 - minY * scale;
  return {
    viewBox: '0 0 ' + THUMB_BOX_W + ' ' + THUMB_BOX_H,
    transform: 'translate(' + tx + ',' + ty + ') scale(' + scale + ')',
  };
}

function mountThumbSvg(pathD, container) {
  const ns = 'http://www.w3.org/2000/svg';
  const bounds = measurePathBounds(pathD);
  const layout = thumbLayout(bounds);
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('xmlns', ns);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', layout.viewBox);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('overflow', 'visible');
  svg.classList.add('pagmar__choice-preset-vector');

  const group = document.createElementNS(ns, 'g');
  group.setAttribute('transform', layout.transform);

  const pathEl = document.createElementNS(ns, 'path');
  pathEl.setAttribute('d', pathD);
  pathEl.setAttribute('fill', 'none');
  pathEl.setAttribute('stroke', VECTOR_COLOR);
  pathEl.setAttribute('stroke-width', String(VECTOR_STROKE));
  pathEl.setAttribute('stroke-linejoin', 'round');
  pathEl.setAttribute('stroke-linecap', 'round');
  pathEl.setAttribute('vector-effect', 'non-scaling-stroke');
  pathEl.setAttribute('shape-rendering', 'geometricPrecision');
  group.appendChild(pathEl);
  svg.appendChild(group);

  container.innerHTML = '';
  container.appendChild(svg);
}

function clearThumb(questionNum) {
  const container = thumbContainer(questionNum);
  if (!container) return;
  container.hidden = true;
  container.innerHTML = '';
}

async function renderThumb(questionNum, fileName) {
  const container = thumbContainer(questionNum);
  if (!container || !fileName) return false;
  try {
    const svgText = await loadSvgText(fileName);
    const pathD = extractPathD(svgText);
    if (!pathD) return false;
    mountThumbSvg(pathD, container);
    container.hidden = false;
    return true;
  } catch (err) {
    console.warn('[choice-vector] thumb render failed Q' + questionNum, err);
    return false;
  }
}

/**
 * @param {Record<string, string>} answers
 */
export async function syncChoicePresetThumbVectors(answers) {
  const tasks = [];

  if (answers?.q4Belief && Q4_BELIEF_VECTOR[answers.q4Belief]) {
    tasks.push(renderThumb(4, Q4_BELIEF_VECTOR[answers.q4Belief]));
  } else {
    clearThumb(4);
  }

  if (answers?.q5Feeling && Q5_FEELING_VECTOR[answers.q5Feeling]) {
    tasks.push(renderThumb(5, Q5_FEELING_VECTOR[answers.q5Feeling]));
  } else {
    clearThumb(5);
  }

  if (!tasks.length) return;
  await Promise.all(tasks);
}

export function clearChoicePresetThumbVectors() {
  clearThumb(4);
  clearThumb(5);
}
