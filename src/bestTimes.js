const fs = require('fs');
const path = require('path');

const SCORES_CSV = path.join(__dirname, '..', 'data', 'wcl_scores.csv');

function computeBestTimes(rows) {
  const timed = rows.filter(r => Number(r.upgrades) > 0 && Number(r.duration_ms) > 0);
  const byDungeon = {};
  for (const r of timed) {
    const key = r.dungeon;
    if (!byDungeon[key] || Number(r.duration_ms) < byDungeon[key].duration_ms) {
      byDungeon[key] = {
        dungeon: key,
        team: r.team,
        level: Number(r.level),
        upgrades: Number(r.upgrades),
        duration_ms: Number(r.duration_ms),
      };
    }
  }
  return Object.values(byDungeon).sort((a, b) => a.duration_ms - b.duration_ms);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i]; });
    return obj;
  });
}

function readBestTimes() {
  try {
    if (!fs.existsSync(SCORES_CSV)) return [];
    const text = fs.readFileSync(SCORES_CSV, 'utf8');
    return computeBestTimes(parseCsv(text));
  } catch (err) {
    console.warn('[BestTimes] read failed:', err.message);
    return [];
  }
}

module.exports = { computeBestTimes, readBestTimes };
