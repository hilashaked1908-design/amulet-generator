(function () {
  'use strict';

  if (!document.body.classList.contains('pagmar-index')) return;

  function closeAbout() {
    var overlay = document.getElementById('aboutOverlay');
    if (!overlay) return;

    overlay.hidden = true;
    overlay.classList.remove('is-visible');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.style.display = 'none';

    document.body.classList.remove('is-about-overlay-open');
    window.dispatchEvent(new CustomEvent('questionnaire:about-closed'));
  }

  function openAbout() {
    var overlay = document.getElementById('aboutOverlay');
    if (!overlay) return;

    overlay.hidden = false;
    overlay.style.display = '';
    overlay.removeAttribute('aria-hidden');
    overlay.classList.add('is-visible');

    document.body.classList.add('is-about-overlay-open');
    window.dispatchEvent(new CustomEvent('questionnaire:about-opened'));
  }

  window.closeAboutOverlay = closeAbout;
  window.openAboutShell = openAbout;
  window.openAboutOverlay = openAbout;

  var closeBtn = document.getElementById('aboutCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      closeAbout();
    });
  }

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !document.getElementById('aboutOverlay')?.hidden) {
      e.preventDefault();
      closeAbout();
    }
  });
})();
