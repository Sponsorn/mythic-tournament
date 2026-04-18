(function () {
  'use strict';

  function render(el, { team, run, rank, points }) {
    if (!team) {
      el.innerHTML = '<div class="hud-card hud-card--empty">No team selected</div>';
      return;
    }
    const dungeon = run ? escapeHtml(run.dungeonName || 'Starting…') : '—';
    const level = run && run.keystoneLevel ? `+${run.keystoneLevel}` : '—';
    el.innerHTML = `
      <div class="hud-card">
        <span class="hud-rank">#${rank ?? '—'}</span>
        <span class="hud-team">${escapeHtml(team.name)}</span>
        <span class="hud-dungeon">${dungeon}</span>
        <span class="hud-level">${level}</span>
        <span class="hud-points">${Number(points || 0)} pts</span>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.DungeonHud = { render };
})();
