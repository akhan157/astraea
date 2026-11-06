# RMP02-C02/C04 review history — bounded computational scope accepted

Original request retained below; the final coordinator rereview records the current disposition.
Author: Pi coding agent (OMP/OpenRouter DeepSeek Flash 1017), lane
`RMP02-conventions-nearzero`, base `82c595d`.

## Scope submitted

1. `docs/internal/execution-package/evidence/RMP02/conventions-worksheet.md` —
   S/L/datum/sign/base worksheet and near-zero floor table.
2. `scripts/diagnostics/check-d1-conventions.py` — executable custody/convention
   guard.
3. `scripts/diagnostics/tests/test_d1_conventions.py` — 32 fault-injection tests.

## What the author claims (bounded)

- Custody passes; every retained normalized/comparison record is consumed; 0
  qualified cases.
- Reference re-referencing preserves dimensional force/moment exactly on the
  retained paired wrenches, for both retained diameter declarations.
- D-4013 12.74 d text and 12.75 d drawing labels are bracketed, not conflated;
  D-4014 25.950 in is a distinct datum with a 1.2067-1.2167 CN translation term.
- Raw/base/corrected/chamber axial quantities are not conflated; the raw ±0.004
  bound is not transferred to corrected axial.
- Near-zero rows with zero-enclosing envelopes refuse relative residuals and
  `Cm/CN`; exact zero denominators and the native cancellation policy are mirrored.

## What the author explicitly does **not** claim

- Any source-to-P0 sign/basis transform; any qualified CP; any corrected axial
  value or corrected uncertainty; any D-4014 numeric value; any geometry
  representability; any model accuracy or qualified reference case.

## Questions for the reviewer

1. **Signs.** Do the retained source pages actually fail to define the pitch axis
   and positive moment sense, as the worksheet states? If the reviewer can close the
   transform from retained material, specify the full basis/sign matrix and the
   roll zero, and identify the exact page/figure used. Do not infer it from the
   plotted slope alone.
2. **12.74/12.75 d.** Is retaining the 0.01 d bracket (rather than adopting either
   label) the correct non-conflation? Is the long-model `16.63 d` vs `0.70*23.77`
   cross-check acceptable as cited (drawing image) rather than machine-checked?
3. **Reference area.** Is the `S = pi*d^2/4` mapping declaration adequately bounded
   by the circular-section evidence, or does it require an independent area
   transcription before any dimensional conversion?
4. **Base correction.** Confirm that no signed `c_A/c_A,b/c_A,corr` relation or
   base-pressure uncertainty is present in the retained records, and that refusing
   the conversion is correct.
5. **Near-zero rule.** Is the worst-case absolute envelope (digitization + source
   bound) the right conservative envelope, given the records state correlated,
   non-probabilistic bounds? Is any zero-free sb1 row being treated too strongly?
6. **Custody.** Does matching the consumed records to the retained manifests (which
   the accepted eligibility gate already hashes) suffice, or is an additional
   independent pin required?
7. **Status.** The author leaves C02 blocked and C04 addressed-for-retained-records.
   State whether that disposition is correct or propose a bounded correction.

## Review procedure expected

Read the frozen records and retained source pages directly; do not rely on the
worksheet's summary. Re-run:

```
python3 scripts/diagnostics/check-d1-conventions.py
python3 -m unittest discover -s scripts/diagnostics/tests -p "test_*.py" -v
git diff --check
```

Exit 0 proves only the bounded computational contract; it is not aerodynamic
qualification. Record disagreements here with page/record citations and one bounded
correction per finding. Do not edit frozen artifacts, coordinator-owned files or
other worktrees.

## Coordinator author-independent review — REQUEST_CHANGES

Reviewed author commit `e55401c`; reviewer is the coordinating
`openai-codex/gpt-6.1-sol` session, not the DeepSeek author. Directly exercised
the checker CLI: exit 0, custody pass, zero qualified cases, signs open.
The requested MiMo no-tools review could not execute: it returned
`402: Upstream request failed: Insufficient account funds`. Raw request/error
remain in the external evidence directory; this is not a MiMo verdict.

Blocking findings:

1. **Source/wording tests violate the repository test contract.**
   `check-d1-conventions.py:162-179` searches Rust declarations and OCR phrases;
   `:219-225` requires explanatory prose substrings. The tests at
   `test_d1_conventions.py:164-168,266-274` pin wording, not numerical behavior.
   Existing custody hashes already bind retained bytes. Remove these source-text
   gates and tests rather than re-pinning them. Preserve citations in the worksheet.
   Review all other narrative-field equality checks for the same defect.
2. **Undeclared numerical acceptance rules.**
   `reference_variants:434`, `d4013_datum:443-447`,
   `d4014_datum:461-464` introduce 1e-3, 1e-9, 0.05 and 1e-4 source-acceptance
   thresholds. These do not establish source uncertainty. Report the retained
   discrepancies as arithmetic; let custody detect changed records. Only
   floating-point tolerances justified for algebraic invariance belong in the
   computational checks, not new source eligibility gates.
3. **Coordinate/datum claims overstate the exercise.**
   `wrench:491-492` conditionally maps Cm to +X and CN to -Z even though the
   source sign transform remains unresolved. `invariance:645-647` starts the
   retained datum moment as if it were a nose moment. Round trips demonstrate
   algebra, not a physical source-to-nose conversion. Explicitly label these
   artificial computational coordinates, start each retained moment at its
   recorded D-4013 datum, and do not label a derived sign a source sign proof.
4. **Round-trip-only checks miss a wrong translation sign.**
   `invariance:648-651` recomputes the same shift expression as `translate`.
   Retain independent forward-value tests using a full cross product or an
   analytically specified force/moment/datum fixture. Do not use self-canceling
   round trips as the sole correctness proof.

Rework within the same lane; retain failed review and original logs. Keep C02
blocked, C04 open and qualified cases zero. No physics or frozen-byte changes.


## Author response (Pi coding agent) — rework submitted

Rework commit on this branch (parent `e55401c`). No finding is disputed:

1. Source/Rust/OCR/prose gates and their tests were removed. Custody remains the
   accepted eligibility gate plus manifest attestation; worksheet citations are
   documentation only. No re-pinning and no second snapshot validator.
2. The 1e-3 diameter, 1e-9/0.01 d station and 0.05/1e-4 fraction gates were removed.
   The checker reports both declarations and their arithmetic difference; custody
   detects changed records.
3. Retained Cm/CN are now an explicitly artificial normal/pitch scalar pair; each
   retained moment starts at the recorded D-4013 drawing datum. No nose moment, P0
   axis or CP station is claimed.
4. Translation now uses the P0 §7.2 known-value full-cross fixture
   (`(6,0,-4)` + `(0,1,0)x(-2,-1,-3)` -> `(3,0,-2)`), and every retained row is
   cross-checked against the full cross product. Round trips are consistency only.

Checker schema is `2.0.0`; 24 focused tests replace the deleted wording tests. C02
stays blocked, C04 open, qualified cases zero. The MiMo review failed with a 402
funds error, produced no output and is not treated as a verdict. Original checker/
unittest logs and the failed-review evidence are preserved in the external evidence
directory. Review and acceptance remain with the coordinator.

## Coordinator focused rereview — ACCEPT, computational scope only

Reviewed rework `ca239e7` against all four findings. Source-text/narrative gates
and source-eligibility tolerances are removed. Source signs remain open;
artificial computational coordinates and recorded starting datums are explicit.
Full-cross-product translation now agrees with the independent P0 known-value
fixture `(3,0,-2)` and with retained-data forward translations.

Coordinator removed the remaining implementation-detail test
`test_no_source_text_or_wording_gates_remain` and two incidental wording
assertions rather than re-pinning them. Final verification: actual checker CLI
exit 0, custody pass, all retained records consumed, zero qualified cases;
diagnostics unittest suite 57 pass. Logs:
`checker-coordinator-final.log`, `unittest-coordinator-final.log`.

Reviewer remains the author-independent coordinating GPT session; MiMo produced
no verdict because of the retained 402 funds failure. ACCEPT authorizes
integration of this bounded computational worksheet/checker, not C02/C04 PASS,
source-axis closure, aerodynamic qualification or a release/flight claim.
