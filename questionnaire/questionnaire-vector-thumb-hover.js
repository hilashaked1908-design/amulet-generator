/**
 * Glass answer tooltip on questionnaire vector thumbnails (Q1–Q8 grid).
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'amuletQuestionnaire';
  const THUMB_KEYS = {
    1: 'q1Wish',
    2: 'q2Name',
    3: 'q3WhyNow',
    4: 'q4Belief',
    5: 'q5Feeling',
    6: 'q6Difficulty',
    7: 'q7Change',
    8: 'q8Motivation',
  };
  const GAP_ABOVE = 10;
  const VIEWPORT_PAD = 16;
  const SMOOTH = 0.32;
  const MAX_TIP_WIDTH = 400;

  let tip = null;
  let surface = null;
  let tagEl = null;
  let textEl = null;
  let targetX = -9999;
  let targetY = -9999;
  let sx = -9999;
  let sy = -9999;
  let visible = false;
  let fade = 0;
  let booted = false;
  let rafId = 0;

  function isCreateFlowActive() {
    return (
      document.body.classList.contains('is-create-mode') ||
      document.body.classList.contains('pagmar-create')
    );
  }

  function loadAnswers() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_err) {
      return {};
    }
  }

  function questionByNum(questionNum) {
    const qs = window.AMULET_QUESTIONS || [];
    return qs[questionNum - 1] || null;
  }

  function resolveChoiceLabel(question, value) {
    if (!question || !question.options) return String(value || '').trim();
    const option = question.options.find(function (entry) {
      return entry.value === value;
    });
    return option ? option.label : String(value || '').trim();
  }

  function formatAnswerText(questionNum) {
    const key = THUMB_KEYS[questionNum];
    const question = questionByNum(questionNum);
    if (!key || !question) return '';

    const raw = loadAnswers()[key];
    if (raw === undefined || raw === null || !String(raw).trim()) return '';

    if (question.type === 'choice') {
      return resolveChoiceLabel(question, raw);
    }

    const text = String(raw).trim();
    return window.pagmarNormalizeDashes ? window.pagmarNormalizeDashes(text) : text;
  }

  function measureTipWidth() {
    if (!surface) return MAX_TIP_WIDTH;
    const width = surface.getBoundingClientRect().width;
    return width > 1 ? width : MAX_TIP_WIDTH;
  }

  function clampTipX(centerX, tipWidth) {
    const left = VIEWPORT_PAD;
    const right = window.innerWidth - VIEWPORT_PAD;
    let x = centerX - tipWidth * 0.5;
    x = Math.max(left, Math.min(x, right - tipWidth));
    return x;
  }

  function positionAboveThumb(thumbEl) {
    const rect = thumbEl.getBoundingClientRect();
    const tipWidth = measureTipWidth();
    const tipHeight = surface.getBoundingClientRect().height || 0;
    const centerX = rect.left + rect.width * 0.5;
    return {
      x: clampTipX(centerX, tipWidth),
      y: rect.top - GAP_ABOVE - tipHeight,
    };
  }

  function shouldSuppressTip() {
    return (
      !isCreateFlowActive() ||
      document.body.classList.contains('is-question-transition-loading')
    );
  }

  function setActive(detail) {
    if (!tip) return;

    if (
      shouldSuppressTip() ||
      !detail ||
      !detail.active ||
      !detail.target ||
      detail.target.hidden
    ) {
      visible = false;
      tip.classList.remove('is-visible', 'is-anchor-left', 'has-request');
      return;
    }

    const questionNum = detail.questionNum;
    const question = questionByNum(questionNum);
    const answerText = formatAnswerText(questionNum);
    if (!question || !answerText) {
      visible = false;
      tip.classList.remove('is-visible', 'is-anchor-left', 'has-request');
      return;
    }

    visible = true;
    tagEl.textContent = question.tag || '';
    textEl.textContent = answerText;
    textEl.hidden = !answerText;
    tip.classList.toggle('has-request', !!answerText);
    tip.classList.remove('is-anchor-left');

    const pos = positionAboveThumb(detail.target);
    targetX = pos.x;
    targetY = pos.y;
    tip.classList.add('is-visible');

    if (window.pagmarGlassLens && surface) {
      window.pagmarGlassLens.register(surface);
    }
  }

  function onEnter(e) {
    if (e.pointerType === 'touch') return;
    const thumb = e.currentTarget;
    if (thumb.hidden) return;
    const questionNum = parseInt(thumb.getAttribute('data-question'), 10);
    if (!questionNum) return;
    setActive({
      active: true,
      questionNum: questionNum,
      target: thumb,
    });
  }

  function onMove(e) {
    if (e.pointerType === 'touch' || !visible) return;
    const thumb = e.currentTarget;
    if (thumb.hidden) return;
    const pos = positionAboveThumb(thumb);
    targetX = pos.x;
    targetY = pos.y;
  }

  function onLeave() {
    setActive(null);
  }

  function bindThumb(el, questionNum) {
    if (!el || el.dataset.vectorThumbHoverBound === '1') return;
    el.dataset.vectorThumbHoverBound = '1';
    el.setAttribute('data-question', String(questionNum));
    el.classList.add('figma-q-vector-thumb--hoverable');
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
  }

  function ensureTip() {
    if (tip) return;

    tip = document.createElement('div');
    tip.className = 'pagmar__garden-amulet-hover pagmar__request-thumb-hover';
    tip.setAttribute('aria-hidden', 'true');
    tip.innerHTML =
      '<div class="pagmar__garden-amulet-hover__surface glass-tooltip glass-lens" data-glass-source="request-fog">' +
      '<div class="glass-lens__backdrop" aria-hidden="true">' +
      '<div class="glass-clone" aria-hidden="true">' +
      '<canvas class="glass-clone__capture" aria-hidden="true"></canvas>' +
      '</div>' +
      '<div class="glass-lens__tint" aria-hidden="true"></div>' +
      '<div class="glass-chrome" aria-hidden="true"></div>' +
      '</div>' +
      '<div class="pagmar__garden-amulet-hover__head">' +
      '<span class="pagmar__glass-pill__arrow" aria-hidden="true"></span>' +
      '<span class="pagmar__garden-amulet-hover__index"></span>' +
      '</div>' +
      '<p class="pagmar__garden-amulet-hover__request"></p>' +
      '</div>';
    document.body.appendChild(tip);

    surface = tip.querySelector('.pagmar__garden-amulet-hover__surface');
    if (window.pagmarGlassLens && surface) {
      window.pagmarGlassLens.register(surface);
    }

    tagEl = tip.querySelector('.pagmar__garden-amulet-hover__index');
    textEl = tip.querySelector('.pagmar__garden-amulet-hover__request');
  }

  function boot() {
    if (!document.getElementById('questionVectorGrid')) return;

    ensureTip();
    for (let q = 1; q <= 8; q += 1) {
      bindThumb(document.getElementById('vectorThumbQ' + q), q);
    }

    if (booted) return;
    booted = true;
    rafId = requestAnimationFrame(tick);
  }

  function tick() {
    if (!tip) return;

    if (visible) {
      sx += (targetX - sx) * SMOOTH;
      sy += (targetY - sy) * SMOOTH;
      tip.style.transform = 'translate3d(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px,0)';
    }
    fade += ((visible ? 1 : 0) - fade) * 0.22;
    tip.style.opacity = String(fade);
    rafId = requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('questionnaire:vector-ready', boot);
  window.pagmarBootVectorThumbHover = boot;
})();
