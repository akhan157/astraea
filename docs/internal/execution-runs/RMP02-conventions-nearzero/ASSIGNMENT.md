# RMP02-C02/C04 assignment — conventions worksheet and near-zero floor guard

Base: `82c595d`. Branch: `rmp02-c02-c04-conventions`. Worktree:
`/home/ak/.paseo/worktrees/3s8t98rp/rmp02-c02-c04-conventions`. Never touch any
other worktree.

## Lane

RMP02-C02 (conventions) and RMP02-C04 (near-zero floor discipline) only.
Parent RMP02 remains partial: zero qualified native reference cases. This lane
adds an independently checked sign/datum/base dimensional worksheet and an
executable convention guard. It does not close geometry (RMP08), extraction
audit (RMP13), model accuracy, or any qualification claim.

Status inherited from RMP02a (`44d74d7`): C01/C05 pass for explicit exclusions
and paired-evidence guard; C02 blocked solely on the absent independent P0
sign/datum/base dimensional worksheet and executable conversion verification;
C04 in progress (inspect near-zero force and moment symbols: absolute
uncertainty governs; no unstable relative-error pass).

## Read first (frozen custody, read-only)

- `docs/internal/execution-package/packets/RMP02.md`
- `docs/internal/execution-runs/RMP02-source-eligibility/RESULT.md`
- `docs/internal/execution-package/evidence/RMP02/README.md` and
  `eligibility.json`
- `docs/internal/accuracy-program/first-batch-2026-10-26/P0-contract.md`
- `docs/internal/accuracy-program/first-batch-2026-10-26/D1/README.md`,
  `frozen-subset.json`, `normalized-reading-points.json`, `comparison.json`
- `docs/internal/accuracy-program/sb1-foundation-2026-10-26/D1/README.md`,
  `frozen-subset.json`, `comparison.json`, `19670020050-pdf-p04.txt`,
  `19670020050-pdf-p05.txt`, `19670020050-pdf-p06.txt`
- `scripts/diagnostics/check-reference-eligibility.py` and
  `scripts/diagnostics/tests/test_reference_eligibility.py`
- `crates/astraea-core/src/aero_coefficients.rs` (`NormalSums`,
  `CoefficientWrench::translated`, `rereferenced`, `dimensional`,
  `derivative_cp` / `CpUnavailable::UncertaintyContainsZero`)

## Authority rule

Retained D1 JSON records, the frozen subset, the P0 contract, and
`aero_coefficients.rs` are the only evidence. Numerical or sign claims seen in
earlier drafts or in this assignment text are hypotheses to verify against
those records, never authority. Where the retained records cannot establish a
sign, a base-correction sign, a reference-area ratio, or an uncertainty
propagation step, the worksheet and the checker must report the precise
unresolved prerequisite instead of inventing it. A guard that merely tests an
invented policy without consuming every retained record is not acceptable: the
checker must load all retained normalized/comparison records read-only,
expose provenance, bounds, transformations, and unresolved terms, and refuse
to merge, score, or divide where the records forbid it.

## Owned lease (this lane only)

NEW:

- `docs/internal/execution-package/evidence/RMP02/conventions-worksheet.md`
- `scripts/diagnostics/check-d1-conventions.py`
- `scripts/diagnostics/tests/test_d1_conventions.py`
- `docs/internal/execution-runs/RMP02-conventions-nearzero/ASSIGNMENT.md`
  (this file), `RESULT.md`, `REVIEW.md`, `EVIDENCE.json`
- External raw evidence directory:
  `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp02-conventions-nearzero/`

## Do NOT touch

- `docs/internal/execution-package/evidence/RMP02/eligibility.json`,
  `docs/internal/accuracy-program/first-batch-2026-10-26/D1/*`,
  `docs/internal/accuracy-program/sb1-foundation-2026-10-26/D1/*` (frozen
  custody artifacts verified by SHA-256).
- `CHANGELOG.md`, `TASKS.md`, `acceptance-register.json`, `manifest.json`
  (coordinator owns those at integration).
- No `pnpm install`, `cargo`, or `vite`. This lane is pure Python standard
  library plus documentation.

## Deliverables (in order)

1. This `ASSIGNMENT.md`.
2. `docs/internal/execution-package/evidence/RMP02/conventions-worksheet.md`
   covering P0 vs NASA TN D-4013/D-4014 frame and sign mapping; reference area
   `S` and length `L` with exact dimensional preservation under
   `rereferenced(old, new)`; moment datum stations and non-conflation
   (D-4013 `12.74d` text vs `12.75d` drawing; D-4013 vs D-4014 `25.95 in`
   station separation with `O(1.21 C_N)` error if merged); axial/base
   convention separation (`C_A`, `C_{A,b}`, `C_{A,corr}`, `C_{A,c}`) with
   base-pressure uncertainty propagation; and the RMP02-C04 near-zero floor
   table over every retained point in `normalized-reading-points.json`,
   first-batch `comparison.json`, and sb1 `comparison.json`.
3. `scripts/diagnostics/check-d1-conventions.py` (stdlib only) plus
   `scripts/diagnostics/tests/test_d1_conventions.py` (stdlib `unittest`),
   implementing custody verification via `check-reference-eligibility.py`
   and deterministic checks for (a) P0 wrench/reference invariance on all
   retained paired readings, (b) refusal of direct D-4013/D-4014 and
   `12.74d`/`12.75d` station conflation, (c) refusal of raw/corrected/chamber
   axial conflation or omitted base-correction uncertainty, and (d) the
   near-zero floor guard including `CpUnavailable::UncertaintyContainsZero`
   behavior. Fault-injection tests must prove each guard fires on mutated
   input.
4. Run `python3 scripts/diagnostics/check-d1-conventions.py`,
   `python3 -m unittest discover -s scripts/diagnostics/tests -p "test_*.py" -v`,
   and `git diff --check`, saving logs to the external evidence directory.
5. `RESULT.md`, `EVIDENCE.json`, `REVIEW.md` (pending independent scientific
   review) and a local commit on this branch with
   `git -c user.name='Pi coding agent' -c user.email='pi@localhost' commit`.
   Do not run an external reviewer. No acceptance promotion.

## Stop conditions

Stop and record a blocked prerequisite rather than guessing: unreadable axis
sign definitions, untranscribed base-area ratio, unclosed tip/lip/anchor
geometry, or any missing native-density source page. Never overwrite or
conflate the `12.74d`/`12.75d` rounding, never merge D-4013 and D-4014 `C_m`
across stations, never transfer raw `δC_A = 0.004` to corrected axial, never
score a relative-percent residual where the uncertainty interval encloses or
approaches zero, and never divide `C_m / C_N` where the `C_N` interval
encloses zero.
