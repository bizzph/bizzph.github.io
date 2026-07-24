# AI Handoff: PicklePulse v3

Read this before modifying the project.

## Product intent

PicklePulse is a small-phone scoring controller with an optional read-only live display. Local scoring must remain usable during weak connectivity. The UI is intentionally sparse, icon-first, and responsive from 320 px portrait phones to landscape TVs.

## Architecture

- UI: `<pickleball-app>` custom element in `src/app.js`
- Scoring and timer domain: pure functions in `src/game-engine.js`
- Live sync: PeerJS/WebRTC wrapper in `src/live-sync.js`
- Persistence: `localStorage` key `picklepulse-state-v1`
- Offline shell: `sw.js`
- Backups: JSON Blob download and File API import
- Build system: none
- Runtime dependencies: PeerJS loaded on demand from pinned CDNs

Do not move scoring rules into the UI. UI actions must call engine functions, persist the resulting game, broadcast it when live, and render.

## State schema

Root state:

```js
{
  schemaVersion: 2,
  currentGame: Game | null,
  games: SavedGame[],
  lastSavedAt: ISODateString | null
}
```

Important game fields:

```js
{
  schemaVersion: 2,
  format: 'singles' | 'doubles',
  teams: [
    { name, players, score },
    { name, players, score }
  ],
  servingTeam: 0 | 1,
  serverNumber: 1 | 2,
  servingPlayer: 0 | 1,
  startingTeam: 0 | 1,
  rallies: Rally[],
  timer: {
    durationMs: number,
    elapsedMs: number,
    running: boolean,
    startedAt: number | null
  }
}
```

`Engine.normalizeGame()` migrates older data. Always normalize imported or restored games.

## Countdown timer invariants

- Default duration is `15 * 60 * 1000`.
- The UI displays `Engine.getRemainingMs(game, now)`.
- `elapsedMs` is accumulated time used, not time remaining.
- A running timer uses `startedAt` to avoid drift and browser-throttling errors.
- `formatCountdown()` rounds remaining seconds upward so a new timer displays `15:00` for the first second.
- Controller interval calls `Engine.expireTimer()` at zero, persists the stopped timer, and broadcasts it.
- A spectator independently renders zero if the controller tab is temporarily throttled.
- Reset returns to the configured duration and starts immediately when the game is active.
- Starting a timer already at zero does nothing; reset is required.

## Serving-player and side invariants

Doubles player positions are defined at game start:

- player index `0`: right-side starter
- player index `1`: left-side starter

Court position can be derived from team score parity:

- even score: player 0 right, player 1 left
- odd score: player 1 right, player 0 left

Rules:

1. Opening server is the starting team's player 0 at server number 2.
2. A serving point increments score; `servingPlayer` stays unchanged and therefore changes sides.
3. A server-1 loss keeps the serving team, changes to server 2, and selects the partner.
4. A server-2 loss causes a side-out.
5. On side-out, the new serving team's player currently on the right becomes server 1.
6. Singles always uses player index 0; court side follows the serving score parity.
7. Rally snapshots store `servingPlayer` so undo restores exact rotation.

Use these engine helpers rather than recreating logic:

- `serviceDetails(game)`
- `nextServiceAfterFault(game)`
- `rightPlayerIndex(game, teamIndex)`
- `serviceCourt(game)`
- `spokenScore(game)`

The UI currently shows the upcoming server's name plus `Right/Left` and the spoken score.

## Live-room protocol

Room alphabet:

```text
23456789ABCDEFGHJKLMNPQRSTUVWXYZ
```

Controller peer ID:

```js
picklepulse-${room.toLowerCase()}
```

Display query:

```text
?watch=ROOM
```

Messages:

```js
{
  type: 'state',
  game: Game,
  sentAt: Date.now()
}
```

The whole game is sent after each mutation. Spectator data events are ignored. `adaptRemoteGame()` shifts a running timer's `startedAt` to compensate for controller/viewer clock differences.

Do not add remote write controls without an authentication and conflict-resolution design.

## Fullscreen display

Spectator mode has a `data-action="toggle-fullscreen"` icon button.

Implementation notes:

- Uses standard Fullscreen API with WebKit-prefixed fallback.
- Must be initiated by a click; browsers reject automatic fullscreen.
- `fullscreenchange` and `webkitfullscreenchange` trigger rerendering.
- `.display-shell.is-fullscreen` hides normal spectator chrome but keeps a floating exit-fullscreen button.
- Native Escape exits fullscreen on desktop.
- Some iPhone browsers may not support page fullscreen. Keep the graceful `Fullscreen unavailable` path.

## Rendering and security

All player-entered or imported strings rendered into templates must pass through `escapeHtml()`.

Keep icon buttons accessible with `aria-label` and `title`. Do not remove safe-area inset handling, reduced-motion support, or responsive phone/landscape media rules.

## Service worker

When app assets change, bump `CACHE_NAME` in `sw.js`. Do not put cross-origin PeerJS scripts in `cache.addAll()`.

## Validation

Run:

```bash
node --check src/game-engine.js
node --check src/live-sync.js
node --check src/app.js
npm test
python3 -m http.server 4173
```

Manual regression checklist:

1. New game displays `15:00` and begins counting down.
2. Pause/resume/reset are synchronized to a spectator.
3. Timer stops at `00:00` without becoming negative.
4. Doubles starts with P1, Right, `0 - 0 - 2`.
5. A serving point keeps the same player and changes their side.
6. A server-1 loss selects the partner and correct side.
7. A server-2 loss selects the opponent currently on the right.
8. Undo restores score, server number, player, side, and timer.
9. `?watch=ROOM` shows the same server guidance and countdown.
10. Fullscreen enters only after tapping its button and can be exited.
11. Refresh restores the current local game.
12. Version-1 JSON imports migrate successfully.

## Known limitations

- Public PeerServer/WebRTC may be blocked on restrictive networks.
- Controller must remain open; no server-side room exists.
- Controller refresh creates a new live room.
- Local storage is per browser profile and can be cleared by the browser or OS.
- Fullscreen support varies, especially on iPhone browser tabs.
- Player starting positions are fixed by entry order; there is no mid-game manual position correction UI.
- PeerJS client delivery depends on jsDelivr or the unpkg fallback when live mode starts.

## High-value next improvements

1. Add a manual court-position correction control for scorekeeping mistakes.
2. Add Screen Wake Lock with graceful fallback.
3. Add best-of-three matches and end switching.
4. Add a compact live-state serializer that omits rally history.
5. Add QR-code sharing for `?watch=` links.
6. Add real cross-browser WebRTC tests in CI.
7. Add a configurable self-hosted PeerServer endpoint.
8. Add an optional persistent-room backend adapter for tournament use.
