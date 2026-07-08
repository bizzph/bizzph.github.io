# Moto Talk QR Offline

Minimal browser-based two-phone audio app using offline QR signaling.

## How to pair

1. Put both phones on the same hotspot/Wi-Fi.
2. Open the app on both phones while the page is available. For microphone access, the page must be served from HTTPS, localhost, or already installed/cached from HTTPS.
3. Phone A: tap **Create QR**.
4. Phone B: tap **Scan QR** and scan Phone A's QR.
5. Phone B shows an answer QR.
6. Phone A: tap **Scan QR** and scan Phone B's answer QR.
7. Hold **HOLD TO TALK** to speak.

## Notes

- No CDN and no public signaling server are used.
- The QR codes exchange WebRTC setup data only. Audio then tries to travel directly between the phones over the hotspot/LAN.
- Some hotspots block phone-to-phone traffic. If that happens, the browser app cannot bypass it.
- QR scanning uses the browser BarcodeDetector API when available. If unavailable, use **Manual text** copy/paste.
