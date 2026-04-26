(function () {
  'use strict';

  function mount(root) {
    root.innerHTML = `
      <div class="la-grid">
        <div class="la-top">
          <div class="la-main"></div>
          <div class="la-sidebar"></div>
        </div>
        <div class="la-bottom">
          <div class="la-hud"></div>
          <div class="la-info"></div>
          <div class="la-alt"></div>
        </div>
      </div>
    `;
    const mainEl = root.querySelector('.la-main');
    const sidebarEl = root.querySelector('.la-sidebar');
    const hudEl = root.querySelector('.la-hud');
    const infoEl = root.querySelector('.la-info');
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

      window.FullLeaderboard.render(sidebarEl, {
        leaderboard: state.leaderboard,
        title: 'Standings',
        showRuns: true,
      });

      window.DungeonHud.render(hudEl, {
        team,
        run,
        rank: lbEntry?.rank ?? null,
        points: lbEntry?.points ?? 0,
      });

      renderInfobox(infoEl, state.directorState);

      window.AltCard.render(altEl, { directorState: state.directorState });
    }

    function renderInfobox(el, directorState) {
      // Admin-provided HTML; trust boundary is the /api/director auth gate
      // (unauthenticated in Phase 1, tightened in Phase 2).
      const html = (directorState && directorState.infoboxHtml) || '';
      el.innerHTML = `
        <div class="info-card">
          <div class="info-card-header">Info</div>
          <div class="info-card-body">${html || '<div class="info-empty">No info set</div>'}</div>
        </div>
      `;
    }

    function ensureOverlay(el, teamName, run) {
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
      window.FullLeaderboard.flash(sidebarEl, payload.teamName, payload.pointsEarned);
    }

    function unmount() {
      if (window.TwitchEmbedManager) window.TwitchEmbedManager.detachAll();
    }

    return { update, unmount, onRunComplete };
  }

  window.LayoutA = { mount };
})();
