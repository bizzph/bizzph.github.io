# PicklePulse v7.3

PicklePulse is a local-first pickleball scorekeeper with a phone-friendly scoring controller and an optional read-only live display powered by PeerJS. It needs no account, database, API key, package install, or build step.

## What is included

- Local player roster stored in `localStorage`
- Player dropdowns for singles and doubles setup
- FIFO **four on, four off** player queue with fixed default mapping: 1 = Team A P1, 2 = Team A P2, 3 = Team B P1, 4 = Team B P2
- One-tap **Add all** for every roster player who is not already queued or on court
- Mouse and touch drag-and-drop queue ordering, with up/down buttons as accessible fallbacks
- Automatic requeue of all four players after a queued game ends
- Local standings calculated from completed saved games
- JSON backup and restore for roster, queue, current game, history, appearance, and settings
- Room-code connect form, so spectators do not need to edit the URL manually
- Protected scoring mode with back-navigation and refresh/close warnings
- Persistent live room recovery after an accidental controller refresh
- Large current-server callout on the spectator display
- Compact right-side **Next 4** queue panel after the live score becomes final
- Optional spoken score, server, and court-side announcements
- Side-out singles and doubles scoring, including the correct doubles opening call `0 - 0 - 2`
- Games to 11, 15, or 21, win by two
- 15-minute default countdown, timer corrections, undo, and confirmed manual game end
- Offline app shell and installable PWA metadata
- Custom team score colors and high-contrast mode synchronized to spectators
- Faster startup through a single eager core bundle, lazy live-network loading, idle service-worker registration, and focused timer updates
- Compact icon-first controls with reduced helper text and accessible labels/tooltips

## Run locally

Extract the ZIP and start a local server.

### macOS / Linux

```bash
./start.sh
```

### Windows

Double-click `start.bat`, or run:

```bat
py -m http.server 4173
```

Then open:

```text
http://localhost:4173
```

Basic local scoring also works when `index.html` is opened directly. PeerJS live mode and service workers work best over HTTP or HTTPS.

## Typical workflow

1. Open **Players** and add the local roster.
2. Add waiting players individually or tap **Add all**. Drag the grip to reorder the queue when needed.
3. Tap **Next 4** to load the first four waiting players.
4. The queue prefills positions 1–2 as Team A and 3–4 as Team B. Review or change the teams, then start scoring.
5. When the game ends, those four players return to the back of the queue.
6. Open **History** to see completed-game standings and saved games.

The queue is deliberately simple and transparent: first in, first out, four players on, then all four off. Players can be reordered by dragging the grip with a mouse or touch, or by using the up/down buttons, before the next game is loaded. The default assignment is always **1 = A P1, 2 = A P2, 3 = B P1, 4 = B P2**.

## Live controller and spectator display

### Start a live room

1. Start a game on the controller.
2. Tap **Live**.
3. Share the generated link or room code.
4. On the spectator device, either open the shared link or enter the code in the **Watch a live game** form.

A direct spectator URL still works:

```text
https://example.github.io/pickleball-scorekeeper/?watch=RCBZLH
```

The spectator display is read-only. It shows the current server prominently, the spoken serving score, the correct court side, timer, and both team scores. After a game becomes final, a compact side panel shows up to the first four waiting players from the controller queue.

### Accidental navigation protection

While an active game is being scored:

- internal navigation asks for confirmation before leaving the scoring screen;
- browser Back is intercepted and shows an in-app warning;
- refresh, tab close, and external navigation trigger the browser's standard unsaved-work warning;
- the current game and live room code are persisted locally after changes;
- after refresh, the controller attempts to restore the same live room automatically.

Browsers control the exact wording of refresh/close warnings. They do not allow a web page to replace that prompt with custom text.

## Voice announcements

Tap the speaker icon on either the controller or spectator display to enable voice. Announcements use the browser's built-in `speechSynthesis` API and include:

```text
0, 0, 2. Ava serving from the right side.
```

For doubles, the spoken score is always server score, receiver score, server number. Voice availability and the installed voice vary by browser and device. Audio is opt-in because many browsers require a user gesture before speech is allowed.

## Standings

Standings are generated locally from the latest completed snapshot of each saved game. They show:

- games played
- wins and losses
- win percentage
- point differential

Unfinished/manual mid-game saves are excluded. Player IDs are stored with game records so renamed or duplicate-looking names are less likely to corrupt the standings.

## JSON backup and restore

Use the download and upload buttons in **History**. Version 7 backups contain the complete local state:

```json
{
  "app": "PicklePulse",
  "schemaVersion": 3,
  "exportedAt": "2026-07-26T00:00:00.000Z",
  "players": [
    { "id": "player-...", "name": "Ava", "createdAt": "..." }
  ],
  "queue": {
    "waiting": [],
    "pending": [],
    "onCourt": [],
    "activeGameId": ""
  },
  "currentGame": null,
  "games": [],
  "appearance": {
    "teamA": "#ffd400",
    "teamB": "#00d9ff",
    "highContrast": true
  },
  "settings": {
    "voiceEnabled": false
  }
}
```

Imports merge roster entries by normalized player name, remap player IDs in games, avoid duplicate saved snapshots, and append imported waiting players to the local queue. Imported `onCourt` state is intentionally not resumed automatically.

## PeerJS notes

PeerJS wraps WebRTC data channels. The controller creates a deterministic peer ID from the room code, while spectator browsers connect to that controller and receive complete state snapshots. Spectator messages are ignored.

The local live-sync module is loaded only when live mode is requested. It then loads the pinned PeerJS `1.5.5` browser client from jsDelivr with an unpkg fallback. Core scoring, roster, queue, standings, history, and JSON backup do not need PeerJS or internet access.

Live limitations:

- controller and spectator browsers must remain open;
- internet access is required for signaling and live connectivity;
- restrictive networks may block WebRTC;
- there is no cloud copy of a game;
- same-room recovery after refresh is best effort and can fail while a stale peer ID is still registered;
- the free public PeerServer is appropriate for casual use and prototypes, not guaranteed tournament infrastructure.

## Tests

Node.js 18 or newer:

```bash
npm test
```

The suite covers scoring rules, serving-player rotation, win-by-two, undo, timers, room generation, PeerJS controller-to-viewer transfer, queue rotation, add-all, drag reordering, team mapping, end-game confirmation, standings deduplication, unfinished-game exclusion, optimized loading, appearance synchronization, and UI smoke rendering.

For syntax-only checks:

```bash
node --check src/game-engine.js
node --check src/live-sync.js
node --check src/player-data.js
node --check src/app.js
node --check src/picklepulse-core.js
```

After editing `game-engine.js`, `player-data.js`, or `app.js`, regenerate the checked-in browser bundle:

```bash
npm run build:core
```

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
│   ├── live-sync.js
│   ├── picklepulse-core.js
│   └── player-data.js
├── scripts/
│   └── build-core.js
├── tests/
│   ├── game-engine.test.js
│   ├── live-sync.test.js
│   ├── loading.test.js
│   ├── player-data.test.js
│   └── ui-smoke.test.js
├── assets/
│   └── icon.svg
├── README.md
└── AI_HANDOFF.md
```

## Privacy

Roster names, queue state, settings, current game, and history remain in the controller browser unless the user exports JSON. During live mode, the current game state and appearance are sent directly to connected spectator peers. There is no analytics code.

## License

MIT. See `LICENSE`.
