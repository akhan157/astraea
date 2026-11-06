# RMP10c — geometry CP support correction

## Delivered scope

Geometry-only CP and margin are unavailable when the total slope is nonfinite, nonpositive, at or below the native geometry fallback boundary (1e-4 /rad), or ill-conditioned against the component slope magnitudes. The bridge preserves CG, mass, total slope and component contributions. Supported analyses pass through unchanged. The UI and copilot withhold a stability verdict and show the unavailable reason; the 3D CP marker is omitted. Transition-removal explanations also refuse unsupported residual ratios.

No Rust, flight model, project schema, thresholds or defaults changed. This is not unified-provider, flight-accuracy, powered-stability or release qualification. RMP10-C02 remains in_progress.

## Verification

- Original raw-WASM probe retained externally: finless tail-cone vehicle produced a substituted CP and overstable geometry verdict while flight refused its slope.
- Pre-fix behavioral run: all five unit cases failed; post-fix initial focused run passed 14 tests.
- Real shipped-WASM bridge cases: four pass (unsupported geometry/flight refusal, supported unstable finless vehicle, two supported presets unchanged).
- Full src suite initially failed one existing real-WASM reversed-ensemble test on its 20 s default timeout (25.687 s observed). Explicit 120 s describe timeout; no numerical inputs or assertions changed. Next full run: 124 files / 1536 tests pass, tsc exit 0.
- Final boundary/conditioning rework: 10 affected files / 91 tests pass, tsc and production Vite build exit 0 (bg_11).
- Final built-browser smoke imports the finless vehicle through the actual file picker. Airframe/Aero show CP and margin unavailable, retained CG, explanatory reason and no stable/unstable sentence. Browser runtime errors list empty. Exact-boundary behavior is covered by the unit test, not a browser fixture.
- Current source and built WASM SHA-256: b32e7b7c0df33b70c51ea645612f74660648212b76a368ccfb5e852f69bc5b3b. This matches the prior RMP07g author-recorded runtime receipt. WASM is not tracked at the base; Git cannot prove a byte comparison to that base. No engine rebuild was performed here.

## Review chronology

Initial MiMo supplied-text review REQUEST_CHANGES: exact-floor substituted CP leak; missing consumer sweep. Rework rejects equality and records LSP references for both verdict booleans, margin and CP. The only production boolean consumer is the explanation layer, which exits before verdict branches when CP is unavailable. Residual conditioning and nonfinite-magnitude reasons corrected; flight-parity claims narrowed. Focused rereview also REQUEST_CHANGES for consumer-path coverage. The twice-requested material consumer-coverage finding triggers the goal's stop condition. See REVIEW.md for the factual rebuttal of the alleged ungated native entry and the remaining copilot/transonic evidence gap. This increment is unapproved and uncommitted.

## Retained limits

- Signed component CNalpha percentage shares remain unbounded near cancellation; the browser exposed this unchanged presentation issue. No numerical percentage bound is claimed.
- Full undefined/free-couple/provider force/moment semantics remain open, as do physical accuracy and decision qualification.
- Browser evidence covers managed Chromium on Linux, not desktop IPC or other platforms.
- External evidence: `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp10-geometry-cp-support/`; logs, review inputs, consumer references and browser receipts are not represented as tracked raw files.

## Owner-authorized continuation from 27c1b05

The owner requested resume after the recorded review stop. Both previous
REQUEST_CHANGES remain evidence; this direction is not acceptance.

- Fixed copilot `stabilityQuantity`: nonfinite values are Unknown, with the
  qualifier's reason for CP/margin. CG remains finite/Modeled. Both stability
  checks already refuse the unsupported margin before producing quantities;
  no stability edit is proposed.
- Native `stabilityOf` delegates through `stabilityOfRecorded` and the qualifier.
  LSP was unavailable in this checkout; source references plus actual build
  module code establish the runtime boundary. The TS transonic CP/curve functions
  are absent from the emitted app. Only unrelated ARCAS constants remain there
  (325 rendered bytes); TS loads/six-DOF modules emit zero bytes. Atmosphere and
  pure dispersion reducers remain. The TS model is unchanged, not qualified.
- The separate native `aero_curves` API still supplies its own CP. Its actual UI
  consumer now uses the existing content-keyed stability cache to withhold CP
  when the geometry baseline is unsupported or not established, retaining Cd.
  This is not a global API or Mach-specific CP support qualification.
- Restored the preserved target-rmp10 WASM into the fresh checkout without a
  rebuild; SHA-256 b32e7b7c… matches the earlier recorded runtime receipt.

New red/green evidence:

- Real shipped-WASM copilot regression: before, 1 failed / 4 passed (Modeled
  rather than Unknown); after, passes. An intermediate overbroad assertion
  expected no fixes at all, ignoring the legitimate boattail advisory. Corrected
  to assert no **stability** fixes; advisory behavior unchanged.
- Full source suite after copilot correction: 124 files / 1537 pass, tsc clean.
- Coefficient UI regression initially fails: fallback 357 mm displayed.
  After masking: N/A CP, unchanged 0.420 Cd; a subsequent supported edit restores
  the CP. Final affected suite after this change: 7 files / 73 pass, tsc/Vite pass.
- Actual built Chromium file import → copilot explanation: CP/margin N/A/Unknown
  with reason, CG 0.178 m/Modeled. Suggest-fixes: both margin checks not-evaluated,
  no apply button; native flight refusal retained.
- Final rebuilt Chromium Aero → Aerodynamic inputs: all five CP cells N/A;
  finite Cd off/on retained (0.297, 0.457, 0.423, 0.308, 0.256). Runtime error
  lists empty. File-chooser automation and a body-text wait timed out; retries
  used the actual file input/observed imported state, not product bypasses.
- Preview services and browser tabs closed. Package validator pass, 29/117
  acceptance passes unchanged. No Rust, model, defaults, schema, push or release.

New external evidence: `evidence-rmp10-geometry-cp-support-resume/` beside the
worktrees, including raw failed/passing logs, build module code, browser text/
screenshots and supplied-text review input. Independent MiMo no-tools verdict:
**ACCEPT**, bounded correction only; source `49b07ad`, increment 6/10 completed.
The final full-suite count applies before the coefficient UI addition; final-tree
evidence is the affected 73 tests/typecheck/build and rebuilt-browser smoke.
