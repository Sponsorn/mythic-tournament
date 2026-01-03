# Lucky Bot

Discord bot that tracks unique reactions per message, runs competitions, and provides `/top` leaderboards.

## Setup
1. Node 18+
2. Install deps: `npm install`
3. Copy `.env.example` to `.env` and fill:
   - `DISCORD_TOKEN` – bot token
   - `CLIENT_ID` – application ID
   - `GUILD_ID` – target guild for commands
   - `ANNOUNCE_CHANNEL_ID` - channel for WCL announcements
   - `COMMANDS_CHANNEL_ID` - channel for WCL command output
   - `WCL_CLIENT_ID` - Warcraft Logs client ID
   - `WCL_CLIENT_SECRET` - Warcraft Logs client secret

## Commands
- `/competition start name:<text> channel:<#channel?>` – start/reset a competition; optionally limit tracking to a text channel.
- `/competition start` also accepts optional `start_date` and `end_date` (ISO). If you pass a date without time, it defaults to 00:01 (start) and 23:59 (end) in Stockholm time.
- `/competition setup` - interactive modal for creating a competition.
- `/competition end` – stop tracking (data stays for viewing).
- `/competition status` – show current settings.
- `/top limit:(5|10)` – show leaderboard of unique reactors for the active competition.
- `/epic setchannel channel:<#channel>` - set the channel for Epic free game announcements.
- `/epic status` - show Epic free game announcement settings.
- `/epic check` - manually check Epic free games right now.
- `/wcl scoreboard` - show WCL standings.
- `/wcl teamruns team_name?:<text> limit?:(5|10|25|50)` - show recent runs.
- `/wcl forcecheck` - poll WCL now and announce new runs.
- `/wcl team` - create or update a team (name, leader, WCL main/backup).
- `/wcl listteams` - list current teams and WCL links.
- `/wcl reloadteams` - reload teams from disk.

## Running
1. Register commands (run after each command schema change): `npm run deploy-commands`
2. Start bot: `npm start`

## Notes
- Each user counts once per message; removing a reaction removes their count.
- Data persists to `data/store.json`, `data/wcl.json`, and `data/wcl_scores.csv`.
- Only the active competition in a guild is tracked; starting a new one replaces the previous data for that guild.

## WCL Setup
- Set `WCL_CLIENT_ID` and `WCL_CLIENT_SECRET` to enable WCL polling/commands.
- Optional: set `ANNOUNCE_CHANNEL_ID` and `COMMANDS_CHANNEL_ID` to route public/private WCL messages.
- Optional: set `EVENT_START_SE` and `EVENT_END_SE` (YYYY-MM-DD HH:MM) and `EVENT_ENFORCE_WINDOW=true` to filter runs.

## Migration Notes
- The current schema only uses `team_name`, `leader_name`, `wcl_url`, and `wcl_backup_url` per team.
