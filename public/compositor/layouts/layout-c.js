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

        // Clean up our own labels + placeholder; leave embed container alone.
        // Use direct children only so we don't disturb the embed iframe's
        // inner DOM. Avoid a full-area overlay wrapper — Twitch's autoplay
        // check rejects iframes obscured by another element.
        tileEl.querySelectorAll(':scope > .tile-label, :scope > .tile-keylevel, :scope > .stream-tile-offline').forEach(n => n.remove());

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
        const run = (state.activeRuns || []).find(r => r.teamName === teamName);
        const label = document.createElement('div');
        label.className = 'tile-label';
        label.textContent = teamName;
        tileEl.appendChild(label);
        if (run?.keystoneLevel) {
          const lvl = document.createElement('div');
          lvl.className = 'tile-keylevel';
          lvl.textContent = `+${run.keystoneLevel}`;
          tileEl.appendChild(lvl);
        }
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
