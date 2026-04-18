(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function cssEscape(s) {
    if (typeof window !== 'undefined' && window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(String(s || ''));
    }
    return String(s || '').replace(/["\\]/g, '\\$&');
  }

  window.Compositor = window.Compositor || {};
  window.Compositor.escapeHtml = escapeHtml;
  window.Compositor.cssEscape = cssEscape;
})();
