const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

function loadCompositor() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
  const w = dom.window;

  w.Twitch = { Player: function () {} };
  w.TwitchEmbedManager = {
    syncTeams: () => {},
    mountInto: (team, slot) => { slot.innerHTML = `[embed:${team}]`; },
    setMainAudio: () => {},
    detachAll: () => {},
  };

  const files = [
    'public/compositor/components/brand-strip.js',
    'public/compositor/components/mini-leaderboard.js',
    'public/compositor/components/full-leaderboard.js',
    'public/compositor/components/dungeon-hud.js',
    'public/compositor/components/alt-card.js',
    'public/compositor/layouts/layout-a.js',
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    new Function('window', 'document', src)(w, w.document);
  }
  return w;
}

test('layout A mounts dungeon hud, mini-lb, alt-card', () => {
  const w = loadCompositor();
  const root = w.document.createElement('div');
  w.document.body.appendChild(root);
  const inst = w.LayoutA.mount(root);
  assert.ok(root.querySelector('.la-main'));
  assert.ok(root.querySelector('.la-hud'));
  assert.ok(root.querySelector('.la-lb'));
  assert.ok(root.querySelector('.la-alt'));
  inst.unmount();
});

test('layout A update() renders team HUD and mounts focused embed', () => {
  const w = loadCompositor();
  const root = w.document.createElement('div');
  w.document.body.appendChild(root);
  const inst = w.LayoutA.mount(root);

  inst.update({
    teams: [{ name: 'ALPHA', twitchChannel: 'alpha_stream' }],
    leaderboard: [
      { rank: 1, teamName: 'ALPHA', points: 124 },
      { rank: 2, teamName: 'BRAVO', points: 98 },
      { rank: 3, teamName: 'CHARLIE', points: 76 },
    ],
    activeRuns: [
      { teamName: 'ALPHA', dungeonName: 'Ara-Kara', keystoneLevel: 22 },
    ],
    directorState: {
      slots: { main: 'ALPHA' },
      altCard: { pinnedSlide: 'brand' },
    },
  });

  const mainHtml = root.querySelector('.la-main').innerHTML;
  assert.match(mainHtml, /\[embed:ALPHA\]/);
  const hudText = root.querySelector('.la-hud').textContent;
  assert.match(hudText, /ALPHA/);
  assert.match(hudText, /Ara-Kara/);
  assert.match(hudText, /\+22/);
  assert.match(hudText, /124/);
  inst.unmount();
});

test('layout A onRunComplete adds flash class to matching row', () => {
  const w = loadCompositor();
  const root = w.document.createElement('div');
  w.document.body.appendChild(root);
  const inst = w.LayoutA.mount(root);

  inst.update({
    teams: [{ name: 'ALPHA', twitchChannel: 'alpha' }, { name: 'BRAVO', twitchChannel: 'bravo' }],
    leaderboard: [
      { rank: 1, teamName: 'ALPHA', points: 124 },
      { rank: 2, teamName: 'BRAVO', points: 98 },
      { rank: 3, teamName: 'CHARLIE', points: 76 },
    ],
    activeRuns: [],
    directorState: { slots: { main: 'ALPHA' }, altCard: { pinnedSlide: 'brand' } },
  });

  inst.onRunComplete({ teamName: 'BRAVO', pointsEarned: 14, newTotal: 98, newRank: 2, previousRank: 3 });

  const flashed = root.querySelector('.lb-row.flash');
  assert.ok(flashed, 'expected a row with class flash');
  assert.match(flashed.textContent, /BRAVO/);
  assert.match(flashed.textContent, /\+14/);
  inst.unmount();
});
