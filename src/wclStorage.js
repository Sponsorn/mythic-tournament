const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const WCL_JSON = path.join(DATA_DIR, 'wcl.json');
const WCL_SCORES = path.join(DATA_DIR, 'wcl_scores.csv');

const DEFAULT_DATA = {
  teams: [],
  seenWcl: [],
  leaderboardWcl: {},
  wclMeta: {},
};

const SCORE_HEADER = [
  'finished_at_realm',
  'team',
  'dungeon',
  'level',
  'upgrades',
  'blizz_rating',
  'in_time',
  'points',
  'deaths',
  'duration_ms',
  'boss_kills',
  'character',
  'realm',
  'region',
];

let cache = null;
let saving = false;

const VALID_BRACKETS = ['A', 'B', 'C', 'D'];

function ensureTeamDefaults(team) {
  const bracket = String(team?.bracket || 'A').toUpperCase();
  return {
    team_name: team?.team_name || '',
    leader_name: team?.leader_name || '',
    wcl_url: team?.wcl_url || '',
    wcl_backup_url: team?.wcl_backup_url || '',
    team_number: Number.isFinite(Number(team?.team_number)) ? Number(team.team_number) : null,
    bracket: VALID_BRACKETS.includes(bracket) ? bracket : 'A',
  };
}

function ensureFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(WCL_JSON)) {
    fs.writeFileSync(WCL_JSON, JSON.stringify(DEFAULT_DATA, null, 2), 'utf8');
  }
  if (!fs.existsSync(WCL_SCORES)) {
    fs.writeFileSync(WCL_SCORES, `${SCORE_HEADER.join(',')}\n`, 'utf8');
  }
}

function loadData() {
  ensureFiles();
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(WCL_JSON, 'utf8');
    cache = JSON.parse(raw);
  } catch (err) {
    cache = { ...DEFAULT_DATA };
  }
  cache.teams = Array.isArray(cache.teams)
    ? cache.teams.map(team => ensureTeamDefaults(team))
    : [];
  cache.seenWcl = Array.isArray(cache.seenWcl) ? cache.seenWcl : [];
  cache.leaderboardWcl = cache.leaderboardWcl || {};
  cache.wclMeta = cache.wclMeta || {};
  return cache;
}

function saveData() {
  if (!cache) return;
  if (saving) {
    console.warn('[Storage] Re-entrant write detected, skipping');
    return;
  }
  saving = true;
  try {
    fs.writeFileSync(WCL_JSON, JSON.stringify(cache, null, 2), 'utf8');
  } finally {
    saving = false;
  }
}

function reloadData() {
  cache = null;
  return loadData();
}

function getTeams() {
  return loadData().teams;
}

function findTeam(teamName) {
  const data = loadData();
  const key = String(teamName || '').toLowerCase();
  return data.teams.find(t => String(t.team_name || '').toLowerCase() === key) || null;
}

function findTeamByNumber(teamNumber) {
  const data = loadData();
  const target = Number(teamNumber);
  return (
    data.teams.find(t => Number(t.team_number) === target) || null
  );
}

function upsertTeam({ teamName, leaderName, wclUrl, wclBackupUrl }) {
  const data = loadData();
  const key = String(teamName || '').toLowerCase();
  const existing = data.teams.find(t => String(t.team_name || '').toLowerCase() === key);
  if (existing) {
    existing.team_name = teamName;
    existing.leader_name = leaderName || existing.leader_name || '';
    existing.wcl_url = wclUrl || '';
    existing.wcl_backup_url = wclBackupUrl || '';
    if (!Number.isFinite(Number(existing.team_number))) {
      existing.team_number = nextTeamNumber(data.teams);
    }
    saveData();
    return { status: 'updated', team: existing };
  }
  const team = ensureTeamDefaults({
    team_name: teamName,
    leader_name: leaderName || '',
    wcl_url: wclUrl || '',
    wcl_backup_url: wclBackupUrl || '',
  });
  if (!Number.isFinite(Number(team.team_number))) {
    team.team_number = nextTeamNumber(data.teams);
  }
  data.teams.push(team);
  saveData();
  return { status: 'created', team };
}

function updateTeam({ teamName, teamNumber, leaderName, wclUrl, wclBackupUrl, bracket }) {
  const data = loadData();
  let target = null;
  if (Number.isFinite(Number(teamNumber))) {
    target = data.teams.find(t => Number(t.team_number) === Number(teamNumber)) || null;
  }
  if (!target && teamName) {
    const key = String(teamName || '').toLowerCase();
    target = data.teams.find(t => String(t.team_name || '').toLowerCase() === key) || null;
  }
  if (!target) return { status: 'missing', team: null };
  target.team_name = teamName || target.team_name;
  target.leader_name = leaderName ?? target.leader_name;
  target.wcl_url = wclUrl ?? target.wcl_url;
  target.wcl_backup_url = wclBackupUrl ?? target.wcl_backup_url;
  if (bracket !== undefined) {
    const bracketUpper = String(bracket || 'A').toUpperCase();
    target.bracket = VALID_BRACKETS.includes(bracketUpper) ? bracketUpper : target.bracket;
  }
  saveData();
  return { status: 'updated', team: target };
}

function nextTeamNumber(teams) {
  const used = new Set(
    (teams || [])
      .map(t => Number(t.team_number))
      .filter(n => Number.isFinite(n) && n > 0)
  );
  let n = 1;
  while (used.has(n)) n += 1;
  return n;
}

function setTeamNumber(teamName, teamNumber) {
  const data = loadData();
  const key = String(teamName || '').toLowerCase();
  const existing = data.teams.find(t => String(t.team_name || '').toLowerCase() === key);
  if (!existing) return { status: 'missing', team: null };
  const nextNum = Number(teamNumber);
  const conflict = data.teams.find(
    t =>
      String(t.team_name || '').toLowerCase() !== key &&
      Number(t.team_number) === nextNum
  );
  if (conflict) {
    const fallback = nextTeamNumber(data.teams);
    existing.team_number = fallback;
    saveData();
    return { status: 'conflict', team: existing, conflict, fallback };
  }
  existing.team_number = nextNum;
  saveData();
  return { status: 'updated', team: existing };
}

function saveTeams(teams) {
  const data = loadData();
  data.teams = Array.isArray(teams) ? teams.map(team => ensureTeamDefaults(team)) : [];
  saveData();
}


function listTeams() {
  return getTeams();
}

function getSeenWcl() {
  return new Set(loadData().seenWcl || []);
}

function saveSeenWcl(seenSet) {
  const data = loadData();
  data.seenWcl = Array.from(seenSet);
  saveData();
}

function updateLeaderboardWcl(team, points) {
  const data = loadData();
  const key = String(team || '');
  data.leaderboardWcl[key] = Number(data.leaderboardWcl[key] || 0) + Number(points || 0);
  saveData();
}

function readLeaderboardWcl() {
  const data = loadData();
  return data.leaderboardWcl || {};
}

function renameTeamInLeaderboard(oldName, newName) {
  const data = loadData();
  const oldKey = String(oldName || '');
  const newKey = String(newName || '');
  if (oldKey === newKey || !oldKey || !newKey) return false;

  // Rename in leaderboard
  if (data.leaderboardWcl && data.leaderboardWcl[oldKey] !== undefined) {
    data.leaderboardWcl[newKey] = data.leaderboardWcl[oldKey];
    delete data.leaderboardWcl[oldKey];
  }

  // Rename in wclMeta
  if (data.wclMeta && data.wclMeta[oldKey] !== undefined) {
    data.wclMeta[newKey] = data.wclMeta[oldKey];
    delete data.wclMeta[oldKey];
  }

  saveData();
  return true;
}

function readWclMeta() {
  const data = loadData();
  return data.wclMeta || {};
}

function updateWclMeta(team, tsIso) {
  const data = loadData();
  const key = String(team || '');
  const cur = data.wclMeta[key] || { runs: 0, last: null };
  cur.runs = Number(cur.runs || 0) + 1;
  try {
    if (tsIso) {
      const next = new Date(tsIso);
      const prev = cur.last ? new Date(cur.last) : null;
      if (!prev || next > prev) {
        cur.last = tsIso;
      }
    }
  } catch (err) {
    cur.last = tsIso || cur.last;
  }
  data.wclMeta[key] = cur;
  saveData();
}

function csvEscape(value) {
  let str = String(value ?? '');
  // Prevent CSV formula injection
  if (/^[=+\-@]/.test(str)) {
    str = "'" + str;
  }
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeScoreRow(row) {
  ensureFiles();
  const line = SCORE_HEADER.map(key => csvEscape(row[key])).join(',');
  fs.appendFileSync(WCL_SCORES, `${line}\n`, 'utf8');
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && inQuotes && line[i + 1] === '"') {
      cur += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function readScores() {
  if (!fs.existsSync(WCL_SCORES)) return [];
  const raw = fs.readFileSync(WCL_SCORES, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];
  return lines.slice(1).map(parseCsvLine);
}

function readScoresAsObjects() {
  if (!fs.existsSync(WCL_SCORES)) return [];
  const raw = fs.readFileSync(WCL_SCORES, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return [];

  return lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const obj = {};
    SCORE_HEADER.forEach((key, i) => {
      obj[key] = values[i] || '';
    });
    // Parse numeric fields
    obj.level = parseInt(obj.level, 10) || 0;
    obj.upgrades = parseInt(obj.upgrades, 10) || 0;
    obj.blizz_rating = parseInt(obj.blizz_rating, 10) || 0;
    obj.in_time = obj.in_time === '1' || obj.in_time === 'true';
    obj.points = parseInt(obj.points, 10) || 0;
    obj.deaths = parseInt(obj.deaths, 10) || 0;
    obj.duration_ms = parseInt(obj.duration_ms, 10) || 0;
    // Parse boss_kills as JSON array (e.g., "[120000,300000,450000]")
    try {
      obj.boss_kills = obj.boss_kills ? JSON.parse(obj.boss_kills) : [];
    } catch (err) {
      obj.boss_kills = [];
    }
    return obj;
  });
}

function getBestRunsPerDungeon(dungeonFilter = null) {
  const scores = readScoresAsObjects();
  const dungeons = {};

  for (const run of scores) {
    if (!run.dungeon || !run.in_time) continue;
    if (dungeonFilter && run.dungeon !== dungeonFilter) continue;

    if (!dungeons[run.dungeon]) {
      dungeons[run.dungeon] = [];
    }
    dungeons[run.dungeon].push(run);
  }

  // Sort each dungeon's runs by level desc, then by duration asc
  // Higher key level is always better (more points), then faster time wins
  for (const dungeon of Object.keys(dungeons)) {
    dungeons[dungeon].sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      return a.duration_ms - b.duration_ms;
    });
  }

  return dungeons;
}

function getAllDungeonNames() {
  const scores = readScoresAsObjects();
  const names = new Set();
  for (const run of scores) {
    if (run.dungeon) {
      names.add(run.dungeon);
    }
  }
  return Array.from(names).sort();
}

module.exports = {
  ensureFiles,
  reloadData,
  getTeams,
  findTeam,
  findTeamByNumber,
  upsertTeam,
  updateTeam,
  setTeamNumber,
  saveTeams,
  listTeams,
  getSeenWcl,
  saveSeenWcl,
  updateLeaderboardWcl,
  readLeaderboardWcl,
  renameTeamInLeaderboard,
  readWclMeta,
  updateWclMeta,
  writeScoreRow,
  readScores,
  readScoresAsObjects,
  getBestRunsPerDungeon,
  getAllDungeonNames,
  SCORE_HEADER,
};
