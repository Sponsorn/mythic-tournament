function normalizeRealmSlug(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw
    .replace(/['`]/g, "'")
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function formatLocalTime(isoStr, timeZone) {
  if (!isoStr) return '';
  try {
    const dt = new Date(isoStr);
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return fmt.format(dt).replace(',', '');
  } catch (err) {
    return '';
  }
}

function formatTable(headers, rows) {
  const widths = headers.map(h => String(h).length);
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i], String(cell).length);
    });
  }
  const pad = (value, width) => String(value).padEnd(width, ' ');
  const headerLine = headers.map((h, i) => pad(h, widths[i])).join(' | ');
  const sepLine = widths.map(w => '-'.repeat(w)).join('-|-');
  const rowLines = rows.map(row => row.map((c, i) => pad(c, widths[i])).join(' | '));
  return [headerLine, sepLine, ...rowLines].join('\n');
}

module.exports = {
  normalizeRealmSlug,
  formatLocalTime,
  formatTable,
};
