# PicklePulse security and privacy notes

Finalized: 2026-09-19

## Default data flow

PicklePulse is local-first. Queue, roster, scoring, Standings/Games, backups, roster QR/code generation, result text/image generation, fullscreen, synthesized court music, local MP3 playback, and voice settings run in the browser and do not upload app data to an analytics or telemetry service.

Persistent app state is stored in the browser's `localStorage`. User-added MP3 blobs are stored separately in same-origin browser IndexedDB (`picklepulse-audio-v1`) because `localStorage` is not suitable for binary audio. Neither store is encrypted and both should be treated like other data in the browser profile/device. Do not put secrets, passwords, medical information, or other sensitive data in player names or backups.

Voice-over exposes three profiles: English 1, English 2, and System Default. English 1 / English 2 use the app's local-voice filtering, including the Firefox `urn:moz-tts:` compatibility path for local voices that Gecko may mislabel. System Default deliberately delegates voice choice to the browser/device speech engine; because browsers differ in how they implement their default speech service, PicklePulse cannot independently guarantee that this user-selected profile is offline on every platform. No third-party TTS SDK or PicklePulse-controlled cloud TTS endpoint is included.


## Intentional user sharing

Roster QR/codes and exported backups are **not encrypted**. A roster code is an encoding of the shared player names, so anyone who receives the code can recover those names. Result text/images and backup files remain local until the user explicitly copies, saves, downloads, or invokes the device share sheet; the destination app/service then controls what happens to that shared copy.


## Local MP3 storage and playback

- MP3 files are selected explicitly by the user and saved to same-origin IndexedDB. PicklePulse does not upload them, fetch cover art, parse remote playlists, or contact a music service.
- The MP3 picker is limited to MP3 MIME/extensions and a lightweight ID3/MPEG header check, with a 50 MB per-track cap and a 40-track local-library cap to reduce storage/memory abuse.
- The library UI keeps only track metadata in memory. As of v27, that metadata is stored in a separate IndexedDB `track-meta` object store, so normal library scans do not deserialize every saved MP3 blob. A track blob is loaded from the `tracks` store only when selected for playback, then played through a browser `blob:` object URL. Object URLs are revoked when their playback source is cleared.
- Queue order and volume are lightweight metadata in the normal local app state; the binary MP3 data is not copied into backup JSON or roster share codes.
- Browser storage quotas still apply. Clearing site data, using private browsing, or browser eviction can remove saved MP3 files.

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
- No `eval`, `new Function`, `document.write`, `sendBeacon`, `XMLHttpRequest`, `WebSocket`, `EventSource`, analytics SDK, ad SDK, telemetry SDK, cloud TTS client, or MP3 upload endpoint exists in PicklePulse first-party code.
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
## v27 audio/UI security note

v27 adds roster-name speech preview and multi-file MP3 batching without adding a new network path. Name previews use the same installed `localService=true` speech voices and local speech-synthesis API as normal announcements. Multi-file MP3 imports keep the existing extension/MIME, size, and MP3-signature validation; accepted files are written only to same-origin IndexedDB. Clearing the playback queue removes only local track IDs from app state and does not delete the stored MP3 blobs unless the user explicitly uses the saved-track delete control.


## v28 compact scoreboard MP3 controls

The scoreboard transport controls the same in-memory `Audio` element and IndexedDB-backed local MP3 queue introduced in v26/v27. It does not add another media source, upload path, remote endpoint, permission, analytics hook, or background service. Seek and volume controls operate only on the current local `blob:` playback object; previous/next resolve IDs from the existing persisted queue.

## v29 Firefox voice compatibility and cache update

- The app still does not add cloud TTS, telemetry, analytics, or an audio upload service.
- Voice selection prefers voices explicitly reported local. Because Firefox can misreport its own local `urn:moz-tts:` voices as `localService=false`, those Mozilla-owned voice URIs are treated as local. Explicit non-Mozilla voices reported as remote remain rejected.
- A temporary English system-default fallback is permitted only while Firefox returns an empty voice list; Tagalog never uses this fallback and still requires an enumerated Filipino/Tagalog local voice.
- Voice discovery retries are bounded to four delayed checks and do not poll continuously.
- Version query parameters on local CSS/JS are cache-busting identifiers only; they do not add network endpoints or external dependencies.
- The scoreboard MP3 controls continue to use only the existing local IndexedDB audio library and local `<audio>` playback.


## v30 voice-profile note

v30 removes the Tagalog selector and adds System Default while retaining English 1 / English 2. Legacy `tagalog` state migrates locally to `system`. System Default uses the browser/device Web Speech default rather than adding a network service or TTS provider to the application.

## v31 player-pronunciation note

v31 adds an optional per-player pronunciation string stored with the local roster. It is handled like the player name: persisted in browser localStorage and included in JSON backups, but it is not uploaded to a PicklePulse service. The value is escaped when rendered and passed only as plain text to the selected Web Speech voice. Controller announcements use it only for speech; visible player names remain unchanged. Roster share QR/code remains name-only in this build.
