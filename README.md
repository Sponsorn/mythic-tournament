# M+ Tournament Live Scoreboard

Real-time Mythic+ tournament tracking system with OBS overlays. Web server with live scoreboard displays during streaming events.

## Features

- **Live Scoreboard Overlay** - Real-time team rankings for OBS browser sources
- **Stream Overlay** - Top bar overlay with leaderboard and team status
- **Admin Dashboard** - Web-based team management and tournament control
- **Bracket System** - Teams assigned to skill brackets (A/B/C) with different point scales
- **Warcraft Logs Integration** - Automatic run detection via WCL API polling

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Server (Raspberry Pi 5)                  │
│  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐   │
│  │ WCL Poller  │───▶│ State Manager │───▶│ WebSocket     │  │
│  └─────────────┘    └──────────────┘    │ Server        │   │
│                                         └───────┬───────┘   │
│  ┌───────────────────────────────────────────────┴────────┐ │
│  │              Express Web Server (:3000)                │ │
│  │  /overlays/stream-overlay.html                          │ │
│  │  /overlays/scoreboard-fullscreen.html                   │ │
│  │  /admin/                                               │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    OBS (Streaming PC)                       │
│  Browser Source: http://[SERVER_IP]:3000/overlays/...       │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites
- Node.js 18+
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
   - `WCL_CLIENT_ID` - Warcraft Logs OAuth client ID
   - `WCL_CLIENT_SECRET` - Warcraft Logs OAuth secret

   **Optional:**
   - `WEB_PORT` - Web server port (default: 3000)
   - `WEB_HOST` - Web server host (default: 0.0.0.0)
   - `POLL_INTERVAL_ACTIVE_MS` - Polling for active runs (default: 30000)
   - `POLL_INTERVAL_IDLE_MS` - Polling for idle teams (default: 300000)

3. **Start the server:**
   ```bash
   npm start
   ```

## OBS Setup

Add browser sources with these URLs (replace `SERVER_IP` with your server's IP):

| Overlay | URL | Recommended Size |
|---------|-----|------------------|
| Stream Overlay | `http://SERVER_IP:3000/overlays/stream-overlay.html` | 1920x300 |
| Scoreboard Fullscreen | `http://SERVER_IP:3000/overlays/scoreboard-fullscreen.html` | 1920x1080 |
| Countdown | `http://SERVER_IP:3000/overlays/countdown.html` | 1920x1080 |

All overlays have transparent backgrounds for easy compositing.

## Admin Dashboard

Access at `http://SERVER_IP:3000/admin/`

Features:
- View all teams with status, bracket, and scores
- Edit team names, leaders, brackets, and WCL report codes
- Force refresh individual teams
- Pause/resume tournament polling
- View best times per dungeon

## Bracket Scoring System

Teams are assigned to brackets (A, B, or C) which determine point values per key level:

| Key Level | Bracket A | Bracket B | Bracket C |
|-----------|-----------|-----------|-----------|
| 10        | 1-3 pts   | 0 pts     | 0 pts     |
| 11        | 2-4 pts   | 0-2 pts   | 0 pts     |
| 12        | 8-10 pts  | 1-3 pts   | 0 pts     |
| 13        | 11-13 pts | 2-4 pts   | 0-1 pts   |
| 14        | 14-16 pts | 8-10 pts  | 2-4 pts   |
| 15        | 20-22 pts | 11-13 pts | 5-7 pts   |
| 16        | 23-25 pts | 14-16 pts | 8-10 pts  |

Points shown as +1/+2/+3 upgrade ranges. See `src/wclScoring.js` for complete tables.

## Project Structure

```
src/
├── main.js           # Entry point (web server)
├── webServer.js      # Express + Socket.io server
├── stateManager.js   # Central state + event emitter
├── config.js         # Configuration & validation
├── wclApi.js         # WCL API client (OAuth2, GraphQL)
├── wclCollector.js   # WCL run detection & polling
├── wclScoring.js     # M+ bracket-based scoring logic
├── wclStorage.js     # Team & leaderboard persistence
└── timeUtils.js      # Time formatting utilities

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
| `teams:update` | Team data changed |
| `quota:update` | API usage update |

### Client to Server (Admin)
| Event | Description |
|-------|-------------|
| `admin:updateTeam` | Edit team details (including bracket) |
| `admin:forceRefresh` | Force poll a team |
| `admin:tournament` | Pause/resume polling |

## API Quota

WCL free tier: 3,600 requests/hour

Estimated usage with 10 teams:
- Idle (5 min interval): ~120 req/hr
- Active (30 sec interval): ~600 req/hr peak

Quota is displayed in the admin dashboard.

## Data Storage

- `data/wcl.json` - Teams (with brackets), leaderboard, seen runs
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
