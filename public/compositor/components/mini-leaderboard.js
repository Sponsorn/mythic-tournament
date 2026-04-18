(function () {
  'use strict';

  const FLASH_MS = 8000;
  const flashTimers = new WeakMap();

  function render(el, { leaderboard }) {
    const top = (leaderboard || []).slice(0, 3);
    const rows = top.map((e, i) => {
      const medalClass = ['gold', 'silver', 'bronze'][i] || '';
      return `
        <div class="lb-row" data-team="${escapeHtml(e.teamName)}">
          <span class="lb-rank ${medalClass}">${e.rank} ${escapeHtml(e.teamName)}</span>
          <span class="lb-points">${Number(e.points || 0)}</span>
        </div>
      `;
    }).join('');
    el.innerHTML = `
      <div class="lb-card">
        <div class="lb-card-header">Top</div>
        ${rows || '<div class="lb-empty">No scores yet</div>'}
      </div>
    `;
  }

  function flash(el, teamName, pointsEarned) {
    if (!el || !teamName) return;
    const row = el.querySelector(`.lb-row[data-team="${cssEscape(teamName)}"]`);
    if (!row) return;

    const pointsEl = row.querySelector('.lb-points');
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

  function cssEscape(s) {
    return String(s || '').replace(/["\\]/g, '\\$&');
  }
  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.MiniLeaderboard = { render, flash };
})();
