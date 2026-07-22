# Gyro Steady Camera

A framework-free mobile web app that combines the rear camera with browser motion sensors to reduce rotational shake in a live preview.

## Run it

Camera and motion APIs require a secure context. Use either:

- An HTTPS host (GitHub Pages, Netlify, Vercel, Cloudflare Pages, etc.)
- `localhost` during development

Example local server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` on the same device. For testing on a physical phone over your LAN, use an HTTPS development tunnel or deploy the folder to an HTTPS host; a plain `http://192.168...` address normally will not be treated as secure.

## Controls

- **Start camera**: requests camera and motion permissions.
- **Stabilization**: integrates angular velocity, smooths the intended path, and compensates the canvas output.
- **Stabilization crop**: reserves border pixels for movement correction. More crop permits stronger correction.
- **Strength**: changes how slowly the virtual camera follows physical movement.
- **Estimated field of view**: calibrates conversion from angular movement to pixel displacement.
- **Horizon lock**: enables roll correction.
- **Camera zoom**: appears only when the browser exposes a zoom capability for the selected camera.
- **Record**: records the stabilized canvas when `canvas.captureStream()` and `MediaRecorder` are supported.

## Technical notes

This is gyro-assisted electronic stabilization, not optical stabilization. It is strongest against pitch, yaw, and roll shake. Translational movement, rolling shutter, camera/sensor timestamp mismatch, and walking bounce remain difficult in a browser-only implementation.

The app uses both `devicemotion.rotationRate` and a `deviceorientation` derivative fallback. Sensor axis mapping changes with screen orientation. Rendering is done through Canvas 2D with overscan, translation, and rotation.
