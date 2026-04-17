# Code Review — M+ Tournament

Date: 2026-04-17
Reviewer: Claude (Opus 4.7)
Scope: Full repo review for understanding and improvement areas.

---

## 1. Architecture at a glance

**Entry point:** `src/main.js` — boots Express/Socket.io via `webServer.js`, then starts an adaptive WCL poll loop.

**Module map:**

| Module | Purpose |
|---|---|
| `src/main.js` | Orchestration: startup, adaptive poll timer, graceful shutdown |
| `src/webServer.js` | Express routes, static hosting, Socket.io events, admin API, OBS WS proxy |
| `src/stateManager.js` | Singleton EventEmitter — in-memory state bridge between poller and sockets |
| `src/wclCollector.js` | Polls WCL, dedupes, computes scoring, writes to CSV/JSON |
| `src/wclApi.js` | GraphQL client with OAuth token caching |
| `src/wclStorage.js` | Persistence for `wcl.json` and `wcl_scores.csv` |
| `src/wclScoring.js` | Bracket/par-time scoring — loads from `data/scoring.json` (hot-reloadable) |
| `src/config.js` | Env-var parsing + validation; getters layer `runtimeConfig` on top |
| `src/runtimeConfig.js` | Disk-backed config overrides at `data/runtime-config.json` |
| `src/apiUtils.js` | Fetch retry/backoff, sanitization |
| `src/logger.js` | Level-gated structured logging |
| `src/timeUtils.js` | Timezone + timer formatting |

**Data flow:** WCL API → `wclCollector` → `wclStorage` (JSON/CSV) → `stateManager` → Socket.io → browser overlays.

**Polling cadence:** adaptive — 60 s when any run is active, 300 s when idle. `main.js:60-71` schedules each next tick based on live `getActiveRuns()`.

**Scoring:** 4 brackets (A/B/C/D). Tables now live in `data/scoring.json` with defaults hardcoded in `wclScoring.js:44-104` as fallback. Hot-reload via admin panel (`admin:reloadScoring`).

---

## 2. Improvement areas — prioritized

Severity legend: **C**ritical · **H**igh · **M**edium · **L**ow. Line numbers are accurate at time of review.

### Critical

- **C1. CSV injection / escaping.** `wclStorage.js` writes rows via manual string concatenation. Team names with commas, quotes, or newlines can corrupt `wcl_scores.csv` and break downstream reads. Fix: use a real CSV library (`csv-stringify`) or always quote-and-escape fields.
- **C2. No admin auth by default.** `ADMIN_SECRET` is optional (`config.js:67`). If unset, anyone who can reach Socket.io can call `admin:*` events. Fix: either refuse to start without it, or at minimum log a loud warning and bind admin socket to localhost.

### High

- **H1. Synchronous file I/O on the hot path.** `wclStorage.saveData()` uses `fs.writeFileSync` for `wcl.json` on every poll and admin action. Blocks the event loop; risks missed ticks under slow disk. Fix: switch to `fs.promises.writeFile` + write coalescing.
- **H2. Poll errors are swallowed.** `main.js:51-55` catches WCL poll failures with `console.warn` and continues. No retry counter, no surfaced health signal, no alert on repeated failure. Fix: track consecutive failures, emit a state event after N, expose on a `/health` endpoint.
- **H3. Concurrent write races on admin edits.** Two simultaneous admin mutations read → modify → write the same `wcl.json` with no locking. Last writer wins silently. Fix: serialize writes through a queue, or use `proper-lockfile`.
- **H4. WCL rate-limit awareness is reactive only.** `apiUtils.fetchWithRetry` backs off on 429, but the poller doesn't look at `rateLimitData.pointsSpentThisHour` before firing. `stateManager.shouldThrottle()` exists but isn't consulted in the poll loop. Fix: gate polls on quota headroom.
- **H5. CSV schema drift.** Header declares `potions_used`, `character`, `realm`, `region` but live writes populate these weakly or not at all. Either wire them up (WCL actor data is available) or drop the columns — current state silently loses data.

### Medium

- **M1. Leaderboard is rebuilt from CSV each refresh.** `stateManager.refreshLeaderboard()` re-reads and re-sorts on every poll. Fine at current team counts; watch it if the tournament grows past ~100 teams. Fix: cache per-team aggregates keyed by CSV offset.
- **M2. Frontend has no error boundaries.** Overlays assume Socket.io payloads parse cleanly; a single malformed event can freeze rendering. Fix: wrap render calls, show a visible "reconnecting" state.
- **M3. Polling interval changes lag one cycle.** `POLL_INTERVAL_ACTIVE_MS` is a getter (`config.js:134`), but the active `setTimeout` was scheduled with the prior value, so admin changes take effect only after the current tick fires. Fix: clear and reschedule when `admin:updateConfig` changes either interval.
- **M4. Hardcoded boss count.** `stateManager.js` assumes 3 bosses per dungeon; Tazavesh runs have 4. Progress bars will be wrong for those. Fix: pull `totalBosses` from scoring config per dungeon slug.
- **M5. No admin action audit trail.** Renames, bracket changes, and forced refreshes leave no record. For a tournament with prize implications this is worth having. Fix: append to `data/audit.log` with timestamp, action, before/after.
- **M6. No input length/shape limits on admin forms.** Team/leader names aren't bounded; WCL codes are regex-checked but not whitelisted per team on save. Fix: enforce max length and validate codes at write time.

### Low

- **L1. Stray artifacts in the working tree.** `nul`, `data/wcl copy.json`, `data/wcl_scores copy.csv` — delete or gitignore a backup pattern. `nul` on Windows is a reserved name and was likely created by a shell redirect like `2>nul`.
- **L2. `engines` field missing from `package.json`.** Code requires Node 18+ (native `fetch`) but nothing enforces it. Add `"engines": {"node": ">=18"}`.
- **L3. `CORS_ORIGINS` defaults to allow-all.** Fine for dev; document the expectation for production and refuse to start if public-facing without it.
- **L4. No `NODE_ENV` distinction.** No dev/prod toggle for log verbosity, error detail, CORS strictness.
- **L5. Dead/unused exports.** `stateManager.shouldThrottle()` and some `config.js` getters appear unreferenced. Quick sweep with a linter would find more.
- **L6. Timezone validation at startup.** If `REALM_TZ` is invalid, `Intl` silently falls back to system TZ — event windows would be off by hours and no one would notice until a run gets rejected. Fix: construct a test formatter at boot; fail loudly if invalid.
- **L7. No test suite.** Highest-value targets to add first: `calcUpgradesFromPar` edge cases, deduplication across primary/backup WCL codes, timezone parsing around DST, and CSV round-trip with adversarial team names.

---

## 3. Security posture

Read-through of the attack surface, not a full pentest:

- `.env` is properly gitignored (verified — `.gitignore:1-3`).
- Socket.io admin handshake auth is checked at connect, not per-event. Acceptable given current event set but worth noting.
- No rate limiting on HTTP endpoints — trivial to hammer `/api/all-runs`.
- Team-name fields appear to be rendered into overlay HTML; verify all overlay templates escape (possible XSS in OBS browser sources if not).

---

## 4. Work-in-progress context

Uncommitted changes (per `git status` at review time) point to a **break-time feature**: admin can set `breakStartSE`/`breakEndSE` windows, presumably to exclude runs during tournament breaks. Plumbing exists in `runtimeConfig.js` and the admin form but the enforcement path in `wclCollector.js` isn't yet in place. Worth finishing or reverting before merging further work.

`scripts/player-stats.js` is an untracked CLI for per-character potion/death/interrupt stats — useful but should be formally added or removed, not left loose.

---

## 5. Quick wins (order I'd do them)

1. Delete `nul`, add `data/*copy*` to `.gitignore` (15 min).
2. Add `"engines": {"node": ">=18"}` to `package.json` (2 min).
3. Swap `writeFileSync` → `fs.promises.writeFile` in `wclStorage.js` (1 hr).
4. Add CSV library and rewrite `writeScoreRow` (1 hr).
5. Make `ADMIN_SECRET` required in production (wire via `NODE_ENV`) (30 min).
6. Gate poll loop on `stateManager.shouldThrottle()` (30 min).
7. Add Jest + smoke tests for scoring and dedup (half day).

Everything else is fine to defer behind real requirements.
