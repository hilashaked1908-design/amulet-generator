/**
 * Open page - garden-style liquid glass copy bubble follows cursor.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-open')) return;

  var OFFSET_X = 20;
  var OFFSET_Y = -12;
  var SMOOTH = 0.32;

  var tip = document.createElement('div');
  tip.className = 'pagmar-open__cursor-hint pagmar__garden-amulet-hover';
  tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML =
    '<div class="pagmar__garden-amulet-hover__surface glass-tooltip glass-lens" data-glass-source="open-amulet">' +
    '<div class="glass-lens__backdrop" aria-hidden="true">' +
    '<div class="glass-clone" aria-hidden="true">' +
    '<canvas class="glass-clone__capture" aria-hidden="true"></canvas>' +
    '</div>' +
    '<div class="glass-lens__tint" aria-hidden="true"></div>' +
    '<div class="glass-chrome" aria-hidden="true"></div>' +
    '</div>' +
    '<div class="pagmar-open__cursor-hint__copy pagmar__garden-amulet-hover__request" dir="rtl">' +
    '<p>מאז ומתמיד בני האדם יצרו טקסים, קמעות ושיטות שונות בניסיון להשפיע על המציאות ולהתמודד עם חוסר הוודאות.</p>' +
    '<p>הפרויקט מציע פרשנות עכשווית למסורות אלו. הבקשה שלכם מתורגמת למערכת סימנים היוצרת סיגיל ייחודי, המבוסס על המילים שכתבתם ועל הרגשות המלווים אותן.</p>' +
    '</div>' +
    '</div>';
  document.body.appendChild(tip);

  var surface = tip.querySelector('.pagmar__garden-amulet-hover__surface');
  if (window.pagmarGlassLens && surface) {
    window.pagmarGlassLens.register(surface);
  }

  var targetX = -9999;
  var targetY = -9999;
  var sx = -9999;
  var sy = -9999;
  var visible = false;
  var fade = 0;
  var coarsePointer = window.matchMedia('(hover: none)').matches;

  function setTarget(clientX, clientY) {
    targetX = clientX + OFFSET_X;
    targetY = clientY + OFFSET_Y;
  }

  function showAt(clientX, clientY) {
    visible = true;
    setTarget(clientX, clientY);
    tip.classList.add('is-visible');
  }

  function hide() {
    visible = false;
    tip.classList.remove('is-visible');
  }

  function placeDefaultHint() {
    var stage = document.querySelector('.pagmar-open__stage');
    var rect = tip.getBoundingClientRect();
    var h = rect.height > 1 ? rect.height : 180;
    var baseX = window.innerWidth * 0.5 + 80.42;
    var baseY = window.innerHeight * 0.5714 + 99.73;
    if (stage) {
      var stageRect = stage.getBoundingClientRect();
      var u = stageRect.width / 1920;
      baseX = stageRect.left + stageRect.width * 0.5 + 80.42 * u;
      baseY = stageRect.top + stageRect.height * 0.5714 + 99.73 * u;
    }
    showAt(baseX - OFFSET_X, baseY - h * 0.5 - OFFSET_Y);
  }

  function onPointerMove(e) {
    if (coarsePointer) return;
    showAt(e.clientX, e.clientY);
  }

  function onPointerLeave() {
    if (coarsePointer) return;
    hide();
  }

  function onCoarseChange(e) {
    coarsePointer = e.matches;
    if (coarsePointer) {
      placeDefaultHint();
    } else {
      hide();
    }
  }

  function tick() {
    if (visible) {
      sx += (targetX - sx) * SMOOTH;
      sy += (targetY - sy) * SMOOTH;
      tip.style.transform =
        'translate3d(' + Math.round(sx) + 'px,' + Math.round(sy) + 'px,0)';
    }
    fade += ((visible ? 1 : 0) - fade) * 0.22;
    tip.style.opacity = String(fade);
    requestAnimationFrame(tick);
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
  window.addEventListener('pointerleave', onPointerLeave, { passive: true, capture: true });
  window.matchMedia('(hover: none)').addEventListener('change', onCoarseChange);

  if (coarsePointer) {
    requestAnimationFrame(function () {
      requestAnimationFrame(placeDefaultHint);
    });
  }

  requestAnimationFrame(tick);
})();
