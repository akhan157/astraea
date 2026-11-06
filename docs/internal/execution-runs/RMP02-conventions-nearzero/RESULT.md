# RMP02-C02/C04 result — conventions worksheet and near-zero floor guard

Status: **partial, not qualification.** Base `82c595d`; branch
`rmp02-c02-c04-conventions`; lane `RMP02-conventions-nearzero`. C02 remains
**blocked** on independent sign/datum/base closure; C04 is **open** (addressed for
the retained records only; no fresh native-symbol inspection). Parent RMP02 remains
partial: **zero qualified native reference cases**.

## Review history (not erased)

- Author commit `e55401c` was reviewed by the coordinating
  `openai-codex/gpt-6.1-sol` session, author-independent, which exercised the
  checker CLI and returned **REQUEST_CHANGES** (appended to `REVIEW.md`).
- The requested MiMo no-tools review returned
  `402: {"type":"server_error","message":"Upstream request failed: Insufficient
  account funds"}` with no output and **no verdict**. Raw request/error remain in
  the external evidence directory; no MiMo acceptance is claimed.
- The four blocking findings are addressed in the rework commit (see below). C02
  stays blocked, C04 open, qualified cases zero.

## Rework changes (checker schema 2.0.0)

1. **Source/Rust/OCR/prose gates removed.** The checker no longer searches Rust
   declarations, OCR text or narrative fields, and the wording tests were deleted.
   Custody is the accepted `check-reference-eligibility.py` gate plus manifest
   attestation of every consumed record; worksheet citations remain documentation.
   There is no second broad snapshot-validation convention.
2. **Invented eligibility tolerances removed.** The 1e-3 diameter, 1e-9/0.01 d
   station and 0.05/1e-4 fraction gates are gone. The checker reports both retained
   declarations and their arithmetic difference; changed records are detected by
   custody hashes.
3. **Artificial coordinates labelled.** Retained CN and Cm form an explicit
   artificial normal/pitch scalar pair. Each retained moment starts at its recorded
   D-4013 drawing datum; no nose moment, P0 axis or CP station is asserted.
4. **Independent forward translation fixture added.** The P0 §7.2 known-value
   full-cross fixture (force `(-2,-1,-3)`, nose moment `(6,0,-4)`, offset `(0,1,0)`,
   `L=1` -> `(3,0,-2)`) is checked directly. Every retained translation row is also
   cross-checked against the full 3-D cross product; round trips are consistency
   checks only.

## Completed

- `docs/internal/execution-package/evidence/RMP02/conventions-worksheet.md`:
  P0/source frame inventory with the evidenced/unresolved split; S/L mapping and
  exact dimensional preservation over the two retained diameter declarations;
  D-4013 12.74 d / 12.75 d bracket and the distinct D-4014 25.950 in datum with the
  1.2067-1.2167 per-unit-normal translation term; axial/base/chamber separation
  with the missing signed relation and missing corrected uncertainty term; and the
  near-zero floor table over every retained normalized/comparison record.
- `scripts/diagnostics/check-d1-conventions.py` (stdlib only, 721 lines): custody
  and manifest attestation, all-record parsing, 7 paired wrenches, reference and
  datum algebra, P0 known-value fixture, 22-row near-zero table, axial-unavailable
  state, and five live refusals. Exit 0 is a bounded computational pass.
- `scripts/diagnostics/tests/test_d1_conventions.py`: 24 stdlib `unittest` tests for
  custody, all-record consumption, axial unavailability, near-zero refusal, CP
  refusal, uncertainty reduction, direct conflation, the P0 fixture and retained
  value sensitivity.
- `RESULT.md`, `REVIEW.md`, `EVIDENCE.json`; external logs under
  `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp02-conventions-nearzero/`
  (`*-rework.log` added; original pre-review logs and failed-review evidence kept).

## What was computed and what was refused

Computed, on retained bytes only:

| Check | Result |
|---|---|
| Reference invariance | 28 rows (7 wrenches x 4 ordered transitions between the 2.25 in and 5.72 cm references); F and M preserved within 2e-12 relative |
| Datum translation | 14 rows starting at the recorded D-4013 drawing datum, forward to the D-4014 station; forward shift +1.21667 per unit normal (drawing) or +1.20667 (text); scalar equals full cross on every row |
| Independent fixture | P0 §7.2 full-cross known values `(3,0,-2)`; D-4013-datum forward fixture scalar = full cross = 1.7166666666666666 for `CN=1, Cm=0.5` |
| Cross-source separation | 2.7375 in = 1.21667 d (drawing) or 2.715 in = 1.20667 d (text), reported as arithmetic |
| Near-zero rows | 6 normalized + 6 comparison + 8 sb1 reader coefficients + 2 excluded zero targets = 22 |
| Zero-enclosing M1.20 rows | CN alpha0 [-0.057778, 0.113333], Cm alpha0 [-0.020588, 0.197059]; relative residual and Cm/CN refused |
| Live refusals | direct D4013/D4014 Cm merge; raw CA bound as corrected; raw/base merge without sign; relative residual at zero; Cm/CN with zero-enclosing CN |

Refused by construction: direct D-4013/D-4014 moment merging, raw/corrected/chamber
axial conflation, transferring raw ±0.004 to corrected axial, relative residuals
where the absolute envelope encloses zero, `Cm/CN` where the CN envelope encloses
zero, uncertainty reduction by averaging readers, and any qualification promotion.

## Commands / attempts

| Command | Exit | Evidence |
|---|---|---|
| `python3 scripts/diagnostics/check-d1-conventions.py` | 0 | `checker-rework.log`; `qualified_cases: 0`, `conventions_status: computational-invariance-verified-signs-open` |
| `python3 -m unittest discover -s scripts/diagnostics/tests -p "test_*.py" -v` | 0 | `unittest-rework.log`; 58 tests OK (24 reworked) |
| `git diff --check` | 0 | `diff-check-rework.log` |
| `git diff --cached --check` | 0 | `diff-check-cached-rework.log` |
| pre-review runs | 0 | `checker.log`, `unittest.log`, `diff-check*.log` preserved; not overwritten |

No pnpm/cargo/vite/build/browser/simulator execution; no source download; no new
curve reading, fit, slope, CP or model residual; no edit to frozen artifacts,
coordinator-owned files or other worktrees.

## Dispositions

| Check | Status | Basis/bound |
|---|---|---|
| C02 (conventions) | **blocked** | Independent S/L/datum conversion algebra is executable and verified, and stations are refused conflation. The source triad, positive moment sense, roll zero and signed base-correction relation remain untranscribed, so sign/base reconstruction is not closed. |
| C04 (near zero) | **open** | Absolute envelopes govern every retained near-zero row; zero-enclosing rows refuse relative/ratio operations; `CpUnavailable::UncertaintyContainsZero` mirrored. No fresh native-density symbol inspection (RMP13). |
| Qualification | unchanged | Zero qualified cases; no acceptance promotion. |

## Provenance and limitations

- Custody: 64 manifest artifact entries verified byte-for-byte by the accepted
  eligibility gate; 0 original PDFs available; both `/tmp/astraea-data-path` paths
  absent. Source-page PNGs are 144 ppi renders of embedded 300 ppi scans; no
  native-density extraction occurred.
- All numeric values are retained record values; new numbers are algebra on those
  values. The `L*CM/CN` column is a computational ratio, not a qualified CP.
- D-4014 CN/Cm/CA remain frozen/unextracted; no cross-source numeric Cm merge was
  performed.
- The Python near-zero guard mirrors the accepted 64-epsilon cancellation policy; it
  does not execute or qualify the Rust implementation.
- Two retained readers share the raster, crop and physical source; their agreement
  is not independent physical evidence.

## Remaining / next

Coordinator acceptance/integration remains external. Open prerequisites are listed
in worksheet §6 and `EVIDENCE.json`: source axis/sign transform and roll zero;
12.74/12.75 d bracket; base-correction sign and corrected-axial uncertainty term;
D-4014 extraction and datum translation; native geometry/lip/tip/anchors (RMP08);
native-density extraction audit (RMP13). No push, merge, release or acceptance
promotion occurred.

## Final coordinator verification

Rework `ca239e7` accepted for the bounded computational scope in REVIEW.md.
Coordinator deleted one implementation-detail test and two incidental wording
assertions. Actual checker CLI: exit 0; 7 scalar pairs, 28 reference rows,
14 datum rows, 22 near-zero rows, 5 refusals, zero qualified cases.
Final diagnostics suite: **57 tests pass**, including 23 lane tests.
Original and rework logs remain historical evidence; current logs are
`checker-coordinator-final.log` and `unittest-coordinator-final.log` in the
external evidence directory.

C02 remains blocked, C04 remains open, no acceptance check is promoted. The
author-independent coordinator review does not replace the missing source
evidence, native-density inspection or empirical qualification. MiMo failed
with 402 and has no verdict.
