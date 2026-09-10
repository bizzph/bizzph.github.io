# PicklePulse v8 Turnover / Handoff

Finalized: 2026-09-11

## What changed

- Queue court count is now configurable from 1 to 12 courts. This setting affects queue rotation only; the scorekeeper remains a single scored game view.
- New Game now uses radio buttons for the starting/serving team (Team A / Team B).
- Active games have a Reset action with two paths:
  - restart the same players/settings at 0-0; or
  - change players/settings, then restart at 0-0.
  The interrupted score/rallies are not saved as a completed History entry.
- Roster and Queue are separate top-level pages.
- Queueing was redesigned around one shared multi-court fairness state instead of independent court lines.
- Roster can be handed to another PicklePulse instance using a QR/import link. Duplicate names are skipped on merge.

## Queue fairness model

The queue uses one shared waiting pool for all configured queue courts.

Selection order is based on:

1. **Fair-turn level**: players with fewer completed queue rotations are selected first.
2. **Wait time**: within the same fair-turn level, the player who has waited longer is selected first.
3. **Stable join order**: equal timestamps use a session tie sequence rather than alphabetic roster order.

When Add All is used, the initial queue is seeded in a stable pseudo-random session order so an alphabetically sorted roster does not always get the first courts.

Late arrivals do not get artificial catch-up priority. On their first entry into a running queue session they inherit the current minimum fair-turn level, then go to the back of that level by wait timestamp.

For each batch of open courts, the scheduler reserves only the fairness-eligible players needed for those courts and then groups those players to reduce social repetition. Team pairing strongly penalizes repeat partners first, then repeat opponents. The partner/opponent history is shared across every queue court for the session.

When a queue-only court is marked Done, its four players receive one completed queue game and are re-added behind eligible players who have already been waiting. The app then fills open courts from the shared pool. Cancel returns that court's players without completion credit.

**New queue session** clears the waiting list, queue-only courts, and queue fairness/pairing history while keeping the roster, saved scored games, and configured court count.

## Why this model

The implementation combines common open-play rotation rules (players rotate off and waiting players go next) with multi-court fairness practices that consider games played, wait time, and partner/opponent variety across the whole session rather than treating each court as an isolated queue.

Research references used during the redesign:

- Sandy Springs Pickleball Open Play Rules: https://www.sandyspringsga.gov/pickleball-open-play-rules/
- DinkPro, multi-court scheduling and fairness: https://www.dinkpro.app/how-it-works
- MatchPoint, open-play rotation fairness: https://joinmatchpoint.io/pickleball-open-play
- CourtConnect PH, fair open-play queueing: https://courtconnectph.com/about
- CourtConnect PH open-play guide: https://courtconnectph.com/open-play-guide

## Queue vs. scorekeeper

Queue-only courts and the scored game are intentionally separate concepts:

- **Queue page courts** are rotation assignments only. They are marked Done/Cancel and do not create scored History records.
- **Score Next 4** preserves the app's prior queue-to-scorekeeper workflow for one group. That scored game can still be completed/saved normally.
- If a queue-linked scored game is reset with the same four doubles players, the queue link is preserved.
- If a queue-linked scored game is reset and its players/format are changed, the old queued group is returned to the queue without completion credit, and the edited game starts as a regular scored game.

## Roster QR transfer

Roster Share creates a same-app URL whose `#roster=` fragment contains a compact JSON payload of player names encoded as base64url. The receiving PicklePulse instance detects the fragment, asks whether to import, merges new names, skips duplicate names, then removes the fragment from the address bar.

QR rendering is done in the browser with `qrcode-generator` 1.4.4 loaded from cdnjs:

- Library project: https://github.com/kazuhikoarase/qrcode-generator/blob/master/js/README.md
- CDN listing: https://cdnjs.com/libraries/qrcode-generator/1.4.4

The roster payload is not sent to a QR-image web service. If the QR library is unavailable/offline or the roster is too large for a single QR code, Copy link / native Share remains available.

Deployment note: for QR transfer between devices, both devices need to be able to open the same hosted PicklePulse URL. Local-only file URLs are not suitable for cross-device scanning.

## State / migration

Local storage key remains `picklepulse-state-v1`.

Root state schema is now **v5**. Queue normalization automatically accepts older state that only had `waiting`, `pending`, `onCourt`, and `activeGameId` and adds the new queue fields.

New queue state includes:

- `courtCount`
- `courts[]`
- per-player queue `stats` including `gamesPlayed`, `fairTurns`, timestamps, tie order, and session participation
- `pairCounts`
- `opponentCounts`
- `sequence`
- `sessionSeed`

No manual migration step is required; loading/persisting normalizes legacy state into the new shape.

## Files changed

- `index.html`
  - queue icon
  - QR generator dependency
- `src/picklepulse-core.js`
  - state schema v5
  - multi-court fair queue engine
  - separate Roster and Queue views
  - serving-team radios
  - game reset/edit flow
  - roster QR link import/share
- `styles.css`
  - queue courts, fairness UI, roster QR, reset dialog, and responsive layout
- `sw.js`
  - service-worker cache bumped to `picklepulse-v8-0-0`

Existing `src/live-sync.js`, manifest, and app icon are retained.

## Build / deployment

There is no build step. Serve the folder as a normal static site over HTTPS (or localhost during development). Do not open `index.html` only as a local `file://` page if PWA/service-worker behavior or cross-device QR transfer is required.

After deploying this version, the new service-worker cache name causes existing clients to replace the prior app-shell cache on activation.

## Validation completed

Automated/static checks performed on the finalized source:

- JavaScript syntax check: PASS
- Legacy queue-state normalization/migration: PASS
- 3-court / 16-player uneven-completion simulation over 30 court completions: PASS
  - no duplicate player across waiting/courts
  - courts remain groups of 0 or 4
  - completed queue-game spread remained within 1 rotation
  - partner/opponent history recorded
- Court-count reduction returns players to waiting without duplication: PASS
- Court Cancel returns players without completion credit: PASS
- Late-arrival fairness baseline/back-of-tier behavior: PASS
- Game reset clears score/rallies, restores starting server, preserves game ID, and restarts timer: PASS
- Referenced SVG icons: PASS
- CSS brace balance/basic HTML structure: PASS

A Chromium headless smoke run was attempted in the handoff environment, but the container's Chromium process did not become usable because of sandbox/DBus/zygote runtime issues. No app JavaScript runtime error was observed in those logs. Before production rollout, perform the browser checklist below on a real target device/browser.

## Production browser checklist

1. Existing install/state loads and roster/history remain present.
2. Roster and Queue open as separate pages.
3. Set Queue courts to 2+; Add All; Fill open courts; complete courts in different orders.
4. Confirm no player appears on two queue courts or both court + waiting list.
5. Confirm late arrivals enter behind current eligible waiters.
6. Run enough rounds to confirm partners/opponents vary as expected.
7. New Game serving-team radio starts the correct team.
8. During a live game, test Restart same players and Change players/settings.
9. Confirm reset does not create an unwanted History entry.
10. Share a roster QR from device A and scan/import on device B; verify duplicate names are skipped.
11. Test QR fallback by disabling network after the app is loaded; Copy link should remain usable even if QR rendering is unavailable.
12. Confirm PWA refresh/update behavior after the service worker activates.

## Turnover notes

- Queue fairness is session-local and intentionally resets with New queue session.
- Saved scored-game History is separate from queue-only completion counters.
- Do not make each physical court maintain its own queue; that would reintroduce multi-court bias.
- If fairness behavior changes later, preserve the key ordering invariant: fairness level first, waiting time second, then use partner/opponent history only to form matches among already-eligible players.
- Keep QR payloads limited to roster names unless a future product decision explicitly expands what users agree to transfer.
