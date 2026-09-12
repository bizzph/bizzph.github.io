# PicklePulse v15 Turnover / Handoff

Finalized: 2026-09-12

## v15 changes — local image recap + privacy/security cleanup

- **History → Games → Share results** now includes **Share image** and **Save image** in addition to the existing text actions.
- The image is rendered entirely in the browser from the already-filtered local History data. No screenshot service, image API, analytics endpoint, or upload is used.
- Image output is a fixed **1080 × 1350 PNG (4:5)** so memory use stays predictable on mobile instead of scaling with device pixel ratio.
- The image includes the selected date/time range, total completed games, unique player count, Top 3, and a compact set of the most recent results. If the selected range contains more games than fit legibly, the image states exactly how many additional completed games are in the range; the full text recap still contains every game.
- **Share image** uses the browser/phone native file share sheet only when file sharing is supported. If file sharing is unavailable, it safely falls back to saving the PNG locally.
- **Save image** creates a temporary object URL, downloads the PNG, then revokes the URL.
- Image generation uses only system fonts, Canvas, and local app data. It does not embed external images or fonts.

## Security / network audit

- Audited app source for network calls, trackers, analytics, `sendBeacon`, `XMLHttpRequest`, `eval`, and dynamic code execution. None are present in the normal queue/roster/scoring/history/share flows.
- The service worker only intercepts and caches **same-origin GET requests**.
- Queue, roster, scoring, backups, History, roster QR, text recap, and image recap work from local/same-origin code and browser storage.
- **Live Display remains the only intentional outside-network feature.** It lazy-loads PeerJS 1.5.5 from jsDelivr/unpkg and PeerJS uses its cloud signaling service / WebRTC networking. This behavior is user-triggered and is not needed by normal app operation.
- Removed controller-mode automatic Live Display reconnection after a page reload. A controller now opens the external live connection **only after the user explicitly starts/shares Live Display in the current session**.
- `src/live-sync.js` is now included in the app-shell service-worker cache, reducing same-origin fetches and making the local module consistently available offline; the external PeerJS networking requirement for cross-device Live Display is unchanged.
- No advertising, analytics, telemetry, hidden upload, or background roster/game-result transmission was added.

## v15 validation

- `src/picklepulse-core.js` syntax: PASS.
- `src/qrcode-offline.js` syntax: PASS.
- `src/live-sync.js` syntax: PASS.
- `sw.js` syntax: PASS.
- Image share/save actions are wired to the existing validated date/time selection: PASS.
- Image uses completed, de-duplicated games through the same `resultsShareSelection()` / `resultsShareStats()` pipeline as text sharing: PASS.
- Mobile-safe fixed canvas size and native file-share fallback path: PASS.
- No controller auto-start of Live Display on reload: PASS.
- Service-worker cache bumped to `picklepulse-v15-0-0`: PASS.

---

# PicklePulse v14 Turnover / Handoff

Finalized: 2026-09-12

## v14 change — cleaner, story-first shared game recap

- **History → Games → Share results** keeps the same date/time filtering and accuracy rules from v13, but the copied/shared text is now optimized for group chats.
- The recap opens with one compact session line instead of separate labels for games, players, and time zone.
- A short leader callout makes the result feel like a recap rather than a raw export.
- **Top players** uses medal markers and hides secondary ranking metrics unless they are needed to explain a tie in wins.
  - Default: wins only.
  - Same wins: show win percentage.
  - Same wins + win percentage: also show point differential.
  - Same wins + win percentage + point differential: also show games played.
- Detailed results are now human-readable sentences: `A / B beat C / D, 11–8 · Doubles`.
- Per-game numbering was removed. Result lines use bullets and show only the completion time, winner/loser, final score, and format.
- If the selected results span multiple calendar days, games are grouped under date headers. Single-day shares do not repeat the same date above the result list.
- Tied games remain visible and still do not affect Top 3.
- All underlying calculations, de-duplication, completion-time filtering, and History ranking logic are unchanged.
- No image-result feature was added in v14.
- Service-worker cache bumped to `picklepulse-v14-0-0`.

## v14 validation

- `src/picklepulse-core.js` JavaScript syntax: PASS.
- `src/qrcode-offline.js` JavaScript syntax: PASS.
- `src/live-sync.js` JavaScript syntax: PASS.
- `sw.js` JavaScript syntax: PASS.
- Runtime share-output harness: PASS.
- Old share-text labels (`Ranking:`, numeric game list) removed: PASS.
- Smart Top 3 tie-break display present: PASS.
- Single-day result grouping avoids repeated date headers: PASS.
- Multi-day grouping remains supported: PASS.
- Queue, roster, offline QR, scoring, and result calculations are unchanged in v14.

## Resource/network note

- Core app assets, offline roster QR generation, queue, roster, scoring, History, and result sharing are local/same-origin assets.
- **Live Display is the exception:** `src/live-sync.js` lazy-loads PeerJS 1.5.5 from jsDelivr with an unpkg fallback when Live Display is started. PeerJS also requires network signaling/WebRTC connectivity.
- The normal app does not load those PeerJS CDN scripts unless Live Display is used.

---

# PicklePulse v13 Turnover / Handoff

Finalized: 2026-09-12

## v13 change — date/time-filtered shareable game results

- **History → Games** now has a **Share results** action.
- Share results opens a popup with **From** and **To** `datetime-local` controls.
- The selected ending minute is inclusive, so a game completed at `8:30:47 PM` is included when **To** is `8:30 PM`.
- Only **completed** games are included. Active/manual snapshots are excluded.
- Multiple saved snapshots of the same game are de-duplicated by game ID before counting, ranking, or listing results.
- Date/time filtering uses the game's recorded `completedAt` value. Older completed records without `completedAt` fall back to `savedAt`, then `updatedAt`, then `createdAt`.
- Share text includes:
  - selected date/time range;
  - device time-zone name;
  - completed game count;
  - unique participating player count;
  - **Top 3 players**;
  - chronological game-by-game results with completion time, singles/doubles format, player names, and final score.
- **Top 3** intentionally uses the same standings order as the History standings table: **wins → win percentage → point differential → games played → player name**.
- Tied completed scores remain visible in the game-results list, but are not counted as wins/losses in Top 3. A note is added to the shared text when ties exist.
- Unique-player counting resolves saved player IDs/names back to the current roster when possible so legacy/no-ID game records do not unnecessarily double-count the same roster player.
- The popup includes a read-only text preview plus **Copy text** and **Share** actions.
- **Share** uses the Web Share API when available (group chat, Messages, etc.) and falls back to copying the exact same text.
- No internet service is required to build or copy the summary; it is derived entirely from local History data.
- Queue, roster, scoring, and offline roster-QR logic are unchanged in v13.
- Service-worker cache bumped to `picklepulse-v13-0-0`.

## v13 validation

- `src/picklepulse-core.js` JavaScript syntax: PASS.
- `src/qrcode-offline.js` JavaScript syntax: PASS.
- `sw.js` JavaScript syntax: PASS.
- Completed-game filtering: PASS.
- Active saved snapshots excluded from share range: PASS.
- Duplicate snapshots of the same game counted once: PASS.
- Filtering follows `completedAt` even when a duplicate was saved on a later date: PASS.
- End-minute inclusivity: PASS.
- Top 3 order matches existing History standings calculation: PASS.
- Unique participant count: PASS.
- Tied result listed while excluded from win/loss ranking: PASS.
- Share output contains range, time zone, counts, Top 3, and chronological final scores: PASS.

---

## Previous v12 Turnover / Handoff

## v12 change — smart pasted roster import

- **Roster → Import roster** now supports two import paths in the same popup:
  - existing roster **code / link** import; and
  - a new **Player list** paste area.
- Pasted lists are cleaned before import. Supported examples include:
  - `1.lebron`, `2. ayo`, `3.ilaw`
  - `1) LeBron`, `2) Ayo`
  - consecutive bare numbering such as `1 LeBron`, `2 Ayo`
  - bullet lists using `-`, `*`, `•`, and common checkbox/bullet glyphs
  - semicolon-separated inline lists.
- Empty lines and extra whitespace are ignored.
- Duplicate names inside the pasted list are collapsed case-insensitively, and names already in the roster are skipped.
- Commas are intentionally preserved inside names rather than treated as separators.
- Bare numeric prefixes are removed only when the whole pasted block looks like a consecutive numbered list. This prevents legitimate names such as `50 Cent` or `21 Savage` from being mangled.
- Existing roster normalization remains unchanged, so the displayed roster continues using the app's existing alphabetical ordering.
- No queue scheduling behavior was changed in v12.
- Service-worker cache bumped to `picklepulse-v12-0-0`.

## v12 validation

- JavaScript syntax check: PASS.
- Requested numbered-list sample parses to `lebron`, `ayo`, `ilaw`: PASS.
- Numbered, bulleted, blank-line, semicolon, duplicate, comma-containing-name, and numeric-name parser cases: PASS.
- Bulk-import integration with an existing duplicate roster name: PASS.
- Import popup contains both code/link and player-list actions: PASS.

---

## Previous v11 Turnover / Handoff

## v11 change

- Queue court **Done** now only completes/clears that court and returns its four players to the waiting queue with normal completion/fairness credit.
- **Done no longer auto-fills any open court.** The next batch starts only when the operator explicitly uses **Fill courts** (or the separate scorekeeper flow).
- This is intentionally manual so a finished court can remain open while the organizer reviews the next group, accepts a voluntary **Next** defer, waits for players, or chooses when to dispatch.
- Service-worker cache bumped to `picklepulse-v11-0-0` so installed copies fetch the updated core script.

## Regression note

The queue engine itself is unchanged from v10: completion still increments completed-turn fairness, requeues the four finished players, preserves partner/opponent history, and leaves other active courts untouched. Only the UI handler's automatic call to `fillOpenCourts()` after **Done** was removed.

---

## Previous v10 Turnover / Handoff

Finalized: 2026-09-12

## v10 changes

### Offline roster QR

- Roster QR generation is now bundled into the app as `src/qrcode-offline.js`.
- `index.html` no longer loads the QR generator from cdnjs or any other CDN.
- `sw.js` precaches the local QR script with the app shell (`picklepulse-v10-0-0`).
- **Show code** QR can therefore be generated with no internet connection once the app files are present. The roster payload stays in-browser and is encoded directly into the QR.
- **Open app** QR is still a URL by design. Creating that QR is local, but the receiving device must be able to open the hosted PicklePulse address (or already have that origin/app cached by its browser/PWA).
- Raw roster code and legacy/current `#roster=` links remain accepted by the Import Roster popup.
- The roster code is encoded, not encrypted; anyone who receives the code/QR can recover the roster names.

The offline QR encoder is derived from Kazuhiko Arase's QRCode for JavaScript implementation. Attribution/license details are included in `THIRD_PARTY_NOTICES.md`.

### Queue audit fixes

The queue model remains one shared multi-court pool. The audit found and fixed three edge cases:

1. **One-batch defer consumption**
   - Previously, with multiple open courts, a player could choose **Next** for a later position in the current multi-court batch and then have that defer cleared if the organizer used **Score Next 4**, even when that player was not among those four.
   - v10 consumes a defer only when a dispatch actually passes that deferred player's position. Defers later than the dispatch frontier stay active for the next relevant fill.
   - Preparing/cancelling a scored group still does not consume a defer.

2. **Leave/rejoin catch-up bias**
   - A player explicitly removed from the queue could previously return much later with an old, low `fairTurns` value and jump ahead of players who stayed in the session.
   - v10 rebases an explicitly returning player's fairness credit to at least the current active-session floor. Their real `gamesPlayed` statistic is not falsified; only the scheduling fairness credit is rebased.
   - This applies to both individual Add to Queue and Add All.

3. **Cancelled-court wait-time bias**
   - Court Cancel / reducing the court count could previously use the court's original assignment time as the player's new queue timestamp, effectively treating time spent playing as time spent waiting.
   - v10 returns those players at the current time, at the back of their current fairness tier, without completion credit.

## Queue fairness model

The queue uses one shared waiting pool across all configured queue-only courts.

Selection priority is:

1. **Completed-turn fairness (`fairTurns`)** — fewer credited queue rotations first.
2. **Actual queue wait time** — longer-waiting players first within the same fairness level.
3. **Stable tie order** — a per-session sequence breaks exact timestamp ties instead of roster alphabet/order.

Initial **Add All** order is seeded pseudo-randomly per queue session so an alphabetically sorted roster does not repeatedly get the first courts.

First-time late arrivals inherit the current minimum fairness level and join the back of that level. Players who explicitly leave and later rejoin are now also rebased to at least the current fairness floor so they do not receive artificial catch-up games.

When courts are filled, the scheduler first reserves only the fairness-eligible players needed for the currently fillable courts. It then forms foursomes/teams from that already-eligible set, strongly penalizing repeat partners and secondarily penalizing repeat opponents. Pairing history is shared across every queue court for the session.

A queue-only court marked **Done** gives its four players one completed queue game/turn and requeues them. **Cancel** returns them without game credit. The UI then fills available courts from the shared queue.

The **Next** control is a voluntary one-dispatch skip. It does not increment games or fairness turns. It is available only when enough replacement players exist to fill the intended dispatch, and it is consumed only if that dispatch actually passes the deferred player.

## Why this remains the selected model

Current open-play guidance consistently supports full rotation for recreational fairness: all four players leave after a game, and the next four waiting players take the open court. Multi-court tools additionally emphasize equal byes/court turns, wait-time priority, and avoiding repeat partners/opponents among otherwise eligible players.

References reviewed for the v10 audit:

- City of Sandy Springs open-play rules — all players come off after each game and the next four in the rack take the open court: https://www.sandyspringsga.gov/pickleball-open-play-rules/
- Dink N' Lob Cebu — next four on the paddle rack; four on/four off: https://dinknlobcebu.com/open-play
- Sparrk Philippines — shared multi-court queue; fair-by-default 4-in/4-out; optional recent-play and repeat-pairing controls: https://www.sparrk.ph/court-queue/
- CourtConnect Philippines — waiting-time priority, late arrivals at the back, and repeat partner/opponent avoidance: https://courtconnectph.com/about
- PB Queue — longest-rested players first, repeat-partner/opponent avoidance, offline-first operation: https://www.pbqueue.com/
- Picklr Lab — current open-play queue app; prior release notes specifically corrected stale wait-time credit after a match: https://play.google.com/store/apps/details?id=com.picklr.app
- Pickleball Rounds — fair byes/even court time with partner-repeat penalties: https://pickleballrounds.com/tools/rotating-partners
- CSPLib Social Golfer Problem — formal basis for reducing repeated group pairings across repeated foursomes: https://csplib.github.io/csplib-PR-builds/PR-21/Problems/prob010/

The app intentionally does **not** use winners-stay/king-of-court behavior for this default queue because that optimizes competitive continuity rather than equal recreational court access.

## Existing v8/v9 functionality retained

- Queue court count: 1–12, used only for queue rotation.
- Queue / Roster / History are sub-page tabs in the same top-level area.
- New Game serving team uses Team A / Team B radio controls.
- Active game Reset supports restarting same settings or changing players/settings without saving the interrupted score as a completed History game.
- Roster share supports raw code QR or Open app QR.
- Import Roster accepts raw roster code or older/current roster import links.
- Queue-linked scored games and queue-only court assignments remain separate concepts.

## State / migration

- Local storage key remains `picklepulse-state-v1`.
- Root state schema remains **v6**; v10 does not add a persisted queue field.
- Existing v8/v9 queue state is normalized automatically on load.
- New Queue Session still clears queue fairness/pairing history while keeping roster, saved scored games, and configured queue court count.

## Files changed in v10

- `index.html`
  - replaced external QR CDN script with local `src/qrcode-offline.js`
- `src/qrcode-offline.js`
  - new offline QR encoding bundle + SVG renderer
- `src/picklepulse-core.js`
  - precise defer consumption per dispatch
  - leave/rejoin fairness-floor rebasing
  - corrected cancelled/removed-court queue timestamps
  - offline/link QR explanatory copy
- `sw.js`
  - cache bumped to `picklepulse-v10-0-0`
  - local QR script added to app-shell precache
- `THIRD_PARTY_NOTICES.md`
  - QR library attribution/license

## Validation completed

- `picklepulse-core.js` JavaScript syntax: PASS
- `qrcode-offline.js` JavaScript syntax: PASS
- `sw.js` JavaScript syntax: PASS
- Local QR generation: PASS
- Generated QR rendered to PNG and decoded back to its exact source roster token: PASS
- No QR CDN/reference remains in `index.html`: PASS
- Service worker precaches local QR bundle: PASS
- Single-court **Next** behavior: deferred #1 skipped, #2–#5 dispatched, #1 returns to next priority: PASS
- Defer blocked when there is no replacement player: PASS
- Multi-court defer outside a `Score Next 4` dispatch remains active: PASS
- Defer actually passed by `Score Next 4` is consumed: PASS
- Multiple later defers are not incorrectly consumed by an earlier four-player dispatch: PASS
- Explicit remove/rejoin fairness-floor rebasing: PASS
- Add All rejoin fairness-floor rebasing: PASS
- Court Cancel returns players without completion credit and with fresh queue timestamp: PASS
- Court-count reduction returns players without completion credit and without stale wait credit: PASS
- Uneven completion simulations across 1–4 courts / 8–24 players: completed-game spread stayed within one turn: PASS
- Same simulations: no avoidable immediate replay when four non-finishing waiters were available: PASS
- Random mixed-operation queue fuzz test: PASS
- No duplicate player across waiting / queue courts / scorekeeper court invariants in tests: PASS

Browser/PWA note: the automated headless Chromium smoke runner available in this container was not reliable, so turnover should include one real-browser/device acceptance pass for install/offline behavior. The queue engine, static references, service-worker precache, and QR encode/decode paths were validated independently as listed above.

### Recommended real-device acceptance pass

1. Load v10 once while online, then enable airplane mode and confirm **Share Roster → Show code** still renders a QR.
2. Scan that code with a second phone, copy the text, and paste it into **Import roster code**.
3. With 8+ queued players on one court, defer #1 with **Next** and confirm #2–#5 play while #1 remains first for the following opportunity.
4. With 2+ open courts, defer a player outside the first four, use **Score Next 4**, and confirm the later defer remains active.
5. Cancel an occupied queue court and confirm those four return behind already-waiting players in the same fairness tier without receiving a completed game.

## Deployment / offline notes

There is no build step. Serve the folder as static files over HTTPS for installable PWA behavior.

For offline roster QR use:

1. Load/install this v10 app at least once so the service worker stores the app shell, including `src/qrcode-offline.js`.
2. After that, **Show code** QR generation works in airplane mode/offline.
3. A raw code QR does not need a server; the receiving device's QR scanner only needs to read the text, which can then be pasted into Import Roster.
4. **Open app** QR is a URL. It can only open successfully if the receiving device can reach the hosted app or already has that app/origin cached appropriately.

`src/live-sync.js` still loads PeerJS from the internet only when Live Display mode is started. This does not affect local scoring, queueing, roster storage, roster-code QR generation, or roster-code import.

## Turnover cautions

- Keep one shared queue across physical courts; independent court lines can produce unequal turn counts when courts finish at different speeds.
- Preserve the scheduler invariant: fairness credit first, real waiting time second; partner/opponent optimization must not let a later fairness tier jump ahead.
- Do not count time spent on a court as queue waiting time when an assignment is cancelled.
- A voluntary **Next** must never count as a completed turn and should only expire when its intended dispatch is actually skipped.
- Do not claim roster codes are encrypted. They are compact transport encoding for convenience, not a confidentiality mechanism.
