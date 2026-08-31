# Property Due Diligence Viewer - v17 Bertulfo & Piasidad presentation build

## What changed

- TCT numbers (spreadsheet Column B) and Tax Declaration numbers (Column E) are now stored and displayed as separate document identifiers.
- Each parcel is explicitly classified as **Titled lot** when a TCT number exists, or **Tax declaration only** when no TCT is listed but a Tax Declaration number exists.
- B-25-A / B-25-B TCT references were corrected to match the supplied spreadsheet: B-25-A = `101-CARP2023000086`; B-25-B = `101-CARP2023000087`.
- B-25-A and B-25-B both display Tax Declaration No. `2018-45-0004-0370`, reflecting the shared Tax Declaration confirmed by the user.

- The supplied **Bertulfo & Piasidad Attorneys & Counselors** logo is now used in the primary sidebar header.
- The presentation UI now follows the supplied logo palette: deep maroon, white, charcoal, and muted rose neutrals.
- Styling was simplified for a minimal law-firm presentation while preserving clear hierarchy and touch-sized controls.
- Each parcel now carries a small on-map label using its legal lot name (`B-25-A`, `B-25-B`, `B-134`, `B-158`, `B-51`, `B-141`, `B-144`, `B-157`).
- Lot labels are implemented as lightweight Google Maps `OverlayView` elements centered over each parcel and do not capture pointer/touch events.
- The selected lot label switches to the firm maroon treatment while the parcel itself retains the existing orange active highlight.
- The firm logo asset is stored at `assets/bertulfo-piasidad-logo.jpg` and was cropped from the user-supplied reference image without redrawing the artwork.
- Google Maps is now the only map platform and loads by default.
- All legacy non-Google tile providers, provider switching, custom tile-rendering code, and their attribution/UI were removed.
- Google Maps JavaScript API is loaded asynchronously and only the Maps library is requested.
- Touch navigation uses Google Maps native gestures with `gestureHandling: "greedy"`, including pinch zoom.
- The map UI was redesigned for a restrained corporate/law-firm presentation.
- All controls live in a header above the map instead of overlapping the map canvas.
- The available controls are intentionally minimal: Map, Satellite, All lots, zoom out, and zoom in.
- Inactive parcels remain yellow; the selected parcel is orange.
- The existing left-panel card entrance animation is retained and respects reduced-motion preferences.
- Due-diligence fields were transcribed from the supplied `Untitled spreadsheet.xlsx` and added in `due-diligence.js`.
- Existing survey geometry, bearings, distances, BLLM placement, and parcel-selection behavior are retained.

## Google Maps API setup

1. In Google Cloud Console, select/create a project and enable billing.
2. Enable **Maps JavaScript API**.
3. Create an API key under **APIs & Services > Credentials**.
4. Restrict the key:
   - Application restriction: **Websites / HTTP referrers**.
   - Add the production domain, e.g. `https://example.com/*`.
   - For local testing, add `http://localhost:8080/*`.
   - API restriction: **Maps JavaScript API** only.
5. Open `config.js` and set:

```js
googleMapsApiKey: "YOUR_RESTRICTED_BROWSER_KEY",
```

6. Run the included local server and open `http://localhost:8080`.

The key is a browser key and will be present in client-side requests; security comes from referrer and API restrictions, not from trying to hide the key in HTML/JavaScript.

## Google Maps behavior

- Default type: `roadmap`.
- Optional alternate type: `satellite`.
- API version channel: `quarterly` for presentation stability.
- Native Google touch gestures are enabled, including pinch zoom.
- Google default map UI is disabled; the app exposes only the controls needed for the presentation.
- Clicking a parcel selects it and opens details without automatically changing zoom or center.
- **All lots** fits all eight parcels into view.

## Due-diligence spreadsheet mapping

The supplied spreadsheet uses legal lot numbers rather than the app's original `Lot 1` ... `Lot 8` identifiers. The mapping used is:

- Lot 1 -> B-25-A
- Lot 2 -> B-25-B
- Lot 3 -> B-134
- Lot 4 -> B-158
- Lot 5 -> B-51
- Lot 6 -> B-141
- Lot 7 -> B-144
- Lot 8 -> B-157

Spreadsheet fields added to the detail panel:

- Transfer Certificate of Title: TCT number (Column B) and encumbrances
- Tax Declaration: Tax Declaration number (Column E), kept separate from both title and tax-clearance status
- Real Property Tax Clearance: full payment, delinquency, period covered, remarks
- RTC Certification: land registration/litigation and bail-bond status
- Certificate of No Improvements: remarks
- Partial remarks/recommendations

Blank spreadsheet cells are generally preserved as blank/null data and displayed as an em dash. User-confirmed shared-document corrections override a blank source cell where specifically instructed; B-25-B therefore displays the same Tax Declaration No. as B-25-A.

## Files

- `index.html` - application shell and presentation layout
- `style.css` - Bertulfo & Piasidad presentation styling and responsive layout
- `config.js` - BLLM and Google Maps API configuration
- `lots.js` - survey geometry/source descriptions
- `due-diligence.js` - spreadsheet-derived document-review data
- `app.js` - WGS84 parcel calculations, Google Maps integration, parcel labels, and UI behavior
- `DATA-GUIDE.md` - data maintenance notes
- `assets/bertulfo-piasidad-logo.jpg` - supplied firm logo crop used by the interface
- `start-server.sh` / `start-server.bat` - local HTTP server helpers

## Legal/survey caution

This remains a presentation and review aid. Survey positions are computed from supplied descriptions and the configured BLLM coordinate. Due-diligence content is transcribed from the supplied spreadsheet. Verify against original titles, tax clearances, certifications, survey records, and official control points before relying on it for legal, acquisition, engineering, construction, or boundary-setting decisions.
