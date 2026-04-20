(function () {
  'use strict';

  const GRID_SIZE = 6;

  function mount(root) {
    root.innerHTML = `
      <div class="lc-grid">
        ${Array.from({ length: GRID_SIZE }, (_, i) =>
          `<div class="lc-tile" data-slot="${i}"></div>`
        ).join('')}
        <div class="lc-sidebar"></div>
      </div>
    `;
    const tileEls = Array.from(root.querySelectorAll('.lc-tile'));
    const sidebarEl = root.querySelector('.lc-sidebar');

    function update(state) {
      const escapeHtml = window.Compositor.escapeHtml;
      const grid = state.directorState?.slots?.grid || [];
      tileEls.forEach((tileEl, i) => {
        const teamName = grid[i];

        // Clean up our own overlay + placeholder; leave embed container alone
        const oldOverlay = tileEl.querySelector('.lc-tile-overlay');
        if (oldOverlay) oldOverlay.remove();
        const oldPlaceholder = tileEl.querySelector('.stream-tile-offline');
        if (oldPlaceholder) oldPlaceholder.remove();

        if (!teamName) {
          tileEl.classList.add('lc-tile--empty');
          if (window.TwitchEmbedManager) window.TwitchEmbedManager.detachFrom(tileEl);
          const placeholder = document.createElement('div');
          placeholder.className = 'stream-tile-offline';
          placeholder.textContent = `Slot ${i + 1} empty`;
          tileEl.appendChild(placeholder);
          return;
        }

        tileEl.classList.remove('lc-tile--empty');
        if (window.TwitchEmbedManager) {
          window.TwitchEmbedManager.mountInto(teamName, tileEl, { focused: false });
        }
        const overlay = document.createElement('div');
        overlay.className = 'lc-tile-overlay';
        const run = (state.activeRuns || []).find(r => r.teamName === teamName);
        const level = run?.keystoneLevel ? `+${run.keystoneLevel}` : '';
        overlay.innerHTML = `
          <div class="tile-label">${escapeHtml(teamName)}</div>
          ${level ? `<div class="tile-keylevel">${level}</div>` : ''}
        `;
        tileEl.appendChild(overlay);
      });

      window.FullLeaderboard.render(sidebarEl, {
        leaderboard: state.leaderboard,
        title: 'Standings',
        showRuns: true,
      });
    }

    function onRunComplete(payload) {
      window.FullLeaderboard.flash(sidebarEl, payload.teamName, payload.pointsEarned);
    }

    function unmount() {
      if (window.TwitchEmbedManager) window.TwitchEmbedManager.detachAll();
    }

    return { update, unmount, onRunComplete };
  }

  window.LayoutC = { mount };
})();
