# PicklePulse v26 Turnover / Handoff

Finalized: 2026-09-19

## v26 changes - editable roster, offline voice profiles, local MP3 background player

- Added **Edit player** to Roster. Renaming preserves the player's stable ID so queue fairness, standings identity, and player links remain intact. Active and completed games that reference that player ID are updated to the new visible name.
- Voice-over now exposes three fixed profiles: **English 1**, **English 2**, and **Tagalog**. Only voices reported by the browser as `localService=true` are used; cloud speech voices are excluded.
- Added Tagalog announcement wording for game end/result, side-out, second server, match point, score, and serving side. Player/team names remain the roster names.
- Voice profiles are intentionally device-local/offline. If the OS/browser does not have a local English or Filipino/Tagalog voice installed, that profile is shown as unavailable instead of silently falling back to a network voice.
- Added a lightweight **local MP3 background player** in Audio settings. Users can add MP3 files from the device, play/pause/skip/stop, adjust independent MP3 volume, add tracks to the playback queue, remove tracks from the queue, or delete tracks from offline storage.
- MP3 blobs are stored in browser **IndexedDB** (`picklepulse-audio-v1`) instead of `localStorage`; only small queue/settings metadata is stored in the existing app state. The library UI retains only metadata in memory and loads a blob when that track is played. Files are never uploaded by PicklePulse.
- Local MP3 safety limits: MP3-only picker plus ID3/MPEG signature check, 50 MB maximum per track, 40 stored tracks maximum, 100 queue entries maximum, and object URLs are revoked when playback sources are cleared.
- Voice announcements temporarily pause local MP3 playback and resume it afterward, matching the existing behavior of the built-in synthesized court playlist. Starting local MP3 playback disables the built-in court playlist to prevent overlapping background audio.
- Existing built-in court music, scoring, queue/fairness behavior, standings, Games, import/export, roster sharing, Live Display, CSP restrictions, and local-first behavior are retained.
- Service-worker cache bumped to `picklepulse-v26-0-0`.

## v26 validation

- JavaScript syntax checks for app core, QR module, Live Display module, and service worker: PASS.
- Roster rename regression: stable player ID retained; active-game and completed-game visible names updated; duplicate-name rename blocked: PASS.
- Offline voice filtering test: two local English voices and one local Filipino voice resolve to the three profiles; a non-local/cloud English voice is excluded: PASS.
- MP3 validation regression: ID3/MPEG header detection accepts an MP3 signature and rejects unrelated file content: PASS.
- No new external script, telemetry, upload, WebSocket, XHR, `sendBeacon`, or arbitrary service-worker caching path was added: PASS.
- Content Security Policy already permits only same-origin/blob media for local MP3 playback; no new network media source was added: PASS.

---

# PicklePulse v25 Turnover / Handoff

Finalized: 2026-09-13

## v25 changes - separate Standings and Games navigation

- Removed the user-facing **History** tab.
- The utility sub-navigation is now **Queue | Roster | Standings | Games**.
- **Standings** is its own page and contains only the calculated player rankings plus backup import/export controls.
- **Games** is its own page and contains the canonical completed-game list, Share Results, per-game delete, and Clear Games.
- Backup imports now land on **Games** so imported completed results are visible immediately.
- Updated the main utility navigation label and active-state routing for the two new views.
- Four-tab mobile styling was tightened for narrow portrait screens while preserving the existing short-landscape layout.
- Service-worker cache bumped to `picklepulse-v25-0-0`.
- Standings calculations, canonical game identity, queue/fairness logic, scoring, roster, sharing, Live Display, and security behavior were not changed.

## v25 validation

- JavaScript syntax check: PASS.
- No `data-view="history"` route or user-facing History tab remains: PASS.
- Queue / Roster / Standings / Games routes are all recognized by the shared utility view: PASS.
- Backup import destination changed from History to Games: PASS.
- Games retains Share Results, Clear Games, and per-game delete controls: PASS.
- Standings remains driven by the same canonical completed-game data: PASS.
- Service-worker cache version bumped: PASS.

---

# PicklePulse v24 Turnover / Handoff

Finalized: 2026-09-13

## v24 changes - one authoritative completed-game record

- Removed the manual **Save** button from the scoring toolbar. Completed results now enter History only through game completion / **End Game**.
- Changed completion storage from append-only snapshots to an idempotent upsert keyed by the stable `game.id`: one logical match can have at most one completed History record.
- Fixed **End -> Undo -> End**: reopening the completed match removes its final History record; ending it again replaces/recreates that same logical record instead of adding a duplicate.
- Added a reversible queue-completion checkpoint. For a queue-linked scored match, reopening restores the exact pre-completion queue state, including waiting order and fairness statistics, so completion credit is not double-counted. Re-ending applies that completion exactly once.
- Existing local data is migrated on load: duplicate snapshots with the same `game.id` collapse to the newest completed result, unfinished legacy snapshots are removed from History, and a currently active/reopened game invalidates any stale completed record with the same ID.
- Persistence now enforces the same invariant on every write: History contains completed canonical game records only, with at most one record per `game.id`.
- Starting a different game while another game is still active now clearly confirms that the unfinished game will be discarded and **not** added to History. A queue-linked unfinished game is cancelled/returned without completion credit rather than being treated as finished.
- Backup import now merges completed results by logical `game.id` instead of snapshot ID, preventing imports from reintroducing duplicated finals.
- Updated user-facing wording from “saved as final” to “recorded as final” so **End Game** is the single clear completion action.
- Removed the unused Save icon from the document sprite.
- Root state schema bumped to 7; service-worker cache bumped to `picklepulse-v24-0-0`.
- Queue scheduling/fairness selection code, New Game player picker, roster, Live Display, scoring rules, result sharing, and image sharing were not otherwise changed.

## v24 validation

- JavaScript syntax checks for app core and service worker: PASS.
- End -> Undo -> End non-queue lifecycle: one canonical History record after re-ending: PASS.
- Reopened match is removed from final History while active: PASS.
- Legacy duplicate completed snapshots collapse to the newest result on load: PASS.
- Legacy unfinished snapshots are excluded from History: PASS.
- Standings de-duplication still counts one logical `game.id` once: PASS.
- Queue-linked End applies one completion credit and returns players: PASS.
- Queue-linked Undo restores the exact serialized pre-completion queue state: PASS.
- Queue-linked re-End still leaves one History record and exactly one completion credit: PASS.
- Scoring toolbar contains no `Save game` / `data-action="save"`: PASS.
- Queue scheduling/fairness implementation region is byte-identical to v23: PASS.

---

# PicklePulse v23 Turnover / Handoff

Finalized: 2026-09-13

## v23 changes - security, privacy, and resilience audit

- Added a restrictive document Content Security Policy and `no-referrer` policy. Normal scripts/assets are same-origin; the only allowed external script URL is the exact pinned PeerJS 1.5.5 file used on demand by Live Display.
- Removed the secondary/unpkg PeerJS fallback. Live Display now loads exactly PeerJS 1.5.5 from one jsDelivr URL with Subresource Integrity verification and `crossorigin=anonymous`.
- Made Live Display's network endpoints explicit: PeerJS Cloud at `0.peerjs.com:443` plus `stun.l.google.com:19302` for WebRTC STUN.
- Added explicit controller-side confirmation before the first Live Display network connection in each page session. Controller mode still never auto-connects on page load.
- New Live Display rooms now use 8-character cryptographically generated codes. Existing 4-8 character room codes remain compatible.
- Controller Live Display accepts only the expected `picklepulse-display` data-channel label and still ignores all incoming payload data.
- Added strict sanitation/normalization of remote Live Display game state before rendering. Remote format, scores, names, queue names, appearance, timer values, and other fields are bounded/coerced; direct remote strings are no longer rendered unsafely. Viewer payloads above 100,000 serialized characters are ignored.
- Hardened game normalization: bounded names, scores, teams, player IDs, timer values, and rally history. Persisted-state restore also caps players/games before normalization.
- Added import abuse limits: 5 MB JSON backup maximum, 500 imported players, 5,000 imported games, and 100,000-character roster code/list maximum.
- Backup import is now transactional: validation/remapping completes before app state is mutated, preventing partial imports after a bad file.
- Live Display now broadcasts a minimal scoreboard snapshot only; internal player IDs and rally/undo history are no longer sent to viewers.
- Service worker now caches only the known application shell instead of arbitrary same-origin GET requests. Navigation falls back to cached `index.html` only when the network is unavailable.
- Service worker registration uses explicit `./` scope and `updateViaCache: 'none'`; cache version bumped to `picklepulse-v23-0-0`.
- Added `SECURITY.md` documenting data flow, the one intentional networked feature, limitations, and recommended deployment headers.
- Added `CHECKSUMS.sha256` for turnover integrity checking; it is intentionally documented as an integrity aid, not a cryptographic publisher signature.
- Queue scheduling/fairness behavior and New Game selection behavior were not intentionally changed.

## v23 audit findings

- No analytics SDK, advertising SDK, telemetry endpoint, `sendBeacon`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `eval`, `new Function`, or `document.write` exists in PicklePulse first-party code.
- Normal queue/roster/scoring/history/QR/result-image/audio features remain local-first.
- Live Display remains intentionally internet-dependent. It is now disclosed before controller connection and its third-party script is version-pinned and integrity-checked.
- `localStorage` remains unencrypted browser storage; roster/history data should not be treated as secret data.
- Roster codes/QR payloads and backup JSON are share formats, not encryption; anyone who receives them can read the included roster/history data.

## v23 validation

- JavaScript syntax checks: PASS.
- External-reference inventory: only intentional PeerJS/Google STUN Live Display endpoints remain in production code, plus non-network XML/license namespace URLs: PASS.
- Risky-code scan (`eval`, `new Function`, `document.write`, telemetry/network APIs in first-party code): PASS.
- Service-worker arbitrary runtime caching removed: PASS.
- Remote-display markup sanitization tests: PASS.
- Controller startup-path audit confirms Live Display/PeerJS is not loaded or connected until the explicit Live action is used: PASS.
- Queue/player scheduling module is byte-identical to v22: PASS.
- Production ZIP excludes test/audit helper files: PASS.

---

# PicklePulse v22 Turnover / Handoff

Finalized: 2026-09-13

## v22 changes - mobile player picker viewport fix

- Fixed **New Game -> Choose player** on short/narrow mobile screens where the bottom of the picker could sit below the actually visible browser area.
- Picker sizing now tracks `window.visualViewport` while open, including live viewport height/offset changes caused by mobile browser chrome and the on-screen keyboard.
- Browsers without `visualViewport` fall back to `window.innerHeight`.
- On narrow portrait phones, the picker uses the available visible height and keeps the player list as the dedicated scroll region.
- On short landscape phones, the picker is inset inside the visible viewport and the full header/search/footer remain reachable while the player grid scrolls independently.
- Background page scrolling is locked only while the player picker is open, preventing the page behind the sheet from moving instead of the player list.
- Safe-area insets remain accounted for on notched/home-indicator devices.
- Automatic player advance, recent players, search behavior, duplicate prevention, Singles behavior, Swap sides, queue scheduling/fairness, scoring, roster, and History logic were not changed.
- Service-worker cache bumped to `picklepulse-v22-0-0`.

## v22 validation

- `src/picklepulse-core.js` JavaScript syntax: PASS.
- `src/qrcode-offline.js` JavaScript syntax: PASS.
- `src/live-sync.js` JavaScript syntax: PASS.
- `sw.js` JavaScript syntax: PASS.
- Source diff against v21 confirms production JavaScript changes are confined to player-picker viewport tracking/cleanup: PASS.
- Source diff against v21 confirms CSS changes are confined to player-picker viewport/scroll behavior plus picker viewport variables: PASS.
- Queue/fairness scheduling code is unchanged from v21: PASS.
- Production ZIP contains no test harness files: PASS.

---

# PicklePulse v21 Turnover / Handoff

Finalized: 2026-09-13

## v21 changes - clearer compact queue hierarchy

- Removed the Queue page `h1`. The Queue/Roster/History sub-page tab already identifies the current area, so the redundant heading no longer consumes vertical space on small phones.
- Moved **New queue session** reset into the Queue courts configuration card so the reset action remains easy to reach without a standalone heading row.
- The actual next-fill batch is now visually distinct from later waiting players using multiple cues:
  - accent-tinted row background;
  - accent leading edge;
  - highlighted queue-position tile;
  - visible **Up next** badge.
- The distinction does not rely on color alone, and it uses `Players.nextQueueBatchPlayers(queue)`, so it stays accurate for one or multiple open courts and respects one-batch deferrals.
- Waiting summary now states how many players are **next up**.
- Narrow portrait keeps one ordered column with approximately 50 px rows.
- Short landscape keeps the existing compact courts and two-column waiting layout where width allows, with smaller badges/spacing to preserve names and actions.
- Queue fairness, court assignment, defer behavior, scoring, roster, history, and game logic were not changed.
- Service-worker cache bumped to `picklepulse-v21-0-0`.

## v21 validation

- `src/picklepulse-core.js` JavaScript syntax: PASS.
- `src/qrcode-offline.js` JavaScript syntax: PASS.
- `src/live-sync.js` JavaScript syntax: PASS.
- `sw.js` JavaScript syntax: PASS.
- Queue scheduling/fairness engine section before UI rendering is byte-identical to v20: PASS.
- No `<h1>Queue</h1>` remains in the production source: PASS.
- Next-fill styling is driven only by the scheduler's existing `nextQueueBatchPlayers()` result: PASS.
- Deferred players are excluded from **Up next** unless the scheduler actually selects them again: PASS.

---

# PicklePulse v20 Turnover / Handoff

Finalized: 2026-09-13

## v20 changes - fast New Game player picker

- Replaced the four separate **Search player + dropdown** controls on New Game with large tap-friendly player slots.
- Tapping a slot opens one shared mobile player picker for that position.
- Player selection automatically advances through the remaining required positions:
  - Doubles: Team A Right -> Team A Left -> Team B Right -> Team B Left.
  - Singles: Team A Right -> Team B Right.
- Players already selected in another position are excluded from the picker, preventing duplicate assignment before submit.
- Added a **Recent** section based on players used in the current/recent recorded games.
- Search is intentionally secondary and only appears when more than 12 players are available for the active slot.
- Player selection stays explicit: typing/filtering never auto-selects a player.
- Added **Clear selection** for an already-filled slot.
- Existing per-team **Swap sides** now swaps the hidden player IDs and visible player cards together.
- Picker uses a bottom-sheet layout on narrow phones and a compact multi-column dialog on short landscape phones.
- Queue scheduling/fairness, scoring, history, roster sharing, result sharing, and Live Display logic were not changed.
- Service-worker cache bumped to `picklepulse-v20-0-0`.

## v20 validation

- `src/picklepulse-core.js` JavaScript syntax: PASS.
- Phone-size Chromium runtime: four-player automatic advance sequence: PASS.
- Duplicate selected players are removed from subsequent picker choices: PASS.
- Team A Swap sides still exchanges the correct two player IDs/names: PASS.
- Large-roster picker shows search and filters to matching available players: PASS.
- Singles automatic advance skips left-side partner slots: PASS.
- Small portrait and short-landscape picker dialogs remain inside the viewport: PASS.
- No `.player-search` inputs or legacy `filterPlayerSelect`/`playerOptions` code remains in the New Game flow: PASS.
- Queue/fairness engine prefix is byte-identical to v19: PASS.

---

# PicklePulse v19 Turnover / Handoff

Finalized: 2026-09-13

## v19 changes - landscape queue, fullscreen, player search

- Added a controller **Fullscreen** button in the top bar. It uses the standard Fullscreen API with the existing WebKit fallback and reports `Fullscreen unavailable` when the browser does not expose a supported method.
- Fullscreen state now rerenders the controller header so the icon/label switches between enter and exit correctly.
- Added a search input above every **New Game** player dropdown. Search filters that dropdown by roster name without changing the selected player until the user explicitly chooses another option.
- Kept the existing per-team **Swap sides** control and Singles behavior unchanged.
- Added a short-landscape queue layout for phone-sized viewports (landscape, <=520px high, <=950px wide):
  - reduced header/tab vertical footprint;
  - restored multi-column courts instead of the old <=700px single-court column;
  - compacted court cards while preserving actionable button sizes;
  - uses a two-column waiting list where landscape width is sufficient (>=620px);
  - keeps DOM/fairness order unchanged, so visual positions still follow queue positions 1, 2, 3, 4...;
  - hides only the explanatory queue-court paragraph on extremely short (<=400px high) landscape screens.
- Queue scheduling/fairness, scoring, roster, history, saved-image, and Live Display logic were not changed.
- Service-worker cache bumped to `picklepulse-v19-0-0`.

## v19 validation

- Queue scheduling engine block is byte-identical to v18: PASS.
- Core JavaScript syntax: PASS.
- Fullscreen action available in controller header: PASS.
- Search fields present for all four doubles player selectors: PASS.
- Landscape queue media rules present after generic <=700px court rule, so they win the cascade on short landscape phones: PASS.

---

# PicklePulse v18 Turnover / Handoff

Finalized: 2026-09-12

## v18 changes - history safety, side swap, long image layout

- **History → Games** rows are now read-only summaries. A saved game row no longer opens/reloads a game when tapped; the delete/trash action remains available.
- Removed the obsolete `load-save` click action from the UI controller so there is no hidden reopen path behind History rows.
- **New Game** doubles selection now has a per-team **Swap sides** control. It swaps that team’s `P1 · Right` and `P2 · Left` select values in place and does not alter the other team, queue order, or roster.
- The swap control is automatically hidden in Singles mode.
- Reworked shared-results image vertical layout so the header statistics and **TOP 3** heading have explicit separation and cannot collide.
- The PNG still renders the full selected game list. There is no app-level row cutoff or summary cap; image height is calculated from every selected completed game.
- Result-image width remains 1080 px for mobile readability, while height grows with the selected range.
- No queue fairness, scoring, standings, roster, date/time filtering, result de-duplication, or game-result calculation logic changed in v18.

## v18 validation

- `src/picklepulse-core.js` JavaScript syntax: PASS.
- `src/qrcode-offline.js` JavaScript syntax: PASS.
- `src/live-sync.js` JavaScript syntax: PASS.
- `sw.js` JavaScript syntax: PASS.
- History markup contains a non-interactive `.saved-summary` and only the delete button is actionable per saved row: PASS.
- No `data-action="load-save"` or `load-save` controller branch remains: PASS.
- Both Team A and Team B render a doubles-only `swap-team-players` control: PASS.
- Swap handler exchanges only the two select values belonging to the chosen team: PASS.
- Image result loop iterates the complete selected `games` array with no slice/cap: PASS.
- Image height formula grows linearly with all selected game rows and Top 3 begins below the header metrics with a dedicated gap: PASS.
- Service-worker cache bumped to `picklepulse-v18-0-0`: PASS.

---

# PicklePulse v17 Turnover / Handoff

Finalized: 2026-09-12

## v17 changes - complete image results

- Removed the separate **Session leader** / **Top spot after tie-break** hero from the shared PNG recap.
- **Top 3** is now the first results-focused section after the compact session header.
- The image now lists **every completed game in the selected date/time range**. There is no four-game cutoff, `+ N more games` summary, or hidden result count.
- Result rows remain chronological and show game number, completion time, winner/loser (or tie), final score, and format when the selected range mixes singles and doubles.
- The export keeps a 1080 px mobile-friendly width and uses a **dynamic canvas height** based on the number of selected games. This preserves readable text instead of shrinking a long session into a fixed 4:5 image.
- The image still uses the same completed/de-duplicated History selection and standings calculations as the text recap. No queue, roster, score, ranking, or filtering logic changed.
- The image footer remains PicklePulse-only; the removed `Generated locally on this device` wording stays removed.

## v17 validation

- `src/picklepulse-core.js` JavaScript syntax: PASS.
- `src/qrcode-offline.js` JavaScript syntax: PASS.
- `src/live-sync.js` JavaScript syntax: PASS.
- `sw.js` JavaScript syntax: PASS.
- No `SESSION LEADER`, `TOP SPOT AFTER TIE-BREAK`, `RECENT RESULTS`, or `+ N more games` image-render logic remains: PASS.
- Image result loop iterates the full selected `games` array with no slice/row cap: PASS.
- Service-worker cache bumped to `picklepulse-v17-0-0`: PASS.

---

# PicklePulse v16 Turnover / Handoff

Finalized: 2026-09-12

## v16 changes - cleaner, reader-first image recap

- Removed the `Generated locally on this device` footer from shared result images. The image now uses a quiet PicklePulse-only brand footer.
- Kept the mobile-friendly **1080 x 1350 (4:5)** PNG format.
- Rebuilt the image hierarchy to make the recap readable in a few seconds on a phone:
  - compact PicklePulse + date/time header;
  - one dominant **Session leader** hero instead of multiple equal-weight statistics;
  - simplified **Top 3** showing names and wins only;
  - tie-break text appears only when equal win totals make the ranking otherwise unclear;
  - recent games are limited to four rows so the image does not become a dense report;
  - newest result is shown first;
  - winner and loser are separated into two visual lines, with the final score isolated on the right;
  - if all selected games use the same format, `RECENT DOUBLES` / `RECENT SINGLES` is shown once instead of repeating the format on every result.
- When more than four completed games are in the selected range, the image shows an exact `+ N more games` line. The text-share version remains the complete detailed record.
- No standings calculation, date/time filtering, de-duplication, score calculation, queue logic, roster logic, or sharing privacy behavior changed in v16.

## v16 validation

- `src/picklepulse-core.js` syntax: PASS.
- `src/qrcode-offline.js` syntax: PASS.
- `src/live-sync.js` syntax: PASS.
- `sw.js` syntax: PASS.
- Canvas image method runtime harness: PASS.
- Old `Generated locally on this device` image text removed: PASS.
- Image still uses the same completed/de-duplicated range selection and standings data as the text recap: PASS.
- Service-worker cache bumped to `picklepulse-v16-0-0`: PASS.

---

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
