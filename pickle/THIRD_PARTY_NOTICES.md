# Third-party notices

## QRCode for JavaScript

PicklePulse includes a local browser bundle of the QR encoding core derived from **QRCode for JavaScript** by Kazuhiko Arase. The source copy used for the bundle was the QRCode implementation vendored with the installed `qrcode-terminal` package; the QRCode source itself carries the following notice:

> Copyright (c) 2009 Kazuhiko Arase
>
> Licensed under the MIT license.

PicklePulse adds only a small browser module wrapper and SVG renderer around that QR encoding core.

### MIT License

Copyright (c) 2009 Kazuhiko Arase

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.


## PeerJS

PicklePulse uses **PeerJS 1.5.5** for the optional Live Display feature. PeerJS is MIT licensed. The PeerJS browser library is loaded only when Live Display is used, from the pinned URL `https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js`, with this Subresource Integrity value:

`sha512-XEKeWX+mI3Ov+tg2evDlVQFzVOIp4T8J3cNcCEPaEUGpxJV3eZaN8rHuvnFPvQpGJBHPmrozJDMpm2xcDvtmyQ==`

Live Display explicitly uses PeerJS Cloud (`0.peerjs.com`) for signaling and Google's public STUN service (`stun.l.google.com:19302`) for WebRTC connectivity discovery. Normal PicklePulse use does not load PeerJS or start those connections.

PeerJS project: https://peerjs.com/
License: MIT.
