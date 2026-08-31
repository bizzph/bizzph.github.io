# Property Due Diligence Viewer - spreadsheet-3 accuracy update

## Source mapping

The due-diligence dataset was rebuilt from `Untitled spreadsheet-3.xlsx` and mirrors its document sections exactly:

- Columns A-C: Transfer Certificate of Title (TCT)
- Columns D-H: Tax Declaration
- Columns I-L: Real Property Tax Clearance
- Columns M-N: DARAB Certificate
- Columns O-Q: MTC Certification
- Columns R-T: Certificate of No Improvements
- Columns U-V: Partial Remarks / Recommendations

Blank spreadsheet cells are stored as `null` and displayed as an em dash. Survey geometry, survey area/location, bearings, distances, and mapping data remain separate in `lots.js`.

## Accuracy corrections in this build

- B-25-A and B-25-B both show Tax Declaration No. `2018-45-0004-0370`, as explicitly listed in the new workbook.
- B-25-B now includes its registered owner, copy type, tax-clearance status, delinquency amount, DARAB result, MTC result, and shared recommendation from the workbook.
- `Pending application (Lack of SPA)` for B-157 and B-158 is shown under DARAB and MTC rather than Real Property Tax Clearance.
- The prior `RTC Certification` UI section was corrected to the workbook's actual `MTC Certification` section.
- Tax Declaration now shows registered owner, copy type, and other information.
- Certificate of No Improvements now shows both Remarks and Other Info.
- Real Property Tax Clearance now shows only Full payment, Delinquency, and Period Covered from its own section.

## Legal lot mapping

- Lot 1 -> B-25-A
- Lot 2 -> B-25-B
- Lot 3 -> B-134
- Lot 4 -> B-158
- Lot 5 -> B-51
- Lot 6 -> B-141
- Lot 7 -> B-144
- Lot 8 -> B-157

## Document-basis rule

TCT and Tax Declaration are separate document types. A lot is marked **Titled lot** when a TCT number is present. **Tax declaration only** is used only when no TCT number is present but a Tax Declaration number exists. A titled lot may also have a Tax Declaration.

## Caution

This is a presentation/review aid. Verify title, tax, DARAB, MTC, certification, survey, and control-point information against official source documents before reliance.
