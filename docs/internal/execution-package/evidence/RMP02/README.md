# RMP02a — retained reference eligibility, not model qualification

[Assignment](../../../execution-runs/RMP02-source-eligibility/ASSIGNMENT.md).
[Machine-readable matrix](eligibility.json) freezes four **already-exposed public development** source IDs and five finite cases. It does not open new flight outcomes, acquire sources, reread/digitize markers, calculate slopes/CP, run models or score residuals.

Run from repository root:

```sh
python3 scripts/diagnostics/check-reference-eligibility.py
python3 -m unittest discover -s scripts/diagnostics/tests -p test_reference_eligibility.py -v
```

The first command succeeds when the frozen exclusion/custody contract is intact. Its separate `qualification_status: blocked-not-a-model-pass` and `qualified_cases: 0` are intentional. An exit-zero custody check is **not** an aerodynamic accuracy/qualification pass. This gate cannot self-certify a newly closed source by flipping flags. New extraction, conventions or source eligibility require a separately reviewed version.

## Actual availability and rights

Both historical D1 manifests remain byte-for-byte unchanged. All **64 listed artifact entries** are currently available with matching size/SHA-256, including source-page PNGs, untouched/annotated crops, first and independent reader records, calibrations and comparisons. Counts include repeated provenance records across the two manifests; they are not 64 independent sources or measurements. The gate hashes their bytes; it does not parse numeric readings or view enlarged crops.

No original source PDF is retained in this repository. The two known historical `/tmp/astraea-data-path/19670020050.pdf` and `19670020031.pdf` paths are absent on this host. A retained PDF hash is not an available PDF. Existing inventory entries for A53D02/R100 are metadata, not locally available case sheets/drawings. No source download was attempted. Prior catalog-based government-report/public-use attribution is retained verbatim from the inventory; no new legal determination or third-party redistribution right is asserted.

The D4013 retained coordinate images are 144ppi renders. The historical source inspection reported embedded 300ppi scans. `inspect4x` is an enlargement, not new measurement resolution. Native-density geometry/skew/marker work therefore remains unperformed here. Existing independent readers share the physical source, raster/crops and correlated uncertainty; they do not supply independent physical data.

## Frozen exclusion matrix

| Case | Retained quantities | Current eligibility |
|---|---|---|
| D4013 short, fins on, roll0/cant0, Mach0.60 | provisional signed CN and independent Cm, nominal-zero targets excluded by both readers; CA unselected | Mach alone within SB1; ordinate/finite-tip, lip/taper and anchor/root/section geometry, signs/datum/conditions and extraction audit remain open/nonmatching |
| D4013 same selected configuration, Mach1.20 | provisional CN/Cm; first-reader baseline-intersection nearzero picks excluded; raw/corrected/base CA frozen, unextracted | outside SB1 `0<=Mach<0.8`, plus geometry/convention/extraction exclusions |
| D4014 configuration1, Mach1.50 | raw CA/CN/Cm frozen, unextracted; simulator roll intentionally unknown | outside SB1, distinct finite-tip/geometry/datum/trip/base and pitch-roll mapping unresolved |
| NACA A53D02 | zero-lift corrected total-CD inventory only; no selected shot/Re/variant or independent moment | unselected, no geometry/condition certificate; cannot infer CN/Cm from drag |
| NASA R100 | measured-total-drag collection metadata; no selected sheet; estimated components distinct from measurements | unselected, no geometry/reference/condition certificate; no full-force/independent-moment selection |

The matrix includes nose profile/tip, centerbody/tail/base, fin planform, section, root/anchors and support/protrusions, with explicit per-feature support/exclusion and open normalization/Re/incidence/roll/power/base/trip/extraction fields. An explicit unsupported/unclosed feature is an exclusion, never a completed reconstruction. The current adapter retains fin thickness/section metadata but its asserted thin-fin law does not model section effects.

## Convention and uncertainty constraints retained

- D4013 moment station: 12.75d drawing versus .70×18.20=12.74d rounded text. D4014: 25.95in from nose on 40.95in length. Do not overwrite or conflate them. P0 sign/axis/datum conversion still needs an independent dimensional worksheet.
- Unit Re 3e6/ft is not length-based Re, and does not become matched by assigning a standard atmosphere. Preserve separately rounded report metric values and different trip treatments.
- Raw CA, base-corrected summary CA and chamber/base terms remain distinct. Raw-source CA uncertainty is not complete corrected-CA uncertainty; unpowered tunnels do not qualify powered-base/nozzle behavior.
- Source CN .03/Cm .05/CA .004 and alpha .1deg calibration/repeatability bounds are absolute, not probability intervals. Do not average away shared error, force nominal alpha/zero intercepts or use unstable nearzero percentage passes. No new floor or threshold is introduced here.
- Paired provisional CN/Cm is not a completed full static source, and CP/drag-only agreement cannot supply missing independent moment or complete axial evidence. RMP06b still consumes explicitly prescribed CA0, not a qualified native total-axial prediction.

## Next engineering tickets / parent status

RMP08 needs justified finite-tip/ordinate profiles, reflex-lip/taper and anchor/root/section representation **and aerodynamic support**, or a genuinely matched selected case. Geometry support alone does not prove a force law. A supplied-total-force/independent-moment source can instead test normalization/load assembly, without qualifying native coefficients. RMP13 needs the native-density source/skew/marker and source/correction uncertainty audit.

RMP02-C01 and C05 may pass for these reviewed **explicit exclusions and guarded paired-evidence eligibility**, not for any empirically qualified case. C02 remains blocked on independent signs/datum/base closure; C03 remains partial/blocked on actual native-density source and audit; C04 retains the existing absolute-bound/exclusion discipline without claiming a new symbol inspection. Parent RMP02 remains partial, and downstream scientific gates remain open. The independent review accepted exactly those bounded dispositions; see the [review](../../../execution-runs/RMP02-source-eligibility/REVIEW.md).
