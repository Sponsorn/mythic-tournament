(function () {
  'use strict';

  function formatDuration(ms) {
    const totalSec = Math.floor(Number(ms) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function mount(root) {
    root.innerHTML = `
      <div class="lbt-wrap">
        <div class="lbt-panel">
          <div class="lbt-panel-header">
            <img src="/images/luckywipelogo.png" alt="" class="lbt-header-logo">
            <span class="lbt-header-title">Best times</span>
          </div>
          <div class="lbt-grid"></div>
        </div>
      </div>
    `;
    const gridEl = root.querySelector('.lbt-grid');
    let timer = null;

    async function load() {
      try {
        const res = await fetch('/api/best-times');
        const data = await res.json();
        render(data);
      } catch (err) {
        gridEl.innerHTML = `<div class="lbt-empty">Failed to load: ${window.Compositor.escapeHtml(err.message)}</div>`;
      }
    }

    function render(items) {
      const escapeHtml = window.Compositor.escapeHtml;
      if (!items || items.length === 0) {
        gridEl.innerHTML = '<div class="lbt-empty">No timed runs yet</div>';
        return;
      }
      gridEl.innerHTML = items.map(it => `
        <div class="lbt-cell">
          <div class="lbt-cell-dungeon">${escapeHtml(it.dungeon)}</div>
          <div class="lbt-cell-time">${formatDuration(it.duration_ms)}</div>
          <div class="lbt-cell-meta">
            <span class="lbt-cell-team">${escapeHtml(it.team)}</span>
            <span class="lbt-cell-level">+${it.level}</span>
            <span class="lbt-cell-upg">${'★'.repeat(it.upgrades)}</span>
          </div>
        </div>
      `).join('');
    }

    function update() {
      // nothing per-state; best times fetched independently
    }

    function unmount() {
      if (timer) clearInterval(timer);
      if (window.TwitchEmbedManager) window.TwitchEmbedManager.detachAll();
    }

    load();
    timer = setInterval(load, 30000);

    return { update, unmount, onRunComplete: load };
  }

  window.LayoutBT = { mount };
})();
