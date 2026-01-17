# M+ Tournament Live Scoreboard

Real-time Mythic+ tournament tracking system with OBS overlays. Combines a Discord bot with a web server for live scoreboard displays during streaming events.

## Features

- **Live Scoreboard Overlay** - Real-time team rankings for OBS browser sources
- **Active Runs Tracker** - Shows teams currently in dungeons with progress
- **Run Recap Display** - Auto-triggered completion summaries with scores
- **Admin Dashboard** - Web-based team management and tournament control
- **Discord Integration** - Slash commands for team management and status
- **Warcraft Logs Integration** - Automatic run detection via WCL API polling

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Server (Raspberry Pi 5)                  │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │ WCL Poller  │───▶│ State Manager │───▶│ WebSocket     │  │
│  └─────────────┘    └──────────────┘    │ Server        │  │
│                                          └───────┬───────┘  │
│  ┌───────────────────────────────────────────────┴────────┐ │
│  │              Express Web Server (:3000)                │ │
│  │  /overlays/scoreboard.html                             │ │
│  │  /overlays/active-runs.html                            │ │
│  │  /overlays/recap.html                                  │ │
│  │  /admin/                                               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    OBS (Streaming PC)                       │
│  Browser Source: http://[SERVER_IP]:3000/overlays/...      │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 18+
- Discord bot token and application
- Warcraft Logs API credentials (OAuth2)

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

   **Required:**
   - `DISCORD_TOKEN` - Bot token
   - `CLIENT_ID` - Discord application ID
   - `GUILD_ID` - Target Discord server ID
   - `WCL_CLIENT_ID` - Warcraft Logs OAuth client ID
   - `WCL_CLIENT_SECRET` - Warcraft Logs OAuth secret

   **Optional:**
   - `WEB_PORT` - Web server port (default: 3000)
   - `WEB_HOST` - Web server host (default: 0.0.0.0)
   - `POLL_INTERVAL_ACTIVE_MS` - Polling for active runs (default: 30000)
   - `POLL_INTERVAL_IDLE_MS` - Polling for idle teams (default: 300000)

3. **Deploy Discord commands:**
   ```bash
   npm run deploy-commands
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

## OBS Setup

Add browser sources with these URLs (replace `SERVER_IP` with your server's IP):

| Overlay | URL | Recommended Size |
|---------|-----|------------------|
| Scoreboard | `http://SERVER_IP:3000/overlays/scoreboard.html` | 400x600 |
| Active Runs | `http://SERVER_IP:3000/overlays/active-runs.html` | 500x300 |
| Recap | `http://SERVER_IP:3000/overlays/recap.html` | 600x400 |

All overlays have transparent backgrounds for easy compositing.

## Admin Dashboard

Access at `http://SERVER_IP:3000/admin/`

Features:
- View all teams with status and scores
- Edit team names, leaders, and WCL report codes
- Force refresh individual teams
- Pause/resume tournament polling
- Trigger run recaps manually

## Discord Commands

### Warcraft Logs
- `/wcl scoreboard` - Show team standings
- `/wcl teamruns [team_name] [limit]` - Show recent runs
- `/wcl team` - Create or update a team
- `/wcl teamedit [team_name] [team_number]` - Edit team details
- `/wcl listteams` - List all teams
- `/wcl reloadteams` - Reload teams from disk
- `/wcl forcecheck` - Manually poll WCL for new runs

## Project Structure

```
src/
├── main.js           # Entry point (Discord bot + web server)
├── webServer.js      # Express + Socket.io server
├── stateManager.js   # Central state + event emitter
├── config.js         # Configuration & validation
├── wclApi.js         # WCL API client (OAuth2, GraphQL)
├── wclCollector.js   # WCL run detection & polling
├── wclScoring.js     # M+ scoring logic
├── wclStorage.js     # Team & leaderboard persistence
└── wclUtils.js       # WCL utilities

public/
├── css/              # Stylesheets
├── js/               # Client-side JavaScript
├── overlays/         # OBS overlay HTML files
└── admin/            # Admin dashboard

data/
├── wcl.json          # Teams, leaderboard, run history
└── wcl_scores.csv    # Historical run records
```

## WebSocket Events

### Server to Client
| Event | Description |
|-------|-------------|
| `state:sync` | Full state on connect |
| `scoreboard:update` | Leaderboard changes |
| `run:start` | New run detected |
| `run:progress` | Run progress update |
| `run:complete` | Run finished |
| `recap:show` | Display run recap |
| `teams:update` | Team data changed |
| `quota:update` | API usage update |

### Client to Server (Admin)
| Event | Description |
|-------|-------------|
| `admin:updateTeam` | Edit team details |
| `admin:forceRefresh` | Force poll a team |
| `admin:tournament` | Pause/resume polling |
| `admin:showRecap` | Trigger recap display |

## Scoring System

Points are calculated based on:
- Keystone level and upgrade status
- Completion time vs par time
- Death penalties (5s for keys <12, 15s for keys >=12)

See `src/wclScoring.js` for detailed scoring logic.

## API Quota

WCL free tier: 3,600 requests/hour

Estimated usage with 10 teams:
- Idle (5 min interval): ~120 req/hr
- Active (30 sec interval): ~600 req/hr peak

Quota is displayed in the admin dashboard.

## Data Storage

- `data/wcl.json` - Teams, leaderboard, seen runs
- `data/wcl_scores.csv` - Historical run records

**Backup recommendation:** Regular backups of the `data/` directory.

## Troubleshooting

### Overlays not updating
- Check WebSocket connection in browser console
- Verify server is running and accessible
- Check for CORS issues if using different domain

### WCL not detecting runs
- Verify WCL credentials in `.env`
- Check team has valid WCL report URL
- Look for API errors in server console

### Admin dashboard not connecting
- Ensure server is running
- Check firewall allows port 3000
- Verify correct IP/hostname

## License

ISC
