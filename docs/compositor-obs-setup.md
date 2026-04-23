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

Until the caster panel lands in Phase 2, use curl to drive the compositor. See `docs/dev-commands.md` for the full command reference. Common cases:

```
# Pick a layout
curl -X POST -H "Content-Type: application/json" -d "{\"layout\":\"A\"}" http://localhost:3000/api/director

# Assign a team to the main slot (Layout A)
curl -X POST -H "Content-Type: application/json" -d "{\"slot\":\"main\",\"team\":\"ALPHA\"}" http://localhost:3000/api/director

# Fill the 6-up grid (Layout C)
curl -X POST -H "Content-Type: application/json" -d "{\"slot\":\"grid[0]\",\"team\":\"ALPHA\"}" http://localhost:3000/api/director
curl -X POST -H "Content-Type: application/json" -d "{\"slot\":\"grid[1]\",\"team\":\"BRAVO\"}" http://localhost:3000/api/director
```

Valid layouts: `PRE`, `A`, `C`, `D`, `G`, `LB`, `BT`. Phase 1 implements `A`, `C`, `LB`, `BT`. `PRE`, `D`, `G` land in Phase 2 (unknown layouts fall back to `A` with a console warning).

## Troubleshooting

- **Streams show ads**: verify you logged in via OBS Interact and that cookies persisted. Fallback: use Chrome window capture pointing at the same URL.
- **Streams don't load**: check browser source console via Interact. Twitch requires `parent` to match the hostname serving the page — if you're serving from anything but `localhost`, the compositor code uses `window.location.hostname` automatically.
- **Layout doesn't change**: check `http://localhost:3000/api/director` returns the expected state. Compositor listens via Socket.io — if the socket disconnected, refresh the browser source.
- **Old embeds stack in a slot**: fixed in Phase 1 — `TwitchEmbedManager.mountInto` now evicts other embeds from the slot before mounting. If you still see this, run `curl http://localhost:3000/api/director` and confirm the slot assignment matches what you expect.
- **Flash animation spills outside card**: fixed in Phase 1 — `.lb-card` clips overflow. If you see it again, the CSS `overflow: hidden` rule may have regressed.

## End-to-end verification checklist

Once the server is up and OBS is configured, walk through:

1. Brand strip shows tournament title + progress bar.
2. Assign `twitchChannel` to at least two teams via the admin panel.
3. POST to Layout A + main slot. Confirm focused embed + HUD + mini-leaderboard + alt-card.
4. POST to Layout C + grid slots 0/1. Confirm 3×2 grid + standings sidebar.
5. POST to Layout LB. Confirm centered standings panel.
6. POST to Layout BT. Confirm best-times panel (real data if `data/wcl_scores.csv` has runs, "No timed runs yet" otherwise).
7. Trigger a run complete (`curl POST /api/test/run-complete` in dev, or via admin panel). Confirm leaderboard row pulses green for 8s with a `+N` delta badge.
8. OBS Browser source captures the compositor cleanly at 1920×1080.
