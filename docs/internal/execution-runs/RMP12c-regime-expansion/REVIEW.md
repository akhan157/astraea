# RMP12c review chronology — contract, implementation and results ACCEPT

No experiment calls, implementation approval or results acceptance is recorded.
This file is a review log, not authorization to skip a missing review stage.

## Contract round 1 — REQUEST_CHANGES

Fresh no-history, read-only pi reviewer explicitly routed through opencode-go /
mimo-v2.6-pro. Raw record is external-local-only:
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp12-candidate-controls/rmp12c-contract-review.md`.
No hashing or test execution by the reviewer is implied. Findings:

- M1: macro-step trends conflate event-service brackets, straddle populations
  and different sample sets; counts need denominators and rail service context.
- M2: finer-step default-controls passes must not waive the retained 20 ms
  failure or imply a macro-step default recommendation. Tolerance conclusions
  must be bounded specifically to RMP12b's 20 ms regime, not just its fixture.
- M3: replace knowable checker-hash placeholder, bind the equation gate's second
  file, state verify-before-execute and exact-path load order.
- M4: prove both 20 ms request hashes before any reservation/spawn, not just
  output equality; retain BASE-INPUT's byte-exact JSON round trip.
- M5: disclose pre-flight failures/zero attempts and state when seals are checked.

## Focused pre-implementation response — ACCEPT

M2–M5 incorporated directly, plus pinned binary hashes and prior-ledger anchor
provenance. M1 uses a narrower alternative: sealed binaries do not expose
full-flight trial/call counts or final candidate refinement brackets. Mark them
unavailable rather than invent counts or rebuild binaries. Report the existing
[0.18,0.25] s trial-window denominator with same-window straddle/clip subsets,
global counts only as raw events (never global rates/efficiency), sample counts,
candidate event time and nearest committed interval, configured width LIMIT
(not observed bracket), and separate reference-root brackets. Explicitly carry
within-series confounds; only fixed-step A/C pairing isolates split including
dt-sequence effects. The focused rereview accepts this alternative after checking the actual
mechanism bookkeeping and confirms all five material findings closed.

Raw prompt/output for focused rereview: same external directory,
`rmp12c-contract-rereview-prompt.md` / `rmp12c-contract-rereview.md`.
Actual disposition: **ACCEPT**, no material findings. Contract and plan are
now frozen; no outcome-based edits permitted. Non-blocking implementation notes:
local trial population includes rejected proposals; A straddle shares and C clip
shares are different event types (not a like-for-like rate pair); derive the
nearest committed bracketing samples, not the helper's ±20 ms diagnostic window.
Hash verification remains the runner's responsibility, not a reviewer execution.
Implementation, RUN-SEAL and results reviews remain pending.

Author's read-only byte check found the copied inputs, source fixture, both
checker dependencies, prior attempts ledger, raw anchor inputs/stdouts and both
existing binaries match the declared hashes. BASE-INPUT round-trips exactly.
This check made zero native calls; it is not an experiment or a substitute for
runner preflight, seal or review.

## Implementation review — ACCEPT

New uncommitted runner/checks: `scripts/diagnostics/check-candidate-regimes.py`
and `test_candidate_regimes.py`, based on accepted contract commit
`47908a800150c0a7662f9131d51fb56b6b9f7244`. Nineteen pure/manufactured checks
pass, including mocked seven-call accounting and saved-output-only RMP12b
compatibility. **Zero new native experiment calls**; no RUN-SEAL yet.

Independent read-only implementation review completed (task-owned PID 420751
exited). Final disposition **ACCEPT**, no material/execution-blocking findings. Prompt/output/logs are external-local-only under
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp12c-regime-expansion/`:
`implementation-review-prompt.md`, `implementation-review.md/.err`,
`unit-1.log` (superseded 15-test iteration), `unit-2.log` (19 tests on reviewed
implementation). The review read files/logs only; it did not run tests or hash
files. Author/coordinator verification is recorded separately.

A unique `preseal-inventory-*.json` in that directory records unchanged Rust
source hashes/diff since RMP12b, current Rust/Cargo/Python versions; it is not a
RUN-SEAL. Rust sources, frozen contract/plan and binaries remain unmodified.
Reviewer-suggested comment correction adopted: the driver records at most the
first interior knot per proposal, not every interior knot. Distinct start times
are not trial-attempt counts because rejected proposals can reuse a start.
This comment-only correction changes no output or execution behavior.

Non-blocking followups retained as limitations: unexpected non-finite metrics
could stop the remaining matrix during JSON persistence (raw streams/reservation
and invocation failure survive; partial stays partial); an exactly coincident
rail/sample time yields [t,t], explicitly a containing committed interval, not
a final refinement bracket; metrics can remain available after a determinism
mismatch, but that row and whole integrity fail. The frozen confounds text names
the old helper diagnostic-window field; output labels it explicitly as
`diagnosticPlusMinus20msSampleWindowS`. No need to change frozen plan bytes.

Final 19-check suite passed in `unit-final.log`; runner committed `51611d1`,
separate pre-execution seal committed `4a425f2`. Comment-only correction was the
only post-review runner change. No experimental smoke calls/retries.

## Execution and results review — ACCEPT

Exactly seven durable reservations/process attempts completed once (six profile,
one legacy), all expected dispositions matched, zero retries/pre-flight failures.
The two 20 ms request/stdout anchors and legacy output match pinned hashes.
A20 rail reserve still fails; A10/A5 and all three C rows pass selected
provisional checks. Primary audit recomputes 28 actual hashes; post-outcome
saved-file analysis independently checks those plus plan/seal copies (30/30),
with no new native calls/reference solves. Five-millisecond rows' 402 samples,
unavailable measurements and macro-step confounds are disclosed in RESULT.

Original external result SHA256
`c65c7b09f321d5f9a3d8407cd40e8a6862ff2b12fa50acfbbd6d1ce5361ca59d`;
attempts SHA256
`034032cc3e95ff3d41127e17ac64ea186030d1353d32192ebeaee75f4b982c3a`.
Portable `metrics.json` is generated solely from saved artifacts by
`analyze-saved-output.py`. Additional author checks on temporary copies confirm
changed reservation bytes and a missing plan copy cannot pass hash verification,
and a missing reservation fails closed; originals untouched, zero native calls.
External `saved-analysis-failure-checks.json` records this separately.

Fresh read-only results review launched serially as task-owned PID 426712,
explicit opencode-go/mimo-v2.6-pro route. Raw prompt/output under external
`evidence-rmp12c-regime-expansion/results-review-prompt.md` /
`results-review.md/.err`. Final disposition **ACCEPT**, no material findings. The reviewer cross-read
all six residual/context rows, reference controls and hashes against the raw
result, confirmed that the analysis genuinely recomputes 30 hashes and performs
the claimed consistency checks, and accepted the bounded interpretation.
Read-only verification did not execute/hash anything; author/coordinator checks
remain distinct.

Optional sample-count assertion adopted after acceptance: actual saved array
length must equal the retained service count; the analysis note now describes
retained counts/times instead of hardcoding the 402-sample observation. Regenerated
portable metrics use the same original outputs; no native calls/reference solves.
Optional external hash-pinning strengthening deferred: non-anchor expectations
come from the audited record, independently anchored by the execution-time audit
and separately recorded original result/ledger hashes. This is an evidence chain,
not an authenticated signature or tamper-proof security claim.

Results lane accepted; lease released for source/compute (no task-owned native
processes remain). Final documentation hashes/package validation/checkpoint are
bookkeeping only. Parent RMP12 remains partial, C02 FAIL retained. No experiment
rerun or default change.

## Routing limits

Initial contract/review prompts described same-model independent reasoning per
prior session routing. Current continuation environment reports openai /
gpt-6.1-sol / high, while the reviewer invocation explicitly selects opencode-go /
mimo-v2.6-pro. Neither route nor review agreement establishes scientific
qualification or comparative model quality; attribution must not be inferred
retroactively from current environment variables.
