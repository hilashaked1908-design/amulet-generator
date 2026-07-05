/**
 * Site intro overlay — Cyber Garden style click-anywhere-to-enter.
 * Figma Frame 225 (1763:26756) — אינדקס.
 */
(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  const overlay = document.getElementById('siteIntro');
  if (!overlay) return;

  const DISMISS_MS = 420;
  let dismissed = false;

  function setIntroOpen(open) {
    document.body.classList.toggle('is-site-intro-open', open);
    window.dispatchEvent(
      new CustomEvent(open ? 'questionnaire:intro-open' : 'questionnaire:intro-close')
    );
  }

  function dismissIntro() {
    if (dismissed) return;
    dismissed = true;

    overlay.classList.add('is-leaving');
    setIntroOpen(false);

    window.setTimeout(function () {
      overlay.hidden = true;
      overlay.classList.remove('is-leaving');
      overlay.setAttribute('aria-hidden', 'true');
    }, DISMISS_MS);
  }

  setIntroOpen(true);
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');

  overlay.addEventListener('click', dismissIntro);

  overlay.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      dismissIntro();
    }
  });

  window.dismissSiteIntro = dismissIntro;
})();
