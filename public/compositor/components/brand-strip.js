(function () {
  'use strict';

  function formatRemaining(ms) {
    const totalMin = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    if (hours >= 1) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    return `${minutes}m`;
  }

  function formatHHMM(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--:--';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function renderAt(el, { tournamentStartSE, tournamentEndSE, title, now }) {
    const hasSchedule = tournamentStartSE && tournamentEndSE;
    let label, fillClass, widthPct;

    if (!hasSchedule) {
      label = 'Schedule not set';
      fillClass = 'brand-progress-fill--idle';
      widthPct = 0;
    } else {
      const start = Date.parse(tournamentStartSE);
      const end = Date.parse(tournamentEndSE);
      if (now < start) {
        label = `Starts in ${formatRemaining(start - now)}`;
        fillClass = 'brand-progress-fill--pre';
        const sixH = 6 * 60 * 60 * 1000;
        widthPct = Math.max(0, Math.min(100, ((sixH - (start - now)) / sixH) * 100));
      } else if (now < end) {
        label = `${formatRemaining(end - now)} remaining`;
        fillClass = 'brand-progress-fill--live';
        widthPct = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
      } else {
        label = 'Event ended';
        fillClass = 'brand-progress-fill--post';
        widthPct = 100;
      }
    }

    const rightText = hasSchedule
      ? `${formatHHMM(tournamentStartSE)} → ${formatHHMM(tournamentEndSE)}`
      : '';

    el.innerHTML = `
      <img src="/images/luckywipelogo.png" alt="" class="brand-logo">
      <span class="brand-title">${window.Compositor.escapeHtml(title || 'M+ Tournament')}</span>
      <div class="brand-progress">
        <div class="brand-progress-fill ${fillClass}" style="width: ${widthPct.toFixed(1)}%"></div>
        <div class="brand-progress-label">${window.Compositor.escapeHtml(label)}</div>
      </div>
      <span class="brand-time-right">${window.Compositor.escapeHtml(rightText)}</span>
    `;
  }

  function render(el, { directorState }) {
    renderAt(el, {
      tournamentStartSE: directorState?.tournamentContext?.startSE || '',
      tournamentEndSE: directorState?.tournamentContext?.endSE || '',
      title: directorState?.tournamentContext?.title || 'M+ Tournament',
      now: Date.now(),
    });
  }

  window.BrandStrip = { render, renderAt };
})();
