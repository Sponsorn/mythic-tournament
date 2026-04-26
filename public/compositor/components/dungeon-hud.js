(function () {
  'use strict';

  function render(el, { team, run, rank, points }) {
    if (!team) {
      el.innerHTML = '<div class="hud-card hud-card--empty">No team selected</div>';
      return;
    }
    const dungeon = run ? window.Compositor.escapeHtml(run.dungeonName || 'Starting…') : '—';
    const level = run && run.keystoneLevel ? `+${run.keystoneLevel}` : '—';
    el.innerHTML = `
      <div class="hud-card">
        <span class="hud-rank">${rank != null ? '#' + rank : '—'}</span>
        <span class="hud-team">${window.Compositor.escapeHtml(team.name)}</span>
        <span class="hud-dungeon">${dungeon}</span>
        <span class="hud-level">${level}</span>
        <span class="hud-points">${Number(points || 0)} pts</span>
      </div>
    `;
  }

  window.DungeonHud = { render };
})();
