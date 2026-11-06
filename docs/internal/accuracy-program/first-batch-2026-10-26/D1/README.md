# D1 first coefficient extraction packet

Baseline `00e768b`; research/extraction 2026-10-25. **Source subset frozen; six D-4013 CN/Cm marker readings extracted and compared with a separately frozen coordinator pass. This is not a fully qualified reference packet.** No model changes, model runs, flight outcomes or new downloads. Retained source PDF hashes matched the earlier verified inventory.

The selected case is short ARCAS, four fins on, zero cant. D-4013 uses roll0 square symbols. D-4014 configuration1 pitch orientation must still be mapped explicitly to a numeric simulator roll convention; its null roll field is intentional. The small paired subset is CN/Cm at nominal alpha−2,0,+2 degrees for M1.20 andM1.50, with alpha0 raw CA and separately identified base-corrected D-4013 summary CA. Actual plotted alpha readings and uncertainty must be retained rather than forcing those targets.

## Files and source locations

- [frozen-subset.json](frozen-subset.json): exact source hashes, figures/pages/series, conditions, source accuracy limits, geometry/reference ledger and remaining fields.
- [digitization-point.schema.json](digitization-point.schema.json): normalized point schema with source, geometry conditions, axes/datum/base convention, pixel calibration, uncertainty and independent-reader status.
- [first-reader-calibrations.json](first-reader-calibrations.json), [first-reader-points.json](first-reader-points.json) and [CSV](first-reader-points.csv): immutable first pass. Its JSON SHA-256 is `a285b667b7ddfc041db451afcd474680117d71786bdd623fd02869aa3b5847ae`.
- [independent-root-pass.json](independent-root-pass.json): coordinator's separate visual pass, frozen before first-pass numbers were seen; SHA-256 `869920c401a34982e475c6657320e993c91c6b3c75be04603553ab4869493f94`. It shares the rasterization/crop, so this is independent extraction, not independent physical data, custody or complete validation.
- [comparison.json](comparison.json): differences, actual-alpha reading-interval overlap and dispositions. [normalized-reading-points.json](normalized-reading-points.json) contains six source-linked records; all validate against the schema. Chosen reported centers are the coordinator readings, preserved without averaging away common uncertainty.
- Full source-page PNGs retain legends, captions and drawing dimensions. `d4013-*`/`d4014-*` crops are unchanged pixel crops with calibration coordinates referencing the crop top-left. First-reader annotated copies identify selected pixels; original crops remain intact. [artifact-manifest.json](artifact-manifest.json) records hashes and byte sizes.

| Report / selected series | PDF page (one-based) / printed page | Figure and identity |
|---|---|---|
| [D-4013 source](https://ntrs.nasa.gov/api/citations/19670020050/downloads/19670020050.pdf), M1.20 CN |24/22|7(b), bottom vertically offset Mach series, square fins-on/roll0|
| D-4013 M1.20 Cm |27/25|7(c), lower M1.20 panel, square fins-on/roll0|
| D-4013 M1.20 raw CA |23/21|7(a), square fins-on/roll0; frozen, not extracted|
| D-4013 alpha≈0 corrected CA and base CA |62/60|11, middle and bottom solid zero-cant lines; frozen, not extracted|
| [D-4014 source](https://ntrs.nasa.gov/api/citations/19670020031/downloads/19670020031.pdf), M1.50 CA/Cm/CN |28/26,29/27,30/28|5(b), configuration1, zero cant, open circles; frozen, not extracted|

## Calibration and first-pass limitations

Both reports stack Mach series vertically, with **repeated zero labels**. Each selected Mach series needs its own y origin. D-4013 CN M1.20 uses its bottom zero, and Cm uses the lower M1.20 panel zero. A page-global linear calibration would introduce false offsets. Coordinates are pixel positions in a 2-pixel-per-PDF-point retained render, cropped without resizing. Original PDF dimensions differ slightly between scanned pages.

The first reader selected marker centers manually and assigned ±3pixels picking plus ±2pixels calibration/scan allowance as a conservative bounded reading estimate. Separate x and y linear transforms, anchor coordinates, crop rectangles and uncertainty conversion are recorded. These are not statistical confidence limits. The coordinator used independent marker/anchor estimates with an approximate ±2pixel reading bound; local skew and anchor uncertainty still need explicit review. Shared scan/raster/crop errors cannot be reduced by treating readers as independent measurements.

The signed nonzero marker picks coincide between readers; calibration differences produce small numerical differences, and recorded alpha/coefficient reading intervals overlap. **The first reader's nominal-zero picks were baseline intersections, not independently established measured square centers.** Those two original values remain preserved but are excluded from fits/scoring. The coordinator's separately selected nearzero markers retain nonzero intercept information and remain provisional. The coordinator's additional alpha≈4degree readings fall outside this frozen batch and were not added to it. No lines were fitted, slopes/CP calculated or simulator residuals viewed.

D-4013 reports calibration/repeatability accuracy limits of CN±.03, Cm±.05, CA±.004, alpha±.1degree, Mach±.003; they are not specified probability intervals. D-4014 reports corresponding force/moment limits and Mach±.015 in this range. Keep source error separate from digitization and alpha error. Do not transfer the raw CA limit unchanged to the corrected summary: base-pressure/correction error is an additional term requiring explicit propagation.

## Geometry and convention closure

Full geometry drawings are retained: D-4013 PDF11–12/printed9–10 and D-4014 PDF10/printed8. They include finite nose shape/ordinate tables, cylinder, boattail/reflex lip, double-wedge fin sections, anchors/protrusions and orientation. These are the geometry contract; the typed ledger is partial, explicitly unreviewed transcription. Do not replace them with a generic ogive/flat trapezoid or assume both reports' rounded dimensions are identical. Native representability of the lip, anchor and fin section remains unresolved. The packet does not claim that full geometry work is complete.

Both reports normalize forces by q times maximum body cross-section and moments by that quantity times body diameter. D-4013 short-model moment origin is described as70%L, dimensioned12.75d with L18.20d; preserve the small drawing/text rounding. D-4014 short configuration is25.95in from nose on a40.95in body (63.37%L). Translate moments only after signs/origins are independently confirmed. D-4013 raw CA retains base effects except its identified summary correction; D-4014 CA remains uncorrected and has separate chamber-force information. Neither validates powered base drag.

Unit Re is3×10⁶/ft; do not confuse this with length-based Re. The reports use different forced-transition grit/placement, retained in the ledger. Reproduce those conditions rather than assigning a standard sea-level atmosphere and declaring a match.

## Next independent assignment

The coordinator's frozen pass supplies the second visual reading for these two D-4013 slices; another identical reader is unnecessary. Assign the next reviewer to: (1) audit local grid skew/anchor coordinates and exact square-marker overlap, particularly the nearzero readings; (2) independently transcribe both full geometry drawings, reference axes/origins, transition and correction uncertainty; (3) extract the frozen D-4013 raw/corrected/base CA series and D-4014 M1.50 CN/Cm/CA using separate per-series calibration, confirming pitch/roll mapping. Freeze those values before revealing a previous reader's values. Preserve all disagreements/exclusions, and compare actual alpha uncertainty ranges before fitting a slope. Authorize no component-model acceptance until geometry, reference conventions, physical uncertainty and the independent review are resolved.
