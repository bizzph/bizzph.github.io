MINESWEEPER PWA — MOBILE-FIRST BUILD

Difficulty:
- Easy: 9x9, 10 mines
- Medium: 14x14, 35 mines
- Hard: 30x16, 100 mines

UX highlights:
- Large persistent Shovel / Flag controls
- Bottom thumb-zone tool dock on phones
- Press-and-hold or right-click as an optional quick flag action
- First move plus neighboring tiles are safe
- Tap an opened number when its matching flags are placed to clear adjacent tiles (chording)
- Larger boards scroll instead of shrinking tiles to unusable sizes
- Safe-area support for notches and phone home indicators
- Keyboard shortcuts: S = Shovel, F = Flag, R = Restart
- Installable and offline-ready PWA

RUN LOCALLY
PWA/service-worker features require HTTP/HTTPS rather than file://.

From this folder:
  python3 -m http.server 8000

Then visit:
  http://localhost:8000

For production, deploy this folder to an HTTPS-enabled host.
