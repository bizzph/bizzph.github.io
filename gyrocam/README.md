# Gyro Steady Camera

A mobile-first, framework-free web app that uses the phone camera and motion sensors to reduce visible rotational shake.

## Privacy by design

- Camera and motion processing stays in the browser.
- The app contains no upload code, analytics, ads, or third-party scripts.
- Microphone access is disabled.
- The camera stops when the page is hidden.
- Recordings remain in memory until the user saves/shares or deletes them.
- Unsaved recordings disappear when the page closes.
- Recording automatically stops at 3 minutes or 150 MB.
- The app refuses to run inside an iframe.

Saving or sharing is always initiated by the user. On supported phones the app opens the system share sheet; otherwise it uses a local Blob download.

## Recommended browsers

Use a recent version of:

- Safari on iPhone or iPad
- Chrome on Android

Open the app as a normal top-level page, not inside an in-app browser or iframe. Browser API support and recording formats can still vary by phone.

## Run securely

Camera and motion APIs require a secure context:

- Deploy to an HTTPS host.
- Use `http://localhost` during local development.

```bash
python3 -m http.server 8080
```

A normal LAN address such as `http://192.168.x.x` is not usually treated as a secure context. Use an HTTPS development tunnel or deploy to an HTTPS host for physical-phone testing.

## Deployment headers

The project includes:

- `_headers` for Netlify and compatible hosts
- `vercel.json` for Vercel
- A restrictive CSP meta tag as a browser fallback

For other hosts, apply the headers documented in `SECURITY.md`.

## Main controls

- **Start camera**: requests camera and motion permission.
- **Steady**: enables or disables gyro-assisted stabilization.
- **Center**: clears accumulated correction.
- **Flip**: requests the other phone camera.
- **Full**: enters fullscreen when the browser supports it.
- **Stop**: immediately releases the camera.
- **Record**: records the stabilized canvas without audio.
- **Save / share**: sends the finished local file to the browser or system share sheet.
- **Delete**: releases the recording from the page memory.

Advanced crop, stabilization strength, lens estimate, camera zoom, raw view, and telemetry controls are inside **Settings**.

## Technical limits

This is gyro-assisted electronic stabilization, not optical stabilization. It mainly reduces pitch, yaw, and roll shake. It cannot fully correct walking bounce, camera translation, parallax, rolling shutter, motion blur, or sensor/camera timing differences.

## Files

- `index.html` - mobile interface and restrictive CSP fallback
- `styles.css` - responsive, safe-area-aware mobile UI
- `app.js` - permissions, camera, motion processing, stabilization, recording, and cleanup
- `sw.js` - same-origin allowlisted application-shell cache
- `manifest.webmanifest` - PWA metadata and icons
- `_headers` - security headers for Netlify-style hosts
- `vercel.json` - equivalent Vercel security headers
- `SECURITY.md` - security model and deployment checklist
