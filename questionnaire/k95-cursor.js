/**
 * K95-style companion cursor — yellow dot beside the native pointer, ring on hover.
 */
(function () {
  'use strict';

  const HOVER_SELECTOR =
    'a, button:not(:disabled), [data-hover], .intro__choice-btn--figma:not(:disabled), .figma-q__btn:not(:disabled), .figma-close';

  let cursorEl = null;
  let meshHoverLock = false;
  let coarsePointer = window.matchMedia('(hover: none)').matches;

  function isActive() {
    return (
      document.body.classList.contains('is-create-mode') ||
      document.body.classList.contains('pagmar-create')
    );
  }

  function getOffset() {
    const rtl =
      document.documentElement.dir === 'rtl' ||
      getComputedStyle(document.documentElement).direction === 'rtl';
    return { x: rtl ? -22 : 22, y: 18 };
  }

  function ensureCursor() {
    if (cursorEl && cursorEl.isConnected) return cursorEl;
    cursorEl = document.getElementById('pagmarK95Cursor');
    if (cursorEl) return cursorEl;

    cursorEl = document.createElement('div');
    cursorEl.id = 'pagmarK95Cursor';
    cursorEl.className = 'pagmar__k95-cursor';
    cursorEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cursorEl);
    return cursorEl;
  }

  function setHovering(active) {
    const el = ensureCursor();
    el.classList.toggle('is-hovering', Boolean(active));
  }

  function setVisible(active) {
    const el = ensureCursor();
    el.classList.toggle('is-visible', Boolean(active));
    if (!active) {
      el.classList.remove('is-hovering', 'is-transitioning');
      meshHoverLock = false;
    }
  }

  function placeCursor(clientX, clientY) {
    const el = ensureCursor();
    const off = getOffset();
    const x = clientX + off.x;
    const y = clientY + off.y;
    el.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0) translate(-50%, -50%)';
  }

  function updateHoverFromTarget(target) {
    if (!target || !(target instanceof Element)) {
      if (!meshHoverLock) setHovering(false);
      return;
    }
    const hit = target.closest(HOVER_SELECTOR);
    if (!meshHoverLock) setHovering(Boolean(hit));
  }

  function onPointerMove(e) {
    if (!isActive() || coarsePointer) return;
    setVisible(true);
    placeCursor(e.clientX, e.clientY);
  }

  function onPointerLeave() {
    if (!isActive()) return;
    setVisible(false);
  }

  function onPointerOver(e) {
    if (!isActive() || coarsePointer) return;
    updateHoverFromTarget(e.target);
  }

  function onMeshHover(e) {
    if (!isActive() || coarsePointer) return;
    meshHoverLock = Boolean(e.detail);
    setHovering(meshHoverLock);
  }

  function onCoarseChange(e) {
    coarsePointer = e.matches;
    if (coarsePointer) setVisible(false);
  }

  function onCreateOpen() {
    if (coarsePointer) return;
    meshHoverLock = false;
  }

  function onCreateClose() {
    meshHoverLock = false;
    setVisible(false);
    if (cursorEl) cursorEl.classList.remove('is-hovering');
  }

  function watchBody() {
    const observer = new MutationObserver(function () {
      if (!isActive()) onCreateClose();
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true, capture: true });
  window.addEventListener('pointerleave', onPointerLeave, { passive: true, capture: true });
  window.addEventListener('pointerover', onPointerOver, { passive: true, capture: true });
  window.addEventListener('mesh-hover', onMeshHover);
  window.addEventListener('questionnaire:create-open', onCreateOpen);
  window.addEventListener('questionnaire:create-close', onCreateClose);
  window.matchMedia('(hover: none)').addEventListener('change', onCoarseChange);

  watchBody();
})();
