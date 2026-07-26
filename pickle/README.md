# PicklePulse v8 — Secure LAN Edition

PicklePulse is a fast, local-first pickleball scorekeeper designed for this setup:

- score the match from a mobile browser;
- show the read-only live score on a laptop;
- keep both devices on the same trusted Wi-Fi network;
- store players, queue, standings, game history, and settings in the scoring browser.

Version 8 removes the public PeerJS/CDN path. Live scoring now uses the included Python server as a small authenticated relay on your local network. No account, cloud database, API key, or third-party JavaScript is required.

## Start the app

Python 3 is the only runtime requirement.

### macOS or Linux

```bash
./start.sh
```

### Windows

Double-click `start.bat`, or run:

```bat
python serve.py --port 4173
```

### Any platform

```bash
python3 serve.py --port 4173
```

On the laptop, open:

```text
http://localhost:4173
```

On the phone, connect to the same trusted Wi-Fi and open the laptop's LAN address, for example:

```text
http://192.168.1.25:4173
```

Use the same LAN address on both devices when sharing a live display link. Allow Python through the operating-system firewall only for **private networks**. Do not expose port `4173` through router port forwarding.

Basic scoring can still open from `index.html`, but authenticated live display mode requires `serve.py`.

## Secure live display

1. Start a game on the phone.
2. Tap **Live**.
3. Copy the full secure display link or the compact `ROOM.ACCESSKEY` code.
4. Open or paste it on the laptop.

A live link looks like:

```text
http://192.168.1.25:4173/?watch=RCBZLH#key=23456789ABCDEFGHJKMN
```

The room code identifies the relay slot. The separate random access key authorizes the viewer. The raw key arrives in the URL fragment, which is not included in the HTTP page request. The viewer captures it into session storage and removes it from the address bar. The browser derives a SHA-256 relay token before contacting the local API.

The controller sends only the public scoreboard snapshot:

- team names and player display names;
- scores, format, target, status, serve, and timer;
- score-display colors.

It does **not** send rally history, local player IDs, roster, queue, standings, saved-game history, settings, or the raw access key. Live room data stays in server memory and is removed when the controller stops, the server exits, or the room expires.

The local relay limits each room to three active displays, caps messages at 64 KB, validates authentication on every request, and expires inactive viewer slots.

## Security model

The v8 build includes:

- no external scripts, CDNs, analytics, trackers, or internet dependency;
- an authenticated same-origin LAN relay;
- a strict Content Security Policy and defensive response headers;
- schema-based validation for saved, imported, and remote game data;
- escaped dynamic scoreboard rendering;
- bounded imports, players, queue entries, games, rallies, scores, rooms, viewers, and message sizes;
- an explicit static-file allowlist, so the server does not expose tests, source modules, documentation, or arbitrary files;
- Host-header filtering, no CORS access, per-device API throttling, and bounded room creation;
- session-only storage for the active live credential, excluded from JSON exports;
- versioned core/live files and a restricted service-worker cache.

### Trusted-Wi-Fi limitation

Plain `http://` traffic is not encrypted. This is appropriate only on a Wi-Fi network you trust and control. Avoid public, guest, hotel, or open Wi-Fi. Anyone who obtains the complete secure link while the room is active can view that score.

For encrypted LAN traffic, provide your own certificate and key:

```bash
python3 serve.py --port 4173 --cert certificate.pem --key private-key.pem
```

Both devices must trust that certificate. HTTPS is optional for a private home or club network but preferred when you can configure it correctly.

## Players and queue

Players are saved in the browser's local storage. Add players first, then select them from team dropdowns.

The queue uses FIFO four-on/four-off rotation. The first four waiting players are assigned as:

1. Team A — Player 1
2. Team A — Player 2
3. Team B — Player 1
4. Team B — Player 2

Assignments can still be edited before starting. After a completed queued game, all four return to the back of the line.

## Standings and backups

Standings are calculated locally from completed saved games. They include games played, wins, losses, win percentage, points for/against, and point differential.

JSON export includes the roster, queue, completed history, current game, appearance, and settings. The active live access key is intentionally excluded. Imports are limited to 5 MB and are normalized before becoming application state. Invalid or oversized data is rejected, and the previous state is restored if import persistence fails.

Browser storage is convenient but not a permanent database. Export a backup periodically if the history matters.

## Scoring features

- singles and doubles;
- automatic server number, serving player, and court side;
- win-by-two scoring;
- undo;
- countdown timer with quick and exact adjustments;
- current-server emphasis on the laptop display;
- optional voice score and serve announcements;
- warning before refresh, closing, or accidental navigation during active scoring;
- local recovery of the active game after a refresh.

## Performance

Normal startup uses one eager, versioned JavaScript bundle. The local live module is loaded only when a controller starts a room or a viewer opens a secure live link. Timer ticks update only the visible clock rather than rebuilding the interface.

After editing `src/game-engine.js`, `src/player-data.js`, or `src/app.js`, regenerate the browser bundle:

```bash
npm run build:core
```

## Tests

Run:

```bash
npm test
```

The suite covers scoring rules, serving rotation, timers, queue ordering, standings, hostile import normalization, public-state filtering, secure room parsing, relay authentication, wrong-key rejection, payload bounds, optimized loading, security policy, and UI smoke behavior.

## Project structure

```text
index.html                     App shell and icon sprite
styles.css                     Responsive UI
src/picklepulse-core.js        Generated eager browser bundle
src/live-sync.js               Lazy authenticated LAN client
src/game-engine.js             Scoring and strict game schema
src/player-data.js             Roster, queue, and standings
src/app.js                     UI, persistence, import/export, live controls
serve.py                       Hardened static server and in-memory relay
sw.js                          Restricted offline cache
scripts/build-core.js          Deterministic core bundler
tests/                         Node test suite
```

## License

MIT
