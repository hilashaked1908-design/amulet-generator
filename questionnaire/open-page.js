/**
 * Site opening page - click anywhere to enter the garden index.
 */
(function () {
  'use strict';

  var viewport = document.querySelector('.pagmar-open__viewport');
  if (!viewport) return;

  function enterSite() {
    location.href = 'index.html' + (location.search || '') + (location.hash || '');
  }

  viewport.addEventListener('click', enterSite);

  viewport.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      enterSite();
    }
  });

  viewport.setAttribute('tabindex', '0');
  viewport.setAttribute('role', 'button');
  viewport.setAttribute('aria-label', 'לחץ לכניסה לאתר');
})();
