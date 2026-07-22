# Security and Privacy Notes

## Data flow

The application requests only:

- Video camera access
- Device motion/orientation access

It does not request microphone access. Camera frames are drawn to a local canvas. Sensor readings are used only for the current stabilization calculation. There are no API endpoints, uploads, analytics calls, external libraries, or remote fonts.

## Recording lifecycle

1. The stabilized canvas is captured into a `MediaStream`.
2. `MediaRecorder` produces local chunks held in page memory.
3. Recording stops after 3 minutes or 150 MB, whichever happens first.
4. The chunks become a local `Blob` and optional `File`.
5. The user explicitly chooses Save / share or Delete.
6. Closing the page removes unsaved in-memory data.

Long recordings are intentionally limited because Blob recording can consume substantial mobile memory.

## Browser lifecycle safety

- The camera and sensor listeners stop when the page becomes hidden.
- Camera tracks are stopped on manual Stop, track termination, page hide, and page exit.
- Canvas recording tracks and wake locks are released after use.
- The app refuses to run in an iframe.
- A top-level HTTPS or localhost context is required.

## Content and embedding controls

The recommended production headers are:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; frame-src 'none'
Permissions-Policy: camera=(self), microphone=(), gyroscope=(self), accelerometer=(self), fullscreen=(self)
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Cross-Origin-Resource-Policy: same-origin
```

The HTML includes a CSP meta fallback, but `frame-ancestors` and Permissions Policy must be delivered as HTTP response headers for full enforcement.

## Service worker

The service worker:

- Handles only same-origin GET requests.
- Caches only the explicitly listed application-shell files.
- Does not cache arbitrary responses.
- Uses network-first behavior for navigation.
- Deletes older named caches during activation.

## Deployment checklist

- Serve every application file over HTTPS.
- Apply the supplied security headers.
- Do not add third-party scripts without reviewing their camera, storage, and network behavior.
- Do not add wildcard CSP sources.
- Do not enable microphone permission unless the product intentionally adds audio recording.
- Test direct Safari and Chrome use on real phones.
- Avoid social-media in-app browsers and iframe embedding.
- Verify the final deployed response headers with browser developer tools or a trusted header scanner.

## Remaining platform risks

No web application can guarantee identical behavior on every browser or phone. Mobile browsers control permissions, codec support, download behavior, background suspension, available memory, and camera capabilities. Feature detection and conservative failure handling reduce risk but do not remove platform differences.
