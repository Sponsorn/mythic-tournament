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

// Bracket-based scoring tables
// Keys are key levels, values are { 1: points, 2: points, 3: points } for +1/+2/+3 upgrades
const BRACKET_A = {
  10: { 1: 1, 2: 2, 3: 3 },
  11: { 1: 2, 2: 3, 3: 4 },
  12: { 1: 8, 2: 9, 3: 10 },
  13: { 1: 11, 2: 12, 3: 13 },
  14: { 1: 14, 2: 15, 3: 16 },
  15: { 1: 20, 2: 21, 3: 22 },
  16: { 1: 23, 2: 24, 3: 25 },
  // 17+ not defined yet
};

const BRACKET_B = {
  10: { 1: 0, 2: 0, 3: 0 },
  11: { 1: 0, 2: 1, 3: 2 },
  12: { 1: 1, 2: 2, 3: 3 },
  13: { 1: 2, 2: 3, 3: 4 },
  14: { 1: 8, 2: 9, 3: 10 },
  15: { 1: 11, 2: 12, 3: 13 },
  16: { 1: 14, 2: 15, 3: 16 },
  17: { 1: 20, 2: 21, 3: 22 },
  18: { 1: 23, 2: 24, 3: 25 },
  // 19+ not defined yet
};

const BRACKET_C = {
  10: { 1: 0, 2: 0, 3: 0 },
  11: { 1: 0, 2: 0, 3: 0 },
  12: { 1: 0, 2: 0, 3: 0 },
  13: { 1: 0, 2: 0, 3: 1 },
  14: { 1: 2, 2: 3, 3: 4 },
  15: { 1: 5, 2: 6, 3: 7 },
  16: { 1: 8, 2: 9, 3: 10 },
  17: { 1: 14, 2: 15, 3: 16 },
  18: { 1: 17, 2: 18, 3: 19 },
  19: { 1: 26, 2: 28, 3: 30 },
  20: { 1: 32, 2: 34, 3: 36 },
  // 21+ not defined yet
};

const BRACKETS = {
  A: BRACKET_A,
  B: BRACKET_B,
  C: BRACKET_C,
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
 * @param {string} bracket - Team bracket ('A', 'B', or 'C'), defaults to 'A'
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

module.exports = {
  calcUpgradesFromPar,
  pointsFor,
  getValidBrackets,
  BRACKETS,
  DUNGEON_PAR_MS,
};
