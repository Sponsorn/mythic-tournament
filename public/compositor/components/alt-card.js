(function () {
  'use strict';

  function render(el, { directorState }) {
    const slide = (directorState && directorState.altCard && directorState.altCard.pinnedSlide) || 'brand';
    let body;
    if (slide === 'brand') {
      body = `
        <div class="alt-slide alt-slide--brand">
          <img src="/images/luckywipelogo.png" alt="" class="alt-brand-logo">
          <div class="alt-brand-name">Lucky Wipe</div>
          <div class="alt-brand-tag">Presents</div>
        </div>
      `;
    } else if (slide === 'commands') {
      const list = (directorState?.commandsList || []).map(c =>
        `<code>${window.Compositor.escapeHtml(c)}</code>`
      ).join(' ');
      body = `<div class="alt-slide alt-slide--commands">${list || 'No commands configured'}</div>`;
    } else {
      const html = directorState?.infoboxHtml || 'No info set';
      // infoboxHtml is admin-provided HTML; trust boundary is the /api/director
      // auth gate (unauthenticated in Phase 1, tightened in Phase 2).
      body = `<div class="alt-slide alt-slide--info">${html}</div>`;
    }
    el.innerHTML = `
      <div class="alt-card">
        <div class="alt-card-header">
          <span>${labelFor(slide)}</span>
        </div>
        <div class="alt-card-body">${body}</div>
      </div>
    `;
  }

  function labelFor(slide) {
    return { brand: 'Brand', commands: 'Commands', info: 'Info' }[slide] || slide;
  }

  window.AltCard = { render };
})();
