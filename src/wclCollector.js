const {
  wclExtractCode,
  wclFetchReportMplusFights,
  wclFetchBossKillTimes,
  wclCountDeathsForFight,
  makeAbsMs,
} = require('./wclApi');
const { calcUpgradesFromPar, pointsFor, DUNGEON_PAR_MS, slugifyDungeon } = require('./wclScoring');
const {
  getTeams,
  getSeenWcl,
  saveSeenWcl,
  updateLeaderboardWcl,
  updateWclMeta,
  writeScoreRow,
} = require('./wclStorage');
const {
  REALM_TZ,
  EVENT_START_SE,
  EVENT_END_SE,
  EVENT_ENFORCE_WINDOW,
  WCL_REQUIRE_KILL,
  MPLUS_DEATH_PENALTY_LT12,
  MPLUS_DEATH_PENALTY_GE12,
  MPLUS_START_OFFSET_MS,
} = require('./config');
const { parseLocalDateTime, formatTimerMs } = require('./timeUtils');

/**
 * Parses event window from environment configuration
 * @returns {{start: Date|null, end: Date|null}}
 */
function parseEventWindow() {
  try {
    const startIso = EVENT_START_SE ? parseLocalDateTime(EVENT_START_SE, REALM_TZ) : null;
    const endIso = EVENT_END_SE ? parseLocalDateTime(EVENT_END_SE, REALM_TZ) : null;
    return {
      start: startIso ? new Date(startIso) : null,
      end: endIso ? new Date(endIso) : null,
    };
  } catch (err) {
    console.warn(`[WCL] Failed to parse event window: ${err.message || err}`);
    return { start: null, end: null };
  }
}

function collectCodes(team) {
  const codes = [];
  for (const field of ['wcl_url', 'wcl_backup_url']) {
    const code = wclExtractCode(team?.[field]);
    if (code) codes.push(code);
  }
  return Array.from(new Set(codes));
}

function teamNumber(teamName, teams) {
  const idx = teams.findIndex(
    t => String(t.team_name || '').toLowerCase() === String(teamName || '').toLowerCase()
  );
  if (idx < 0) return null;
  const team = teams[idx];
  const num = Number(team?.team_number);
  return Number.isFinite(num) && num > 0 ? num : idx + 1;
}

async function collectRunsAndSync() {
  const publicMsgs = [];
  const privateMsgs = [];
  const completedRuns = []; // Track completed runs to clear active status
  const window = parseEventWindow();

  const teams = getTeams();
  if (!teams.length) return { publicMsgs, privateMsgs, newCount: 0, completedRuns };

  const seen = getSeenWcl();
  const newSeen = new Set();
  let added = 0;

  for (const team of teams) {
    const teamName = team.team_name || 'Unknown';
    const codes = collectCodes(team);
    if (!codes.length) {
      privateMsgs.push(`[WCL Info] team=${teamName} has no report codes`);
      continue;
    }

    for (const code of codes) {
      let report;
      let fights;
      try {
        const res = await wclFetchReportMplusFights(code);
        report = res.report;
        fights = res.fights;
      } catch (err) {
        privateMsgs.push(`[WCL] ${teamName}: failed ${code}: ${err.message || err}`);
        continue;
      }

      privateMsgs.push(`[WCL Info] team=${teamName} code=${code} fights=${fights.length}`);
      const repStart = Number(report.startTime || 0);

      for (const fight of fights) {
        const lvl = Number(fight.keystoneLevel || 0);
        if (!lvl) continue;
        if (WCL_REQUIRE_KILL && !fight.kill) {
          privateMsgs.push(
            `[WCL Info] cancelled run from team=${teamName} name=${fight.name} lvl=${lvl} id=${fight.id}`
          );
          continue;
        }

        const stAbs = makeAbsMs(repStart, fight.startTime || 0);
        const enAbs = makeAbsMs(repStart, fight.endTime || 0);
        if (enAbs <= stAbs) {
          privateMsgs.push(`[WCL Info] skip bad times id=${fight.id} st=${stAbs} en=${enAbs}`);
          continue;
        }

        if (EVENT_ENFORCE_WINDOW && window.start && window.end) {
          if (stAbs < window.start.getTime() || stAbs > window.end.getTime()) {
            privateMsgs.push(
              `[WCL Info] ${teamName} started run outside of event window id=${fight.id}`
            );
            continue;
          }
        }

        // Dedupe by team + dungeon + level + end time (rounded to nearest minute)
        // This prevents the same run from being imported multiple times if it appears
        // in different WCL reports (e.g., primary and backup codes pointing to same runs)
        const endMinute = Math.floor(enAbs / 60000);
        const dedupe = `team:${teamName}:${fight.name}:${lvl}:${endMinute}`;
        if (seen.has(dedupe) || newSeen.has(dedupe)) {
          privateMsgs.push(`[WCL Info] skip duplicate run: ${fight.name} +${lvl} (team=${teamName})`);
          continue;
        }

        let deaths = 0;
        try {
          deaths = await wclCountDeathsForFight(code, fight.id);
        } catch (err) {
          console.warn(`[WCL] Failed to fetch death count for ${teamName} fight=${fight.id}: ${err.message || err}`);
          deaths = 0;
        }

        // Fetch boss kill times
        let bossKills = [];
        try {
          bossKills = await wclFetchBossKillTimes(code, fight.id, fight.startTime || 0);
        } catch (err) {
          console.warn(`[WCL] Failed to fetch boss kills for ${teamName} fight=${fight.id}: ${err.message || err}`);
          bossKills = [];
        }

        let adjustedClearMs;
        const keystoneTime = Number(fight.keystoneTime || 0);
        if (keystoneTime > 0) {
          adjustedClearMs = keystoneTime;
        } else {
          const clearMs = Math.max(0, enAbs - stAbs - MPLUS_START_OFFSET_MS);
          const penaltySec = lvl < 12 ? MPLUS_DEATH_PENALTY_LT12 : MPLUS_DEATH_PENALTY_GE12;
          adjustedClearMs = clearMs + Math.max(0, deaths) * Number(penaltySec) * 1000;
        }

        let upgrades = 0;
        let inTime = false;
        if (Number.isFinite(fight.keystoneBonus)) {
          upgrades = Number(fight.keystoneBonus);
          inTime = upgrades > 0;
        } else {
          const par = calcUpgradesFromPar(fight.name, adjustedClearMs);
          upgrades = par.upgrades;
          inTime = par.inTime;
        }

        const blizzRating = Number.isFinite(fight.rating)
          ? Math.round(Number(fight.rating))
          : 0;
        const teamBracket = team.bracket || 'A';
        const points = pointsFor(lvl, upgrades, inTime, teamBracket);

        const dtEnd = new Date(enAbs);
        updateWclMeta(teamName, dtEnd.toISOString());
        newSeen.add(dedupe);
        added += 1;

        if (points > 0) {
          updateLeaderboardWcl(teamName, points);
        }

        writeScoreRow({
          finished_at_realm: dtEnd.toISOString(),
          team: teamName,
          dungeon: fight.name,
          level: lvl,
          upgrades,
          blizz_rating: blizzRating,
          in_time: inTime ? 1 : 0,
          points,
          deaths: Number(deaths || 0),
          duration_ms: adjustedClearMs,
          boss_kills: JSON.stringify(bossKills),
          character: '',
          realm: '',
          region: '',
        });

        const timerStr = formatTimerMs(adjustedClearMs);
        const num = teamNumber(teamName, teams);
        const teamLabel = num ? `${teamName} (Team ${num})` : teamName;
        const upgLabel = inTime ? `+${upgrades}` : 'depleted';

        // Track completed run for clearing active status
        const dungeonSlug = slugifyDungeon(fight.name);
        completedRuns.push({
          teamName,
          dungeonName: fight.name,
          keystoneLevel: lvl,
          duration: adjustedClearMs,
          parTime: DUNGEON_PAR_MS[dungeonSlug] || 1800000,
          inTime,
          upgrades,
          deaths,
          points,
          blizzRating: blizzRating,
          completedAt: dtEnd.toISOString(),
        });

        privateMsgs.push(
          `${teamLabel} completed ${fight.name} +${lvl}, ${upgLabel}, timer: ${timerStr}, points: ${points}`
        );
        publicMsgs.push(`A team completed ${fight.name} +${lvl}`);
      }
    }
  }

  if (newSeen.size) {
    const merged = new Set([...seen, ...newSeen]);
    saveSeenWcl(merged);
  }

  return { publicMsgs, privateMsgs, newCount: added, completedRuns };
}

module.exports = { collectRunsAndSync };
