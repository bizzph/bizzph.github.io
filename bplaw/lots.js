/*
 * LOT DATA
 * --------
 * Edit this file to add or change survey lots.
 * Bearings/distances are enough when all lots use the same BLLM reference.
 * The app calculates polygon coordinates automatically.
 *
 * BLLM No. 1 is configured in config.js as WGS84 latitude/longitude.
 * The application calculates each title corner from that common control point.
 */
window.LOT_MAP_DATA = {
  locationLabel: "Ubay, Bohol",
  placementIsDemo: false,
  lots: [
    {
      id: "Lot 1",
      shortLabel: "LOT 1",
      surveyLot: "TCT 101-CARP2023000087",
      plan: "TCT 101-CARP2023000087",
      barangay: "Ubay, Bohol",
      areaSqm: 20580,
      tiePoint: "BLLM No. 1, Municipality of Ubay, Province of Bohol",
      tie: { bearing: "S 32\u00b043' E", distanceM: 6918.52 },
      boundaries: [
        { line: "1-2", direction: "SW", adjoining: "B-25-A, BSD-07-093598 (AR)" },
        { line: "2-3", direction: "NW", adjoining: "B-35, BSD-07-035133 (AR)" },
        { line: "3-4", direction: "NE", adjoining: "B-24, BSD-07-035133 (AR)" },
        { line: "4-1", direction: "SE", adjoining: "B-22, BSD-07-035133 (AR)" }
      ],
      traverse: [
        { line: "1-2", bearing: "N 44\u00b033' W", distanceM: 156.91 },
        { line: "2-3", bearing: "N 54\u00b023' E", distanceM: 145.40 },
        { line: "3-4", bearing: "S 44\u00b030' E", distanceM: 129.79 },
        { line: "4-1", bearing: "S 43\u00b038' W", distanceM: 143.57 }
      ],
      bearingsTrue: true,
      originalSurveyDate: "Not shown on supplied page",
      surveyDate: "January 23-24, 2014",
      approvedDate: "May 6, 2014",
      engineer: "Arnel D. Cabulao",
      cornerDescription: "Points 3 and 4 are B.L. cylindrical concrete monuments 15x40 cm; the rest are A.R. cylindrical concrete monuments 15x50 cm."
    },
    {
      id: "Lot 2",
      shortLabel: "LOT 2",
      surveyLot: "TCT 101-CARP2023000086",
      plan: "TCT 101-CARP2023000086",
      barangay: "Ubay, Bohol",
      areaSqm: 20580,
      tiePoint: "BLLM No. 1, Municipality of Ubay, Province of Bohol",
      tie: { bearing: "S 32\u00b043' E", distanceM: 6918.52 },
      boundaries: [
        { line: "1-2", direction: "SE", adjoining: "B-22, BSD-07-035133 (AR)" },
        { line: "2-3", direction: "SE", adjoining: "B-26, BSD-07-035133 (AR)" },
        { line: "3-4", direction: "NW", adjoining: "B-35, BSD-07-035133 (AR)" },
        { line: "4-1", direction: "NE", adjoining: "B-25-B, BSD-07-039598 (AR)" }
      ],
      traverse: [
        { line: "1-2", bearing: "S 43\u00b038' W", distanceM: 122.23 },
        { line: "2-3", bearing: "N 44\u00b033' W", distanceM: 179.99 },
        { line: "3-4", bearing: "N 54\u00b023' E", distanceM: 123.67 },
        { line: "4-1", bearing: "S 44\u00b033' E", distanceM: 156.91 }
      ],
      bearingsTrue: true,
      originalSurveyDate: "Not shown on supplied page",
      surveyDate: "January 23-24, 2014",
      approvedDate: "May 6, 2014",
      engineer: "Arnel D. Cabulao",
      cornerDescription: "Points 2 and 3 are B.L. cylindrical concrete monuments 15x40 cm; the rest are A.R. cylindrical concrete monuments 15x50 cm."
    },
    {
      id: "Lot 3",
      shortLabel: "LOT 3",
      surveyLot: "Lot B-134",
      plan: "Bsd-07-035133 (AR)",
      barangay: "Imelda, Ubay, Bohol",
      areaSqm: 29610,
      tiePoint: "BLLM No. 1, Ubay, Bohol",
      tie: { bearing: "S 33\u00b049' E", distanceM: 6012.54 },
      boundaries: [
        { line: "1-2", direction: "NW", adjoining: "Lot B-127" },
        { line: "2-3", direction: "NE", adjoining: "Lot B-132" },
        { line: "3-4", direction: "SE", adjoining: "Lot B-155" },
        { line: "4-1", direction: "SW", adjoining: "Lot B-58" }
      ],
      traverse: [
        { line: "1-2", bearing: "N 42\u00b009' E", distanceM: 211.42 },
        { line: "2-3", bearing: "S 46\u00b031' E", distanceM: 151.07 },
        { line: "3-4", bearing: "S 46\u00b051' W", distanceM: 204.66 },
        { line: "4-1", bearing: "N 49\u00b033' W", distanceM: 134.25 }
      ],
      bearingsTrue: true,
      originalSurveyDate: "May 13-30, June 17-29, and July 25-27, 1918",
      surveyDate: "October 24-December 2, 1995",
      approvedDate: "December 20, 1995",
      engineer: "Manuel G. Gonzaga",
      cornerDescription: "DAR cylindrical concrete monuments, 15x40 cm.",
      sourceNote: "Transcribed from the supplied land-description image; verify against the original document for legal use."
    },
    {
      id: "Lot 4",
      shortLabel: "LOT 4",
      surveyLot: "Lot B-158",
      plan: "Bsd-07-035133 (AR)",
      barangay: "Benliw, Ubay, Bohol",
      areaSqm: 23704,
      tiePoint: "BLLM No. 1, Ubay, Bohol",
      tie: { bearing: "S 35\u00b032' E", distanceM: 6852.94 },
      boundaries: [
        { line: "1-2", direction: "NW", adjoining: "Lot B-151" },
        { line: "2-3", direction: "NE", adjoining: "Lot B-157" },
        { line: "3-4", direction: "E", adjoining: "Lot B-159" },
        { line: "4-5", direction: "SE", adjoining: "Lot B-167" },
        { line: "5-1", direction: "SW", adjoining: "Lot B-23" }
      ],
      traverse: [
        { line: "1-2", bearing: "N 43\u00b050' E", distanceM: 220.07 },
        { line: "2-3", bearing: "S 25\u00b002' E", distanceM: 119.73 },
        { line: "3-4", bearing: "S 42\u00b054' W", distanceM: 111.91 },
        { line: "4-5", bearing: "S 42\u00b054' W", distanceM: 87.41 },
        { line: "5-1", bearing: "N 35\u00b009' W", distanceM: 117.08 }
      ],
      bearingsTrue: true,
      originalSurveyDate: "May 13-30, June 17-29, and July 25-27, 1918",
      surveyDate: "October 24-December 2, 1995",
      approvedDate: "December 20, 1995",
      engineer: "Manuel G. Gonzaga",
      cornerDescription: "B.L. cylindrical concrete monuments, 15x60 cm.",
      sourceNote: "Transcribed from the supplied land-description image; verify against the original document for legal use."
    },
    {
      id: "Lot 5",
      shortLabel: "LOT 5",
      surveyLot: "Lot B-51",
      plan: "Bsd-07-035133 (AR)",
      barangay: "Imelda, Ubay, Bohol",
      areaSqm: 27127,
      tiePoint: "BLLM No. 1, Ubay, Bohol",
      tie: { bearing: "S 30\u00b012' E", distanceM: 6365.72 },
      boundaries: [
        { line: "1-2", direction: "SE", adjoining: "Lot B-46" },
        { line: "2-3", direction: "SW", adjoining: "Lot B-52" },
        { line: "3-4", direction: "NW", adjoining: "Lot B-56" },
        { line: "4-1", direction: "NE", adjoining: "Lot B-50" }
      ],
      traverse: [
        { line: "1-2", bearing: "S 36\u00b043' W", distanceM: 198.50 },
        { line: "2-3", bearing: "N 48\u00b038' W", distanceM: 140.56 },
        { line: "3-4", bearing: "N 36\u00b042' E", distanceM: 188.67 },
        { line: "4-1", bearing: "S 52\u00b038' E", distanceM: 140.17 }
      ],
      bearingsTrue: true,
      originalSurveyDate: "May 13-30, June 17-29, and July 25-27, 1918",
      surveyDate: "October 24-December 2, 1995",
      approvedDate: "December 20, 1995",
      engineer: "Manuel G. Gonzaga",
      cornerDescription: "DAR cylindrical concrete monuments, 15x40 cm.",
      sourceNote: "Transcribed from the supplied land-description image; verify against the original document for legal use."
    },
    {
      id: "Lot 6",
      shortLabel: "LOT 6",
      surveyLot: "Lot B-141",
      plan: "BSD-07-035133 (AR)",
      barangay: "Imelda, Ubay, Bohol",
      areaSqm: 33305,
      tiePoint: "BLLM No. 1, Ubay, Bohol",
      tie: { bearing: "S 38\u00b025' E", distanceM: 6386.61 },
      boundaries: [
        { line: "1-2", direction: "SE", adjoining: "Lot B-144" },
        { line: "2-3", direction: "SW", adjoining: "Lot B-142" },
        { line: "3-4", direction: "NW", adjoining: "Lot B-136" },
        { line: "4-1", direction: "NE", adjoining: "Lot B-140" }
      ],
      traverse: [
        { line: "1-2", bearing: "S 42\u00b056' W", distanceM: 203.16 },
        { line: "2-3", bearing: "N 47\u00b028' W", distanceM: 155.17 },
        { line: "3-4", bearing: "N 38\u00b033' E", distanceM: 205.97 },
        { line: "4-1", bearing: "S 46\u00b042' E", distanceM: 170.93 }
      ],
      bearingsTrue: true,
      originalSurveyDate: "May 13-30, June 17-29, and July 25-27, 1918",
      surveyDate: "October 24-December 2, 1995",
      approvedDate: "December 20, 1995",
      engineer: "Manuel G. Gonzaga",
      cornerDescription: "B.L. cylindrical concrete monuments, 15x60 cm.",
      sourceNote: "Transcribed from the supplied land-description image; verify against the original document for legal use."
    },
    {
      id: "Lot 7",
      shortLabel: "LOT 7",
      surveyLot: "Lot B-144",
      plan: "Bsd-07-035133 (AR)",
      barangay: "Imelda, Ubay, Bohol",
      areaSqm: 28585,
      tiePoint: "BLLM No. 1, Ubay, Bohol",
      tie: { bearing: "S 38\u00b025' E", distanceM: 6386.61 },
      boundaries: [
        { line: "1-2", direction: "NE", adjoining: "Lot B-145" },
        { line: "2-3", direction: "SE", adjoining: "Lot B-149" },
        { line: "3-4", direction: "SW", adjoining: "Lot B-143" },
        { line: "4-1", direction: "NW", adjoining: "Lot B-141" }
      ],
      traverse: [
        { line: "1-2", bearing: "S 47\u00b017' E", distanceM: 138.48 },
        { line: "2-3", bearing: "S 41\u00b001' W", distanceM: 199.92 },
        { line: "3-4", bearing: "N 48\u00b036' W", distanceM: 145.24 },
        { line: "4-1", bearing: "N 42\u00b056' E", distanceM: 203.16 }
      ],
      bearingsTrue: true,
      originalSurveyDate: "May 13-30, June 17-29, and July 25-27, 1918",
      surveyDate: "October 24-December 2, 1995",
      approvedDate: "December 20, 1995",
      engineer: "Manuel G. Gonzaga",
      cornerDescription: "B.L. cylindrical concrete monuments, 15x60 cm.",
      sourceNote: "Transcribed from the supplied land-description image; verify against the original document for legal use."
    },
    {
      id: "Lot 8",
      shortLabel: "LOT 8",
      surveyLot: "Lot B-157",
      plan: "BSD-07-035133 (AR)",
      barangay: "Benliw, Ubay, Bohol",
      areaSqm: 28850,
      tiePoint: "BLLM No. 1, Ubay, Bohol",
      tie: { bearing: "S 39\u00b014' E", distanceM: 6964.29 },
      boundaries: [
        { line: "1-2", direction: "SE", adjoining: "Lot B-163" },
        { line: "2-3", direction: "SW", adjoining: "Lot B-158" },
        { line: "3-4", direction: "NW", adjoining: "Lot B-152" },
        { line: "4-1", direction: "NE", adjoining: "Lot B-156" }
      ],
      traverse: [
        { line: "1-2", bearing: "S 58\u00b054' W", distanceM: 255.14 },
        { line: "2-3", bearing: "N 25\u00b002' W", distanceM: 119.73 },
        { line: "3-4", bearing: "N 52\u00b056' E", distanceM: 190.26 },
        { line: "4-1", bearing: "S 52\u00b006' E", distanceM: 148.69 }
      ],
      bearingsTrue: true,
      originalSurveyDate: "May 13-30, June 17-29, and July 25-27, 1918",
      surveyDate: "October 24-December 2, 1995",
      approvedDate: "December 20, 1995",
      engineer: "Manuel G. Gonzaga",
      cornerDescription: "B.L. cylindrical concrete monuments, 15x60 cm.",
      sourceNote: "Transcribed from the supplied land-description image; verify against the original document for legal use."
    }
  ]
};
