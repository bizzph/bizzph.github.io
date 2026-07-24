# PicklePulse

A minimal, responsive pickleball scorekeeper that works locally and can broadcast a live, read-only scoreboard to another browser with PeerJS.

No account, API key, database, build step, or credit card is required.

## Highlights

- Phone-friendly controller with large score targets
- Separate spectator display for a laptop, tablet, phone, or TV browser
- Short six-character live room codes
- Native Share button with copy-link fallback
- Multiple spectator displays per controller
- Singles and doubles side-out scoring
- Correct doubles opening call: `0–0–2`
- Games to 11, 15, or 21, win by two
- Player names, match timer, undo, and manual game end
- Automatic `localStorage` recovery
- Saved games plus JSON import/export
- Offline app shell and installable PWA metadata
- Responsive layouts tested from 320 px phone widths through desktop and TV sizes
- Light and dark themes based on the device setting

## Quick test

Extract the ZIP and run a local server.

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

Scoring also works by opening `index.html` directly. Live mode and service workers work best over HTTP or HTTPS.

## Test live controller + display mode

1. Open the app on the controller browser.
2. Enter player names and start a match.
3. Tap the **Live** radio icon.
4. Share or copy the generated display link.
5. Open that link in a second browser or device.
6. Tap either team on the controller and watch the display update.

A display URL looks like:

```text
https://example.github.io/pickleball-scorekeeper/?watch=K7M4Q2
```

For a one-computer simulation, use Chrome for the controller and Firefox or a private window for the display.

## How PeerJS is used

PeerJS wraps WebRTC data channels. The controller creates a deterministic peer ID from the room code, and spectator browsers connect to that peer. The controller sends the complete current game after each change. Spectator messages are ignored, so display mode is read-only.

The PeerJS client is loaded only when live mode is requested, using the pinned `1.5.5` browser build from jsDelivr with an unpkg fallback. The free public PeerServer handles signaling. Normal scoring, local saves, history, and JSON files do not need PeerJS or an internet connection.

Live mode limitations:

- Both controller and display browsers must stay open.
- Internet access is required for signaling and live connectivity.
- Some restrictive school, corporate, carrier, or guest networks may block WebRTC.
- There is no cloud copy of the live game.
- Refreshing the controller creates a new live room.
- The public PeerServer is suitable for casual use and prototypes, not guaranteed tournament infrastructure.

## GitHub Pages

1. Create a GitHub repository.
2. Put the contents of this folder at the repository root.
3. Push to the `main` branch.
4. Open **Settings → Pages**.
5. Choose **Deploy from a branch**.
6. Select `main` and `/ (root)`.
7. Save and wait for the published URL.

All asset paths and generated spectator links work from a GitHub Pages project subdirectory.

## Offline and weak-signal behavior

The active match and history are written to `localStorage` after each scoring action. If live connectivity drops, the controller remains usable and keeps saving locally. Spectators show a reconnecting state and retry automatically.

When connectivity returns, the display reconnects and receives the controller's latest complete state. This is latest-state recovery, not a server-backed event queue.

## JSON backups

Use the history icon, then the download icon, to export saved games. The upload icon imports a previous backup.

Exports are readable JSON:

```json
{
  "app": "PicklePulse",
  "schemaVersion": 1,
  "exportedAt": "2026-07-25T00:00:00.000Z",
  "games": [
    {
      "format": "doubles",
      "target": 11,
      "teams": [
        { "name": "Team A", "players": ["Ava", "Ben"], "score": 11 },
        { "name": "Team B", "players": ["Cora", "Drew"], "score": 8 }
      ]
    }
  ]
}
```

## Tests

Node.js 18 or newer:

```bash
npm test
```

The suite covers scoring rules, win-by-two, undo, room generation, spectator URLs, a mocked controller-to-viewer PeerJS transfer, and UI smoke rendering.

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
├── assets/
│   └── icon.svg
├── README.md
└── AI_HANDOFF.md
```

## Privacy

Player names and saved games remain in the controller browser unless the user exports JSON. Live state is sent directly to connected spectator peers for the duration of the room. There is no analytics code.

## License

MIT. See `LICENSE`.
