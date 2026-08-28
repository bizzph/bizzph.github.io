# Data Guide

## Survey data

Survey/parcel geometry is maintained in `lots.js`. Each lot may contain:

- `id`
- `surveyLot`
- `plan`
- `barangay`
- `areaSqm`
- `tiePoint`
- `tie.bearing`
- `tie.distanceM`
- `boundaries[]`
- `traverse[]`
- survey dates, engineer, monument/corner description, and source notes

The BLLM WGS84 coordinate is maintained in `config.js`.

## Due-diligence data

Document-review information is maintained separately in `due-diligence.js` so spreadsheet updates do not alter survey geometry.

Each record is keyed by the app's lot ID and may contain:

```js
{
  legalLot: "B-134",
  title: {
    encumbrances: "None"
  },
  realPropertyTax: {
    fullPayment: "Yes",
    delinquency: null,
    periodCovered: "2026",
    remarks: "..."
  },
  rtcCertification: {
    landRegistrationOrLitigation: null,
    postedAsBailBond: null
  },
  noImprovements: {
    remarks: "..."
  },
  recommendation: null
}
```

Use `null` for a blank source cell. The UI displays null values as an em dash rather than interpreting them as "None" or "No".

## Current legal-lot mapping

- `Lot 1` = `B-25-A`
- `Lot 2` = `B-25-B`
- `Lot 3` = `B-134`
- `Lot 4` = `B-158`
- `Lot 5` = `B-51`
- `Lot 6` = `B-141`
- `Lot 7` = `B-144`
- `Lot 8` = `B-157`

## Google Maps configuration

In `config.js`:

```js
window.LOT_MAP_CONFIG = {
  bllm: { ... },
  googleMapsApiKey: "YOUR_RESTRICTED_BROWSER_KEY",
  googleMapType: "roadmap",
  googleMapsVersion: "quarterly"
};
```

Supported default map types in this build are `roadmap` and `satellite`.
