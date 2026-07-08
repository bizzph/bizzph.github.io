# Moto Talk Simple

A two-phone browser-based WebRTC audio app for push-to-talk or call-like mode.

## Changes in this build

- Removed TURN server settings from the UI.
- Removed the old "Connection needed" information section.
- Switched WebRTC ICE config to LAN direct mode with no STUN/TURN servers.
- Added a service worker so the app shell and PeerJS script can be cached after the app has been opened online once.
- Signaling disconnects are now ignored while audio is already connected, so turning off internet after setup is less likely to break an already-established local audio link.

## Important offline note

This app still uses PeerJS Cloud for the short room-code signaling step. Browser cache can make the page load offline, but it cannot replace signaling. For fully offline pairing under the same hotspot, you need one of these:

1. A small local signaling server on the hotspot/LAN.
2. Manual QR/copy-paste exchange of WebRTC offer/answer data.
3. A native app or helper that can use Bluetooth, Wi-Fi Direct, Nearby Connections, or a local socket server.

Once a WebRTC audio link is already established locally, the app tries to keep that audio link alive even if internet/signaling disappears.
