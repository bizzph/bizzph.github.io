# Data Guide

## Survey data

Survey/parcel geometry is maintained in `lots.js`: survey area, barangay/location, tie point, bearings, distances, adjoining boundaries, survey dates, engineer, and monument/corner descriptions. The BLLM WGS84 coordinate is maintained in `config.js`.

## Due-diligence data

`due-diligence.js` mirrors `Untitled spreadsheet-3.xlsx`:

```js
{
  legalLot: "B-134",
  title: {
    number: "732",                 // Column B
    encumbrances: "None"          // Column C
  },
  taxDeclaration: {
    number: "2018-45-0022-00433", // Column E
    registeredOwner: "Vallespin, Carlos", // Column F
    copyType: "Certified",         // Column G
    otherInfo: null                // Column H
  },
  realPropertyTaxClearance: {
    fullPayment: "Yes",            // Column J
    delinquency: null,              // Column K
    periodCovered: "2026"          // Column L
  },
  darabCertificate: {
    remarks: "No pending case or any just compensation case filed" // Column N
  },
  mtcCertification: {
    pendingCivilCase: "No",        // Column P
    otherInfo: null                // Column Q
  },
  certificateNoImprovements: {
    remarks: "...",                // Column S
    otherInfo: "..."               // Column T
  },
  recommendation: null              // Column U (U:V merged)
}
```

Repeated Lot No. columns are validation keys. Blank cells remain `null`; the UI displays them as an em dash and does not infer "No" or "None".

### Document basis

- **Titled lot**: Column B contains a TCT number.
- **Tax declaration only**: Column B is blank and Column E contains a Tax Declaration number.
- A titled lot may also have a Tax Declaration. The Tax Declaration is never treated as a title.

## Current legal-lot mapping

- `Lot 1` = `B-25-A`
- `Lot 2` = `B-25-B`
- `Lot 3` = `B-134`
- `Lot 4` = `B-158`
- `Lot 5` = `B-51`
- `Lot 6` = `B-141`
- `Lot 7` = `B-144`
- `Lot 8` = `B-157`
