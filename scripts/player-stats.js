#!/usr/bin/env node
/**
 * Standalone script to query WCL reports and produce per-character
 * leaderboards for Tempered Potion usage, deaths, and interrupts.
 *
 * Usage: node scripts/player-stats.js
 */

const path = require('path');

// Resolve modules relative to project root
const { wclExtractCode, wclGraphql, wclFetchReportMplusFights, makeAbsMs } = require(path.join(__dirname, '..', 'src', 'wclApi'));
const { getTeams } = require(path.join(__dirname, '..', 'src', 'wclStorage'));
const { EVENT_START_SE, EVENT_END_SE, REALM_TZ } = require(path.join(__dirname, '..', 'src', 'config'));
const { parseLocalDateTime } = require(path.join(__dirname, '..', 'src', 'timeUtils'));

const TEMPERED_POTION_SPELL_ID = 431932;
const BATCH_SIZE = 5;

function parseEventWindow() {
  try {
    const startIso = EVENT_START_SE ? parseLocalDateTime(EVENT_START_SE, REALM_TZ) : null;
    const endIso = EVENT_END_SE ? parseLocalDateTime(EVENT_END_SE, REALM_TZ) : null;
    return {
      start: startIso ? new Date(startIso) : null,
      end: endIso ? new Date(endIso) : null,
    };
  } catch (err) {
    console.warn(`Failed to parse event window: ${err.message || err}`);
    return { start: null, end: null };
  }
}

async function fetchFightEvents(code, fightId, actors) {
  const query = `
    query($code: String!, $fid: Int!, $abilityID: Float!) {
      reportData {
        report(code: $code) {
          deaths: events(
            dataType: Deaths,
            fightIDs: [$fid],
            hostilityType: Friendlies,
            limit: 10000
          ) { data }
          potions: events(
            dataType: Casts,
            fightIDs: [$fid],
            hostilityType: Friendlies,
            abilityID: $abilityID,
            limit: 10000
          ) { data }
          interrupts: events(
            dataType: Interrupts,
            fightIDs: [$fid],
            hostilityType: Friendlies,
            limit: 10000
          ) { data }
        }
      }
    }`;

  const data = await wclGraphql(query, {
    code,
    fid: Number(fightId),
    abilityID: Number(TEMPERED_POTION_SPELL_ID),
  });

  const report = data.reportData?.report;
  const deathEvents = report?.deaths?.data || [];
  const potionEvents = report?.potions?.data || [];
  const interruptEvents = report?.interrupts?.data || [];

  const result = { deaths: [], potions: [], interrupts: [] };

  for (const evt of deathEvents) {
    const actor = actors.get(evt.targetID);
    if (actor) {
      result.deaths.push(actor);
    }
  }

  for (const evt of potionEvents) {
    const actor = actors.get(evt.sourceID);
    if (actor) {
      result.potions.push(actor);
    }
  }

  for (const evt of interruptEvents) {
    const actor = actors.get(evt.sourceID);
    if (actor) {
      result.interrupts.push(actor);
    }
  }

  return result;
}

async function processReport(code, stats, window) {
  console.log(`  Fetching report ${code}...`);
  let reportData;
  try {
    reportData = await wclFetchReportMplusFights(code);
  } catch (err) {
    console.warn(`  WARNING: Could not fetch report ${code}: ${err.message}`);
    return;
  }

  const { report, fights: allFights, actors: actorList } = reportData;

  // Filter fights to event window
  let fights = allFights;
  if (window.start && window.end) {
    fights = allFights.filter(f => {
      const stAbs = makeAbsMs(report.startTime, f.startTime);
      return stAbs >= window.start.getTime() && stAbs <= window.end.getTime();
    });
    if (fights.length < allFights.length) {
      console.log(`  Filtered ${allFights.length} → ${fights.length} fights (event window)`);
    }
  }

  // Build actor map: id → "Name-Server"
  const actors = new Map();
  for (const a of actorList) {
    if (a.name && a.server) {
      actors.set(a.id, `${a.name}-${a.server}`);
    }
  }

  console.log(`  Found ${fights.length} M+ fights, ${actors.size} player actors`);

  // Process fights in batches
  for (let i = 0; i < fights.length; i += BATCH_SIZE) {
    const batch = fights.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(f => fetchFightEvents(code, f.id, actors).catch(err => {
        console.warn(`  WARNING: Failed to fetch events for fight ${f.id}: ${err.message}`);
        return { deaths: [], potions: [], interrupts: [] };
      }))
    );

    for (const result of results) {
      for (const key of result.deaths) {
        const prev = stats.get(key) || { potions: 0, deaths: 0, interrupts: 0 };
        stats.set(key, { ...prev, deaths: prev.deaths + 1 });
      }
      for (const key of result.potions) {
        const prev = stats.get(key) || { potions: 0, deaths: 0, interrupts: 0 };
        stats.set(key, { ...prev, potions: prev.potions + 1 });
      }
      for (const key of result.interrupts) {
        const prev = stats.get(key) || { potions: 0, deaths: 0, interrupts: 0 };
        stats.set(key, { ...prev, interrupts: prev.interrupts + 1 });
      }
    }
  }
}

async function main() {
  const teams = getTeams();
  if (!teams.length) {
    console.log('No teams found in data/wcl.json');
    return;
  }

  console.log(`Found ${teams.length} teams\n`);

  // Collect unique report codes from all teams
  const reportCodes = new Set();
  for (const team of teams) {
    for (const url of [team.wcl_url, team.wcl_backup_url]) {
      const code = wclExtractCode(url);
      if (code) reportCodes.add(code);
    }
  }

  console.log(`${reportCodes.size} unique report codes to process\n`);

  const window = parseEventWindow();
  if (window.start && window.end) {
    console.log(`Event window: ${window.start.toISOString()} → ${window.end.toISOString()}\n`);
  } else {
    console.log('No event window configured — processing all fights\n');
  }

  // Aggregate stats: "Name-Server" → { potions, deaths, interrupts }
  const stats = new Map();

  // Process one report at a time (rate limiting)
  for (const code of reportCodes) {
    await processReport(code, stats, window);
    console.log('');
  }

  // Sort and display results
  const entries = Array.from(stats.entries());

  // Top potions
  const byPotions = entries
    .filter(([, v]) => v.potions > 0)
    .sort((a, b) => b[1].potions - a[1].potions);

  console.log('=== Top 3 Potion Users ===');
  for (let i = 0; i < Math.min(3, byPotions.length); i++) {
    const [name, data] = byPotions[i];
    console.log(`${i + 1}. ${name}  — ${data.potions} potions`);
  }

  console.log('');

  // Top deaths
  const byDeaths = entries
    .filter(([, v]) => v.deaths > 0)
    .sort((a, b) => b[1].deaths - a[1].deaths);

  console.log('=== Top 3 Deaths ===');
  for (let i = 0; i < Math.min(3, byDeaths.length); i++) {
    const [name, data] = byDeaths[i];
    console.log(`${i + 1}. ${name}  — ${data.deaths} deaths`);
  }

  console.log('');

  // Top interrupters
  const byInterrupts = entries
    .filter(([, v]) => v.interrupts > 0)
    .sort((a, b) => b[1].interrupts - a[1].interrupts);

  console.log('=== Top 3 Interrupters ===');
  for (let i = 0; i < Math.min(3, byInterrupts.length); i++) {
    const [name, data] = byInterrupts[i];
    console.log(`${i + 1}. ${name}  — ${data.interrupts} interrupts`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
