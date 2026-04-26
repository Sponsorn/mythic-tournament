(function () {
  'use strict';

  function mount(root) {
    root.innerHTML = `
      <div class="llb-wrap">
        <div class="llb-panel">
          <div class="llb-panel-header">
            <img src="/images/luckywipelogo.png" alt="" class="llb-header-logo">
            <span class="llb-header-title">Standings</span>
          </div>
          <div class="llb-rows"></div>
        </div>
      </div>
    `;
    const rowsEl = root.querySelector('.llb-rows');

    function update(state) {
      const escapeHtml = window.Compositor.escapeHtml;
      const escapeAttr = window.Compositor.escapeAttr;
      const leaderboard = (state.leaderboard || []).slice(0, 10);
      rowsEl.innerHTML = leaderboard.map(e => {
        const medal = e.rank === 1 ? 'gold' : e.rank === 2 ? 'silver' : e.rank === 3 ? 'bronze' : '';
        return `
          <div class="llb-row" data-team="${escapeAttr(e.teamName)}">
            <span class="llb-rank ${medal}">${e.rank}</span>
            <span class="llb-name">${escapeHtml(e.teamName)}</span>
            <span class="llb-runs">${e.runs ?? 0} runs</span>
            <span class="llb-points">${Number(e.points || 0)}</span>
          </div>
        `;
      }).join('');
    }

    const flashTimers = new WeakMap();
    function onRunComplete(payload) {
      const cssEscape = window.Compositor.cssEscape;
      const row = rowsEl.querySelector(`.llb-row[data-team="${cssEscape(payload.teamName)}"]`);
      if (!row) return;
      const pointsEl = row.querySelector('.llb-points');
      if (pointsEl && payload.pointsEarned) {
        const existing = pointsEl.querySelector('.delta-badge');
        if (existing) existing.remove();
        const badge = document.createElement('span');
        badge.className = 'delta-badge';
        badge.textContent = `+${payload.pointsEarned}`;
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
      }, 8000);
      flashTimers.set(row, t);
    }

    function unmount() {
      if (window.TwitchEmbedManager) window.TwitchEmbedManager.detachAll();
    }

    return { update, unmount, onRunComplete };
  }

  window.LayoutLB = { mount };
})();
