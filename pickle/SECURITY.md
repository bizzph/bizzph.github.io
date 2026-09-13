# PicklePulse security and privacy notes

Finalized: 2026-09-13

## Default data flow

PicklePulse is local-first. Queue, roster, scoring, Standings/Games, backups, roster QR/code generation, result text/image generation, fullscreen, synthesized court music, and voice settings run in the browser and do not upload app data to an analytics or telemetry service.

Persistent app state is stored in the browser's `localStorage`. It is not encrypted and should be treated like other data stored by the browser profile/device. Do not put secrets, passwords, medical information, or other sensitive data in player names or backups.


## Intentional user sharing

Roster QR/codes and exported backups are **not encrypted**. A roster code is an encoding of the shared player names, so anyone who receives the code can recover those names. Result text/images and backup files remain local until the user explicitly copies, saves, downloads, or invokes the device share sheet; the destination app/service then controls what happens to that shared copy.

## Intentional network feature: Live Display

Live Display is the only PicklePulse feature designed to connect outside the app origin.

- It starts on the controller only after an explicit user confirmation in the current page session.
- It uses PeerJS 1.5.5 loaded from one pinned jsDelivr URL with Subresource Integrity (SRI).
- PeerJS signaling is explicitly configured to `0.peerjs.com:443` over TLS.
- WebRTC uses Google's public STUN endpoint `stun.l.google.com:19302` for connectivity discovery.
- Scoreboard state is sent over an encrypted WebRTC data channel to viewers who know the room code. The controller sends only the display fields needed by the remote scoreboard; internal player IDs and rally/undo history are not broadcast.
- New rooms use 8-character cryptographically generated codes. Older 4-8 character room links/codes remain compatible.
- Controller connections accept only the PicklePulse display channel label and ignore incoming data.
- Incoming viewer state is size-limited, normalized, and sanitized before rendering.

Live Display is not an authentication system. Anyone who obtains or correctly guesses an active room code can view that live scoreboard. Stop Live Display when it is no longer needed.

## Browser hardening in this build

- Content Security Policy limits scripts to PicklePulse itself plus the exact pinned PeerJS 1.5.5 CDN file path.
- Fetch/WebSocket-style connections are limited by CSP to same-origin plus the explicit PeerJS signaling endpoint.
- `object` and `frame` content are disabled by CSP.
- Referrer policy is `no-referrer`.
- No `eval`, `new Function`, `document.write`, `sendBeacon`, `XMLHttpRequest`, `WebSocket`, `EventSource`, analytics SDK, ad SDK, or telemetry SDK exists in PicklePulse first-party code.
- Roster imports, persisted-state loading, Live Display payloads, and JSON backups have size/count limits to reduce accidental or hostile memory/CPU abuse.
- Backup import validates before mutating live state, preventing partial imports after a validation failure.
- The service worker caches only the known PicklePulse application shell. It does not opportunistically cache arbitrary same-origin GET responses.
- Service worker registration uses an explicit local scope and bypasses HTTP cache when checking for worker updates.

## Hosting recommendations

For an HTTPS deployment, configure the server to send security headers too. HTTP response headers are stronger than a document-only meta policy and can add protections that static HTML cannot enforce reliably, especially `frame-ancestors` and `X-Content-Type-Options`.

Recommended baseline:

- `Content-Security-Policy`: mirror the policy in `index.html`, and add `frame-ancestors 'none'`.
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- Serve only over HTTPS in production.

## Integrity manifest

`CHECKSUMS.sha256` records SHA-256 hashes of the shipped source/assets so a turnover recipient can detect accidental or unexpected file changes after extraction. It is an integrity aid, not a publisher signature: someone able to replace both the app files and the checksum file could still forge both.

## Audit scope

The v23 audit reviewed first-party HTML, CSS, JavaScript, the service worker, manifest, QR bundle integration, external URLs, dynamic script loading, local persistence, import/share paths, and Live Display data flow. This is a practical code audit, not a formal penetration test or a guarantee that no browser/library vulnerability can ever exist.

## v24 scoring-history note

v24 changes the local scoring/history lifecycle only. It removes the manual score snapshot action and enforces one completed History record per stable game ID, including reversible queue state when a just-completed queued game is reopened. No new network endpoint, external script, telemetry path, permission, or remote-data flow was added in v24. The v23 security audit and Live Display limitations above remain applicable.
