const { test } = require('node:test');
const assert = require('node:assert/strict');

test('run:complete payload includes delta fields', () => {
  delete require.cache[require.resolve('../src/stateManager')];
  const stateManager = require('../src/stateManager');

  // Seed leaderboard state — two teams
  stateManager._testSetLeaderboard([
    { rank: 1, teamName: 'ALPHA', points: 100 },
    { rank: 2, teamName: 'BRAVO', points: 80 },
  ]);

  const captured = [];
  stateManager.on('run:complete', (p) => captured.push(p));

  stateManager.onRunComplete('BRAVO', {
    dungeonName: 'Ara-Kara',
    level: 20,
    upgrades: 2,
    points: 12,
  });

  assert.equal(captured.length, 1);
  const p = captured[0];
  assert.equal(p.teamName, 'BRAVO');
  assert.equal(p.pointsEarned, 12);
  assert.equal(p.newTotal, 92);
  assert.equal(p.newRank, 2);
  assert.equal(p.previousRank, 2);
});
