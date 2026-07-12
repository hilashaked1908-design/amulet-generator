/**
 * K95-style per-character label roll - staggered char-top / char-bot on hover.
 */
(function () {
  'use strict';

  const ROLL_SELECTOR = '';

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function splitChars(text) {
    return Array.from(String(text));
  }

  function buildCharCell(content, index, options) {
    const opts = options || {};
    const extraClass = opts.extraClass ? ' ' + opts.extraClass : '';
    const inner = opts.isHtml ? content : escapeHtml(content);
    return (
      '<span class="pagmar-btn__char' +
      extraClass +
      '" style="--i:' +
      index +
      '">' +
      '<span class="pagmar-btn__char-top">' +
      inner +
      '</span>' +
      '<span class="pagmar-btn__char-bot" aria-hidden="true">' +
      inner +
      '</span>' +
      '</span>'
    );
  }

  function buildCharRollInner(text, startIndex) {
    let html = '';
    let index = startIndex || 0;
    splitChars(text).forEach(function (ch) {
      html += buildCharCell(ch === ' ' ? '\u00a0' : ch, index);
      index += 1;
    });
    return html;
  }

  function buildLineRollInner(text) {
    const inner = escapeHtml(text);
    return (
      '<span class="pagmar-btn__roll pagmar-btn__roll--lines">' +
      '<span class="pagmar-btn__roll-track" role="presentation">' +
      '<span class="pagmar-btn__roll-line">' +
      inner +
      '</span>' +
      '<span class="pagmar-btn__roll-line" aria-hidden="true">' +
      inner +
      '</span>' +
      '</span>' +
      '</span>'
    );
  }

  function enhanceCharLabel(el, textOverride) {
    if (!el || el.classList.contains('is-typing')) return;

    const text = String(
      textOverride != null ? textOverride : el.dataset.typeText || el.textContent || ''
    ).trim();
    if (!text) return;

    if (el.dataset.typeText !== undefined) {
      el.dataset.typeText = text;
    }
    el.setAttribute('aria-label', text);
    el.dataset.rollEnhanced = '1';
    el.classList.add('pagmar-btn__roll', 'pagmar-btn__roll--chars');
    el.innerHTML = buildCharRollInner(text);
  }

  function enhanceCtaBody(body, textOverride) {
    if (!body) return;

    const existingRoll = body.querySelector('.pagmar-btn__roll--lines');
    let label = body.querySelector('.pagmar__index-cta-pill__label');
    if (label && label.classList.contains('is-typing')) return;

    const text = String(
      textOverride != null
        ? textOverride
        : (label && (label.dataset.typeText || label.textContent)) ||
            (existingRoll && existingRoll.textContent) ||
            ''
    ).trim();
    if (!text) return;

    if (!label) {
      label = document.createElement('span');
      label.className = 'pagmar__index-cta-pill__label pagmar__index-type-target';
      body.appendChild(label);
    }

    label.dataset.typeText = text;
    label.setAttribute('aria-label', text);
    label.classList.add('pagmar__index-type-target');
    label.dataset.rollEnhanced = '1';
    label.hidden = false;
    label.textContent = text;

    if (existingRoll) existingRoll.remove();

    body.dataset.rollEnhanced = '1';
  }

  function enhanceRollTarget(el) {
    if (!el || el.classList.contains('is-typing')) return;

    if (
      el.classList.contains('pagmar__index-filter-trigger__label') ||
      el.classList.contains('pagmar__index-about__label')
    ) {
      if (el.classList.contains('pagmar__index-about__label')) {
        delete el.dataset.rollEnhanced;
        el.classList.remove('pagmar-btn__roll', 'pagmar-btn__roll--chars');
      }
      return;
    }

    if (el.classList.contains('pagmar__index-cta-pill__label')) {
      const body = el.closest('.pagmar__index-cta-pill__body');
      if (body && body.dataset.rollEnhanced === '1') {
        return;
      }
      enhanceCtaBody(body);
      return;
    }

    if (el.dataset.rollEnhanced === '1' && el.querySelector('.pagmar-btn__char')) return;
    enhanceCharLabel(el);
  }

  function enhancePlainButton(btn) {
    if (!btn || btn.dataset.rollEnhanced === '1') return;
    if (btn.querySelector('.pagmar-btn__roll, .figma-q__btn-label, .pagmar__action-btn__label')) return;

    const text = (btn.textContent || '').trim();
    if (!text) return;

    btn.dataset.rollEnhanced = '1';
    btn.innerHTML =
      '<span class="pagmar-btn__roll pagmar-btn__roll--chars">' + buildCharRollInner(text) + '</span>';
  }

  function enhanceFilterButton(btn, textOverride) {
    if (!btn || btn.classList.contains('is-typing')) return;
    if (btn.classList.contains('pagmar__index-filter-active-tag')) return;

    const text = String(
      textOverride != null ? textOverride : btn.dataset.typeText || btn.textContent || ''
    ).trim();
    if (!text) return;

    btn.dataset.typeText = text;
    btn.setAttribute('aria-label', text);
    btn.dataset.rollEnhanced = '1';
    btn.textContent = text;
  }

  function syncFilterButton(btn, text) {
    if (!btn) return;
    if (btn.classList.contains('pagmar__index-filter-active-tag')) {
      const value = String(text == null ? '' : text);
      btn.dataset.typeText = value;
      btn.setAttribute('aria-label', value);
      btn.textContent = value;
      return;
    }
    const value = String(text == null ? '' : text);
    btn.dataset.typeText = value;
    btn.setAttribute('aria-label', value);

    if (btn.classList.contains('is-typing')) {
      btn.textContent = value;
      return;
    }

    delete btn.dataset.rollEnhanced;
    enhanceFilterButton(btn, value);
  }

  function enhanceFigmaQButton(btn) {
    if (!btn || btn.dataset.rollEnhanced === '1') return;
    if (document.body.classList.contains('is-choice-question')) return;

    const label = btn.querySelector('.figma-q__btn-label');
    if (label) {
      if (label.dataset.rollEnhanced === '1' && label.querySelector('.pagmar-btn__char')) {
        btn.dataset.rollEnhanced = '1';
        return;
      }
      enhanceCharLabel(label);
      btn.dataset.rollEnhanced = '1';
      return;
    }

    if (btn.querySelector('.pagmar-btn__roll, .pagmar__action-btn__label')) return;

    const text = (btn.textContent || '').trim();
    if (!text) return;

    btn.dataset.rollEnhanced = '1';
    btn.innerHTML =
      '<span class="pagmar-btn__roll pagmar-btn__roll--chars figma-q__btn-label">' +
      buildCharRollInner(text) +
      '</span>';
  }

  function syncRollText(el, text) {
    if (!el) return;
    const value = String(text == null ? '' : text);
    if (el.dataset.typeText !== undefined) {
      el.dataset.typeText = value;
    }
    el.setAttribute('aria-label', value);

    if (el.classList.contains('pagmar__index-cta-pill__label')) {
      const body = el.closest('.pagmar__index-cta-pill__body');
      if (body) {
        delete body.dataset.rollEnhanced;
        delete el.dataset.rollEnhanced;
        el.hidden = false;
        enhanceCtaBody(body, value);
        return;
      }
    }

    if (el.dataset.rollEnhanced === '1' || el.querySelector('.pagmar-btn__char')) {
      delete el.dataset.rollEnhanced;
      el.classList.remove('pagmar-btn__roll', 'pagmar-btn__roll--chars');
      enhanceCharLabel(el, value);
      return;
    }

    el.textContent = value;
  }

  function enhanceAll(root) {
    const scope = root && root.querySelectorAll ? root : document;

    if (ROLL_SELECTOR) scope.querySelectorAll(ROLL_SELECTOR).forEach(enhanceRollTarget);
    scope.querySelectorAll('.figma-q__btn').forEach(enhanceFigmaQButton);
    scope.querySelectorAll('.pagmar__text-save, .pagmar__export-btn').forEach(enhancePlainButton);
    scope
      .querySelectorAll('.pagmar__index-filter-item, .pagmar__index-filter-active-tag')
      .forEach(enhanceFilterButton);
  }

  window.pagmarButtonRoll = {
    enhance: enhanceAll,
    sync: syncRollText,
    enhanceTarget: enhanceRollTarget,
    syncFilter: syncFilterButton,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      enhanceAll(document);
    });
  } else {
    enhanceAll(document);
  }

  window.addEventListener('pagmar:buttons-enhance', function (evt) {
    enhanceAll((evt && evt.detail && evt.detail.root) || document);
  });
})();
