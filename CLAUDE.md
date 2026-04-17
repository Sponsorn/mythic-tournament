# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install           # Install dependencies
npm start             # Start web server (src/main.js)
```

No test framework is configured. The project uses Node.js 18+ (requires native `fetch`).

## Architecture

This is a World of Warcraft Mythic+ tournament tracking system with web-based OBS overlays.

### Entry Point (src/main.js)
Initializes in order:
1. **Express + Socket.io server** (`webServer.js`) - Serves OBS overlays and admin dashboard
2. **Adaptive WCL poller** - Polls Warcraft Logs API (60s when runs active, 5min when idle)

### Data Flow
```
WCL API → wclCollector.js → wclStorage.js (JSON/CSV) → stateManager.js → WebSocket → Browser overlays
```

### Key Module Responsibilities

| Module | Purpose |
|--------|---------|
| `main.js` | Orchestration: startup, adaptive poll timer, graceful shutdown |
| `stateManager.js` | Singleton EventEmitter holding tournament state (teams, leaderboard, active runs). Bridges between WCL polling and WebSocket broadcasts. |
| `wclCollector.js` | Polls WCL GraphQL API for new runs, detects completions, calculates scores |
| `wclApi.js` | WCL GraphQL client with OAuth token caching |
| `wclStorage.js` | Persistence layer: `data/wcl.json` (teams/leaderboard), `data/wcl_scores.csv` (run history) |
| `wclScoring.js` | Points calculation. Loads bracket tables from `data/scoring.json` with hardcoded fallback; supports hot-reload via `reloadScoring()`. |
| `webServer.js` | Express routes + Socket.io events for real-time overlay updates; includes OBS WebSocket proxy |
| `config.js` | Environment variable parsing; getters layer `runtimeConfig` on top so admin-editable settings take precedence over env |
| `runtimeConfig.js` | Disk-backed persistent config at `data/runtime-config.json` (event windows, poll intervals, break times) |
| `apiUtils.js` | `fetchWithRetry` with exponential backoff, sanitization helpers |
| `logger.js` | Level-gated structured logging |
| `timeUtils.js` | Timezone handling (`REALM_TZ`), timer formatting |

### Bracket-Based Scoring

Teams are assigned to one of **four brackets (A, B, C, D)** which determine point values. All brackets cover key levels 14-25; harder brackets award points at lower levels (e.g., Bracket A starts paying at 14, Bracket D's meaningful points start at 17). See `wclScoring.js:67-100` for the fallback defaults and `data/scoring.json` for the live tables.

Scoring config (`data/scoring.json`) is hot-reloadable from the admin panel via the `admin:reloadScoring` Socket.io event.

### Frontend Structure

- `/overlays/*.html` - OBS browser source overlays (scoreboard, active-runs, recap)
- `/admin/*.html` - Web dashboard for team management (includes bracket editing)
- `/js/socket-client.js` - TournamentClient class wrapping Socket.io

### WebSocket Event Pattern

Server emits `scoreboard:update`, `run:start`, `run:complete`, etc. Admin panel emits `admin:updateTeam`, `admin:forceRefresh`. All overlays use the shared `TournamentClient` class.

## Environment Variables

Required: `WCL_CLIENT_ID`, `WCL_CLIENT_SECRET`

Web server defaults to port 3000 (`WEB_PORT`). Polling intervals controlled by `POLL_INTERVAL_ACTIVE_MS` (30s) and `POLL_INTERVAL_IDLE_MS` (5min).

## Changelog

When making changes to the codebase, always update `CHANGELOG.md` with a summary of what changed. Add entries under the current date, grouped by category (Bug Fixes, Improvements, Configuration, New Files, etc.). Newest entries go at the top of the file.

## Data Storage

- `data/wcl.json` - Teams array (with bracket field), `leaderboardWcl` object (team→points), `wclMeta` (run counts), `seenWcl` (deduplication)
- `data/wcl_scores.csv` - Historical run records with columns: team, dungeon, level, upgrades, points, duration_ms, etc.
- `data/scoring.json` - Bracket point tables, dungeon par times, short names, upgrade ratios, EPS threshold. Loaded at startup and hot-reloadable.
- `data/runtime-config.json` - Admin-editable runtime overrides (event windows, poll intervals, `requireKill`, break times). Survives restart.

Team renames must update both the team record AND the `leaderboardWcl`/`wclMeta` keys (see `renameTeamInLeaderboard` function).

## Code Review

A standalone review of the codebase with prioritized improvement areas lives in `CODE_REVIEW.md`. Consult it when planning refactors or asked about known issues.
