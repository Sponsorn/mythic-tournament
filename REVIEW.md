# Project Review

**Maintainability score:** 6.5/10  
**Design score:** 7.5/10

## Key maintainability findings

- **Possible dropped writes:** `saveData()` skips re-entrant saves without queueing, which can lose updates under rapid consecutive calls. `src/wclStorage.js`
- **Hardcoded schedule & timezone ambiguity:** overlay schedule is fixed to `2026-01-31` and uses `Date('2026-01-31T18:00:00')` (interpreted as local time of the OBS machine), which makes reuse and portability brittle. `public/overlays/commands-overlay.html`
- **Duplicate utilities:** formatting/escaping helpers are repeated in multiple places, increasing drift risk. `public/js/utils.js`, `public/js/socket-client.js`, `public/overlays/scoreboard-fullscreen.html`
- **Admin security is optional:** no HTTP auth, no rate limits, CORS defaults to `*` when not configured. `src/webServer.js`, `src/config.js`
- **Expensive stats endpoint:** `/api/team-stats` scans the entire CSV on each request; overlays refresh it frequently. `src/webServer.js`, `src/wclStorage.js`, `public/overlays/scoreboard-fullscreen.html`
- **README diagram encoding is broken:** hurts documentation clarity. `README.md`

## Design notes

- Cohesive palette and component tokens give a strong broadcast identity. `public/css/common.css`, `public/css/theme.css`
- Layouts are tuned for OBS sizes and read well at a glance.
- Fixed pixel sizes make local preview/reuse harder (acceptable for OBS).
- Fonts are referenced but not loaded; fallback varies per machine. `public/css/common.css`
- Several text elements are very small (10–12px), which may be hard to read at downscale.

## Suggested improvements (highest impact first)

1. **Make persistence safe under burst updates:** queue or debounce `saveData()` to prevent dropped writes. `src/wclStorage.js`
2. **Externalize schedule + explicit timezone offsets:** move overlay schedule to config or `/api/state`, and use offsets like `2026-01-31T18:00:00+01:00`. `public/overlays/commands-overlay.html`, `src/config.js`, `src/webServer.js`
3. **Centralize shared frontend helpers:** use `public/js/utils.js` consistently. `public/js/utils.js`, `public/js/socket-client.js`, overlays
4. **Basic admin hardening:** require `ADMIN_SECRET` in prod, add rate limiting, tighten CORS. `src/webServer.js`, `src/config.js`
5. **Cache computed stats:** precompute team stats in state and refresh on data changes. `src/stateManager.js`, `src/webServer.js`
6. **Fix README encoding:** replace corrupted diagram with a clean code block or image. `README.md`
7. **Load fonts explicitly:** self-host or link to web fonts to keep visual consistency. `public/css/common.css`, `public/overlays/*.html`, `public/admin/*.html`
8. **Slightly increase tiny type sizes:** improve legibility at stream downscales. `public/css/stream-overlay.css`, `public/overlays/commands-overlay.html`
