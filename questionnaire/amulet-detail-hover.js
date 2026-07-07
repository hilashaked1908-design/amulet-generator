/**
 * K95-style glass pill — "360°" follows cursor on detail amulet hover.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-amulet-detail')) return;

  var media = document.querySelector('.pagmar__detail-amulet-media');
  if (!media) return;

  var OFFSET_X = 20;
  var OFFSET_Y = -32;
  var SMOOTH = 0.32;

  var tip = document.createElement('div');
  tip.className = 'pagmar__detail-amulet-hover pagmar__glass-pill';
  tip.setAttribute('aria-hidden', 'true');
  tip.innerHTML =
    '<span class="pagmar__glass-pill__text">' +
    '360<span class="pagmar__glass-pill__deg" aria-hidden="true"></span>' +
    '</span>';
  document.body.appendChild(tip);

  var targetX = -9999;
  var targetY = -9999;
  var sx = -9999;
  var sy = -9999;
  var visible = false;
  var fade = 0;
  var pointerDown = false;
  var pointerMoved = false;

  function canShow() {
    return (
      !document.body.classList.contains('is-detail-loading') &&
      !pointerDown &&
      !pointerMoved
    );
  }

  function setVisible(on, x, y) {
    if (!on || !canShow()) {
      visible = false;
      tip.classList.remove('is-visible');
      return;
    }
    visible = true;
    targetX = x + OFFSET_X;
    targetY = y + OFFSET_Y;
    tip.classList.add('is-visible');
  }

  function isOverMedia(clientX, clientY) {
    var el = document.elementFromPoint(clientX, clientY);
    return !!(el && media.contains(el));
  }

  media.addEventListener('pointerenter', function (e) {
    if (e.pointerType === 'touch') return;
    setVisible(true, e.clientX, e.clientY);
  });

  media.addEventListener('pointerleave', function () {
    setVisible(false);
    pointerMoved = false;
  });

  media.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    if (pointerDown) {
      pointerMoved = true;
      setVisible(false);
      return;
    }
    setVisible(true, e.clientX, e.clientY);
  });

  media.addEventListener('pointerdown', function () {
    pointerDown = true;
    pointerMoved = false;
    setVisible(false);
  });

  window.addEventListener('pointerup', function (e) {
    pointerDown = false;
    if (isOverMedia(e.clientX, e.clientY) && !pointerMoved) {
      setVisible(true, e.clientX, e.clientY);
    }
    pointerMoved = false;
  });

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

  requestAnimationFrame(tick);
})();
