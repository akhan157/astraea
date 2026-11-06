# RMP08-ARCAS independent review

Reviewer: `opencode-go/mimo-v2.6-pro`, medium, no tools, supplied source/evidence
only. Raw verdict in
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp08-arcas-transonic-scoring/review.md`.

## Initial verdict: REQUEST_CHANGES

Three blocking items, explicitly docs/labeling/diagnostics only — no physics,
threshold or model change requested. The reviewer **accepted** the scoring
design, the per-band 15 % application ("legitimate… no number was invented"),
the retained red ("correct disposition"), and ungated CP ("correct").

## Findings and dispositions

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | CP sign convention undefined; the "5–6 pp forward" bullet not reconcilable with the bias column; "supersonic CP shift moves CP the wrong way" reads as a supersonic-regime defect | **Fixed.** Sign convention stated (bias = model − measured, positive = model aft). Probed the actual model CP and **corrected the claim**: the model CP is Mach-dependent (75.0 → 77.9 % over M 0.6–1.2), so the "Mach-invariant Barrowman / 5–6 pp forward" bullet was stale and is replaced with the measured residuals. Rephrased the supersonic point: the correction is too **small**, not simply reversed |
| 2 | Band labels overstate scored coverage: CA filtered to M ≤ 1.2 under a "0.9–1.5" label; `n` not shown; `CP subsonic ARCAS-long n=1` presented as a statistic | **Fixed.** Table now carries per-row `n` and the actual scored Mach range (`0.90–1.20`), plus explicit prose that 1.20–1.50 drag is unvalidated despite the band label |
| 3 | CA gate logs nothing when it fails and can only ever fail once | **Fixed.** Summary is logged before asserting and every band is asserted with `expect.soft`, so the evidence survives the red and a second regression cannot hide behind the known one. The retained log now contains the full per-band summary |
| 4 | CP report test's assertions were vacuous (`Number.isFinite(outsideSweep)`) | **Fixed.** Now asserts ≥4 reported bands and `n > 0` for each, and pins the excluded-outside-sweep count at 2 |
| 5 | "False pass" wording too strong for user-facing text | **Fixed.** `docs/accuracy.md` now says "an earlier pooled average… could not show this"; "false pass" is retained only in internal records |
| 6 | Doc described only the measured side as base-corrected | **Fixed.** Comparison now stated as base-free on both sides |
| 7 | `bandOf` falls through to supersonic for M ≥ 5 | Recorded; harmless (no rows there), not reworked |

## Residual limitation

`transonic-cp-findings.md` characterizes an earlier, Mach-invariant CP model.
That characterization is **superseded** by the current model and by the per-point
probe run during this rework. The findings doc is retained as history and its
mechanism analysis (transonic fin CNa compressibility) remains the leading
candidate for the physics fix, which is a separate increment.

This increment is accepted on rework. No acceptance-register status is promoted:
the red gate is retained deliberately and the CP budget remains unapproved.

## Focused rereview: REQUEST_CHANGES (evidence integrity)

The reviewer confirmed items 1–3 were resolved and the corrected model
characterization is arithmetically supported ("76.8 − 72.0 = +4.8; 77.9 − 85.5 =
−7.6; 73.0 − 78.5 = −5.5; 72.0 − 60.0 = +12.0. All quoted residuals check out"),
but found the **retained red log was stale**: it had been generated before the
diagnostics fix, so it showed the old single-assertion failure with no per-band
summary. The code fix was therefore unproven in the record.

Rework:

1. **Log regenerated from reworked source.** It now contains the `ARCAS per-band
   CA summary` block with per-row `scored M …`, shows all four band MAEs
   (11.2 / 4.9 / 15.7 / 13.8 %), and the stack references `expect.soft`. This
   closes the evidence gap and proves item 3.
2. **"four tenths of Mach" corrected** to "four measured Mach points (0.90 to
   1.20, three tenths of Mach)".
3. **CP Mach ranges added** to the table (supersonic-long is 1.80–3.96).
4. **Quarantine counts reconciled** in prose: 2 is the CP-only subset, 12 is
   all quantities; both correct for their filter.

Lesson recorded: when a gate is intentionally red, its **evidence log is the
deliverable** and must be regenerated after any change to that gate's reporting.
A log captured before the fix proves nothing about the fix.
