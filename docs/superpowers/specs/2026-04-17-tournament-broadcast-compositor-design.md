# Tournament Broadcast Compositor — Design

Date: 2026-04-17
Status: Draft for review
Author: Claude (Opus 4.7) with Anton Beckman

## Goal

Replace the current OBS-centric, per-scene overlay system with a **single web-based compositor page** that embeds team Twitch streams, renders tournament data, and supports multiple runtime-switchable layouts. A companion **caster control panel** lets remote commentators drive the broadcast (layout, featured team, scene changes, overlays) without touching OBS on the host machine.

The host (Anton) still runs OBS — but OBS collapses from many scenes to three: the compositor, technical-difficulties, and break/info. All "show leaderboard", "swap focused team", "flip to grid" moments happen inside the compositor, controlled remotely.

## Non-goals

- Replacing OBS or the host's role as broadcaster.
- Live in-run telemetry (timer, deaths, % progress). WCL only delivers data post-completion; the overlay will not claim otherwise.
- Automating scene switching based on game events. Commentators drive all visible transitions.
- Supporting >8 teams. Grid and quad layouts are designed against 6–7 teams; going higher is out of scope.

## Context

Last tournament used many OBS scenes (leaderboard, technical, info, grid-with-2-side-streams, etc.). The "stream output" felt cramped and the all-teams bar wasted space on idle teams. Commentators are remote (audio-only) and previously controlled scene switches via a WebSocket page. Teams stream on Twitch. The next tournament has 6–7 teams and three weeks of runway to build this.

Key constraint: the tournament runs on a set schedule but teams run keys continuously — no rounds, no per-team limits.

## Architecture

### New pages (served by existing Node.js server)

| Route | Purpose | Consumed by |
|---|---|---|
| `/compositor` | The main broadcast surface. Renders the 7 layout modes. | OBS browser source for the "Main" scene (1920×1080) |
| `/caster` | Remote commentator control + live program mirror | Commentators' browsers |

Existing overlay pages (`/overlays/stream-overlay.html`, `/overlays/scoreboard-fullscreen.html`, `/overlays/best-times-overlay.html`, `/overlays/countdown.html`, `/overlays/infobox-overlay.html`, `/overlays/commands-overlay.html`) are **superseded**. They can be deleted after the compositor is validated, or kept as standalone fallbacks during migration.

### Backend additions

A new `directorState` slice on `stateManager`, persisted to `data/director-state.json`:

```js
{
  activeLayout: 'PRE' | 'A' | 'C' | 'D' | 'G' | 'LB' | 'BT',
  slots: {
    main: 'teamName',           // Layout A, D (featured stream)
    grid: ['t1','t2','t3','t4','t5','t6'],  // Layout C (6 slots)
    quad: ['t1','t2','t3','t4'],            // Layout G (4 slots)
    strip: ['t2','t3','t4','t5']            // Layout D (thumbnail strip)
  },
  altCard: {
    pinnedSlide: null | 'brand' | 'commands' | 'info',  // null = auto-rotate
    rotationMs: 12000
  },
  mainAudioUnmuted: false,      // true only in A/D; ignored elsewhere
  infoboxHtml: '<string>',      // free-form HTML, same source as alt-card "info" slide
  commandsList: ['!tournament', '!guild', ...],
  tournamentContext: {
    title: 'Lucky Wipe M+ Tournament',
    subtitle: '7 teams competing live',
    startSE: '2026-01-31T18:00',
    endSE: '2026-01-31T22:00'
  }
}
```

New Socket.io events:

**Client → Server (caster panel only, protected by `ADMIN_SECRET`):**
- `director:setLayout` — `{ layout: 'A' }`
- `director:setSlot` — `{ slot: 'main' | 'grid[2]' | 'quad[0]' | 'strip[3]', team: 'teamName' }`
- `director:setPinnedSlide` — `{ slide: 'brand' | 'commands' | 'info' | null }`
- `director:setMainAudio` — `{ unmuted: true | false }` (only effective in A/D)
- `director:setInfoboxHtml` — `{ html: '...' }`
- `director:setCommandsList` — `{ commands: [...] }`
- `director:obsScene` — `{ scene: 'Main' | 'Technical' | 'Break' }` → server forwards to OBS WebSocket

**Server → Client (all clients):**
- `director:state` — full `directorState` object on connect and on change

### Authority model

- `stateManager` owns tournament data (teams, leaderboard, active runs) — unchanged.
- `directorState` is the new, separate slice owning broadcast presentation.
- Compositor subscribes to both.
- Caster panel subscribes to both and emits `director:*` events to mutate `directorState`.
- OBS scene switches are proxied through the server via the existing `obs-websocket` dependency (connection config in `runtime-config.json`: `obsWsUrl`, `obsWsPassword`).

## Compositor page (`/compositor`)

A single HTML page rendered as a 1920×1080 OBS browser source. It subscribes to `director:state` and re-renders based on `activeLayout`.

### Persistent across all event-mode layouts (A/C/D/G)

**Top branding strip** (~34px):
- Guild logo (`/images/luckywipelogo.png`, 22px)
- "M+ Tournament" title
- Tournament progress bar — full-width, shows elapsed/remaining based on `tournamentContext.startSE` and `endSE`
  - Before start: gold gradient, label "Starts in Xh Ym"
  - During: blue→purple gradient, label "Xh Ym remaining"
  - After: green gradient, label "Event ended"
- Right-aligned label: "Start 18:00 → End 22:00 CET"

### Layout modes

#### PRE — Pre-event (auto-selected when `now < startSE`)

- Same branding strip on top (with gold progress bar)
- Hero block: guild logo (64px), tournament title, subtitle ("N teams competing live")
- **Three-unit countdown** — HH:MM:SS (or DD:HH:MM when >24h away) with labels below each unit. Three units always to prevent layout shift.
- Start-date line below the countdown
- Two side-by-side panels at bottom:
  - **Giveaway** — HTML from `directorState.infoboxHtml`
  - **Chat commands** — rendered from `commandsList`
- Row of team chips showing all registered team names

At `now >= startSE`, the compositor does *not* auto-advance — it's commentator-controlled. Caster panel UI will show a prominent "Go live → Layout A" button once `startSE` passes.

#### A — Focus 1-up (default during event)

```
┌─────────────────────── brand strip ───────────────────────┐
│                                                           │
│                                                           │
│                    MAIN STREAM (team)                     │
│                          [+level chip top-right]          │
│                                                           │
├────────────────┬──────────────┬──────────────┬────────────┤
│   dungeon HUD  │  mini lb     │  alt card    │ (unused)   │
└────────────────┴──────────────┴──────────────┴────────────┘
```

- **Main stream**: one team's Twitch embed, `quality=480p30` forced via URL param. `+level` chip in top-right corner (e.g. "+22"), team name + dungeon label bottom-left corner.
- **Dungeon HUD card** (bottom-left, ~3/8 width): `#rank · TEAM · dungeon-short · +level · points`
- **Mini leaderboard** (bottom-center, ~2/8): top 3. Owns the **result flash** — when a team completes a run, their row pulses green for 8s with a points-delta badge (e.g. "+14").
- **Alt card** (bottom-right, ~2/8): cycles through three slides every 12s, or shows `pinnedSlide` if set. Small dots indicate position.

#### C — Grid 6

- 3×2 grid of team Twitch embeds, each with `+level` chip and team name label.
- 180px standings sidebar on the right — full 6-row leaderboard. Owns the result flash.
- No HUD card, no alt card (grid + sidebar fills the canvas).

#### D — Focus + thumbnail strip

- Left ~75%: one featured stream with HUD card + mini leaderboard + alt card (same bottom row as A but narrower).
- Right ~25%: vertical stack of 4 thumbnail streams + a small standings card below them.

#### G — Quad 2×2

- 2×2 of streams on the left, 160px standings sidebar on the right.
- Bottom strip spanning the 2×2 shows a small "4 of 6 in focus" hint.
- Commentators drag teams into any of the 4 slots from the caster panel; remaining 2-3 teams are "off-camera".

#### LB — Leaderboard fullscreen

- Full-canvas standings panel.
- Replaces the current `/overlays/scoreboard-fullscreen.html`.
- Guild logo baked into the panel header.

#### BT — Best times fullscreen

- Full-canvas best-times-per-dungeon grid.
- Replaces the current `/overlays/best-times-overlay.html`.
- Guild logo baked into the panel header.

### Result flash

When `stateManager` emits `run:complete` with a new points total for a team:
- Compositor locates the team in whatever leaderboard is visible (mini-lb in A/D, sidebar in C/G, rows in LB).
- That row gets a pulsing green gradient class for 8s.
- Points-delta badge (e.g. "+14") appears in the row for the same 8s, then fades.
- Rows resort after the pulse completes, with a brief position-swap animation.

### Alt card

Rotates through three slides. Each is a small panel (bottom-right slot in A, same in D).

1. **Brand** — guild logo (34px), "LUCKY WIPE", subtitle "Presents"
2. **Commands** — list from `commandsList`, rendered as a compact `<code>` grid
3. **Info** — HTML from `infoboxHtml` (free-form, admin-authored, rendered verbatim — no sanitization because the source is the admin-only caster panel, same trust level as the rest of the app). Skipped if empty.

Auto-rotate interval: `directorState.altCard.rotationMs` (default 12000). Commentator can pin a slide via `director:setPinnedSlide`; setting back to `null` resumes rotation.

### Twitch embed wiring

Each team has a new field `twitchChannel` in `wcl.json`. The compositor creates one `<iframe>` per embed slot:

```
https://player.twitch.tv/?channel={twitchChannel}&parent={hostname}&muted=true&autoplay=true
```

- **Quality is forced via the Twitch Embed JavaScript API**, not URL param (the `quality` URL param is not a stable interface on `player.twitch.tv`). After the embed loads, the compositor calls `player.setQuality('720p30')` (or the closest available rendition) on each embed. This reduces CPU on the host and reduces the impact of teams streaming at 1440p without partner transcoding.
- Default target: `720p30` for streams shown in main/focused slots; `480p30` for off-focus slots (thumbnail strip in D, non-main grid tiles in C, quad non-main in G). If a target rendition isn't available for a given stream, fall back to the next-lowest. Never select `chunked` (source) or `720p60`.
- The caster panel's multiview thumbnails also force `480p30` to keep commentator machines responsive.
- **Audio** — default `muted=true` on every embed to prevent cacophony. In layouts with a clear focused stream (A and D), the **main slot is unmutable**: the caster panel has an "unmute focused stream" toggle (default off). When toggled on, the compositor calls `player.setMuted(false)` on the main embed only — all other embeds remain muted regardless. Swapping focused team automatically mutes the outgoing team and unmutes the incoming one (if the toggle is on). In C/G/LB/BT the toggle is disabled (no single focused stream). Team voice-chat audio, commentary, dungeon sounds, etc. are what comes through when unmuted.
- `parent={hostname}` — must match whatever domain the compositor is served from (localhost during dev, production host during broadcast).

**Twitch Turbo / ad-free playback.** The compositor benefits from Twitch Turbo (host's paid account) if the browser session that renders the embeds is logged in:
- **In OBS (host machine)**: the browser source uses CEF with a persistent cookie jar. One-time setup: right-click the browser source in OBS → **Interact** → navigate to `twitch.tv/login` inside the source → log in with the Turbo account → close Interact. Cookies persist across OBS restarts as long as **"Shutdown source when not visible"** and **"Refresh browser when scene becomes active"** are **unchecked** in the browser source properties. After login, all embeds in the compositor inherit the Turbo session and won't show ads.
- **In caster panels (commentator machines)**: commentators are in regular browsers with their own Twitch sessions. No action needed — if they're logged into their own Twitch account (Turbo optional), the multiview thumbnails apply those session cookies automatically.
- **Caveat**: Twitch's embed/iframe behavior around third-party cookies has gotten stricter over time. If we see ads despite login, fallback is to have the host's Chrome profile pointed at the compositor and use OBS **Window Capture** on that Chrome window instead of a browser source — Chrome's full cookie handling is more reliable. Document both options in the OBS setup guide.

## Caster control panel (`/caster`)

Separate page, also served by the Node server, protected by `ADMIN_SECRET` query param or cookie.

### Layout

```
┌─────────────────────────────────────┬──────────────────────┐
│                                     │  CONTROLS            │
│  PROGRAM VIEW                       │                      │
│  (live mirror of /compositor)       │  OBS scene:          │
│  Scaled to fit                      │  [Main] [Tech] [Brk] │
│                                     │                      │
│                                     │  Compositor layout:  │
├─────────────────────────────────────┤  [PRE][A][C][D]      │
│  MULTIVIEW (all 6-7 team streams    │  [G][LB][BT]         │
│   as ~320×180 thumbnails —          │                      │
│   click or drag to assign to slots) │  Alt card slide:     │
│                                     │  ( ) auto            │
│                                     │  ( ) Brand           │
├─────────────────────────────────────┤  ( ) Commands        │
│  STATE PANEL                        │  ( ) Info            │
│  Standings + last-10 completed runs │                      │
│  + edit infobox / commands content  │  Infobox HTML:       │
│                                     │  [ textarea ]        │
│                                     │  [ Save ]            │
└─────────────────────────────────────┴──────────────────────┘
```

### Interactions

- **OBS scene buttons**: three buttons. Click → emit `director:obsScene`. Server calls OBS WebSocket. Current scene is highlighted.
- **Compositor layout buttons**: seven buttons. Click → emit `director:setLayout`. Active layout highlighted.
- **Multiview**: all 6-7 team streams shown as small thumbnails (Twitch embeds at 320×180, same quality param). Each thumbnail is a **draggable chip** representing that team.
- **Slot drop zones**: rendered inside the program-view mirror, at the positions corresponding to the active layout (e.g. in A, only the "main" slot is a drop target; in C, all six grid positions are). Drop → emit `director:setSlot`.
- **Alt card slide radios**: auto + 3 slide options. Click → emit `director:setPinnedSlide`.
- **Main audio toggle**: a single "🔊 unmute focused stream" switch. Disabled when the active layout isn't A or D. Click → emit `director:setMainAudio`. State badge reminds the commentator when it's live ("FOCUSED STREAM IS ON-AIR").
- **Content editors**: textarea for infobox HTML (free-form, admin-trusted), text list for commands. Save button emits the corresponding `director:set*` events.
- **State panel**: current leaderboard + last 10 runs (completed, with team/dungeon/level/upgrades/points). Useful commentator reference.

### Latency

Commentators see the Twitch embeds in the panel with the same ~5-15s Twitch delay that viewers see in the stream. This keeps them in sync with what's on-air. Discord streaming from OBS is no longer load-bearing but can remain as a redundancy if desired.

## Data model changes

### New field on teams

In `data/wcl.json` team objects, add:

```js
{
  name: 'ALPHA',
  bracket: 'A',
  leader: '...',
  wclCode: '...',
  twitchChannel: 'luckywipe_alpha'  // NEW
}
```

Admin panel (`/admin/index.html`) adds a "Twitch channel" field to the team edit form, emitted via the existing `admin:updateTeam` event.

### New runtime config fields

In `data/runtime-config.json`:

```js
{
  ...existing...,
  tournamentTitle: 'Lucky Wipe M+ Tournament',
  tournamentSubtitle: '7 teams competing live',
  obsWsUrl: 'ws://localhost:4455',
  obsWsPassword: '...',
  obsSceneMain: 'Main',
  obsSceneTechnical: 'Technical',
  obsSceneBreak: 'Break',
  commandsList: ['!tournament', '!guild', '!join', '!streams', '!teams', '!ticket'],
  infoboxHtml: '<giveaway HTML>',
  altCardRotationMs: 12000
}
```

### New persistent file

`data/director-state.json` — holds the ephemeral `activeLayout` and `slots` between server restarts. Saved on every `director:*` event. Small file, single write per change.

## OBS setup (migration guide)

Before: many scenes (leaderboard, best-times, info, commands-overlay, stream-overlay, technical-difficulties, countdown).

After: three scenes.

1. **Main**
   - One browser source: `http://localhost:3000/compositor`, 1920×1080
   - **Audio — compositor track**: the browser source's audio output. Silent unless the caster panel unmutes the focused team (A/D only). When unmuted, you hear that team's stream audio.
   - **Audio — commentary track**: commentator Discord voice, layered on top via the existing workflow. Always on.
   - **Audio — BGM track** (optional): background music (e.g., YouTube on a separate system audio channel) on its own OBS source. Independent of the compositor. Ducks manually or via OBS audio filters when commentary is active.
   - All three tracks mix in OBS as today. The compositor just owns whether the focused team's stream audio is part of the mix.

2. **Technical difficulties**
   - Same as current.

3. **Break / Info**
   - Same as current (or delete, since the PRE layout + infobox handles most intermission moments).

OBS WebSocket plugin must be enabled; connection details go into `runtime-config.json`. The compositor never reaches OBS directly — only the backend does, on behalf of caster commands.

## Styling and polish

- Shared CSS tokens (already in `public/css/theme.css` and `common.css`) get extended with compositor-specific variables: `--brand-progress-pre-color`, `--brand-progress-live-color`, `--result-flash-color`, `--alt-card-accent`, etc.
- Typography: existing fonts (`--font-sans`, `--font-mono`). No new dependencies.
- All layouts designed against 1920×1080 specifically. The compositor does *not* attempt to be responsive — OBS renders at fixed resolution.

## Migration plan (at a high level)

Three implementation phases, each shippable on its own:

**Phase 1 — Compositor MVP**
- Build `/compositor` rendering Layouts A, C, LB, BT (the highest-value modes).
- Hard-code `directorState` for initial testing (no caster panel yet).
- Verify Twitch embeds render cleanly at 1920×1080 inside OBS.
- Wire the result-flash animation on the mini-lb.

**Phase 2 — Caster panel + remaining layouts**
- Build `/caster` with layout buttons, multiview, drag-drop slots, pin controls.
- Add Layouts D, G, PRE.
- Wire `director:*` Socket.io events end-to-end.
- Wire OBS WebSocket scene switching through the backend.

**Phase 3 — Polish + migration**
- Alt-card rotation, infobox editing, commands editing.
- Retire the old overlay pages.
- OBS scene collapse to three.
- Integration test: full run-through with real Twitch streams.

Each phase becomes its own implementation plan.

## Risks and open questions

- **Twitch embed CPU load**: 6-7 iframes on the compositor + 6-7 more on the caster panel = 12-14 concurrent Twitch players. The host's machine capacity for this needs verification early in Phase 1. If too heavy, the compositor's off-screen streams (e.g., strip thumbnails in D) can be swapped for static placeholders fed from team metadata.
- **Twitch embed `parent` domain**: in dev this is `localhost`; in production the compositor must be served from a stable hostname. Not a blocker, but a setup step.
- **Security**: the `/caster` page exposes powerful controls (OBS scene switching, content editing). `ADMIN_SECRET` must be required before the tournament; leaving it empty is a nonstarter in production.
- **Latency of drag-drop reflection**: when a commentator drags a team into a slot, the compositor re-renders and the OBS browser source re-composites. Twitch embed init can be slow (2-5s). Plan: pre-instantiate all team embeds once at compositor boot (hidden, `display:none`), then swap `display` and re-parent DOM nodes to avoid init lag on slot changes.
- **Run-complete signal**: the result flash needs a Socket.io event that already exists (`run:complete`). Current payload is `{ teamName, dungeonName, level, upgrades, points, ... }` — doesn't include the points delta or new rank. Phase 1 extends the payload with `{ pointsEarned, newTotal, newRank, previousRank }` for the flash.
- **No-live-telemetry reality**: commentators may ask for a live timer inside the HUD anyway. Design is firm on not showing one since we can't. Training will cover this.

## Summary

One compositor page, seven layout modes, one caster panel to drive them, and OBS shrinks to three scenes. Removes most scene-switching work from the host, gives remote commentators direct control of the broadcast surface, and unifies the overlay styling into a single cohesive page. Three-week timeline supports the full scope in three phases.
