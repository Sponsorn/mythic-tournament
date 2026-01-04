const {
  wclExtractCode,
  wclFetchReportMplusFights,
  wclCountDeathsForFight,
  makeAbsMs,
} = require('./wclApi');
const { calcUpgradesFromPar, pointsFor } = require('./wclScoring');
const {
  getTeams,
  getSeenWcl,
  saveSeenWcl,
  updateLeaderboardWcl,
  updateWclMeta,
  writeScoreRow,
} = require('./wclStorage');

const REALM_TZ = process.env.REALM_TZ || 'Europe/Stockholm';
const EVENT_START_SE = process.env.EVENT_START_SE;
const EVENT_END_SE = process.env.EVENT_END_SE;
const EVENT_ENFORCE_WINDOW = String(process.env.EVENT_ENFORCE_WINDOW || 'false').toLowerCase() === 'true';
const WCL_REQUIRE_KILL = String(process.env.WCL_REQUIRE_KILL || 'true').toLowerCase() === 'true';
const MPLUS_DEATH_PENALTY_LT12 = Number(process.env.MPLUS_DEATH_PENALTY_LT12 || 5);
const MPLUS_DEATH_PENALTY_GE12 = Number(process.env.MPLUS_DEATH_PENALTY_GE12 || 15);

function getOffsetForDate(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(date);
  const tzName = parts.find(p => p.type === 'timeZoneName')?.value || '';
  const match = tzName.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return '+01:00';
  const hours = match[1].padStart(match[1].startsWith('-') ? 3 : 2, '0');
  const minutes = match[2] || '00';
  return `${hours}:${minutes}`;
}

function toLocalIso(dateTimeStr, timeZone) {
  const match = String(dateTimeStr || '').match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/
  );
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const probe = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)));
  const offset = getOffsetForDate(probe, timeZone);
  const isoCandidate = `${y}-${m}-${d}T${hh}:${mm}:00${offset}`;
  const parsed = Date.parse(isoCandidate);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function parseEventWindow() {
  const startIso = EVENT_START_SE ? toLocalIso(EVENT_START_SE, REALM_TZ) : null;
  const endIso = EVENT_END_SE ? toLocalIso(EVENT_END_SE, REALM_TZ) : null;
  return {
    start: startIso ? new Date(startIso) : null,
    end: endIso ? new Date(endIso) : null,
  };
}

function fmtTimerMs(ms) {
  if (ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
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
  const window = parseEventWindow();

  const teams = getTeams();
  if (!teams.length) return { publicMsgs, privateMsgs, newCount: 0 };

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

        const dedupe = `team:${teamName}:id:${fight.id}`;
        if (seen.has(dedupe) || newSeen.has(dedupe)) {
          privateMsgs.push(`[WCL Info] skip seen id=${fight.id}`);
          continue;
        }

        let deaths = 0;
        try {
          deaths = await wclCountDeathsForFight(code, fight.id);
        } catch (err) {
          deaths = 0;
        }

        let adjustedClearMs;
        const keystoneTime = Number(fight.keystoneTime || 0);
        if (keystoneTime > 0) {
          adjustedClearMs = keystoneTime;
        } else {
          const MPLUS_START_OFFSET_MS = 10 * 1000;
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
        const points = pointsFor(lvl, upgrades, inTime);

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
          character: '',
          realm: '',
          region: '',
        });

        const timerStr = fmtTimerMs(adjustedClearMs);
        const num = teamNumber(teamName, teams);
        const teamLabel = num ? `${teamName} (Team ${num})` : teamName;
        const upgLabel = inTime ? `+${upgrades}` : 'depleted';

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

  return { publicMsgs, privateMsgs, newCount: added };
}

module.exports = { collectRunsAndSync };
