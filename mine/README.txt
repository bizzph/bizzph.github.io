MINESWEEPER MOBILE PWA V2

Difficulty:
Easy   9 x 9   - 10 mines
Medium 14 x 14 - 35 mines
Hard   16 x 30 - 100 mines

Key mobile UX changes:
- App tracks the actual Visual Viewport height.
- Entire document no longer scrolls; only the game board pans.
- Board region uses min-height:0 so short screens cannot push controls off-screen.
- Compact UI automatically activates on short screens.
- Landscape mode uses side controls.
- Hard mode keeps playable tile sizes and pans in both directions.
- Shovel/Flag controls remain visible at all times.
- No long-press is required to flag.
- +/-/Fit board controls are available.
- Safe-area support for notches and home indicators.
- First reveal is safe.
- Offline PWA service worker.

Serve over HTTPS or localhost for installation/service worker support.
