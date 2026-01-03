# Lucky Bot

Discord bot that tracks unique reactions per message, runs competitions, and provides `/top` leaderboards.

## Setup
1. Node 18+
2. Install deps: `npm install`
3. Copy `.env.example` to `.env` and fill:
   - `DISCORD_TOKEN` – bot token
   - `CLIENT_ID` – application ID
   - `GUILD_ID` – target guild for commands

## Commands
- `/competition start name:<text> channel:<#channel?>` – start/reset a competition; optionally limit tracking to a text channel.
- `/competition start` also accepts optional `start_date` and `end_date` (ISO). If you pass a date without time, it defaults to 00:01 (start) and 23:59 (end) in Stockholm time.
- `/competition end` – stop tracking (data stays for viewing).
- `/competition status` – show current settings.
- `/top limit:(5|10)` – show leaderboard of unique reactors for the active competition.
- `/epic setchannel channel:<#channel>` - set the channel for Epic free game announcements.
- `/epic status` - show Epic free game announcement settings.
- `/epic check` - manually check Epic free games right now.

## Running
1. Register commands (run after each command schema change): `npm run deploy-commands`
2. Start bot: `npm start`

## Notes
- Each user counts once per message; removing a reaction removes their count.
- Data persists to `data/store.json`.
- Only the active competition in a guild is tracked; starting a new one replaces the previous data for that guild.
