/**
 * Request-flow vector explanation bubble - glass lens registration only.
 */
(function () {
  'use strict';

  const tip = document.getElementById('questionVectorCopy');
  if (!tip) return;

  const surface = tip.querySelector('.pagmar__garden-amulet-hover__surface');
  if (window.pagmarGlassLens && surface) {
    window.pagmarGlassLens.register(surface);
  }
})();
