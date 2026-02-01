# Changelog

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
