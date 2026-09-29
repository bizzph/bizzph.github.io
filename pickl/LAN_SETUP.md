# PicklePulse LAN Edition - offline live display setup

This build replaces PeerJS/WebRTC with a small local WebSocket relay. The controller and scoreboard communicate only through the computer running `server.js` on the same Wi-Fi/LAN. The router or hotspot does **not** need Internet access.

## What you need

- One computer with Node.js 18 or newer. This can be a laptop, mini PC, Raspberry Pi, or similar device.
- A local Wi-Fi/LAN. An old router with no WAN connection, a phone hotspot with mobile data disabled, or a laptop hotspot is fine.
- The controller device and scoreboard/display device connected to that same local network.

No `npm install` is required. The server has no external package dependencies.

## Start the local server

From the extracted PicklePulse folder:

```bash
node server.js
```

or:

```bash
npm start
```

The terminal prints addresses similar to:

```text
PicklePulse LAN server is running.
Local: http://localhost:8080/
LAN:   http://192.168.4.10:8080/
```

Use the **LAN** address on phones, tablets, TVs, and other computers. `localhost` works only on the computer running the server.

If port 8080 is already in use:

```bash
PORT=8090 node server.js
```

On Windows Command Prompt:

```bat
set PORT=8090 && node server.js
```

If the operating system firewall asks whether Node.js may accept local/private-network connections, allow it on the private/local network.

## Use Live Display without Internet

1. Connect the server computer, controller, and scoreboard to the same local router/hotspot.
2. Turn off/disconnect the router WAN or disable mobile data if you want to verify there is no Internet path.
3. Start `node server.js`.
4. Open the printed LAN URL on the controller device.
5. Start a match, then press the Live/Share control. PicklePulse creates a room code.
6. On the scoreboard device, open the **same LAN URL** and enter that room code, or open the copied `?watch=ROOMCODE` display link.
7. Score changes are relayed immediately through the local server.

The room code is still used so one LAN server can relay multiple simultaneous courts/scoreboards. One controller can own a given room code; any number of spectator displays can watch it.

## Network architecture

```text
Offline Wi-Fi / LAN
        |
        +-- controller phone/tablet
        |       \
        |        \ WebSocket
        |         \
        +-- local PicklePulse server (Node.js)
        |         /
        |        / WebSocket
        |       /
        +-- scoreboard TV/tablet/browser
```

All app files are also served by the local Node.js server, so Live Display does not depend on a hosted website, PeerJS Cloud, STUN, TURN, a CDN, DNS, or Internet connectivity.

## PWA/install note

Normal desktop/mobile browsers allow the app to run from the local HTTP server, which is enough for fully offline LAN operation. However, many browsers require HTTPS for service workers and PWA installation when the page is opened from another device's LAN IP address.

If you need a truly installable PWA over the LAN, run the included server with a certificate that the devices trust:

```bash
TLS_CERT=/path/to/cert.pem TLS_KEY=/path/to/key.pem node server.js
```

The server will then print `https://...` addresses and Live Display will automatically use `wss://`. A self-signed certificate may still be rejected for PWA/service-worker purposes unless it is explicitly trusted by each device.

## Troubleshooting

- **The page does not open from another device:** confirm both devices are on the same subnet/network, use the printed LAN IP rather than `localhost`, and allow the Node.js server through the computer firewall.
- **Room says it is already active:** that code already has a controller. Stop Live Display on the other controller or generate another room.
- **Display keeps waiting for controller:** make sure the controller has started Live Display and both pages were opened from the same PicklePulse LAN server.
- **Server computer changed networks:** restart the server and use the newly printed LAN address.
- **Port 8080 is occupied:** start with another port, for example `PORT=8090 node server.js`, and use the newly printed URL on all devices.
