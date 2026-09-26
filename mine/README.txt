MINESWEEPER HARDENED LOCAL PWA

Difficulty:
Easy   9 x 9   - 10 mines
Medium 14 x 14 - 35 mines
Hard   16 x 30 - 100 mines

PRIVACY / SECURITY DESIGN
- No accounts.
- No forms.
- No analytics.
- No advertising code.
- No third-party JavaScript, CSS, fonts, images, SDKs or CDNs.
- No API endpoints.
- No cookies.
- No telemetry or score uploads.
- Personal bests are stored only in this origin's localStorage.
- Content Security Policy blocks network connections from page JavaScript (connect-src 'none').
- CSP allows scripts/styles only from this same origin; inline script execution is not allowed.
- Service worker has an explicit same-origin allowlist and blocks unknown/cross-origin fetches.
- Service worker cache contains only the packaged PWA files.
- Referrer policy is no-referrer.
- No eval(), new Function(), WebSocket, EventSource, XMLHttpRequest, sendBeacon, or remote fetch calls are used by app.js.

PWA FILES
- index.html
- app.css
- app.js
- manifest.webmanifest
- sw.js
- icons/icon-192.png
- icons/icon-512.png

HOSTING
- Use HTTPS in production. localhost is suitable for development.
- For strongest isolation, host on a dedicated origin/subdomain (for example minesweeper.example.com).
- Clearing browser/PWA site data also clears personal bests.

OPTIONAL SERVER HEADERS (recommended when publishing)
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'none'; connect-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'self'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=()
Cross-Origin-Opener-Policy: same-origin

NOTE
A static client-side game can be made very small and auditable, but no software can honestly be promised to be absolutely invulnerable. This package intentionally minimizes attack surface and contains no hidden network functionality.
