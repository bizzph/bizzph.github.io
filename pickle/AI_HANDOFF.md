# PicklePulse v8 AI Handoff

## Product and deployment target

PicklePulse is a browser-only pickleball scorekeeper optimized for a mobile controller and a laptop spectator on the same trusted Wi-Fi. Version 8 deliberately replaces PeerJS/public signaling with an authenticated relay inside `serve.py`.

Primary workflow:

1. Run `python3 serve.py --port 4173` on the laptop.
2. Open the laptop's LAN URL on both phone and laptop.
3. Score on the phone.
4. Start Live and open the complete secure link on the laptop.

There are no runtime package dependencies and no external scripts. Do not reintroduce CDN-hosted JavaScript or public live signaling without an explicit product decision.

## Architecture

### Eager path

`index.html` loads exactly one required script:

```text
src/picklepulse-core.js?v=8
```

That generated bundle concatenates, in order:

1. `src/game-engine.js`
2. `src/player-data.js`
3. `src/app.js`

Run `npm run build:core` after changing any eager source file. The generated bundle must be committed and tested.

### Lazy live path

`src/live-sync.js?v=8` is injected only when live mode is started or a valid `?watch=ROOM#key=ACCESSKEY` page is opened. Keep live networking off the normal scoring startup path.

### Local server

`serve.py` provides:

- a `ThreadingHTTPServer` static server;
- an explicit seven-file static allowlist;
- an in-memory authenticated live relay under `/api/live/`;
- per-device API and new-room rate limits;
- response security headers and Host-header checks;
- optional TLS with `--cert` and `--key`.

It must not expose source modules other than the generated core and live client, tests, documentation, hidden files, or arbitrary paths.

## Live authentication protocol

Room codes contain 4–8 unambiguous uppercase characters. Access keys contain 16–32 URL-safe random characters and require `crypto.getRandomValues` when generated.

Shared formats:

```text
http://LAN-IP:4173/?watch=ROOM#key=ACCESSKEY
ROOM.ACCESSKEY
```

The raw access key stays in the fragment. Client code derives:

```text
SHA-256("picklepulse-relay-v1|ROOM|ACCESSKEY")
```

The resulting 64-character token is sent as `X-PicklePulse-Token`. Never put the raw access key into relay payloads, query strings, exports, logs, or server state.

### Relay endpoints

```text
GET    /api/live/ping
POST   /api/live/<ROOM>
GET    /api/live/<ROOM>
DELETE /api/live/<ROOM>
```

Controller POST requirements:

- `Content-Type: application/json`
- valid relay token;
- body at most 64 KB;
- packet object with `type: "state"` and object `game`.

Viewer GET requirements:

- valid relay token;
- `X-PicklePulse-Viewer` as 24 lowercase hex characters;
- ETag polling support;
- maximum three active viewer IDs per room;
- viewer slots expire after eight seconds.

Room data is RAM-only, capped at 100 rooms, and expires after 12 hours. A room cannot be overwritten by another token. Controller DELETE removes it.

## Public live-state invariant

The controller must call `Engine.publicGameState(currentGame)` before broadcasting. The public packet may contain only display-required game fields and appearance.

Never transmit:

- rallies or undo snapshots;
- roster or queue;
- standings or saved history;
- local player IDs;
- arbitrary game properties;
- raw access keys or stored relay credentials.

Viewers must still treat the relay as untrusted: apply `Live.adaptRemoteGame()`, then `Engine.normalizeGame()`, then escape all rendered dynamic text.

## Hostile-data rules

`Engine.normalizeGame()` is the schema boundary for persisted, imported, and live game data. It constrains format, status, target, scores, timer values, IDs, dates, names, players, and rallies, and discards unknown properties.

Do not render dynamic values with unescaped `innerHTML`. Numeric-looking values must also be normalized before interpolation. CSP is defense-in-depth, not a substitute for validation and escaping.

Current bounds:

- score: `0..999`;
- active rallies: 500;
- saved rallies: 100, with completed snapshots stripped;
- imported games: 500;
- backup file: 5 MB;
- players: 500;
- queued players: 500;
- live packet: 64 KB;
- live viewers: 3;
- live rooms: 100.

Keep these bounds synchronized across source, tests, server, and documentation.

## Persistence

Main state is stored under the existing PicklePulse local-storage key. The active live room/access key is stored separately in session storage under:

```text
picklepulse-live-secret-v1
```

The secret entry survives refresh in the current tab but normally disappears when the browser session ends. The viewer removes the raw key from the address bar after capturing it. The secret entry is intentionally absent from JSON exports. Import must validate size first, normalize all incoming data, cap collections, remap invalid IDs, and restore the previous in-memory state if persistence fails.

Local storage is synchronous and origin-wide. Do not add unbounded history. If future usage outgrows current caps, migrate history to IndexedDB rather than increasing limits indefinitely.

## Functional invariants

### Queue

FIFO four-on/four-off. Pending positions map exactly:

1. Team A Player 1
2. Team A Player 2
3. Team B Player 1
4. Team B Player 2

All four return to the back after a completed queued game. Replacing an active queued match must release its players correctly.

### Standings

Use only completed saved results. Deduplicate repeated snapshots by game ID and use the latest snapshot. Prefer player IDs, with normalized names only as a legacy fallback.

### Scoring

Preserve automatic serving team, server number, serving player, court side, win-by-two behavior, undo snapshots, and singles rules.

### Timer

Timer ticks must call the focused clock updater rather than rerendering the app every second. Remote timers are shifted by the packet send/receive difference with a bounded offset.

### Navigation protection

Active scoring requests `beforeunload` confirmation and uses history protection. This is best-effort browser behavior, not a guaranteed lock. Persist scoring changes immediately.

### Service worker

Cache name and versioned asset URLs must change together. Cache only known successful app assets. Use network-first navigation. Do not cache API responses or arbitrary same-origin requests.

## Security headers

Keep the HTML meta CSP and server CSP aligned:

- `default-src 'self'`
- `script-src 'self'`
- `script-src-attr 'none'`
- `connect-src 'self'`
- `object-src 'none'`
- `base-uri 'none'`
- `frame-ancestors 'none'`

`serve.py` also sends `nosniff`, `no-referrer`, `DENY`, restrictive Permissions Policy, COOP, CORP, and HSTS when HTTPS is enabled.

## Known limitations

- Plain LAN HTTP is authenticated but not encrypted. Use only a trusted private network, or configure TLS.
- Anyone holding the complete secure link can view the active room.
- Live rooms disappear when the server stops.
- The laptop must remain awake and reachable from the phone.
- Mobile browser navigation warnings are best effort.
- Local browser data can be cleared or evicted; backups remain necessary.

## Validation checklist

Before release:

```bash
npm run build:core
npm test
python3 -m py_compile serve.py
node --check src/game-engine.js
node --check src/player-data.js
node --check src/app.js
node --check src/live-sync.js
node --check src/picklepulse-core.js
```

Then run the local server and verify:

- all allowlisted assets return 200;
- `/serve.py`, tests, docs, and unknown paths return 404;
- invalid Host returns 421;
- wrong content type returns 415;
- authenticated POST/GET/DELETE succeeds;
- wrong token returns 403;
- conditional GET returns 304;
- a fourth active viewer returns 429;
- security headers appear on static and API responses;
- no source contains PeerJS, jsDelivr, unpkg, or another runtime CDN reference.
