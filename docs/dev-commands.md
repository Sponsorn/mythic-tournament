# Dev Commands

Copy-pasteable commands. All on one line so they work in both Windows **cmd** and **Git Bash** / PowerShell.

## Server

```bash
npm install
npm start
npm test
npm test -- tests/progressBar.test.js
```

## Compositor

```
http://localhost:3000/compositor/
```

Trailing slash matters.

## directorState (temporary Phase 1 admin endpoint)

Replaced in Phase 2 by authenticated Socket.io events.

### Inspect current state

```bash
curl http://localhost:3000/api/director
```

### Switch layout

```bash
curl -X POST -H "Content-Type: application/json" -d "{\"layout\":\"A\"}" http://localhost:3000/api/director
curl -X POST -H "Content-Type: application/json" -d "{\"layout\":\"C\"}" http://localhost:3000/api/director
curl -X POST -H "Content-Type: application/json" -d "{\"layout\":\"LB\"}" http://localhost:3000/api/director
curl -X POST -H "Content-Type: application/json" -d "{\"layout\":\"BT\"}" http://localhost:3000/api/director
```

Valid: `PRE | A | C | D | G | LB | BT`.

### Assign team to a slot

```bash
curl -X POST -H "Content-Type: application/json" -d "{\"slot\":\"main\",\"team\":\"ALPHA\"}" http://localhost:3000/api/director
curl -X POST -H "Content-Type: application/json" -d "{\"slot\":\"main\",\"team\":null}" http://localhost:3000/api/director
```

Valid slots: `main`, `grid[0]..[5]`, `quad[0]..[3]`, `strip[0]..[3]`. Team value is a team name (from `data/wcl.json`) or `null`.

### Toggle focused-stream audio (layouts A and D only)

```bash
curl -X POST -H "Content-Type: application/json" -d "{\"mainAudioUnmuted\":true}"  http://localhost:3000/api/director
curl -X POST -H "Content-Type: application/json" -d "{\"mainAudioUnmuted\":false}" http://localhost:3000/api/director
```

### Pin an alt-card slide

```bash
curl -X POST -H "Content-Type: application/json" -d "{\"pinnedSlide\":\"infobox\"}" http://localhost:3000/api/director
curl -X POST -H "Content-Type: application/json" -d "{\"pinnedSlide\":null}" http://localhost:3000/api/director
```

### Set tournament context (brand strip progress bar)

```bash
curl -X POST -H "Content-Type: application/json" -d "{\"tournamentContext\": {\"title\": \"Lucky Wipe M+ Tournament\", \"startSE\": \"2026-04-18T16:00:00+02:00\", \"endSE\": \"2026-04-18T22:00:00+02:00\"}}" http://localhost:3000/api/director
```

Progress states: `--pre` (gold, last 6h before start), `--live` (blue/purple, during), `--post` (green, after end), `--idle` (dim, no schedule).

### Reset directorState to defaults

Git Bash:
```bash
rm data/director-state.json
```

cmd:
```
del data\director-state.json
```

Then restart the server. Defaults: `activeLayout: "A"`, all slots null, no pinned slide, main audio muted.

## Trigger fake run:complete (dev-only)

Guarded by `NODE_ENV !== 'production'`. Fires a `run:complete` event through stateManager — useful for testing the mini-leaderboard flash.

```bash
curl -X POST -H "Content-Type: application/json" -d "{\"teamName\":\"BRAVO\",\"pointsEarned\":14,\"newTotal\":98,\"newRank\":2,\"previousRank\":3}" http://localhost:3000/api/test/run-complete
```

Expected: the row for BRAVO in the mini-leaderboard (Layout A bottom-middle) pulses green for 8s with a `+14` badge.

## Git

```bash
git log --oneline -15
git status
```
