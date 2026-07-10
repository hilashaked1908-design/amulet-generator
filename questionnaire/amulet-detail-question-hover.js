/**
 * Glass question tooltip on detail criteria + components.
 * Reuses the index garden hover markup/classes for a pixel-identical look.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-amulet-detail')) return;

  var OFFSET_X = 20;
  var OFFSET_Y = -12;
  var SMOOTH = 0.32;
  var MAX_TIP_WIDTH = 400;
  var VIEWPORT_PAD = 16;

  var CRITERIA_TARGETS = [
    { selector: '.pagmar__detail-timing', key: 'q3WhyNow' },
    { selector: '.pagmar__detail-belonging', key: 'q2Name' },
    { selector: '.pagmar__detail-request-criterion', key: 'q1Wish' },
  ];

  var COMPONENT_KEYS = ['q5Feeling', 'q4Belief', 'q6Difficulty'];

  function questionByKey(key) {
    var qs = window.AMULET_QUESTIONS || [];
    for (var i = 0; i < qs.length; i++) {
      if (qs[i].key === key) return qs[i];
    }
    return null;
  }

  var tip = document.createElement('div');
  tip.className = 'pagmar__garden-amulet-hover pagmar__detail-question-hover';
  tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML =
    '<div class="pagmar__garden-amulet-hover__surface glass-tooltip glass-lens" data-glass-source="detail-fog">' +
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

  var surface = tip.querySelector('.pagmar__garden-amulet-hover__surface');
  if (window.pagmarGlassLens && surface) {
    window.pagmarGlassLens.register(surface);
  }

  var tagEl = tip.querySelector('.pagmar__garden-amulet-hover__index');
  var textEl = tip.querySelector('.pagmar__garden-amulet-hover__request');
  var targetX = -9999;
  var targetY = -9999;
  var sx = -9999;
  var sy = -9999;
  var visible = false;
  var fade = 0;

  function measureTipWidth() {
    var width = surface.getBoundingClientRect().width;
    return width > 1 ? width : MAX_TIP_WIDTH;
  }

  function resolvePlacement(clientX, tipWidth) {
    var left = VIEWPORT_PAD;
    var right = window.innerWidth - VIEWPORT_PAD;
    var fitsRight = clientX + OFFSET_X + tipWidth <= right;
    var fitsLeft = clientX - OFFSET_X - tipWidth >= left;

    if (fitsRight) return 'right';
    if (fitsLeft) return 'left';

    var spaceRight = right - clientX;
    var spaceLeft = clientX - left;
    return spaceRight >= spaceLeft ? 'right' : 'left';
  }

  function setActive(detail) {
    if (!detail || !detail.active || !detail.key) {
      visible = false;
      tip.classList.remove('is-visible', 'is-anchor-left', 'has-request');
      return;
    }

    var q = questionByKey(detail.key);
    if (!q) {
      visible = false;
      tip.classList.remove('is-visible', 'is-anchor-left', 'has-request');
      return;
    }

    var questionText = String(q.text || '').trim();
    visible = true;
    tagEl.textContent = q.tag || '';
    textEl.textContent = questionText;
    textEl.hidden = !questionText;
    tip.classList.toggle('has-request', !!questionText);

    var placement = resolvePlacement(detail.x, measureTipWidth());
    var anchorLeft = placement === 'left';
    tip.classList.toggle('is-anchor-left', anchorLeft);
    targetX = anchorLeft ? detail.x - OFFSET_X : detail.x + OFFSET_X;
    targetY = detail.y + OFFSET_Y;
    tip.classList.add('is-visible');
  }

  function onEnter(e) {
    if (e.pointerType === 'touch') return;
    var key = e.currentTarget.getAttribute('data-question-key');
    if (!key) return;
    setActive({
      active: true,
      key: key,
      x: e.clientX,
      y: e.clientY,
      target: e.currentTarget,
    });
  }

  function onMove(e) {
    if (e.pointerType === 'touch' || !visible) return;
    var key = e.currentTarget.getAttribute('data-question-key');
    if (!key) return;
    var placement = resolvePlacement(e.clientX, measureTipWidth());
    var anchorLeft = placement === 'left';
    tip.classList.toggle('is-anchor-left', anchorLeft);
    targetX = anchorLeft ? e.clientX - OFFSET_X : e.clientX + OFFSET_X;
    targetY = e.clientY + OFFSET_Y;
  }

  function onLeave() {
    setActive(null);
  }

  function bindTarget(el, key) {
    if (!el || el.dataset.questionHoverBound === '1') return;
    el.dataset.questionHoverBound = '1';
    el.setAttribute('data-question-key', key);
    el.classList.add('pagmar__detail-question-target');
    el.addEventListener('pointerenter', onEnter);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
  }

  function bindCriteriaTargets() {
    CRITERIA_TARGETS.forEach(function (item) {
      var el = document.querySelector(item.selector);
      if (el) bindTarget(el, item.key);
    });
  }

  function bindComponentTargets() {
    var list = document.getElementById('detailComponents');
    if (!list) return;
    var items = list.querySelectorAll('.pagmar__detail-list-item');
    items.forEach(function (li, index) {
      var key = COMPONENT_KEYS[index];
      if (key) bindTarget(li, key);
    });
  }

  function boot() {
    bindCriteriaTargets();
    bindComponentTargets();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.addEventListener('pagmar:detail-rendered', boot);

  function tick() {
    if (visible) {
      sx += (targetX - sx) * SMOOTH;
      sy += (targetY - sy) * SMOOTH;
      tip.style.transform = 'translate3d(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px,0)';
    }
    fade += ((visible ? 1 : 0) - fade) * 0.22;
    tip.style.opacity = String(fade);
    requestAnimationFrame(tick);
  }

  requestAnimationFrame(tick);
})();
