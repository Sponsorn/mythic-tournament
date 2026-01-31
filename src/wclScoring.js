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

const DUNGEON_SHORT_NAMES = {
  'eco-dome-aldani': 'EDA',
  'ara-kara-city-of-echoes': 'ARA',
  'the-dawnbreaker': 'DAWN',
  'priory-of-the-sacred-flame': 'PSF',
  'operation-floodgate': 'FLOOD',
  'halls-of-atonement': 'HOA',
  'tazavesh-streets-of-wonder': 'STRT',
  'tazavesh-soleahs-gambit': 'GMBT',
};

// Bracket-based scoring tables
// Keys are key levels, values are { 1: points, 2: points, 3: points } for +1/+2/+3 upgrades
const BRACKET_A = {
  14: { 1: 1, 2: 2, 3: 3 },
  15: { 1: 3, 2: 4, 3: 5 },
  16: { 1: 5, 2: 6, 3: 7 },
  17: { 1: 7, 2: 8, 3: 9 },
  18: { 1: 9, 2: 10, 3: 11 },
  19: { 1: 11, 2: 12, 3: 13 },
  20: { 1: 13, 2: 14, 3: 15 },
  21: { 1: 15, 2: 16, 3: 17 },
  22: { 1: 0, 2: 0, 3: 0 },
  23: { 1: 0, 2: 0, 3: 0 },
  24: { 1: 0, 2: 0, 3: 0 },
  25: { 1: 0, 2: 0, 3: 0 },
};

const BRACKET_B = {
  14: { 1: 0, 2: 0, 3: 1 },
  15: { 1: 1, 2: 2, 3: 3 },
  16: { 1: 3, 2: 4, 3: 5 },
  17: { 1: 5, 2: 6, 3: 7 },
  18: { 1: 7, 2: 8, 3: 9 },
  19: { 1: 9, 2: 10, 3: 11 },
  20: { 1: 11, 2: 12, 3: 13 },
  21: { 1: 13, 2: 14, 3: 15 },
  22: { 1: 15, 2: 16, 3: 17 },
  23: { 1: 0, 2: 0, 3: 0 },
  24: { 1: 0, 2: 0, 3: 0 },
  25: { 1: 0, 2: 0, 3: 0 },
};

const BRACKET_C = {
  14: { 1: 0, 2: 0, 3: 1 },
  15: { 1: 0, 2: 0, 3: 1 },
  16: { 1: 1, 2: 2, 3: 3 },
  17: { 1: 3, 2: 4, 3: 5 },
  18: { 1: 5, 2: 6, 3: 7 },
  19: { 1: 7, 2: 8, 3: 9 },
  20: { 1: 9, 2: 10, 3: 11 },
  21: { 1: 11, 2: 12, 3: 13 },
  22: { 1: 13, 2: 14, 3: 15 },
  23: { 1: 15, 2: 16, 3: 17 },
  24: { 1: 0, 2: 0, 3: 0 },
  25: { 1: 0, 2: 0, 3: 0 },
};

const BRACKET_D = {
  14: { 1: 0, 2: 0, 3: 1 },
  15: { 1: 0, 2: 0, 3: 1 },
  16: { 1: 0, 2: 0, 3: 1 },
  17: { 1: 1, 2: 2, 3: 3 },
  18: { 1: 3, 2: 4, 3: 5 },
  19: { 1: 5, 2: 6, 3: 7 },
  20: { 1: 7, 2: 8, 3: 9 },
  21: { 1: 9, 2: 10, 3: 11 },
  22: { 1: 11, 2: 12, 3: 13 },
  23: { 1: 13, 2: 14, 3: 15 },
  24: { 1: 15, 2: 16, 3: 17 },
  25: { 1: 0, 2: 0, 3: 0 },
};

const BRACKETS = {
  A: BRACKET_A,
  B: BRACKET_B,
  C: BRACKET_C,
  D: BRACKET_D,
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

/**
 * Calculate points for a run based on bracket, level, and upgrades
 * @param {number} level - Keystone level
 * @param {number} upgrades - Number of upgrades (1, 2, or 3)
 * @param {boolean} inTime - Whether the run was completed in time
 * @param {string} bracket - Team bracket ('A', 'B', 'C', or 'D'), defaults to 'A'
 * @returns {number} Points earned
 */
function pointsFor(level, upgrades, inTime, bracket = 'A') {
  if (!inTime) return 0;

  const bracketTable = BRACKETS[String(bracket).toUpperCase()] || BRACKET_A;
  const levelPoints = bracketTable[Number(level)];

  if (!levelPoints) return 0;
  return Number(levelPoints[Number(upgrades)] || 0);
}

/**
 * Get valid bracket values
 * @returns {string[]} Array of valid bracket letters
 */
function getValidBrackets() {
  return Object.keys(BRACKETS);
}

/**
 * Get short name for a dungeon
 * @param {string} dungeonName - Full dungeon name
 * @returns {string} Short name or abbreviated original
 */
function getShortDungeonName(dungeonName) {
  const slug = slugifyDungeon(dungeonName);
  return DUNGEON_SHORT_NAMES[slug] || dungeonName.substring(0, 4).toUpperCase();
}

module.exports = {
  calcUpgradesFromPar,
  pointsFor,
  getValidBrackets,
  getShortDungeonName,
  slugifyDungeon,
  BRACKETS,
  DUNGEON_PAR_MS,
  DUNGEON_SHORT_NAMES,
};
