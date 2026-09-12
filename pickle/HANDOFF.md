# PicklePulse v11 Turnover / Handoff

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
