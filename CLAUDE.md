# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install           # Install dependencies
npm start             # Start Discord bot + web server (src/main.js)
npm run deploy-commands  # Deploy Discord slash commands to guild
```

No test framework is configured. The project uses Node.js 18+ (requires native `fetch`).

## Architecture

This is a World of Warcraft Mythic+ tournament tracking system with two main components:

### Discord Bot + Web Server (src/main.js)
Single entry point that initializes:
1. **Discord.js client** - Handles /wcl slash commands for team management and status
2. **Express + Socket.io server** - Serves OBS overlays and admin dashboard
3. **Adaptive WCL poller** - Polls Warcraft Logs API (30s when runs active, 5min when idle)

### Data Flow
```
WCL API → wclCollector.js → wclStorage.js (JSON/CSV) → stateManager.js → WebSocket → Browser overlays
```

### Key Module Responsibilities

| Module | Purpose |
|--------|---------|
| `stateManager.js` | Singleton EventEmitter holding tournament state (teams, leaderboard, active runs). Bridges between WCL polling and WebSocket broadcasts. |
| `wclCollector.js` | Polls WCL GraphQL API for new runs, detects completions, calculates scores |
| `wclStorage.js` | Persistence layer: `data/wcl.json` (teams/leaderboard), `data/wcl_scores.csv` (run history) |
| `wclScoring.js` | Points calculation based on key level, upgrade count, par times |
| `webServer.js` | Express routes + Socket.io events for real-time overlay updates |
| `config.js` | Environment variable parsing with validation and defaults |

### Frontend Structure

- `/overlays/*.html` - OBS browser source overlays (scoreboard, active-runs, recap)
- `/admin/*.html` - Web dashboard for team management
- `/js/socket-client.js` - TournamentClient class wrapping Socket.io

### WebSocket Event Pattern

Server emits `scoreboard:update`, `run:start`, `run:complete`, etc. Admin panel emits `admin:updateTeam`, `admin:forceRefresh`. All overlays use the shared `TournamentClient` class.

## Environment Variables

Required: `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `WCL_CLIENT_ID`, `WCL_CLIENT_SECRET`

Web server defaults to port 3000 (`WEB_PORT`). Polling intervals controlled by `POLL_INTERVAL_ACTIVE_MS` (30s) and `POLL_INTERVAL_IDLE_MS` (5min).

## Data Storage

- `data/wcl.json` - Teams array, `leaderboardWcl` object (team→points), `wclMeta` (run counts), `seenWcl` (deduplication)
- `data/wcl_scores.csv` - Historical run records with columns: team, dungeon, level, upgrades, points, duration_ms, etc.

Team renames must update both the team record AND the `leaderboardWcl`/`wclMeta` keys (see `renameTeamInLeaderboard` function).
