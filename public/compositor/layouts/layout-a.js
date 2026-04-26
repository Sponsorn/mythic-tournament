(function () {
  'use strict';

  function mount(root) {
    root.innerHTML = `
      <div class="la-grid">
        <div class="la-main"></div>
        <div class="la-hud"></div>
        <div class="la-lb"></div>
        <div class="la-alt"></div>
      </div>
    `;
    const mainEl = root.querySelector('.la-main');
    const hudEl = root.querySelector('.la-hud');
    const lbEl = root.querySelector('.la-lb');
    const altEl = root.querySelector('.la-alt');

    function update(state) {
      const featuredName = state.directorState?.slots?.main;
      const team = (state.teams || []).find(t => t.name === featuredName);
      const lbEntry = (state.leaderboard || []).find(e => e.teamName === featuredName);
      const run = (state.activeRuns || []).find(r => r.teamName === featuredName);

      if (featuredName) {
        if (window.TwitchEmbedManager) {
          window.TwitchEmbedManager.mountInto(featuredName, mainEl, { focused: true });
        }
        ensureOverlay(mainEl, featuredName, run);
      } else {
        mainEl.innerHTML = '<div class="stream-tile-offline">No team selected</div>';
      }

      window.DungeonHud.render(hudEl, {
        team,
        run,
        rank: lbEntry?.rank ?? null,
        points: lbEntry?.points ?? 0,
      });
      window.MiniLeaderboard.render(lbEl, { leaderboard: state.leaderboard });
      window.AltCard.render(altEl, { directorState: state.directorState });
    }

    function ensureOverlay(el, teamName, run) {
      // Append tile-label/tile-keylevel directly to el (siblings of the
      // embed). A full-area overlay wrapper, even with pointer-events:none,
      // triggers Twitch's "obscured by other element" autoplay check.
      el.querySelectorAll(':scope > .tile-label, :scope > .tile-keylevel').forEach(n => n.remove());
      const escapeHtml = window.Compositor.escapeHtml;
      const dungeon = run && run.dungeonName ? ` — ${escapeHtml(run.dungeonName)}` : '';
      const label = document.createElement('div');
      label.className = 'tile-label';
      label.innerHTML = `${escapeHtml(teamName)}${dungeon}`;
      el.appendChild(label);
      if (run && run.keystoneLevel) {
        const lvl = document.createElement('div');
        lvl.className = 'tile-keylevel';
        lvl.textContent = `+${run.keystoneLevel}`;
        el.appendChild(lvl);
      }
    }

    function onRunComplete(payload) {
      window.MiniLeaderboard.flash(lbEl, payload.teamName, payload.pointsEarned);
    }

    function unmount() {
      if (window.TwitchEmbedManager) window.TwitchEmbedManager.detachAll();
    }

    return { update, unmount, onRunComplete };
  }

  window.LayoutA = { mount };
})();
