const DUNGEON_PAR_MS = {
  'eco-dome-aldani': 1860000, // 31:00
  'ara-kara-city-of-echoes': 1800000, // 30:00
  'the-dawnbreaker': 1860000, // 31:00
  'priory-of-the-sacred-flame': 1950000, // 32:30
  'operation-floodgate': 1980000, // 33:00
  'halls-of-atonement': 1920000, // 32:00
  'tazavesh-streets-of-wonder': 2100000, // 35:00
  'tazavesh-soleahs-gambit': 1800000, // 30:00
};

const POINTS_MAP = {
  10: { 1: 1, 2: 2, 3: 3 },
  11: { 1: 3, 2: 4, 3: 5 },
  12: { 1: 5, 2: 6, 3: 7 },
  13: { 1: 7, 2: 9, 3: 10 },
  14: { 1: 9, 2: 11, 3: 12 },
  15: { 1: 12, 2: 14, 3: 15 },
  16: { 1: 15, 2: 17, 3: 19 },
  17: { 1: 18, 2: 20, 3: 22 },
  18: { 1: 21, 2: 23, 3: 26 },
  19: { 1: 24, 2: 27, 3: 30 },
  20: { 1: 28, 2: 31, 3: 35 },
};

const EPS_MS = 500;

function slugifyDungeon(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/['`]/g, "'")
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function calcUpgradesFromPar(dungeonName, clearMs) {
  const slug = slugifyDungeon(dungeonName);
  const par = DUNGEON_PAR_MS[slug];
  if (!par || clearMs <= 0) {
    return { inTime: false, upgrades: 0 };
  }

  if (clearMs > par + EPS_MS) {
    return { inTime: false, upgrades: 0 };
  }

  const ratio = clearMs / par;
  if (ratio <= 0.6) return { inTime: true, upgrades: 3 };
  if (ratio <= 0.8) return { inTime: true, upgrades: 2 };
  return { inTime: true, upgrades: 1 };
}

function pointsFor(level, upgrades, inTime) {
  if (!inTime) return 0;
  return Number(POINTS_MAP[Number(level)]?.[Number(upgrades)] || 0);
}

module.exports = {
  calcUpgradesFromPar,
  pointsFor,
};
