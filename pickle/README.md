# PicklePulse

A minimalist, responsive pickleball scorekeeper with an optional PeerJS spectator display.

No account, database, API key, build step, or credit card is required.

## Features

- Phone-first controller with large scoring targets
- Read-only `?watch=ROOM` display for another phone, tablet, laptop, or TV
- PeerJS/WebRTC live updates with automatic reconnect
- 15-minute countdown timer by default; optional 10, 20, or 30 minutes
- Pause, resume, reset, and automatic stop at `00:00`
- Automatic serving-player and court-side guidance
- Correct doubles opening call: `0–0–2`
- Singles and doubles side-out scoring
- Games to 11, 15, or 21, win by two
- Undo, manual game end, local recovery, JSON import/export
- Fullscreen button in spectator mode
- Offline app shell and installable PWA metadata
- Responsive layouts from small phones to landscape displays

## Run locally

Extract the ZIP, then start a local web server.

### macOS / Linux

```bash
./start.sh
```

### Windows

Double-click `start.bat`, or run:

```bat
py -m http.server 4173
```

Open:

```text
http://localhost:4173
```

Opening `index.html` directly is enough for local scoring, but live mode, service workers, and fullscreen behavior are best tested over HTTP or HTTPS.

## Controller and spectator test

1. Open the app on the scoring phone.
2. Enter the players. In doubles, **P1 starts on the right** and **P2 starts on the left**.
3. Select the timer duration; 15 minutes is selected by default.
4. Start the match.
5. Tap the Live radio icon and share the generated link.
6. Open the link in another browser or device.
7. Use the expand icon on the spectator screen to enter fullscreen.

Example spectator URL:

```text
https://username.github.io/pickleball-scorekeeper/?watch=K7M4Q2
```

Browsers require fullscreen to begin from a user action, so the spectator must tap the fullscreen icon. Some iPhone browser versions restrict page fullscreen; installed PWAs and other modern browsers generally provide better fullscreen support.

## Serving rotation

The scoring engine stores the exact serving player and calculates their current court side.

Doubles behavior:

- P1 begins on the right and P2 begins on the left.
- The opening serving team starts at server 2 (`0–0–2`).
- The serving player remains the same after scoring and switches court sides.
- A server-1 fault moves service to the partner on that partner's current side.
- A server-2 fault causes a side-out.
- At a side-out, the receiving team's player currently on the right becomes server 1.

The controller and spectator show the next server's name, court side, and spoken score automatically after every rally.

## Countdown timer

Timer data uses timestamps rather than a once-per-second counter. This keeps it accurate through browser throttling and between devices.

```js
{
  durationMs: 900000,
  elapsedMs: 0,
  running: true,
  startedAt: 1784980800000
}
```

The app renders `durationMs - elapsedMs`, stops at `00:00`, saves the timer locally, and broadcasts timer state to connected spectators.

## PeerJS live mode

The controller creates a deterministic peer ID from the room code. Spectator browsers connect over a WebRTC data channel. The controller sends the complete current game after each change and ignores all incoming spectator data, keeping displays read-only.

PeerJS `1.5.5` is loaded only when live mode is used:

1. jsDelivr
2. unpkg fallback

Core scoring and local saves work without PeerJS. Live mode requires internet access for signaling and may be blocked by restrictive networks.

Important limitations:

- The controller browser must remain open.
- There is no cloud copy of the room.
- Refreshing the controller creates a new room.
- The public PeerServer is appropriate for casual games and prototypes, not guaranteed tournament infrastructure.

## GitHub Pages

1. Create a GitHub repository.
2. Put this folder's contents at the repository root.
3. Push to `main`.
4. Open **Settings → Pages**.
5. Select **Deploy from a branch**.
6. Choose `main` and `/ (root)`.

All local paths and generated `?watch=` links support GitHub Pages project subdirectories.

## Local storage and JSON

The current game and saved-game history are written to browser `localStorage` after each mutation. A weak or lost network does not prevent scoring.

JSON exports use schema version 2 and include timer duration plus serving-player state:

```json
{
  "app": "PicklePulse",
  "schemaVersion": 2,
  "games": [
    {
      "format": "doubles",
      "servingTeam": 0,
      "serverNumber": 1,
      "servingPlayer": 1,
      "timer": {
        "durationMs": 900000,
        "elapsedMs": 125000,
        "running": false,
        "startedAt": null
      }
    }
  ]
}
```

Older version-1 saves are migrated automatically with a 15-minute timer and best-effort serving-player reconstruction from rally history.

## Tests

Node.js 18 or newer:

```bash
npm test
```

The suite covers countdown behavior, expiry, serving-player rotation, court-side changes, side-outs, undo, legacy migration, room generation, PeerJS state transfer, clock-skew correction, fullscreen controls, and UI smoke rendering.

## Project structure

```text
pickleball-scorekeeper/
├── index.html
├── styles.css
├── manifest.webmanifest
├── sw.js
├── package.json
├── start.sh
├── start.bat
├── src/
│   ├── app.js
│   ├── game-engine.js
│   └── live-sync.js
├── tests/
│   ├── game-engine.test.js
│   ├── live-sync.test.js
│   └── ui-smoke.test.js
├── assets/icon.svg
├── README.md
└── AI_HANDOFF.md
```

## Privacy

Player names and saved games remain in the controller browser unless JSON is exported. Live state is sent only to connected spectator peers. There is no analytics code.

## License

MIT. See `LICENSE`.
