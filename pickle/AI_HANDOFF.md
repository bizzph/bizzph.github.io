# AI Handoff: PicklePulse v2

Read this before modifying the project.

## Product intent

PicklePulse is a court-side scoring controller with an optional separate live display. The controller must remain fast and usable on a small phone even when connectivity becomes weak. Local scoring and persistence take priority over networking.

The interface is deliberately sparse: icon-first navigation, large team score targets, very little instructional text, and layouts that work from 320 px portrait phones to landscape TVs.

## Architecture

- UI: one browser-native custom element, `<pickleball-app>`
- Rendering: escaped template strings in `src/app.js`
- Scoring domain: pure functions in `src/game-engine.js`
- Live sync: PeerJS/WebRTC wrapper in `src/live-sync.js`
- Persistence: `localStorage` key `picklepulse-state-v1`
- Offline shell: service worker in `sw.js`
- Backups: JSON Blob download and File API import
- Build system: none
- Runtime package installation: none

PeerJS is not bundled. `loadPeerJS()` dynamically loads the pinned browser build from:

1. `https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js`
2. `https://unpkg.com/peerjs@1.5.5/dist/peerjs.min.js`

This happens only when a controller starts live mode or a `?watch=ROOM` display opens. Core scoring remains independent of the network library.

## Live-room protocol

A normalized room contains 4–8 characters from:

```text
23456789ABCDEFGHJKLMNPQRSTUVWXYZ
```

Ambiguous characters such as `0`, `1`, `I`, and `O` are excluded.

The controller peer ID is deterministic:

```js
picklepulse-${room.toLowerCase()}
```

A display link adds:

```text
?watch=ROOM
```

The controller sends messages shaped like:

```js
{
  type: 'state',
  game: Game,
  sentAt: Date.now()
}
```

The whole game is sent after each mutation. This is intentionally simple and acceptable for one scorekeeper with a small rally history. If message size becomes a problem, add a compact live-state serializer instead of sending local history.

Controller connections ignore all incoming `data` events. Do not add remote scoring commands without authentication and explicit product design.

`LiveViewer` reconnects with bounded exponential backoff. On reconnection, the controller sends the latest full state, so missed intermediate updates do not matter.

## Scoring invariants

1. Only the serving team scores under side-out scoring.
2. Doubles starts at server 2, producing `0 - 0 - 2`.
3. A server-1 loss moves to server 2 on the same team.
4. A server-2 loss transfers service and resets to server 1.
5. Singles transfers service immediately on a service loss.
6. A game finishes only after reaching the target with a two-point lead.
7. Rally snapshots make undo restore score, server, completion state, and timer.

Keep these rules in `src/game-engine.js`. The UI should never reimplement scoring decisions.

## State and timer

Stored root state:

```js
{
  schemaVersion: 1,
  currentGame: Game | null,
  games: SavedGame[],
  lastSavedAt: ISODateString | null
}
```

Timer state:

```js
{
  elapsedMs: number,
  running: boolean,
  startedAt: number | null
}
```

The timer uses timestamps rather than incrementing a counter. This preserves accuracy through browser throttling, page visibility changes, and refresh recovery. Displays receive the same timer object and calculate the visible time locally.

## Rendering and security

Every player-entered or imported string rendered into a template must pass through `escapeHtml()`.

The short room code is a casual sharing mechanism, not strong authentication. Peer-to-peer display traffic is transient and is not stored on a backend. The current architecture is appropriate for casual games, demos, and small events—not high-assurance tournaments.

## Responsive design requirements

Maintain these behaviors:

- No horizontal overflow at 320 CSS px.
- Controller scores remain side by side on phones.
- Score cards are the largest touch targets.
- The bottom toolbar remains reachable with phone safe-area insets.
- Display mode fills the viewport and keeps both teams visible.
- Landscape layouts reduce chrome and maximize score numerals.
- Do not replace icon buttons with unlabeled generic elements; retain `aria-label` and `title` attributes.
- Respect `prefers-reduced-motion` and device light/dark mode.

Visual QA performed for v2:

- 320 × 568 setup and controller
- 360 × 800 controller
- 768 × 1024 tablet controller
- 390 × 844 spectator display
- 1366 × 768 spectator display
- 568 × 320 landscape controller

## Service worker

Whenever a local app asset is added or renamed:

1. Update `ASSETS` in `sw.js`.
2. Bump `CACHE_NAME` when an existing installation must refresh cached files.

Do not add cross-origin PeerJS CDN files to `cache.addAll()`. A failed cross-origin cache fill could prevent the local app shell from installing. Live mode already requires network connectivity.

## Tests and validation

Run:

```bash
node --check src/game-engine.js
node --check src/live-sync.js
node --check src/app.js
npm test
python3 -m http.server 4173
```

Manual two-browser test:

1. Start a doubles match and confirm `0 - 0 - 2`.
2. Start live mode and open the generated link in a second browser.
3. Verify the initial game appears without another scoring action.
4. Score, undo, pause/resume, and reset the timer.
5. Confirm every action updates the display.
6. Open a third spectator and verify both displays update.
7. Disconnect the controller network, score locally, reconnect, and verify latest-state recovery.
8. Close the controller and verify spectators enter reconnecting state.
9. Export JSON and import it in a different browser profile.

The Node suite contains a fake in-memory Peer implementation that validates the controller-to-viewer state path without using the public PeerServer.

## High-value improvements

Recommended next work:

1. Add an optional QR code for the spectator URL using a tiny audited local library.
2. Add Screen Wake Lock with graceful fallback.
3. Track the exact serving player and doubles rotation.
4. Add best-of-three match support and side switching.
5. Add optional haptic feedback for rally entry.
6. Add an install prompt and clearer PWA update notification.
7. Add a compact live serializer that omits rally history.
8. Add a self-hosted PeerServer configuration field for clubs that need more control.
9. Add a Cloudflare Durable Object or similar persistent-room adapter for tournament use.
10. Add real cross-browser WebRTC tests in CI using two browser contexts.
11. Add a controller lock PIN before ever supporting remote write commands.
12. Add internationalization without increasing scoring-screen text density.

## Known limitations

- The public PeerServer and direct WebRTC path may be blocked on restrictive networks.
- The controller must remain open; there is no server-side live room.
- Controller refresh creates a new room.
- Local storage is per browser profile and may be cleared by the browser or OS.
- The app reports estimated connection quality only when the browser exposes the Network Information API.
- Doubles tracks server number, not the exact serving player's rotation.
- PeerJS client delivery currently depends on one of two public CDNs when live mode starts.
