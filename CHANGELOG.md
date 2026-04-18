# Changelog

## 2026-04-18

### Improvements
- **Compositor brand strip renders live tournament progress bar** — `public/compositor/components/brand-strip.js` now renders the logo, title, a segmented progress bar (pre-event gold, live blue/purple, post-event green, idle grey), and the scheduled start/end times. The bar fills over the last 6 hours before start, tracks elapsed percentage during the event, and shows "Event ended" / "Schedule not set" fallbacks. Corresponding styles added to `public/compositor/compositor.css`.

### Tests
- Added `tests/progressBar.test.js` — Covers pre-event, during-event (~50% at halfway), post-event, and missing-schedule rendering paths of `BrandStrip.renderAt`.

## 2026-04-17

### New Files
- `public/compositor/index.html` — HTML shell for the 1920x1080 compositor page. Loads all component/layout scripts and the Socket.io client.
- `public/compositor/compositor.css` — Base CSS: fixed 1920x1080 canvas, brand-strip sizing, layout-root flex container, and `.stream-tile` shared tile styles.
- `public/compositor/compositor.js` — Entry point IIFE. Connects to Socket.io, handles `state:sync`, `scoreboard:update`, `activeRuns:update`, `director:state`, and `run:complete` events. Drives layout switching and per-frame updates.
- `public/compositor/layouts/layout-a.js` — Stub for Layout A (2-stream + mini-leaderboard).
- `public/compositor/layouts/layout-c.js` — Stub for Layout C (4-stream grid).
- `public/compositor/layouts/layout-lb.js` — Stub for Layout LB (full leaderboard).
- `public/compositor/layouts/layout-bt.js` — Stub for Layout BT (best-times).
- `public/compositor/components/brand-strip.js` — Stub for the top bar renderer (`window.BrandStrip`).
- `public/compositor/components/mini-leaderboard.js` — Stub (`window.MiniLeaderboard`).
- `public/compositor/components/full-leaderboard.js` — Stub (`window.FullLeaderboard`).
- `public/compositor/components/dungeon-hud.js` — Stub (`window.DungeonHud`).
- `public/compositor/components/alt-card.js` — Stub (`window.AltCard`).
- `public/js/twitch-embed-manager.js` — Stub (`window.TwitchEmbedManager`) with `syncTeams`, `mountInto`, and `setMainAudio` no-ops. Will be replaced in Task 7.

### Improvements
- **`src/webServer.js` serves `/compositor`** — Added `app.use('/compositor', express.static(...))` so the compositor page is accessible at `http://localhost:3000/compositor/`.

### Improvements
- **`twitchChannel` field added to team records** — `wclStorage.ensureTeamDefaults` now includes `twitch_channel: ''` so all new and reloaded teams carry the field. `updateTeam` accepts and persists the value. `stateManager.refreshTeams` maps it to `twitchChannel` in the frontend team shape. The `admin:updateTeam` socket handler in `webServer.js` accepts and forwards the field. The admin dashboard edit modal gains a "Twitch Channel" text input that populates on open and is included in the save payload via `socket-client.js`.

### Improvements
- **`stateManager.onRunComplete` emits delta fields** — The `run:complete` event payload now includes `pointsEarned`, `newTotal`, `newRank`, and `previousRank` computed from a pre-completion leaderboard snapshot. The existing `recap` object and all downstream emits (`activeRuns:update`, `scoreboard:update`) are preserved.

### Tests
- Added `tests/runCompletePayload.test.js` — Verifies the `run:complete` payload includes correct delta fields using a seeded leaderboard via the new `_testSetLeaderboard` test helper.

### Improvements
- **`webServer.js` wires `directorState` into Socket.io** — New clients receive `director:state` on connect; all state mutations broadcast `director:state` to every connected client. Adds temporary Phase 1 HTTP endpoints `GET /api/director` and `POST /api/director` for smoke-testing layout, slot, pinnedSlide, mainAudio, and tournamentContext fields.

### Bug Fixes
- **`directorState._load` deep-merges nested objects** — Previously a shallow spread replaced entire nested objects (`slots`, `altCard`, `tournamentContext`) when loading persisted state, dropping any keys not present in the saved file. Now merges each nested object individually so new default keys survive across upgrades.
- **`directorState.setSlot` bounds-checks array indices** — Out-of-range indices (e.g. `grid[99]`) now throw instead of silently extending the array with sparse holes. Scalar slots reject index notation; array slots require an index.
- **`directorState._save` creates `data/` directory if missing** — On a fresh checkout the `data/` directory (gitignored) may not exist. `_save()` now calls `fs.mkdirSync(..., { recursive: true })` before writing, preventing silent persistence failures.

### Tests
- Added 5 new unit tests to `tests/directorState.test.js` covering the above fixes: out-of-range index, scalar indexing, missing array index, `setPinnedSlide` validation, and deep-merge on load. Total test count: 13.

### New Files
- `src/directorState.js` — Singleton EventEmitter holding broadcast/presentation state (active layout, slot assignments, audio mute, alt-card config). Persists to `data/director-state.json` via `DIRECTOR_STATE_PATH` env override.
- `tests/directorState.test.js` — Unit tests covering defaults, persistence, event emission, slot updates, and validation.

### Configuration
- `.gitignore` — Added `data/director-state.json` and `tests/.tmp-*` to prevent runtime/test artifacts from being committed.

## 2026-02-01

### Bug Fixes
- **Depleted runs now set team to idle** — Previously only timed runs triggered `onRunComplete()`, leaving teams stuck in "Active" after a depleted key. All finished runs (timed and depleted) now clear active status.
- **Abandoned runs auto-clear** — Added staleness check: if an active run exceeds 2x its dungeon par time, it's automatically cleared to idle after each poll cycle.

### Improvements
- **API quota uses real WCL rate limit data** — `recordApiRequest()` now reads `rateLimitData` from WCL GraphQL response extensions instead of counting requests locally.
- **Noisy log messages demoted to debug** — Duplicate skips, outside-window, cancelled runs, fight counts, and "no report codes" messages now use `logger.debug()` instead of cluttering info-level output. Set `LOG_LEVEL=debug` in `.env` to see them.
- **Countdown shows seconds under 5 minutes** — `commands-overlay.html` timer now displays `m:ss` format when remaining time drops below 5 minutes.

### Configuration
- **Scoring tables moved to `data/scoring.json`** — Bracket point tables, dungeon par times, short names, upgrade ratios, and EPS are now editable in a JSON file. `wclScoring.js` loads from it at startup with hardcoded fallback defaults. Can be hot-reloaded from the admin panel.
- **Runtime config persisted to disk** — New `data/runtime-config.json` stores event window, polling intervals, and require-kill setting. Survives server restarts.
- **Admin settings panel** — Dashboard now has a Settings section to edit event start/end, polling intervals, require-kill toggle, and a button to reload scoring tables. Changes save to disk immediately.

### New Files
- `data/scoring.json` — Scoring configuration (bracket tables, dungeon par times, etc.)
- `src/runtimeConfig.js` — Runtime config persistence layer
- `considerations.md` — Deferred feature ideas (scoreboard dungeon name, raider.io, roster management, API restructuring)
