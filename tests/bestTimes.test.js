const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { computeBestTimes } = require('../src/bestTimes');

test('computeBestTimes returns fastest timed run per dungeon', () => {
  const rows = [
    { team: 'ALPHA', dungeon: 'Ara-Kara', level: 20, upgrades: 2, duration_ms: '1650000' },
    { team: 'BRAVO', dungeon: 'Ara-Kara', level: 18, upgrades: 3, duration_ms: '1500000' }, // fastest
    { team: 'CHARLIE', dungeon: 'Ara-Kara', level: 19, upgrades: 0, duration_ms: '2100000' }, // depleted
    { team: 'ALPHA', dungeon: 'Dawnbreaker', level: 22, upgrades: 1, duration_ms: '1850000' },
  ];
  const result = computeBestTimes(rows);
  assert.equal(result.length, 2);
  const ara = result.find(r => r.dungeon === 'Ara-Kara');
  assert.equal(ara.team, 'BRAVO');
  assert.equal(ara.duration_ms, 1500000);
  assert.equal(ara.level, 18);
  const dawn = result.find(r => r.dungeon === 'Dawnbreaker');
  assert.equal(dawn.team, 'ALPHA');
});

test('computeBestTimes excludes runs with 0 upgrades', () => {
  const rows = [
    { team: 'ALPHA', dungeon: 'Ara-Kara', level: 20, upgrades: 0, duration_ms: '1400000' },
  ];
  assert.deepEqual(computeBestTimes(rows), []);
});

test('computeBestTimes handles empty input', () => {
  assert.deepEqual(computeBestTimes([]), []);
});
