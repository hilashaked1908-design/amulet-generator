/**
 * Boot guard - keep file:// and localhost on the canonical server URL.
 * No automatic reloads / pagmarFresh redirects (they break Safari and interrupt module loading).
 */
(function () {
  'use strict';

  var BUILD = '20250709-full-site';
  var CANONICAL_HOST = '127.0.0.1';
  var CANONICAL_PORT = '8080';

  if (location.protocol === 'file:') {
    location.replace(
      'http://' +
        CANONICAL_HOST +
        ':' +
        CANONICAL_PORT +
        '/questionnaire/index.html' +
        location.search +
        location.hash
    );
    return;
  }

  if (location.hostname === 'localhost') {
    location.replace(
      'http://' +
        CANONICAL_HOST +
        ':' +
        CANONICAL_PORT +
        location.pathname +
        location.search +
        location.hash
    );
    return;
  }

  document.documentElement.setAttribute('data-pagmar-build', BUILD);
})();
