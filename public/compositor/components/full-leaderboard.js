(function () {
  'use strict';

  const FLASH_MS = 8000;
  const flashTimers = new WeakMap();

  function render(el, { leaderboard, title, showRuns }) {
    const escapeHtml = window.Compositor.escapeHtml;
    const escapeAttr = window.Compositor.escapeAttr;
    const rows = (leaderboard || []).map((e) => {
      const medalClass = e.rank === 1 ? 'gold' : e.rank === 2 ? 'silver' : e.rank === 3 ? 'bronze' : '';
      const runs = showRuns ? `<span class="flb-runs">${e.runs ?? 0} runs</span>` : '';
      return `
        <div class="flb-row" data-team="${escapeAttr(e.teamName)}">
          <span class="flb-rank ${medalClass}">${e.rank}</span>
          <span class="flb-name">${escapeHtml(e.teamName)}</span>
          ${runs}
          <span class="flb-points">${Number(e.points || 0)}</span>
        </div>
      `;
    }).join('');
    el.innerHTML = `
      <div class="flb-card">
        <div class="flb-header">${escapeHtml(title || 'Standings')}</div>
        <div class="flb-rows">${rows || '<div class="flb-empty">No scores yet</div>'}</div>
      </div>
    `;
  }

  function flash(el, teamName, pointsEarned) {
    if (!el || !teamName) return;
    const cssEscape = window.Compositor.cssEscape;
    const row = el.querySelector(`.flb-row[data-team="${cssEscape(teamName)}"]`);
    if (!row) return;

    const pointsEl = row.querySelector('.flb-points');
    if (pointsEl && pointsEarned) {
      const existing = pointsEl.querySelector('.delta-badge');
      if (existing) existing.remove();
      const badge = document.createElement('span');
      badge.className = 'delta-badge';
      badge.textContent = `+${pointsEarned}`;
      pointsEl.appendChild(badge);
    }

    row.classList.add('flash');
    const prev = flashTimers.get(row);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      row.classList.remove('flash');
      const b = row.querySelector('.delta-badge');
      if (b) b.remove();
      flashTimers.delete(row);
    }, FLASH_MS);
    flashTimers.set(row, t);
  }

  window.FullLeaderboard = { render, flash };
})();
