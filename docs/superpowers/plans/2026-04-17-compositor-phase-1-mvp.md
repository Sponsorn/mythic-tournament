# Compositor Phase 1 — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working `/compositor` page that renders four layout modes (A, C, LB, BT), embeds Twitch streams for registered teams, and flashes the leaderboard when a run completes — driven by a new `directorState` module and a temporary admin HTTP endpoint (caster panel comes in Phase 2).

**Architecture:** New `src/directorState.js` singleton holds broadcast presentation state, persisted to `data/director-state.json`. A new `/compositor` route serves one HTML page that subscribes to state changes over Socket.io. A `public/js/twitch-embed-manager.js` pre-instantiates embeds for all teams once, then re-parents them across layout slots to avoid reload latency. Layouts are composed via CSS Grid with the active layout applied as a class on the compositor root.

**Tech Stack:** Node.js 18+ (existing), Express + Socket.io (existing), Twitch Embed JS API (`https://player.twitch.tv/js/embed/v1.js`), `node:test` + `jsdom` (new, dev-only) for unit tests.

**Reference spec:** `docs/superpowers/specs/2026-04-17-tournament-broadcast-compositor-design.md`

---

## File Structure

Files created in this phase:

| File | Responsibility |
|---|---|
| `src/directorState.js` | Singleton EventEmitter holding `{activeLayout, slots, altCard, mainAudioUnmuted, ...}`; load/save to disk |
| `src/bestTimes.js` | Read `wcl_scores.csv`, compute best-timed run per dungeon |
| `public/compositor/index.html` | The compositor page shell (1920×1080) |
| `public/compositor/compositor.css` | All layout CSS (brand strip, layouts A/C/LB/BT, result-flash, tile chips) |
| `public/compositor/compositor.js` | Entry: wire socket, render active layout, mount Twitch embeds |
| `public/compositor/layouts/layout-a.js` | Layout A renderer (main stream + HUD + mini-lb + alt-card) |
| `public/compositor/layouts/layout-c.js` | Layout C renderer (grid 6 + standings sidebar) |
| `public/compositor/layouts/layout-lb.js` | Layout LB renderer (fullscreen leaderboard) |
| `public/compositor/layouts/layout-bt.js` | Layout BT renderer (fullscreen best times) |
| `public/compositor/components/brand-strip.js` | Top branding strip with tournament progress bar |
| `public/compositor/components/mini-leaderboard.js` | Standings card (used by A) with result-flash |
| `public/compositor/components/full-leaderboard.js` | Full standings list (used by C sidebar, LB full) with result-flash |
| `public/compositor/components/dungeon-hud.js` | Dungeon HUD card (used by A) |
| `public/compositor/components/alt-card.js` | Alt-card (static slide rendering — rotation deferred to Phase 3) |
| `public/js/twitch-embed-manager.js` | Pre-instantiate all team embeds, slot-swap by DOM re-parent, quality/mute control |
| `tests/directorState.test.js` | Unit tests for directorState |
| `tests/bestTimes.test.js` | Unit tests for bestTimes reader |
| `tests/progressBar.test.js` | Unit tests for tournament progress calculation |
| `tests/layoutA.test.js` | jsdom unit test for layout-a mounting + result-flash |

Files modified in this phase:

| File | Change |
|---|---|
| `package.json` | Add `jsdom` devDependency, add `test` script, set `engines.node>=18` |
| `src/webServer.js` | New routes `/compositor/*`, `/api/director` (GET/POST), `/api/best-times`; broadcast `director:state` on connect and change; extend `run:complete` payload |
| `src/stateManager.js` | Extend `run:complete` emit with `{pointsEarned, newTotal, newRank, previousRank}` |
| `src/wclStorage.js` | Add `twitchChannel` field handling in team objects |
| `public/admin/index.html` | Add Twitch channel input to team edit form |
| `public/js/socket-client.js` | Add `onDirectorState` subscription helper |
| `.gitignore` | Add `data/director-state.json` |

---

## Task 0: Set up branch, test framework, and engines

**Files:**
- Modify: `package.json`
- Create: `tests/smoke.test.js`

- [ ] **Step 1: Create feature branch from current master**

Run:
```bash
git checkout -b feat/compositor-phase-1
```

Expected: switched to new branch based on `v2.0.0-pre-compositor` baseline.

- [ ] **Step 2: Install jsdom as dev dependency**

Run:
```bash
npm install --save-dev jsdom
```

Expected: `jsdom` added to `devDependencies` in `package.json`.

- [ ] **Step 3: Update package.json scripts and engines**

Modify `package.json` — add an `engines` key and a `test` script. After editing, `package.json` should contain:

```json
{
  "name": "mplus-tournament",
  "version": "2.0.0",
  "description": "M+ Tournament scoreboard with OBS overlays",
  "main": "src/main.js",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "start": "node src/main.js",
    "test": "node --test tests/"
  },
  "dependencies": {
    "dotenv": "^17.2.3",
    "express": "^5.2.1",
    "http-proxy-middleware": "^3.0.5",
    "socket.io": "^4.8.3"
  },
  "devDependencies": {
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 4: Write smoke test to verify the runner works**

Create `tests/smoke.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

test('test runner is wired up', () => {
  assert.equal(1 + 1, 2);
});

test('jsdom loads a document', () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="x">hi</div></body></html>');
  assert.equal(dom.window.document.getElementById('x').textContent, 'hi');
});
```

- [ ] **Step 5: Run the smoke test**

Run: `npm test`
Expected: `# tests 2` `# pass 2` — both tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tests/smoke.test.js
git commit -m "setup: node:test + jsdom test framework"
```

---

## Task 1: Create directorState module

**Files:**
- Create: `src/directorState.js`
- Create: `tests/directorState.test.js`

- [ ] **Step 1: Write failing test for default state**

Create `tests/directorState.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TMP = path.join(__dirname, '.tmp-director-state.json');

function freshState() {
  if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
  delete require.cache[require.resolve('../src/directorState')];
  process.env.DIRECTOR_STATE_PATH = TMP;
  return require('../src/directorState');
}

test('directorState defaults', () => {
  const ds = freshState();
  const s = ds.getState();
  assert.equal(s.activeLayout, 'A');
  assert.equal(s.slots.main, null);
  assert.deepEqual(s.slots.grid, [null, null, null, null, null, null]);
  assert.equal(s.altCard.pinnedSlide, null);
  assert.equal(s.mainAudioUnmuted, false);
});

test('directorState.setLayout persists and emits', () => {
  const ds = freshState();
  let emitted = null;
  ds.on('change', (s) => { emitted = s; });
  ds.setLayout('C');
  assert.equal(ds.getState().activeLayout, 'C');
  assert.equal(emitted.activeLayout, 'C');
  const saved = JSON.parse(fs.readFileSync(TMP, 'utf8'));
  assert.equal(saved.activeLayout, 'C');
});

test('directorState.setSlot updates main', () => {
  const ds = freshState();
  ds.setSlot('main', 'ALPHA');
  assert.equal(ds.getState().slots.main, 'ALPHA');
});

test('directorState.setSlot updates grid[i]', () => {
  const ds = freshState();
  ds.setSlot('grid[2]', 'CHARLIE');
  assert.equal(ds.getState().slots.grid[2], 'CHARLIE');
});

test('directorState.setLayout rejects unknown layout', () => {
  const ds = freshState();
  assert.throws(() => ds.setLayout('XYZ'), /unknown layout/i);
});

test('directorState loads persisted state on require', () => {
  const ds1 = freshState();
  ds1.setLayout('LB');
  ds1.setSlot('main', 'BRAVO');
  const ds2 = freshState.__proto__ === undefined ? null : null;
  delete require.cache[require.resolve('../src/directorState')];
  process.env.DIRECTOR_STATE_PATH = TMP;
  const ds3 = require('../src/directorState');
  assert.equal(ds3.getState().activeLayout, 'LB');
  assert.equal(ds3.getState().slots.main, 'BRAVO');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/directorState.test.js`
Expected: FAIL with `Cannot find module '../src/directorState'`.

- [ ] **Step 3: Implement directorState module**

Create `src/directorState.js`:

```js
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

const VALID_LAYOUTS = ['PRE', 'A', 'C', 'D', 'G', 'LB', 'BT'];
const DEFAULT_PATH = path.join(__dirname, '..', 'data', 'director-state.json');

const DEFAULTS = {
  activeLayout: 'A',
  slots: {
    main: null,
    grid: [null, null, null, null, null, null],
    quad: [null, null, null, null],
    strip: [null, null, null, null],
  },
  altCard: {
    pinnedSlide: null,
    rotationMs: 12000,
  },
  mainAudioUnmuted: false,
  commandsList: [],
  infoboxHtml: '',
  tournamentContext: {
    title: 'M+ Tournament',
    subtitle: '',
    startSE: '',
    endSE: '',
  },
};

class DirectorState extends EventEmitter {
  constructor() {
    super();
    this.filePath = process.env.DIRECTOR_STATE_PATH || DEFAULT_PATH;
    this.state = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
        return { ...structuredClone(DEFAULTS), ...raw };
      }
    } catch (err) {
      console.warn('[DirectorState] Failed to load, using defaults:', err.message);
    }
    return structuredClone(DEFAULTS);
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch (err) {
      console.warn('[DirectorState] Failed to save:', err.message);
    }
  }

  getState() {
    return structuredClone(this.state);
  }

  setLayout(layout) {
    if (!VALID_LAYOUTS.includes(layout)) {
      throw new Error(`unknown layout: ${layout}`);
    }
    this.state.activeLayout = layout;
    this._save();
    this.emit('change', this.getState());
  }

  setSlot(key, team) {
    const match = key.match(/^(\w+)(?:\[(\d+)\])?$/);
    if (!match) throw new Error(`invalid slot key: ${key}`);
    const [, group, idx] = match;
    if (!(group in this.state.slots)) {
      throw new Error(`unknown slot group: ${group}`);
    }
    if (idx !== undefined) {
      this.state.slots[group][Number(idx)] = team;
    } else {
      this.state.slots[group] = team;
    }
    this._save();
    this.emit('change', this.getState());
  }

  setMainAudio(unmuted) {
    this.state.mainAudioUnmuted = Boolean(unmuted);
    this._save();
    this.emit('change', this.getState());
  }

  setPinnedSlide(slide) {
    const valid = [null, 'brand', 'commands', 'info'];
    if (!valid.includes(slide)) {
      throw new Error(`unknown pinned slide: ${slide}`);
    }
    this.state.altCard.pinnedSlide = slide;
    this._save();
    this.emit('change', this.getState());
  }
}

module.exports = new DirectorState();
module.exports.VALID_LAYOUTS = VALID_LAYOUTS;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/directorState.test.js`
Expected: all 6 tests pass.

- [ ] **Step 5: Add director-state.json to gitignore**

Modify `.gitignore` — append to the `data/` block so it reads:

```
data/store.json
data/wcl.json
data/wcl_scores.csv
data/runtime-config.json
data/director-state.json
data/*copy*
```

- [ ] **Step 6: Commit**

```bash
git add src/directorState.js tests/directorState.test.js .gitignore
git commit -m "feat: directorState module with persistence and events"
```

---

## Task 2: Wire directorState into webServer

**Files:**
- Modify: `src/webServer.js`

- [ ] **Step 1: Add require and broadcast on connect**

At the top of `src/webServer.js` with the other requires, add:

```js
const directorState = require('./directorState');
```

Find the Socket.io connection handler (search for `io.on('connection'`). Inside that handler, after the existing `state:sync` emit, add:

```js
socket.emit('director:state', directorState.getState());
```

- [ ] **Step 2: Broadcast on directorState change**

At module load time (after `io` is created, but before the server starts listening), subscribe to state changes. Find where `io` is instantiated in `createWebServer` and add:

```js
directorState.on('change', (s) => {
  io.emit('director:state', s);
});
```

- [ ] **Step 3: Add admin HTTP endpoint for temporary control**

Still in `webServer.js`, add a new Express route block (near the other `app.get`/`app.post` routes):

```js
app.get('/api/director', (req, res) => {
  res.json(directorState.getState());
});

app.post('/api/director', express.json(), (req, res) => {
  const { layout, slot, team, pinnedSlide, mainAudioUnmuted } = req.body || {};
  try {
    if (layout !== undefined) directorState.setLayout(layout);
    if (slot !== undefined) directorState.setSlot(slot, team ?? null);
    if (pinnedSlide !== undefined) directorState.setPinnedSlide(pinnedSlide);
    if (mainAudioUnmuted !== undefined) directorState.setMainAudio(mainAudioUnmuted);
    res.json({ ok: true, state: directorState.getState() });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
```

Note: no auth gate on this endpoint in Phase 1. This is a deliberate deferral — the full caster panel (Phase 2) will use `ADMIN_SECRET`. Document that this is Phase-1-only by adding a comment above the route:

```js
// TEMPORARY Phase 1 test endpoint. Replaced in Phase 2 by authenticated
// Socket.io director:* events from the caster panel.
```

- [ ] **Step 4: Verify the server starts and endpoint works**

Run: `npm start`
Then in another terminal:
```bash
curl http://localhost:3000/api/director
```

Expected: JSON with default directorState (`activeLayout: "A"`, etc.).

Then:
```bash
curl -X POST -H "Content-Type: application/json" -d '{"layout":"C"}' http://localhost:3000/api/director
curl http://localhost:3000/api/director
```

Expected: second GET returns `"activeLayout": "C"`.

Stop the server with Ctrl-C.

- [ ] **Step 5: Commit**

```bash
git add src/webServer.js
git commit -m "feat: broadcast directorState over socket + test admin endpoint"
```

---

## Task 3: Extend run:complete payload with delta info

**Files:**
- Modify: `src/stateManager.js`
- Create: `tests/runCompletePayload.test.js`

- [ ] **Step 1: Write failing test for extended payload**

Create `tests/runCompletePayload.test.js`:

```js
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

  // Recompute leaderboard with new points
  stateManager._testSetLeaderboard([
    { rank: 1, teamName: 'ALPHA', points: 100 },
    { rank: 2, teamName: 'BRAVO', points: 92 },
  ]);

  assert.equal(captured.length, 1);
  const p = captured[0];
  assert.equal(p.teamName, 'BRAVO');
  assert.equal(p.pointsEarned, 12);
  assert.equal(p.newTotal, 92);
  assert.equal(p.newRank, 2);
  assert.equal(p.previousRank, 2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/runCompletePayload.test.js`
Expected: FAIL — either on the test helper not existing or on the assertions.

- [ ] **Step 3: Modify stateManager.onRunComplete to emit delta fields**

In `src/stateManager.js`, locate `onRunComplete(teamName, runData)`. Before it emits `run:complete`, capture the previous rank/total and include them in the payload. Add test helper too.

Replace the existing body of `onRunComplete` with logic that:
1. Reads current leaderboard to find previous rank + points
2. Clears active run
3. Emits `run:complete` with `{teamName, dungeonName, level, upgrades, pointsEarned, newTotal, newRank, previousRank, ...runData}`

Add near the bottom of `stateManager.js` (before `module.exports`):

```js
// Test-only helper — allows unit tests to seed leaderboard state
StateManager.prototype._testSetLeaderboard = function (leaderboard) {
  this.leaderboard = leaderboard;
};
```

In `onRunComplete`, compute deltas like this:

```js
onRunComplete(teamName, runData) {
  const prev = (this.leaderboard || []).find(e => e.teamName === teamName);
  const previousRank = prev ? prev.rank : null;
  const previousTotal = prev ? prev.points : 0;
  const pointsEarned = Number(runData.points || 0);

  // Clear active run for this team
  this.activeRuns = (this.activeRuns || []).filter(r => r.teamName !== teamName);

  // Leaderboard refresh happens out-of-band from wclCollector; for the emitted
  // payload we compute the projected new total based on the old leaderboard
  // snapshot. A follow-up scoreboard:update will correct any drift.
  const newTotal = previousTotal + pointsEarned;
  // newRank is computed after the caller refreshes the leaderboard; include
  // the projected rank based on current leaderboard for the immediate flash.
  const projected = [...(this.leaderboard || [])]
    .map(e => e.teamName === teamName ? { ...e, points: newTotal } : e)
    .sort((a, b) => b.points - a.points);
  const newRank = projected.findIndex(e => e.teamName === teamName) + 1 || null;

  this.emit('run:complete', {
    teamName,
    pointsEarned,
    newTotal,
    newRank,
    previousRank,
    ...runData,
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/runCompletePayload.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full test suite to verify nothing regressed**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/stateManager.js tests/runCompletePayload.test.js
git commit -m "feat: extend run:complete payload with rank/total deltas"
```

---

## Task 4: Add twitchChannel field to team records

**Files:**
- Modify: `src/wclStorage.js`
- Modify: `src/webServer.js`
- Modify: `public/admin/index.html`

- [ ] **Step 1: Update team normalization in wclStorage**

In `src/wclStorage.js`, find the team-normalization code (likely in a function that reads/writes `teams` array on `wcl.json`). When a team is created or updated, ensure the team object shape includes `twitchChannel: ''`. Search for places where new team objects are created — for each, add the field.

Example edit: find an object literal like:

```js
{ name, bracket: 'A', wclCode: '', leader: '' }
```

and change to:

```js
{ name, bracket: 'A', wclCode: '', leader: '', twitchChannel: '' }
```

- [ ] **Step 2: Accept twitchChannel in the admin:updateTeam handler**

In `src/webServer.js`, find the `admin:updateTeam` socket handler. It already accepts `name, bracket, leader, wclCode, wclCodeBackup` — add `twitchChannel`. The handler updates a team record with the incoming fields; ensure `twitchChannel` is written through.

Concretely, search for the Socket.io handler `socket.on('admin:updateTeam', ...)` and in the team mutation logic, add:

```js
if (data.twitchChannel !== undefined) team.twitchChannel = String(data.twitchChannel || '').trim();
```

- [ ] **Step 3: Add the input field to the admin form**

In `public/admin/index.html`, find the team-edit form section (search for the existing "Leader" or "WCL Code" inputs). Add a Twitch channel input near those fields. The existing pattern probably looks like:

```html
<div class="form-group">
  <label class="form-label">Leader</label>
  <input type="text" class="input" id="editLeader">
</div>
```

Add a sibling:

```html
<div class="form-group">
  <label class="form-label">Twitch channel</label>
  <input type="text" class="input" id="editTwitchChannel" placeholder="e.g. luckywipe_alpha">
</div>
```

- [ ] **Step 4: Wire the input through the admin JS**

Still in `public/admin/index.html`, find the block that loads the selected team into the form (sets `editLeader.value = team.leader`, etc.). Add:

```js
document.getElementById('editTwitchChannel').value = team.twitchChannel || '';
```

And in the save handler (where it builds the `admin:updateTeam` payload), add:

```js
twitchChannel: document.getElementById('editTwitchChannel').value.trim(),
```

- [ ] **Step 5: Smoke test manually**

Start server: `npm start`
Open `http://localhost:3000/admin/`, edit a team, enter a Twitch channel name, save. Refresh. Verify the value persists. Check `data/wcl.json` shows the new field on that team.

Stop server.

- [ ] **Step 6: Commit**

```bash
git add src/wclStorage.js src/webServer.js public/admin/index.html
git commit -m "feat: add twitchChannel field to team records"
```

---

## Task 5: Create compositor page skeleton + socket wiring

**Files:**
- Create: `public/compositor/index.html`
- Create: `public/compositor/compositor.css`
- Create: `public/compositor/compositor.js`
- Modify: `src/webServer.js`

- [ ] **Step 1: Serve /compositor static route**

In `src/webServer.js`, near the other `express.static` calls, add:

```js
app.use('/compositor', express.static(path.join(__dirname, '..', 'public', 'compositor')));
```

- [ ] **Step 2: Write the compositor HTML shell**

Create `public/compositor/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>M+ Tournament Compositor</title>
  <link rel="stylesheet" href="/css/common.css">
  <link rel="stylesheet" href="/compositor/compositor.css">
</head>
<body>
  <div id="compositor" class="compositor layout-A">
    <div id="brandStrip" class="brand-strip"></div>
    <div id="layoutRoot" class="layout-root"></div>
  </div>
  <script src="https://player.twitch.tv/js/embed/v1.js"></script>
  <script src="/socket.io/socket.io.js"></script>
  <script src="/js/socket-client.js"></script>
  <script src="/js/twitch-embed-manager.js"></script>
  <script src="/compositor/components/brand-strip.js"></script>
  <script src="/compositor/components/mini-leaderboard.js"></script>
  <script src="/compositor/components/full-leaderboard.js"></script>
  <script src="/compositor/components/dungeon-hud.js"></script>
  <script src="/compositor/components/alt-card.js"></script>
  <script src="/compositor/layouts/layout-a.js"></script>
  <script src="/compositor/layouts/layout-c.js"></script>
  <script src="/compositor/layouts/layout-lb.js"></script>
  <script src="/compositor/layouts/layout-bt.js"></script>
  <script src="/compositor/compositor.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write the base CSS**

Create `public/compositor/compositor.css`:

```css
html, body {
  width: 1920px;
  height: 1080px;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: var(--font-sans);
}

.compositor {
  width: 1920px;
  height: 1080px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.brand-strip {
  flex: 0 0 36px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  background: linear-gradient(90deg, #1a1a22 0%, #22222e 50%, #1a1a22 100%);
  border-bottom: 1px solid var(--border-subtle);
  font-size: 13px;
  color: #fff;
}

.layout-root {
  flex: 1;
  position: relative;
  min-height: 0;
}

/* Stream tile base (used by every layout) */
.stream-tile {
  position: relative;
  background: #0a0a0f;
  overflow: hidden;
  border-radius: 2px;
}

.stream-tile .tile-mount {
  position: absolute;
  inset: 0;
}

.stream-tile .tile-label {
  position: absolute;
  bottom: 6px;
  left: 8px;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.65);
  padding: 2px 8px;
  border-radius: 2px;
  color: #fff;
  font-weight: 600;
}

.stream-tile .tile-keylevel {
  position: absolute;
  top: 6px;
  right: 8px;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 14px;
  color: #fff;
  background: rgba(74, 158, 255, 0.85);
  padding: 2px 8px;
  border-radius: 3px;
}
```

- [ ] **Step 4: Write the compositor JS entry with socket wiring**

Create `public/compositor/compositor.js`:

```js
(function () {
  'use strict';

  const rootEl = document.getElementById('compositor');
  const brandEl = document.getElementById('brandStrip');
  const layoutRootEl = document.getElementById('layoutRoot');

  const state = {
    teams: [],
    leaderboard: [],
    activeRuns: [],
    directorState: null,
  };

  const layouts = {
    A: window.LayoutA,
    C: window.LayoutC,
    LB: window.LayoutLB,
    BT: window.LayoutBT,
  };

  let activeLayoutName = null;
  let activeLayoutInstance = null;

  const socket = io();

  socket.on('state:sync', (payload) => {
    state.teams = payload.teams || [];
    state.leaderboard = payload.leaderboard || [];
    state.activeRuns = payload.activeRuns || [];
    window.TwitchEmbedManager.syncTeams(state.teams);
    render();
  });

  socket.on('scoreboard:update', (lb) => {
    state.leaderboard = lb || [];
    render();
  });

  socket.on('activeRuns:update', (runs) => {
    state.activeRuns = runs || [];
    render();
  });

  socket.on('director:state', (ds) => {
    state.directorState = ds;
    render();
  });

  socket.on('run:complete', (payload) => {
    if (activeLayoutInstance && activeLayoutInstance.onRunComplete) {
      activeLayoutInstance.onRunComplete(payload);
    }
  });

  function render() {
    if (!state.directorState) return;

    window.BrandStrip.render(brandEl, {
      teams: state.teams,
      directorState: state.directorState,
    });

    const desired = state.directorState.activeLayout;
    if (desired !== activeLayoutName) {
      if (activeLayoutInstance && activeLayoutInstance.unmount) {
        activeLayoutInstance.unmount();
      }
      layoutRootEl.innerHTML = '';
      rootEl.className = `compositor layout-${desired}`;
      const Layout = layouts[desired];
      if (!Layout) {
        console.warn('[Compositor] Unknown layout:', desired);
        return;
      }
      activeLayoutInstance = Layout.mount(layoutRootEl);
      activeLayoutName = desired;
    }

    if (activeLayoutInstance && activeLayoutInstance.update) {
      activeLayoutInstance.update(state);
    }
  }
})();
```

- [ ] **Step 5: Create stub components so the page loads**

Create `public/compositor/components/brand-strip.js`:

```js
window.BrandStrip = {
  render(el, { teams, directorState }) {
    el.innerHTML = '<span>M+ Tournament Compositor (stub)</span>';
  },
};
```

Create stub layouts — `public/compositor/layouts/layout-a.js`:

```js
window.LayoutA = {
  mount(root) {
    root.innerHTML = '<div style="padding:24px;color:#fff">Layout A (stub)</div>';
    return {
      update() {},
      unmount() {},
      onRunComplete() {},
    };
  },
};
```

Copy the same pattern into `layout-c.js`, `layout-lb.js`, `layout-bt.js`, each labeling itself.

Create stubs for the other components with empty implementations:

- `public/compositor/components/mini-leaderboard.js`:
  ```js
  window.MiniLeaderboard = { render(el, state) { el.innerHTML = ''; }, flash(el, teamName) {} };
  ```
- `public/compositor/components/full-leaderboard.js`:
  ```js
  window.FullLeaderboard = { render(el, state) { el.innerHTML = ''; }, flash(el, teamName) {} };
  ```
- `public/compositor/components/dungeon-hud.js`:
  ```js
  window.DungeonHud = { render(el, state) { el.innerHTML = ''; } };
  ```
- `public/compositor/components/alt-card.js`:
  ```js
  window.AltCard = { render(el, state) { el.innerHTML = ''; } };
  ```

Create a stub for the embed manager — `public/js/twitch-embed-manager.js`:

```js
window.TwitchEmbedManager = {
  syncTeams(teams) {},
  mountInto(teamName, slotEl) {},
  setMainAudio(unmuted) {},
};
```

- [ ] **Step 6: Smoke test the page**

Run: `npm start`
Open `http://localhost:3000/compositor/` in a browser.
Expected: page loads, no console errors. You should see "M+ Tournament Compositor (stub)" in the brand strip and "Layout A (stub)" below it.

POST to set a different layout:
```bash
curl -X POST -H "Content-Type: application/json" -d '{"layout":"C"}' http://localhost:3000/api/director
```
Refresh the compositor (or wait — it should auto-update via the socket event). The body class should change to `layout-C` and you should see "Layout C (stub)".

Stop server.

- [ ] **Step 7: Commit**

```bash
git add public/compositor src/webServer.js public/js/twitch-embed-manager.js
git commit -m "feat: compositor page skeleton with stub layouts and components"
```

---

## Task 6: Build branding strip with tournament progress bar

**Files:**
- Create: `tests/progressBar.test.js`
- Modify: `public/compositor/components/brand-strip.js`
- Modify: `public/compositor/compositor.css`

- [ ] **Step 1: Write failing test for progress bar math**

Create `tests/progressBar.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.window = dom.window;
global.document = dom.window.document;

// Load the component into the jsdom window scope
const src = fs.readFileSync(path.join(__dirname, '..', 'public/compositor/components/brand-strip.js'), 'utf8');
new Function('window', 'document', src)(dom.window, dom.window.document);
const BrandStrip = dom.window.BrandStrip;

test('progress bar before start shows "Starts in" and gold fill', () => {
  const el = dom.window.document.createElement('div');
  const now = Date.parse('2026-01-31T17:00:00+01:00');
  BrandStrip.renderAt(el, {
    tournamentStartSE: '2026-01-31T18:00:00+01:00',
    tournamentEndSE: '2026-01-31T22:00:00+01:00',
    title: 'M+ Tournament',
    now,
  });
  const label = el.querySelector('.brand-progress-label').textContent;
  assert.match(label, /Starts in/);
  const fill = el.querySelector('.brand-progress-fill');
  assert.match(fill.className, /brand-progress-fill--pre/);
});

test('progress bar during event shows remaining time and live fill', () => {
  const el = dom.window.document.createElement('div');
  const start = Date.parse('2026-01-31T18:00:00+01:00');
  const end = Date.parse('2026-01-31T22:00:00+01:00');
  const now = start + 2 * 60 * 60 * 1000; // halfway
  BrandStrip.renderAt(el, {
    tournamentStartSE: '2026-01-31T18:00:00+01:00',
    tournamentEndSE: '2026-01-31T22:00:00+01:00',
    title: 'M+ Tournament',
    now,
  });
  const fill = el.querySelector('.brand-progress-fill');
  assert.match(fill.className, /brand-progress-fill--live/);
  const width = parseFloat(fill.style.width);
  assert.ok(width > 45 && width < 55, `expected ~50%, got ${width}`);
});

test('progress bar after end shows "Event ended" and full green fill', () => {
  const el = dom.window.document.createElement('div');
  const now = Date.parse('2026-01-31T23:00:00+01:00');
  BrandStrip.renderAt(el, {
    tournamentStartSE: '2026-01-31T18:00:00+01:00',
    tournamentEndSE: '2026-01-31T22:00:00+01:00',
    title: 'M+ Tournament',
    now,
  });
  assert.match(el.querySelector('.brand-progress-label').textContent, /ended/i);
  assert.match(el.querySelector('.brand-progress-fill').className, /brand-progress-fill--post/);
});

test('progress bar renders "Schedule not set" when dates missing', () => {
  const el = dom.window.document.createElement('div');
  BrandStrip.renderAt(el, {
    tournamentStartSE: '',
    tournamentEndSE: '',
    title: 'M+ Tournament',
    now: Date.now(),
  });
  assert.match(el.querySelector('.brand-progress-label').textContent, /not set/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/progressBar.test.js`
Expected: FAIL — `BrandStrip.renderAt is not a function`.

- [ ] **Step 3: Implement the brand strip component**

Replace `public/compositor/components/brand-strip.js`:

```js
(function () {
  'use strict';

  function formatRemaining(ms) {
    const totalMin = Math.max(0, Math.floor(ms / 60000));
    const hours = Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    if (hours >= 1) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    return `${minutes}m`;
  }

  function formatHHMM(dateStr) {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '--:--';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function renderAt(el, { tournamentStartSE, tournamentEndSE, title, now }) {
    const hasSchedule = tournamentStartSE && tournamentEndSE;
    let label, fillClass, widthPct;

    if (!hasSchedule) {
      label = 'Schedule not set';
      fillClass = 'brand-progress-fill--idle';
      widthPct = 0;
    } else {
      const start = Date.parse(tournamentStartSE);
      const end = Date.parse(tournamentEndSE);
      if (now < start) {
        label = `Starts in ${formatRemaining(start - now)}`;
        fillClass = 'brand-progress-fill--pre';
        // Fill up the last 6 hours of countdown
        const sixH = 6 * 60 * 60 * 1000;
        widthPct = Math.max(0, Math.min(100, ((sixH - (start - now)) / sixH) * 100));
      } else if (now < end) {
        label = `${formatRemaining(end - now)} remaining`;
        fillClass = 'brand-progress-fill--live';
        widthPct = Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100));
      } else {
        label = 'Event ended';
        fillClass = 'brand-progress-fill--post';
        widthPct = 100;
      }
    }

    const rightText = hasSchedule
      ? `${formatHHMM(tournamentStartSE)} → ${formatHHMM(tournamentEndSE)}`
      : '';

    el.innerHTML = `
      <img src="/images/luckywipelogo.png" alt="" class="brand-logo">
      <span class="brand-title">${escapeHtml(title || 'M+ Tournament')}</span>
      <div class="brand-progress">
        <div class="brand-progress-fill ${fillClass}" style="width: ${widthPct.toFixed(1)}%"></div>
        <div class="brand-progress-label">${escapeHtml(label)}</div>
      </div>
      <span class="brand-time-right">${escapeHtml(rightText)}</span>
    `;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function render(el, { directorState }) {
    renderAt(el, {
      tournamentStartSE: directorState?.tournamentContext?.startSE || '',
      tournamentEndSE: directorState?.tournamentContext?.endSE || '',
      title: directorState?.tournamentContext?.title || 'M+ Tournament',
      now: Date.now(),
    });
  }

  window.BrandStrip = { render, renderAt };
})();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/progressBar.test.js`
Expected: all 4 tests pass.

- [ ] **Step 5: Add the brand strip styling**

Append to `public/compositor/compositor.css`:

```css
.brand-logo {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  object-fit: contain;
}

.brand-title {
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  font-size: 13px;
  white-space: nowrap;
}

.brand-progress {
  flex: 1;
  height: 14px;
  position: relative;
  background: #0a0a0f;
  border: 1px solid #2e2e36;
  border-radius: 7px;
  overflow: hidden;
}

.brand-progress-fill {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  transition: width 1s linear;
}
.brand-progress-fill--pre  { background: linear-gradient(90deg, #ffd700, #ff9500); }
.brand-progress-fill--live { background: linear-gradient(90deg, #4a9eff, #a366ff); }
.brand-progress-fill--post { background: linear-gradient(90deg, #4ade80, #22c55e); }
.brand-progress-fill--idle { background: #2e2e36; }

.brand-progress-label {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 0 4px rgba(0,0,0,0.8);
  white-space: nowrap;
}

.brand-time-right {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}
```

- [ ] **Step 6: Confirm tournamentContext is already in DEFAULTS**

Already added in Task 1. Verify by running: `node -e "console.log(require('./src/directorState').getState())"` — output should include `tournamentContext: { title: 'M+ Tournament', ... }`.

Run: `npm test`
Expected: all tests still pass.

- [ ] **Step 7: Set schedule via the admin endpoint and verify visually**

Run: `npm start`

Set a live-looking schedule via admin endpoint:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"tournamentContext": {"title": "Lucky Wipe M+ Tournament", "startSE": "2026-04-17T16:00:00+02:00", "endSE": "2026-04-17T22:00:00+02:00"}}' \
  http://localhost:3000/api/director
```

You'll need to extend the POST handler in webServer.js to pass through tournamentContext as a direct state set. Add to the POST `/api/director` handler:

```js
if (req.body.tournamentContext !== undefined) {
  directorState.state.tournamentContext = {
    ...directorState.state.tournamentContext,
    ...req.body.tournamentContext,
  };
  directorState._save();
  directorState.emit('change', directorState.getState());
}
```

Now open `http://localhost:3000/compositor/` — brand strip should show "Lucky Wipe M+ Tournament" with a progress bar showing time remaining in the window.

Stop server.

- [ ] **Step 8: Commit**

```bash
git add public/compositor/components/brand-strip.js public/compositor/compositor.css \
        src/directorState.js src/webServer.js tests/progressBar.test.js
git commit -m "feat: branding strip with live tournament progress bar"
```

---

## Task 7: Build Twitch embed manager

**Files:**
- Modify: `public/js/twitch-embed-manager.js`

No unit tests — this is a thin shim around Twitch's embed API that requires a real browser. We'll verify manually in Task 8's layout-A smoke test.

- [ ] **Step 1: Implement the embed manager**

Replace `public/js/twitch-embed-manager.js`:

```js
(function () {
  'use strict';

  const QUALITY_FOCUS = '720p30';
  const QUALITY_OFFSCREEN = '480p30';

  const embeds = {}; // teamName → { player, container, lastQuality, currentParent }
  const hiddenHost = document.createElement('div');
  hiddenHost.style.cssText = 'position:absolute;left:-99999px;top:-99999px;width:640px;height:360px;pointer-events:none;';
  document.body.appendChild(hiddenHost);

  let allMuted = true;
  let unmutedTeam = null;

  function buildEmbed(team) {
    if (!team.twitchChannel) return null;
    const container = document.createElement('div');
    container.className = 'twitch-embed-host';
    container.style.cssText = 'width:100%;height:100%;';
    hiddenHost.appendChild(container);

    const player = new Twitch.Player(container, {
      channel: team.twitchChannel,
      width: '100%',
      height: '100%',
      muted: true,
      autoplay: true,
      parent: [window.location.hostname],
    });

    player.addEventListener(Twitch.Player.PLAYING, () => {
      try {
        // Best-effort; availableQualities() is not guaranteed
        const qualities = player.getQualities ? player.getQualities() : [];
        const target = QUALITY_OFFSCREEN;
        const match = qualities.find(q => q.group === target) ||
                      qualities.find(q => q.group === '360p30') ||
                      qualities.find(q => q.group === '160p30');
        if (match) player.setQuality(match.group);
      } catch (err) {
        console.warn('[Twitch] setQuality failed for', team.twitchChannel, err);
      }
    });

    return { player, container, currentParent: hiddenHost, lastQuality: QUALITY_OFFSCREEN };
  }

  function syncTeams(teams) {
    const seen = new Set();
    teams.forEach(team => {
      if (!team.twitchChannel) return;
      seen.add(team.name);
      if (!embeds[team.name]) {
        const embed = buildEmbed(team);
        if (embed) embeds[team.name] = embed;
      }
    });
    // Tear down any embed for a team that no longer exists or lost its channel
    Object.keys(embeds).forEach(name => {
      if (!seen.has(name)) {
        try { embeds[name].player.pause(); } catch {}
        embeds[name].container.remove();
        delete embeds[name];
      }
    });
  }

  function mountInto(teamName, slotEl, options) {
    if (!teamName || !slotEl) return;
    const embed = embeds[teamName];
    if (!embed) {
      // No embed for this team (missing twitchChannel) — render a placeholder
      slotEl.innerHTML = `<div class="stream-tile-offline">${escapeHtml(teamName)} — no stream</div>`;
      return;
    }
    if (embed.currentParent !== slotEl) {
      slotEl.appendChild(embed.container);
      embed.currentParent = slotEl;
    }
    const desired = options && options.focused ? QUALITY_FOCUS : QUALITY_OFFSCREEN;
    if (desired !== embed.lastQuality) {
      try {
        const qualities = embed.player.getQualities ? embed.player.getQualities() : [];
        const match = qualities.find(q => q.group === desired);
        if (match) {
          embed.player.setQuality(match.group);
          embed.lastQuality = desired;
        }
      } catch {}
    }
  }

  function setMainAudio(unmuted, focusedTeam) {
    allMuted = !unmuted;
    unmutedTeam = unmuted ? focusedTeam : null;
    Object.entries(embeds).forEach(([name, e]) => {
      try {
        const shouldUnmute = unmuted && name === focusedTeam;
        e.player.setMuted(!shouldUnmute);
      } catch {}
    });
  }

  function detachAll() {
    Object.values(embeds).forEach(e => {
      if (e.currentParent !== hiddenHost) {
        hiddenHost.appendChild(e.container);
        e.currentParent = hiddenHost;
      }
    });
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.TwitchEmbedManager = { syncTeams, mountInto, setMainAudio, detachAll };
})();
```

- [ ] **Step 2: Style the embed host and the offline placeholder**

Append to `public/compositor/compositor.css`:

```css
.twitch-embed-host iframe {
  width: 100% !important;
  height: 100% !important;
  border: 0;
}

.stream-tile-offline {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #2a2a35, #1a1a22);
  color: var(--text-muted);
  font-size: 16px;
  font-weight: 600;
}
```

- [ ] **Step 3: Commit**

```bash
git add public/js/twitch-embed-manager.js public/compositor/compositor.css
git commit -m "feat: twitch embed manager with pre-instantiation and slot swap"
```

---

## Task 8: Build Layout A (main stream + HUD + mini-lb + alt-card)

**Files:**
- Modify: `public/compositor/layouts/layout-a.js`
- Modify: `public/compositor/components/dungeon-hud.js`
- Modify: `public/compositor/components/mini-leaderboard.js`
- Modify: `public/compositor/components/alt-card.js`
- Modify: `public/compositor/compositor.css`
- Create: `tests/layoutA.test.js`

- [ ] **Step 1: Write failing test for layout A mount + result flash**

Create `tests/layoutA.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

function loadCompositor() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'http://localhost/' });
  const w = dom.window;

  // Stub the Twitch global and embed manager
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/layoutA.test.js`
Expected: FAIL — the current stubs don't produce the expected structure.

- [ ] **Step 3: Implement the DungeonHud component**

Replace `public/compositor/components/dungeon-hud.js`:

```js
(function () {
  'use strict';

  function render(el, { team, run, rank, points }) {
    if (!team) {
      el.innerHTML = '<div class="hud-card hud-card--empty">No team selected</div>';
      return;
    }
    const dungeon = run ? escapeHtml(run.dungeonName || 'Starting…') : '—';
    const level = run && run.keystoneLevel ? `+${run.keystoneLevel}` : '—';
    el.innerHTML = `
      <div class="hud-card">
        <span class="hud-rank">#${rank ?? '—'}</span>
        <span class="hud-team">${escapeHtml(team.name)}</span>
        <span class="hud-dungeon">${dungeon}</span>
        <span class="hud-level">${level}</span>
        <span class="hud-points">${Number(points || 0)} pts</span>
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.DungeonHud = { render };
})();
```

- [ ] **Step 4: Implement the MiniLeaderboard component**

Replace `public/compositor/components/mini-leaderboard.js`:

```js
(function () {
  'use strict';

  const FLASH_MS = 8000;
  const flashTimers = new WeakMap();

  function render(el, { leaderboard }) {
    const top = (leaderboard || []).slice(0, 3);
    const rows = top.map((e, i) => {
      const medalClass = ['gold', 'silver', 'bronze'][i] || '';
      return `
        <div class="lb-row" data-team="${escapeHtml(e.teamName)}">
          <span class="lb-rank ${medalClass}">${e.rank} ${escapeHtml(e.teamName)}</span>
          <span class="lb-points">${Number(e.points || 0)}</span>
        </div>
      `;
    }).join('');
    el.innerHTML = `
      <div class="lb-card">
        <div class="lb-card-header">Top</div>
        ${rows || '<div class="lb-empty">No scores yet</div>'}
      </div>
    `;
  }

  function flash(el, teamName, pointsEarned) {
    if (!el || !teamName) return;
    const row = el.querySelector(`.lb-row[data-team="${cssEscape(teamName)}"]`);
    if (!row) return;

    // Insert the delta badge
    const pointsEl = row.querySelector('.lb-points');
    if (pointsEl && pointsEarned) {
      const existing = pointsEl.querySelector('.delta-badge');
      if (existing) existing.remove();
      const badge = document.createElement('span');
      badge.className = 'delta-badge';
      badge.textContent = `+${pointsEarned}`;
      pointsEl.appendChild(badge);
    }

    row.classList.add('flash');

    const prev = flashTimers.get(row);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      row.classList.remove('flash');
      const b = row.querySelector('.delta-badge');
      if (b) b.remove();
      flashTimers.delete(row);
    }, FLASH_MS);
    flashTimers.set(row, t);
  }

  function cssEscape(s) {
    return String(s || '').replace(/["\\]/g, '\\$&');
  }
  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.MiniLeaderboard = { render, flash };
})();
```

- [ ] **Step 5: Implement a basic AltCard (static — no rotation yet)**

Replace `public/compositor/components/alt-card.js`:

```js
(function () {
  'use strict';

  function render(el, { directorState }) {
    const slide = (directorState && directorState.altCard && directorState.altCard.pinnedSlide) || 'brand';
    let body;
    if (slide === 'brand') {
      body = `
        <div class="alt-slide alt-slide--brand">
          <img src="/images/luckywipelogo.png" alt="" class="alt-brand-logo">
          <div class="alt-brand-name">Lucky Wipe</div>
          <div class="alt-brand-tag">Presents</div>
        </div>
      `;
    } else if (slide === 'commands') {
      const list = (directorState?.commandsList || []).map(c =>
        `<code>${escapeHtml(c)}</code>`
      ).join(' ');
      body = `<div class="alt-slide alt-slide--commands">${list || 'No commands configured'}</div>`;
    } else {
      const html = directorState?.infoboxHtml || 'No info set';
      body = `<div class="alt-slide alt-slide--info">${html}</div>`;
    }
    el.innerHTML = `
      <div class="alt-card">
        <div class="alt-card-header">
          <span>${labelFor(slide)}</span>
        </div>
        <div class="alt-card-body">${body}</div>
      </div>
    `;
  }

  function labelFor(slide) {
    return { brand: 'Brand', commands: 'Commands', info: 'Info' }[slide] || slide;
  }
  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.AltCard = { render };
})();
```

- [ ] **Step 6: Implement Layout A**

Replace `public/compositor/layouts/layout-a.js`:

```js
(function () {
  'use strict';

  function mount(root) {
    root.innerHTML = `
      <div class="la-grid">
        <div class="la-main"></div>
        <div class="la-hud"></div>
        <div class="la-lb"></div>
        <div class="la-alt"></div>
      </div>
    `;
    const mainEl = root.querySelector('.la-main');
    const hudEl = root.querySelector('.la-hud');
    const lbEl = root.querySelector('.la-lb');
    const altEl = root.querySelector('.la-alt');

    let lastState = null;

    function update(state) {
      lastState = state;
      const featuredName = state.directorState?.slots?.main;
      const team = (state.teams || []).find(t => t.name === featuredName);
      const lbEntry = (state.leaderboard || []).find(e => e.teamName === featuredName);
      const run = (state.activeRuns || []).find(r => r.teamName === featuredName);

      // Main embed
      if (featuredName) {
        if (window.TwitchEmbedManager) {
          window.TwitchEmbedManager.mountInto(featuredName, mainEl, { focused: true });
        }
        // Add key-level chip overlay and team label
        ensureOverlay(mainEl, featuredName, run);
      } else {
        mainEl.innerHTML = '<div class="stream-tile-offline">No team selected</div>';
      }

      window.DungeonHud.render(hudEl, {
        team,
        run,
        rank: lbEntry?.rank,
        points: lbEntry?.points || 0,
      });
      window.MiniLeaderboard.render(lbEl, { leaderboard: state.leaderboard });
      window.AltCard.render(altEl, { directorState: state.directorState });
    }

    function ensureOverlay(el, teamName, run) {
      // Don't blow away the iframe — overlay elements live in a sibling layer
      let overlay = el.querySelector('.la-main-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'la-main-overlay';
        el.appendChild(overlay);
      }
      const level = run && run.keystoneLevel ? `+${run.keystoneLevel}` : '';
      const dungeon = run && run.dungeonName ? ` — ${escapeHtml(run.dungeonName)}` : '';
      overlay.innerHTML = `
        <div class="tile-label">${escapeHtml(teamName)}${dungeon}</div>
        ${level ? `<div class="tile-keylevel">${level}</div>` : ''}
      `;
    }

    function onRunComplete(payload) {
      window.MiniLeaderboard.flash(lbEl, payload.teamName, payload.pointsEarned);
    }

    function unmount() {
      if (window.TwitchEmbedManager) window.TwitchEmbedManager.detachAll();
    }

    function escapeHtml(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    return { update, unmount, onRunComplete };
  }

  window.LayoutA = { mount };
})();
```

- [ ] **Step 7: Add Layout A styling**

Append to `public/compositor/compositor.css`:

```css
/* ── Layout A ───────────────────────────────────────────── */
.compositor.layout-A .la-grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: 1fr 120px;
  grid-template-columns: 3fr 2fr 2fr;
  gap: 6px;
  padding: 6px;
}
.compositor.layout-A .la-main {
  grid-column: 1 / -1;
  grid-row: 1;
  background: #0a0a0f;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}
.compositor.layout-A .la-hud { grid-column: 1; grid-row: 2; }
.compositor.layout-A .la-lb  { grid-column: 2; grid-row: 2; }
.compositor.layout-A .la-alt { grid-column: 3; grid-row: 2; }

.la-main-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.la-main-overlay .tile-label {
  position: absolute;
  bottom: 12px;
  left: 16px;
  font-size: 18px;
  font-weight: 700;
  padding: 4px 12px;
  background: rgba(0,0,0,0.65);
  border-radius: 3px;
  color: #fff;
}
.la-main-overlay .tile-keylevel {
  position: absolute;
  top: 12px;
  right: 16px;
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 22px;
  padding: 4px 12px;
  background: rgba(74, 158, 255, 0.85);
  border-radius: 4px;
  color: #fff;
}

/* HUD card */
.hud-card {
  height: 100%;
  background: rgba(15, 15, 22, 0.92);
  border-radius: 4px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 14px;
  color: #e8ecf4;
  font-size: 18px;
}
.hud-rank {
  font-family: var(--font-mono);
  font-weight: 700;
  color: #ffd700;
  background: rgba(255,215,0,0.12);
  padding: 2px 10px;
  border-radius: 3px;
}
.hud-team { font-weight: 700; color: #fff; }
.hud-dungeon {
  color: var(--text-muted);
  border-left: 1px solid #2e2e36;
  padding-left: 14px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hud-level {
  font-family: var(--font-mono);
  font-weight: 700;
  color: var(--accent-blue);
}
.hud-points {
  font-family: var(--font-mono);
  font-weight: 700;
  color: #fff;
}

/* Mini leaderboard */
.lb-card {
  height: 100%;
  background: rgba(15, 15, 22, 0.92);
  border-left: 3px solid var(--accent-blue);
  border-radius: 4px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: #e8ecf4;
  font-size: 15px;
}
.lb-card-header {
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 700;
  margin-bottom: 2px;
}
.lb-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 3px 6px;
  border-radius: 2px;
}
.lb-row .lb-rank.gold   { color: #ffd700; }
.lb-row .lb-rank.silver { color: #c0c0c0; }
.lb-row .lb-rank.bronze { color: #cd7f32; }
.lb-row .lb-points { font-family: var(--font-mono); font-weight: 700; }
.delta-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 1px 6px;
  background: rgba(74, 222, 128, 0.2);
  color: #4ade80;
  font-size: 11px;
  font-weight: 700;
  border-radius: 2px;
}

/* Result flash */
@keyframes lb-flash-pulse {
  0%, 100% { background: linear-gradient(90deg, rgba(74,222,128,0.35), rgba(74,222,128,0.1)); }
  50%      { background: linear-gradient(90deg, rgba(74,222,128,0.55), rgba(74,222,128,0.2)); }
}
.lb-row.flash {
  animation: lb-flash-pulse 1.4s ease-in-out infinite;
}

/* Alt card */
.alt-card {
  height: 100%;
  background: rgba(15, 15, 22, 0.92);
  border-left: 3px solid #a366ff;
  border-radius: 4px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  color: #e8ecf4;
  font-size: 15px;
  overflow: hidden;
}
.alt-card-header {
  text-transform: uppercase;
  letter-spacing: 1px;
  font-size: 11px;
  color: #a366ff;
  font-weight: 700;
  margin-bottom: 4px;
}
.alt-card-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.alt-slide--brand { text-align: center; }
.alt-brand-logo { width: 42px; height: 42px; border-radius: 6px; object-fit: contain; }
.alt-brand-name { font-weight: 700; font-size: 15px; color: #fff; margin-top: 4px; }
.alt-brand-tag { font-size: 11px; color: var(--text-muted); }
.alt-slide--commands code {
  background: rgba(74, 222, 128, 0.12);
  color: #4ade80;
  font-family: var(--font-mono);
  padding: 2px 6px;
  border-radius: 3px;
  margin: 2px;
  display: inline-block;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test -- tests/layoutA.test.js`
Expected: all 3 tests pass.

- [ ] **Step 9: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 10: Manual smoke test in browser**

Run: `npm start`

In the browser:
1. Open an admin page and assign a `twitchChannel` to one team (pick a team that's actually live streaming right now, or use any public live Twitch channel as a stand-in).
2. POST to `/api/director`:
   ```bash
   curl -X POST -H "Content-Type: application/json" \
     -d '{"layout":"A","slot":"main","team":"ALPHA"}' \
     http://localhost:3000/api/director
   ```
3. Open `http://localhost:3000/compositor/`.

Expected:
- Brand strip on top.
- Main stream area shows the Twitch embed (if channel is live) or "no stream" placeholder.
- HUD card shows team name, rank, points.
- Mini leaderboard shows top 3.
- Alt card shows "Brand" slide with the guild logo.

4. Trigger a fake run complete to exercise the flash. Simplest method: open browser devtools on the compositor page and paste into the console:
   ```js
   io.emit?.bind?.(null); // noop to ensure console has socket
   // Access the socket the compositor already opened
   const s = io();
   // Trigger the flash path directly via the layout's onRunComplete handler
   ```
   Or, via the admin panel (if any team has an active run), complete it. Or most simply — add a one-line admin endpoint next to `/api/director`:
   ```js
   app.post('/api/test/run-complete', express.json(), (req, res) => {
     stateManager.emit('run:complete', req.body);
     res.json({ ok: true });
   });
   ```
   then:
   ```bash
   curl -X POST -H "Content-Type: application/json" \
     -d '{"teamName":"BRAVO","pointsEarned":14,"newTotal":98,"newRank":2,"previousRank":3}' \
     http://localhost:3000/api/test/run-complete
   ```
   Verify the leaderboard row pulses green for 8s and shows a `+14` delta badge. Remove the test endpoint (or guard it with `if (process.env.NODE_ENV !== 'production')`) before the tournament.

Stop server.

- [ ] **Step 11: Commit**

```bash
git add public/compositor tests/layoutA.test.js
git commit -m "feat: layout A with dungeon HUD, mini leaderboard, alt card, result flash"
```

---

## Task 9: Build full-leaderboard component

**Files:**
- Modify: `public/compositor/components/full-leaderboard.js`
- Modify: `public/compositor/compositor.css`

- [ ] **Step 1: Implement FullLeaderboard**

Replace `public/compositor/components/full-leaderboard.js`:

```js
(function () {
  'use strict';

  const FLASH_MS = 8000;
  const flashTimers = new WeakMap();

  function render(el, { leaderboard, title, showRuns }) {
    const rows = (leaderboard || []).map((e) => {
      const medalClass = e.rank === 1 ? 'gold' : e.rank === 2 ? 'silver' : e.rank === 3 ? 'bronze' : '';
      const runs = showRuns ? `<span class="flb-runs">${e.runs ?? 0} runs</span>` : '';
      return `
        <div class="flb-row" data-team="${escapeAttr(e.teamName)}">
          <span class="flb-rank ${medalClass}">${e.rank}</span>
          <span class="flb-name">${escapeHtml(e.teamName)}</span>
          ${runs}
          <span class="flb-points">${Number(e.points || 0)}</span>
        </div>
      `;
    }).join('');
    el.innerHTML = `
      <div class="flb-card">
        <div class="flb-header">${escapeHtml(title || 'Standings')}</div>
        <div class="flb-rows">${rows || '<div class="flb-empty">No scores yet</div>'}</div>
      </div>
    `;
  }

  function flash(el, teamName, pointsEarned) {
    if (!el || !teamName) return;
    const row = el.querySelector(`.flb-row[data-team="${cssEscape(teamName)}"]`);
    if (!row) return;

    const pointsEl = row.querySelector('.flb-points');
    if (pointsEl && pointsEarned) {
      const existing = pointsEl.querySelector('.delta-badge');
      if (existing) existing.remove();
      const badge = document.createElement('span');
      badge.className = 'delta-badge';
      badge.textContent = `+${pointsEarned}`;
      pointsEl.appendChild(badge);
    }

    row.classList.add('flash');
    const prev = flashTimers.get(row);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => {
      row.classList.remove('flash');
      const b = row.querySelector('.delta-badge');
      if (b) b.remove();
      flashTimers.delete(row);
    }, FLASH_MS);
    flashTimers.set(row, t);
  }

  function cssEscape(s) { return String(s || '').replace(/["\\]/g, '\\$&'); }
  function escapeAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }
  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.FullLeaderboard = { render, flash };
})();
```

- [ ] **Step 2: Add FullLeaderboard styling**

Append to `public/compositor/compositor.css`:

```css
.flb-card {
  height: 100%;
  background: rgba(15,15,22,0.95);
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.flb-header {
  padding: 10px 16px;
  background: var(--bg-secondary);
  color: #fff;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 1px;
  text-transform: uppercase;
  border-bottom: 1px solid var(--border-subtle);
}
.flb-rows { flex: 1; padding: 8px; overflow: hidden; display: flex; flex-direction: column; gap: 4px; }
.flb-row {
  display: grid;
  grid-template-columns: 40px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 6px 10px;
  background: rgba(40,40,50,0.45);
  border-radius: 3px;
  color: #e8ecf4;
}
.flb-row .flb-rank {
  font-family: var(--font-mono);
  font-weight: 700;
  text-align: right;
  color: var(--text-muted);
}
.flb-row .flb-rank.gold   { color: #ffd700; }
.flb-row .flb-rank.silver { color: #c0c0c0; }
.flb-row .flb-rank.bronze { color: #cd7f32; }
.flb-row .flb-name {
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.flb-row .flb-runs {
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 13px;
  margin-right: 8px;
}
.flb-row .flb-points {
  font-family: var(--font-mono);
  font-weight: 700;
}
.flb-row.flash {
  animation: lb-flash-pulse 1.4s ease-in-out infinite;
}
```

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all tests pass (no new ones added; existing still green).

- [ ] **Step 4: Commit**

```bash
git add public/compositor/components/full-leaderboard.js public/compositor/compositor.css
git commit -m "feat: FullLeaderboard component with result flash"
```

---

## Task 10: Build Layout C (grid 6 + leaderboard sidebar)

**Files:**
- Modify: `public/compositor/layouts/layout-c.js`
- Modify: `public/compositor/compositor.css`

- [ ] **Step 1: Implement Layout C**

Replace `public/compositor/layouts/layout-c.js`:

```js
(function () {
  'use strict';

  const GRID_SIZE = 6;

  function mount(root) {
    root.innerHTML = `
      <div class="lc-grid">
        ${Array.from({ length: GRID_SIZE }, (_, i) =>
          `<div class="lc-tile" data-slot="${i}"></div>`
        ).join('')}
        <div class="lc-sidebar"></div>
      </div>
    `;
    const tileEls = Array.from(root.querySelectorAll('.lc-tile'));
    const sidebarEl = root.querySelector('.lc-sidebar');

    function update(state) {
      const grid = state.directorState?.slots?.grid || [];
      tileEls.forEach((tileEl, i) => {
        const teamName = grid[i];
        tileEl.innerHTML = '';
        if (!teamName) {
          tileEl.classList.add('lc-tile--empty');
          tileEl.innerHTML = `<div class="stream-tile-offline">Slot ${i + 1} empty</div>`;
          return;
        }
        tileEl.classList.remove('lc-tile--empty');
        if (window.TwitchEmbedManager) {
          window.TwitchEmbedManager.mountInto(teamName, tileEl, { focused: false });
        }
        // Overlay on top of the embed
        const overlay = document.createElement('div');
        overlay.className = 'lc-tile-overlay';
        const run = (state.activeRuns || []).find(r => r.teamName === teamName);
        const level = run?.keystoneLevel ? `+${run.keystoneLevel}` : '';
        overlay.innerHTML = `
          <div class="tile-label">${escapeHtml(teamName)}</div>
          ${level ? `<div class="tile-keylevel">${level}</div>` : ''}
        `;
        tileEl.appendChild(overlay);
      });

      // Full leaderboard in sidebar (with runs count if available)
      window.FullLeaderboard.render(sidebarEl, {
        leaderboard: state.leaderboard,
        title: 'Standings',
        showRuns: true,
      });
    }

    function onRunComplete(payload) {
      window.FullLeaderboard.flash(sidebarEl, payload.teamName, payload.pointsEarned);
    }

    function unmount() {
      if (window.TwitchEmbedManager) window.TwitchEmbedManager.detachAll();
    }

    function escapeHtml(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    return { update, unmount, onRunComplete };
  }

  window.LayoutC = { mount };
})();
```

- [ ] **Step 2: Add Layout C styling**

Append to `public/compositor/compositor.css`:

```css
.compositor.layout-C .lc-grid {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-rows: 1fr 1fr;
  grid-template-columns: 1fr 1fr 1fr 360px;
  gap: 6px;
  padding: 6px;
}
.compositor.layout-C .lc-tile {
  position: relative;
  background: #0a0a0f;
  border-radius: 4px;
  overflow: hidden;
}
.compositor.layout-C .lc-tile:nth-child(1) { grid-column: 1; grid-row: 1; }
.compositor.layout-C .lc-tile:nth-child(2) { grid-column: 2; grid-row: 1; }
.compositor.layout-C .lc-tile:nth-child(3) { grid-column: 3; grid-row: 1; }
.compositor.layout-C .lc-tile:nth-child(4) { grid-column: 1; grid-row: 2; }
.compositor.layout-C .lc-tile:nth-child(5) { grid-column: 2; grid-row: 2; }
.compositor.layout-C .lc-tile:nth-child(6) { grid-column: 3; grid-row: 2; }
.compositor.layout-C .lc-sidebar {
  grid-column: 4;
  grid-row: 1 / -1;
}
.lc-tile-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
```

- [ ] **Step 3: Smoke test**

Run: `npm start`
POST:
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"layout":"C","slot":"grid[0]","team":"ALPHA"}' http://localhost:3000/api/director
curl -X POST -H "Content-Type: application/json" \
  -d '{"slot":"grid[1]","team":"BRAVO"}' http://localhost:3000/api/director
```

Open compositor; expected: 3×2 grid with ALPHA in top-left, BRAVO in top-middle, "Slot N empty" in other tiles. Sidebar shows standings.

Stop server.

- [ ] **Step 4: Commit**

```bash
git add public/compositor/layouts/layout-c.js public/compositor/compositor.css
git commit -m "feat: layout C — 6-tile grid with standings sidebar"
```

---

## Task 11: Build Layout LB (fullscreen leaderboard)

**Files:**
- Modify: `public/compositor/layouts/layout-lb.js`
- Modify: `public/compositor/compositor.css`

- [ ] **Step 1: Implement Layout LB**

Replace `public/compositor/layouts/layout-lb.js`:

```js
(function () {
  'use strict';

  function mount(root) {
    root.innerHTML = `
      <div class="llb-wrap">
        <div class="llb-panel">
          <div class="llb-panel-header">
            <img src="/images/luckywipelogo.png" alt="" class="llb-header-logo">
            <span class="llb-header-title">Standings</span>
          </div>
          <div class="llb-rows"></div>
        </div>
      </div>
    `;
    const rowsEl = root.querySelector('.llb-rows');

    function update(state) {
      // Re-use FullLeaderboard but mount into an inner container without its own header
      const leaderboard = (state.leaderboard || []).slice(0, 10);
      rowsEl.innerHTML = leaderboard.map(e => {
        const medal = e.rank === 1 ? 'gold' : e.rank === 2 ? 'silver' : e.rank === 3 ? 'bronze' : '';
        return `
          <div class="llb-row" data-team="${escapeAttr(e.teamName)}">
            <span class="llb-rank ${medal}">${e.rank}</span>
            <span class="llb-name">${escapeHtml(e.teamName)}</span>
            <span class="llb-runs">${e.runs ?? 0} runs</span>
            <span class="llb-points">${Number(e.points || 0)}</span>
          </div>
        `;
      }).join('');
    }

    const flashTimers = new WeakMap();
    function onRunComplete(payload) {
      const row = rowsEl.querySelector(`.llb-row[data-team="${cssEscape(payload.teamName)}"]`);
      if (!row) return;
      const pointsEl = row.querySelector('.llb-points');
      if (pointsEl && payload.pointsEarned) {
        const existing = pointsEl.querySelector('.delta-badge');
        if (existing) existing.remove();
        const badge = document.createElement('span');
        badge.className = 'delta-badge';
        badge.textContent = `+${payload.pointsEarned}`;
        pointsEl.appendChild(badge);
      }
      row.classList.add('flash');
      const prev = flashTimers.get(row);
      if (prev) clearTimeout(prev);
      const t = setTimeout(() => {
        row.classList.remove('flash');
        const b = row.querySelector('.delta-badge');
        if (b) b.remove();
        flashTimers.delete(row);
      }, 8000);
      flashTimers.set(row, t);
    }

    function unmount() {
      if (window.TwitchEmbedManager) window.TwitchEmbedManager.detachAll();
    }

    function cssEscape(s) { return String(s || '').replace(/["\\]/g, '\\$&'); }
    function escapeAttr(s) { return String(s || '').replace(/"/g, '&quot;'); }
    function escapeHtml(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    return { update, unmount, onRunComplete };
  }

  window.LayoutLB = { mount };
})();
```

- [ ] **Step 2: Add Layout LB styling**

Append to `public/compositor/compositor.css`:

```css
.compositor.layout-LB .llb-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.llb-panel {
  width: 1400px;
  max-height: 100%;
  background: rgba(15, 15, 22, 0.96);
  border: 2px solid rgba(74, 158, 255, 0.4);
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.llb-panel-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 28px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
}
.llb-header-logo { width: 44px; height: 44px; border-radius: 6px; object-fit: contain; }
.llb-header-title {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 2px;
}
.llb-rows {
  padding: 20px 28px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.llb-row {
  display: grid;
  grid-template-columns: 70px 1fr auto auto;
  gap: 24px;
  align-items: center;
  padding: 14px 20px;
  background: rgba(40,40,50,0.5);
  border-radius: 6px;
  font-size: 22px;
  color: #e8ecf4;
}
.llb-rank {
  font-family: var(--font-mono);
  font-weight: 800;
  text-align: right;
  color: var(--text-muted);
  font-size: 28px;
}
.llb-rank.gold   { color: #ffd700; }
.llb-rank.silver { color: #c0c0c0; }
.llb-rank.bronze { color: #cd7f32; }
.llb-name { font-weight: 700; color: #fff; }
.llb-runs { color: var(--text-muted); font-family: var(--font-mono); font-size: 16px; }
.llb-points { font-family: var(--font-mono); font-weight: 800; font-size: 26px; }
.llb-row.flash {
  animation: lb-flash-pulse 1.4s ease-in-out infinite;
}
```

- [ ] **Step 3: Ensure leaderboard entries carry a `runs` count**

The compositor expects `e.runs` on each leaderboard entry. First inspect the existing code:
```bash
grep -n "wclMeta\|runCount\|refreshLeaderboard" src/stateManager.js src/wclStorage.js
```

`wclMeta` is stored in `data/wcl.json` and accessed via `wclStorage`. Confirm which module exposes it and how runCount is tracked (the run count increments on each recorded run).

Then find `refreshLeaderboard` in `src/stateManager.js` and locate the `.map` that builds the leaderboard entries. Extend it to include `runs`:

```js
const wclStorage = require('./wclStorage');
// ...inside refreshLeaderboard, in the .map step:
.map((entry, i) => {
  const meta = wclStorage.getMetaForTeam ? wclStorage.getMetaForTeam(entry.teamName) : null;
  return {
    rank: i + 1,
    teamName: entry.teamName,
    points: entry.points,
    runs: (meta && meta.runCount) || 0,
  };
});
```

If `getMetaForTeam` doesn't exist on `wclStorage`, add it — a one-liner reading `wclMeta[teamName]` from the cached data. Alternatively read directly: `cache.wclMeta[entry.teamName]?.runCount || 0`. Pick whichever matches the module's existing access patterns.

Verify:
```bash
npm start
curl http://localhost:3000/api/state | head -50
```
Expected: leaderboard entries now include a `runs` field.

- [ ] **Step 4: Smoke test**

Run: `npm start`
```bash
curl -X POST -H "Content-Type: application/json" -d '{"layout":"LB"}' http://localhost:3000/api/director
```
Open compositor. Expected: big standings panel centered, with team rank/name/runs/points rows.

Stop server.

- [ ] **Step 5: Commit**

```bash
git add public/compositor/layouts/layout-lb.js public/compositor/compositor.css src/stateManager.js
git commit -m "feat: layout LB fullscreen leaderboard with runs count"
```

---

## Task 12: Build best-times reader and API endpoint

**Files:**
- Create: `src/bestTimes.js`
- Create: `tests/bestTimes.test.js`
- Modify: `src/webServer.js`

- [ ] **Step 1: Write failing test for best-times reader**

Create `tests/bestTimes.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/bestTimes.test.js`
Expected: FAIL — `Cannot find module '../src/bestTimes'`.

- [ ] **Step 3: Implement bestTimes module**

Create `src/bestTimes.js`:

```js
const fs = require('fs');
const path = require('path');

const SCORES_CSV = path.join(__dirname, '..', 'data', 'wcl_scores.csv');

function computeBestTimes(rows) {
  const timed = rows.filter(r => Number(r.upgrades) > 0 && Number(r.duration_ms) > 0);
  const byDungeon = {};
  for (const r of timed) {
    const key = r.dungeon;
    if (!byDungeon[key] || Number(r.duration_ms) < byDungeon[key].duration_ms) {
      byDungeon[key] = {
        dungeon: key,
        team: r.team,
        level: Number(r.level),
        upgrades: Number(r.upgrades),
        duration_ms: Number(r.duration_ms),
      };
    }
  }
  return Object.values(byDungeon).sort((a, b) => a.duration_ms - b.duration_ms);
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i]; });
    return obj;
  });
}

function readBestTimes() {
  try {
    if (!fs.existsSync(SCORES_CSV)) return [];
    const text = fs.readFileSync(SCORES_CSV, 'utf8');
    return computeBestTimes(parseCsv(text));
  } catch (err) {
    console.warn('[BestTimes] read failed:', err.message);
    return [];
  }
}

module.exports = { computeBestTimes, readBestTimes };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/bestTimes.test.js`
Expected: 3 tests pass.

- [ ] **Step 5: Add the /api/best-times endpoint**

In `src/webServer.js`, near the other `app.get` routes, add:

```js
const { readBestTimes } = require('./bestTimes');
// ...
app.get('/api/best-times', (req, res) => {
  res.json(readBestTimes());
});
```

Move the `require` line to the top with the other requires.

- [ ] **Step 6: Commit**

```bash
git add src/bestTimes.js tests/bestTimes.test.js src/webServer.js
git commit -m "feat: best-times computation and /api/best-times endpoint"
```

---

## Task 13: Build Layout BT (fullscreen best times)

**Files:**
- Modify: `public/compositor/layouts/layout-bt.js`
- Modify: `public/compositor/compositor.css`

- [ ] **Step 1: Implement Layout BT**

Replace `public/compositor/layouts/layout-bt.js`:

```js
(function () {
  'use strict';

  function formatDuration(ms) {
    const totalSec = Math.floor(Number(ms) / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function mount(root) {
    root.innerHTML = `
      <div class="lbt-wrap">
        <div class="lbt-panel">
          <div class="lbt-panel-header">
            <img src="/images/luckywipelogo.png" alt="" class="lbt-header-logo">
            <span class="lbt-header-title">Best times</span>
          </div>
          <div class="lbt-grid"></div>
        </div>
      </div>
    `;
    const gridEl = root.querySelector('.lbt-grid');
    let timer = null;

    async function load() {
      try {
        const res = await fetch('/api/best-times');
        const data = await res.json();
        render(data);
      } catch (err) {
        gridEl.innerHTML = `<div class="lbt-empty">Failed to load: ${err.message}</div>`;
      }
    }

    function render(items) {
      if (!items || items.length === 0) {
        gridEl.innerHTML = '<div class="lbt-empty">No timed runs yet</div>';
        return;
      }
      gridEl.innerHTML = items.map(it => `
        <div class="lbt-cell">
          <div class="lbt-cell-dungeon">${escapeHtml(it.dungeon)}</div>
          <div class="lbt-cell-time">${formatDuration(it.duration_ms)}</div>
          <div class="lbt-cell-meta">
            <span class="lbt-cell-team">${escapeHtml(it.team)}</span>
            <span class="lbt-cell-level">+${it.level}</span>
            <span class="lbt-cell-upg">${'★'.repeat(it.upgrades)}</span>
          </div>
        </div>
      `).join('');
    }

    function update() {
      // nothing per-state; best times fetched independently
    }

    function unmount() {
      if (timer) clearInterval(timer);
      if (window.TwitchEmbedManager) window.TwitchEmbedManager.detachAll();
    }

    load();
    timer = setInterval(load, 30000); // re-fetch every 30s

    function escapeHtml(s) {
      return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    return { update, unmount, onRunComplete: load };
  }

  window.LayoutBT = { mount };
})();
```

- [ ] **Step 2: Add Layout BT styling**

Append to `public/compositor/compositor.css`:

```css
.compositor.layout-BT .lbt-wrap {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
}
.lbt-panel {
  width: 1600px;
  max-height: 100%;
  background: rgba(15,15,22,0.96);
  border: 2px solid rgba(74, 158, 255, 0.4);
  border-radius: 10px;
  box-shadow: 0 10px 40px rgba(0,0,0,0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.lbt-panel-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 28px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
}
.lbt-header-logo { width: 44px; height: 44px; border-radius: 6px; object-fit: contain; }
.lbt-header-title {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 2px;
}
.lbt-grid {
  padding: 24px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 18px;
}
.lbt-cell {
  background: rgba(40,40,50,0.5);
  border-radius: 8px;
  padding: 20px;
  color: #e8ecf4;
  border-left: 4px solid var(--accent-blue);
}
.lbt-cell-dungeon {
  font-size: 16px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 6px;
}
.lbt-cell-time {
  font-family: var(--font-mono);
  font-size: 40px;
  font-weight: 800;
  color: #fff;
  line-height: 1;
}
.lbt-cell-meta {
  display: flex;
  gap: 14px;
  align-items: center;
  margin-top: 10px;
  font-family: var(--font-mono);
  font-size: 14px;
}
.lbt-cell-team { font-weight: 700; color: var(--accent-blue); }
.lbt-cell-level { color: var(--text-muted); }
.lbt-cell-upg { color: #ffd700; }
.lbt-empty {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  font-size: 16px;
}
```

- [ ] **Step 3: Smoke test**

Run: `npm start`
```bash
curl -X POST -H "Content-Type: application/json" -d '{"layout":"BT"}' http://localhost:3000/api/director
```
Open compositor. Expected: best times panel with dungeon cards. If `wcl_scores.csv` has data, you'll see actual times; otherwise "No timed runs yet".

Stop server.

- [ ] **Step 4: Commit**

```bash
git add public/compositor/layouts/layout-bt.js public/compositor/compositor.css
git commit -m "feat: layout BT fullscreen best-times panel"
```

---

## Task 14: End-to-end smoke test in OBS

**Files:**
- Create: `docs/compositor-obs-setup.md`

No code in this task — set up and verify OBS captures the compositor correctly.

- [ ] **Step 1: Document OBS setup**

Create `docs/compositor-obs-setup.md`:

```markdown
# OBS setup for compositor Phase 1

Phase 1 replaces the stream-overlay, scoreboard-fullscreen, best-times-overlay, and countdown OBS scenes with a single compositor page.

## One-time setup

1. In OBS, create a new scene named **Main**.
2. Add a new source: **Browser**.
   - URL: `http://localhost:3000/compositor/`
   - Width: `1920`, Height: `1080`
   - **Uncheck** "Shutdown source when not visible"
   - **Uncheck** "Refresh browser when scene becomes active"
3. Save the source.
4. **Log in to Twitch** (for Turbo ad-free):
   - Right-click the source → **Interact**
   - Navigate to `https://twitch.tv/login`, sign in with the Turbo account
   - Close Interact
5. Keep your existing **Technical difficulties** and **Break/Info** scenes as they are.

## Changing layouts in Phase 1

Until the caster panel lands in Phase 2, use curl to drive the compositor:

```
# Pick a layout
curl -X POST -H "Content-Type: application/json" \
  -d '{"layout":"A"}' \
  http://localhost:3000/api/director

# Assign a team to the main slot (Layout A)
curl -X POST -H "Content-Type: application/json" \
  -d '{"slot":"main","team":"ALPHA"}' \
  http://localhost:3000/api/director

# Fill the 6-up grid (Layout C)
curl -X POST -H "Content-Type: application/json" \
  -d '{"slot":"grid[0]","team":"ALPHA"}' \
  http://localhost:3000/api/director
curl -X POST -H "Content-Type: application/json" \
  -d '{"slot":"grid[1]","team":"BRAVO"}' \
  http://localhost:3000/api/director
# ...etc
```

Valid layouts: `PRE`, `A`, `C`, `D`, `G`, `LB`, `BT`. Note: Phase 1 implements `A`, `C`, `LB`, `BT`. `PRE`, `D`, `G` land in Phase 2.

## Troubleshooting

- **Streams show ads**: verify you logged in via OBS Interact and that cookies persisted. Fallback: use Chrome window capture pointing at the same URL.
- **Streams don't load**: check browser source console via Interact. Twitch requires `parent` to match the hostname serving the page — if you're serving from anything but `localhost`, the compositor code will use `window.location.hostname` automatically.
- **Layout doesn't change**: check `http://localhost:3000/api/director` returns the expected state. Compositor listens via Socket.io — if the socket disconnected, refresh the browser source.
```

- [ ] **Step 2: End-to-end walkthrough with the server running**

Run: `npm start`

Execute this checklist with real OBS:

1. Open OBS, add the Main scene with the compositor browser source per the guide above.
2. Verify the brand strip shows the tournament title and progress bar.
3. Assign a `twitchChannel` to two teams via the admin panel (use any public live channel for testing).
4. POST to switch to Layout A and focus one team. Verify the Twitch embed renders in the main area.
5. POST to switch to Layout C and fill grid slots. Verify 3×2 grid renders.
6. POST to switch to Layout LB. Verify the big standings panel centers on the canvas.
7. POST to switch to Layout BT. Verify best-times panel renders (real data if CSV has runs, empty state otherwise).
8. In the admin panel, manually trigger a run complete for a team. Verify the mini-leaderboard (Layout A) or sidebar (Layout C) or full panel (Layout LB) flashes green for ~8s with a `+N` delta.
9. Check OBS: the browser source captures the compositor cleanly at 1920×1080.

If any step fails, diagnose and add the fix as a follow-up task.

Stop server.

- [ ] **Step 3: Commit the docs**

```bash
git add docs/compositor-obs-setup.md
git commit -m "docs: OBS setup guide for compositor phase 1"
```

---

## Task 15: Final integration — ensure layout switching detaches embeds cleanly

**Files:**
- Modify: `public/compositor/compositor.js`

- [ ] **Step 1: Verify embed detach on layout change**

The current `render()` function in `public/compositor/compositor.js` calls `activeLayoutInstance.unmount()` when switching layouts. Each layout's `unmount()` calls `TwitchEmbedManager.detachAll()`, which re-parents embeds back to the hidden host. This prevents embed destruction and keeps teams' streams pre-warmed.

Add a defensive check — if the compositor boots with a layout that doesn't exist (e.g., `PRE` in Phase 1), it should fall back to layout A:

Locate the section in `public/compositor/compositor.js` that sets `desired = state.directorState.activeLayout;` and modify:

```js
let desired = state.directorState.activeLayout;
if (!layouts[desired]) {
  console.warn(`[Compositor] Layout ${desired} not available in Phase 1, falling back to A`);
  desired = 'A';
}
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 3: Manual smoke**

Run: `npm start`
```bash
curl -X POST -H "Content-Type: application/json" -d '{"layout":"PRE"}' http://localhost:3000/api/director
```
Open compositor. Expected: falls back to Layout A with a console warning, not a blank page.

Stop server.

- [ ] **Step 4: Commit**

```bash
git add public/compositor/compositor.js
git commit -m "feat: compositor falls back to layout A for unimplemented layouts"
```

---

## Wrap-up

At the end of this plan, the `feat/compositor-phase-1` branch has:

- A working `/compositor` page that renders in OBS as a single 1920×1080 browser source
- Four layout modes: **A** (focus 1-up), **C** (grid 6), **LB** (fullscreen leaderboard), **BT** (fullscreen best times)
- A `directorState` module persisted to disk, broadcast over Socket.io, controllable via temporary `/api/director` admin endpoint
- Twitch embeds pre-instantiated and re-parented on slot changes (no re-init latency)
- Result-flash animation on leaderboards when runs complete
- Extended `run:complete` payload carrying rank/total deltas
- Team records with `twitchChannel` field + admin form input
- `node:test` + `jsdom` test framework with unit coverage for directorState, progressBar, bestTimes, run-complete payload, and layout A

**Deferred to Phase 2:** caster panel, layouts PRE/D/G, OBS scene switching over `obs-websocket`, authenticated Socket.io director events, alt-card rotation.

**Deferred to Phase 3:** retiring old overlay pages, caster-editable infobox/commands content, integration tests with real Twitch streams.

Merge this branch into master once the Task 14 OBS smoke test passes. The `v2.0.0-pre-compositor` tag remains available as a rollback point.
