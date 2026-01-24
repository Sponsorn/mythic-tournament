/**
 * Shared frontend utility functions for tournament overlays and admin.
 */

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function formatTime(ms) {
  if (!ms || ms < 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function getTimerClass(elapsed, parTime) {
  if (!parTime) return '';
  const ratio = elapsed / parTime;
  if (ratio >= 1) return 'overtime';
  if (ratio >= 0.9) return 'warning';
  return '';
}

function formatNumber(num) {
  return (num || 0).toLocaleString();
}
