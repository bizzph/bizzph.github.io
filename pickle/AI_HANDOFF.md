# AI Handoff: PicklePulse v7

Read this before modifying the project.

## Product intent

PicklePulse is a court-side scoring controller with an optional separate live display. It is local-first: scoring, roster, queue, standings, persistence, and backups must remain usable without network access. Networking is supplemental and must never block scoring.

The interface is icon-first and touch-oriented. Preserve large score targets, minimal scoring-screen text, and responsive behavior from narrow phones through TV displays.

## Architecture

- UI source: browser-native `<pickleball-app>` custom element in `src/app.js`
- Browser entry: generated `src/picklepulse-core.js` containing game engine, player data, and app UI
- Scoring domain: pure functions in `src/game-engine.js`
- Player roster, queue, standings: pure functions in `src/player-data.js`
- Live sync: PeerJS/WebRTC wrapper in `src/live-sync.js`
- Persistence: `localStorage` key `picklepulse-state-v1`
- Offline shell: `sw.js`
- Backup: JSON Blob download and File API import
- Build helper: `scripts/build-core.js` concatenates the three eager source files; the generated bundle is checked in
- Runtime package installation: none

`index.html` eagerly loads only `src/picklepulse-core.js`. That generated file preserves this source order:

1. `game-engine.js`
2. `player-data.js`
3. `app.js`

`src/live-sync.js` is injected only when a controller starts live mode or a `?watch=ROOM` page opens. PeerJS itself is not bundled; `loadPeerJS()` then loads version `1.5.5` from jsDelivr, with unpkg as fallback. After changing any eager source file, run `npm run build:core` and commit the regenerated bundle.

## Startup and runtime performance invariants

- Keep `index.html` to one eager JavaScript request: `src/picklepulse-core.js`.
- Do not put `live-sync.js` or PeerJS back on the normal controller startup path.
- Service-worker registration is intentionally delayed until browser idle time.
- The one-second timer tick must update `[data-role="match-clock"]` directly; do not restore full `innerHTML` rendering every second.
- SVG icon paths live in the inline sprite in `index.html` so they are not parsed as JavaScript.
- Preserve the cached player-ID map in `playerById()` unless state mutation semantics change.
- Regenerate the core bundle with `npm run build:core` after changing eager source files.

## Root state schema

Current root schema version: `3`.

```js
{
  schemaVersion: 3,
  currentGame: Game | null,
  games: SavedGame[],
  players: Player[],
  queue: {
    waiting: string[],
    pending: string[],
    onCourt: string[],
    activeGameId: string
  },
  settings: {
    voiceEnabled: boolean
  },
  liveRoom: string,
  lastSavedAt: ISODateString | null,
  appearance: {
    teamA: string,
    teamB: string,
    highContrast: boolean
  }
}
```

`Game.teams[*]` contains both `players` and parallel `playerIds` arrays. Preserve both for readable history and stable standings identity.

## Roster and queue invariants

Roster names are normalized and deduplicated case-insensitively. Queue functions live in `src/player-data.js`; the UI must not duplicate their logic.

Default rotation policy is FIFO four-on/four-off:

1. `waiting` is the ordered paddle rack.
2. `prepareNextFour()` copies the first four IDs to `pending`.
3. Default assignment is positional: pending 1 = Team A P1, 2 = Team A P2, 3 = Team B P1, 4 = Team B P2. Assignment remains editable, but the selected four must match `pending`.
4. `startQueuedGame()` removes those four from `waiting`, puts them in `onCourt`, and records `activeGameId`.
5. `finishQueuedGame()` appends all four to the back of `waiting` and clears court state.

When an active queued game is replaced by another game, the old four are returned to the queue before the replacement begins.

Do not silently implement winners-stay behavior without a visible policy selector; it changes fairness and queue expectations.

## Standings invariants

`calculateStandings()`:

- deduplicates saved snapshots by game ID and keeps the latest timestamp;
- counts only games whose status is `complete`;
- ignores ties;
- resolves players by player ID first, then normalized name for legacy data;
- calculates games, wins, losses, points for/against, differential, and win rate;
- sorts by wins, win rate, differential, games, then name.

Manual active-game saves must not affect standings.

## Live-room protocol

Normalized room codes contain 4–8 characters from:

```text
23456789ABCDEFGHJKLMNPQRSTUVWXYZ
```

Controller peer ID:

```js
picklepulse-${room.toLowerCase()}
```

Display link:

```text
?watch=ROOM
```

The controller sends:

```js
{
  type: 'state',
  game: GameWithAppearance,
  sentAt: Date.now()
}
```

The complete current game is sent after each mutation. Controller connections ignore incoming data, so display mode remains read-only.

`liveRoom` is persisted. During `connectedCallback()`, an active controller game with a saved room attempts to restore that same room. Recovery is best effort because the public PeerServer can temporarily retain a stale peer ID.

## Scoring protection

For an active controller game:

- internal navigation shows an in-app warning;
- browser Back is guarded with a same-URL history entry and `popstate` warning;
- `beforeunload` triggers the browser's native refresh/close/navigation prompt;
- choosing to leave explicitly sets `allowPageLeave`.

Browsers do not permit custom `beforeunload` text. Do not claim otherwise. Keep persistence after every mutation because no navigation guard is absolute on mobile OS task termination.

## Voice announcements

Voice is opt-in and uses `speechSynthesis`. The announcement signature combines status, scores, serving team, server number, serving player, and side so repeated renders do not repeat speech.

Active game example:

```text
0, 0, 2. Ava serving from the right side.
```

Completion example:

```text
Game. Ava · Ben wins, 11 to 8.
```

Controller preference is persisted in `settings.voiceEnabled`. Spectator voice is session-only because autoplay/user-gesture restrictions vary by browser. Preserve graceful no-op behavior when Speech Synthesis is unavailable.

## Scoring invariants

1. Only the serving team scores under side-out scoring.
2. Doubles starts at server 2, producing `0 - 0 - 2`.
3. A server-1 loss moves to server 2 on the same team.
4. A server-2 loss transfers service and resets to server 1.
5. Singles transfers service immediately on service loss.
6. A game finishes only after reaching the target with a two-point lead.
7. Rally snapshots make undo restore score, server, serving player, completion state, and timer.
8. Spoken score is server score, receiver score, then server number for doubles.

Keep these rules in `src/game-engine.js`.

## Timer model

```js
{
  durationMs: number,
  elapsedMs: number,
  running: boolean,
  startedAt: number | null
}
```

The timer uses timestamps rather than interval increments. `setRemainingMs()` and `adjustTimer()` preserve running/paused state, stop at zero, and cap remaining time at three hours. Displays calculate visible time locally from synchronized timer state.

## Import/export behavior

Exports include players, queue, current game, saved games, appearance, and settings.

Imports:

- merge players by normalized name;
- remap conflicting/imported player IDs in saved games and current game;
- avoid duplicate saved snapshots;
- append imported waiting players to the local queue;
- intentionally discard imported `pending`, `onCourt`, and `activeGameId` state so a backup does not resume a possibly stale court session.

All player/imported text rendered into HTML must pass through `escapeHtml()`.

## Rendering and security

- Escape every user-entered/imported string with `escapeHtml()`.
- Normalize colors with `normalizeHex()` before inline CSS.
- `appearanceStyle()` is the intended score-color CSS-variable path.
- Room codes are casual sharing identifiers, not authentication.
- Never add remote scoring commands without an authenticated product design.

## Responsive requirements

Maintain:

- no horizontal overflow at 320 CSS px;
- score cards side by side on phones;
- largest touch targets reserved for score entry;
- safe-area-aware reachable bottom toolbar;
- spectator display filling the viewport with both teams visible;
- prominent `.remote-call strong` current-server text;
- compact landscape controller mode;
- `aria-label` and `title` on icon-only buttons;
- reduced-motion and light/dark preference support.

Manual visual baseline:

- 320 × 568 setup and controller
- 360 × 800 controller
- 568 × 320 landscape controller
- 768 × 1024 tablet controller
- 390 × 844 spectator display
- 1366 × 768 spectator display

## Service worker

Whenever a local asset is added or renamed:

1. update `ASSETS` in `sw.js`;
2. bump `CACHE_NAME` when installed clients must refresh cached files.

Do not add cross-origin PeerJS CDN files to `cache.addAll()`.

## Validation

Run:

```bash
node --check src/game-engine.js
node --check src/live-sync.js
node --check src/player-data.js
node --check src/app.js
node --check src/picklepulse-core.js
npm run build:core
npm test
python3 -m http.server 4173
```

Manual two-browser checks:

1. Add at least six players and verify dropdown setup.
2. Queue five or more players, load Next 4, verify 1–2 prefill Team A and 3–4 prefill Team B, optionally edit, and start.
3. Complete the queued game and verify all four return behind existing waiters.
4. Verify standings count the completed game once and ignore an active save.
5. Export, clear or use another browser profile, import, and verify roster/history/standings.
6. Enter a room code in the connect form and verify `?watch=ROOM` display mode.
7. Start live mode and open two spectators.
8. Enable voice by clicking the speaker control and verify score/server/side calls.
9. Verify the large current-server callout on phone and TV display sizes.
10. Score, undo, pause/resume, adjust timer, and change colors; verify both spectators update.
11. Press Back during active scoring and verify the in-app warning.
12. Refresh the controller, accept the native warning, and verify local game recovery plus same-room reconnect attempt.
13. Disconnect the network, continue scoring locally, reconnect, and verify latest-state recovery.

## Known limitations

- Public PeerServer/WebRTC can be blocked by restrictive networks.
- The controller must remain open; there is no server-side room or cloud history.
- Same-room refresh recovery can fail temporarily because of stale peer registration.
- `localStorage` is per browser profile and may be cleared by the browser or OS.
- Voice quality and availability depend on device/browser voices.
- Native navigation warning wording is controlled by the browser.
- The queue currently supports one explicit policy only: FIFO four-on/four-off.
- Automated tests are DOM smoke tests, not full cross-browser layout or WebRTC end-to-end tests.

## High-value next work

1. Optional queue policies with clear labels: winners split, winners stay, challenge court.
2. QR code for spectator links using a small audited local library.
3. Screen Wake Lock with graceful fallback.
4. Player rename flow that preserves IDs and historical records.
5. Best-of-three match support and side switching.
6. Optional haptic feedback.
7. Install/update prompt for the PWA.
8. Compact live serializer that omits rally history.
9. Configurable self-hosted PeerServer.
10. Real Playwright cross-browser tests with two browser contexts.
11. Controller lock PIN before any remote-write feature.
12. Internationalization without increasing scoring-screen text density.
