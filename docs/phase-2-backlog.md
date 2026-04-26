# Phase 2 Backlog

Items deferred from Phase 1 (compositor MVP) to be addressed before or during Phase 2 (caster control panel + remote audio commentators).

## User-flagged polish

- [ ] **Infobox editor in admin panel** — add an input box (textarea + save button) on the existing `/admin` page that POSTs `infoboxHtml` to `/api/director`. Currently only settable via curl.
- [ ] **Leaderboard: show more info per row** — elaboration pending. Likely candidates: per-team active dungeon, last run time/level, total upgrades. Decide before implementation.
- [ ] **Brand strip: two-column layout** — left column: tournament/guild icon. Right column: stacked title + subtitle (tournament info / guild info). Currently single horizontal row with progress bar dominating.

## Technical / housekeeping

- [ ] **Port references** — `docs/dev-commands.md`, `docs/compositor-obs-setup.md`, and other docs hardcode `localhost:3000`. Anton runs on 3030 locally; either bump the docs to 3030, switch the default in `src/config.js`, or both.
- [ ] **Auth-gate `/api/director` POST** — currently unauthenticated (Phase 1 temp). Phase 2 caster panel uses authenticated Socket.io `director:*` events; remove or auth-gate the temp REST passthrough at the same time.
- [ ] **Remove legacy best-times pages** — `public/best-times.html`, `public/overlays/best-times-overlay.html`, `public/admin/best-times.html` were left in place when Task 12 replaced `/api/best-times` with the new flat-array shape. They now break against the new endpoint. Either delete them or restore the old endpoint at `/api/best-times-legacy` and point them there.
- [ ] **`AltCard.infoboxHtml` trust boundary** — note already in `alt-card.js`. Tighten when Phase 2 auth lands.
- [ ] **Phase 2 layouts** — implement `PRE` (countdown), `D` (quad), `G` (?). Currently fall back to layout A.
