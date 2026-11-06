# RMP10a review record

## Historical pre-implementation direction/concrete contract

At this stage no implementation/native calls/WASM build. Planning base `78d27f3`.
CONTRACT.md is the original direction proposal. INTERFACE.md resolves its open
choices prospectively; final interface review ACCEPT before runtime edits.

Read-only source inspection confirms actual legacy diagnostics already contain
C/J/CP/combined CG/force/static/rate moment and state context; DriverLoads drops
that metadata before display telemetry. Existing geometry-only labels and
recorded-pressure-peak retention are completed work, not proposed fixes here.

Fresh independent read-only design review explicitly requested via opencode-go /
mimo-v2.6-pro / thinking=high (convention/observable contract). Current author
environment openai/gpt-6.1-sol/high. No quality/cost/qualification inference.
Raw prompt/output external-local-only under
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp10-flight-model-history/`:
`design-review-prompt.md`, `design-review.md/.err`.

Design reviewer PID436444 completed: **ACCEPT AS DESIGN DIRECTION** (not final
API/schema/experiment/implementation/accuracy acceptance). Its source checks
corroborate the observable, unchanged legacy guards, committed macro placement
and telemetry rounding boundary. Six material refinements adopted in INTERFACE:
neutral weighted-arm name/units, canopy applicability mask without guard weakening,
actual alpha_total and drag-coupled/roll static-moment definition, reference length
source, raw f64 records, and no partial successful history on solver errors.

Concrete choices: closed burn-time interval retains exact-boundary macro points
if they genuinely exist; declared motor burn duration is not root-observation
evidence. No exact-burnout requirement/continuous minimum in this increment.
Cap5000 fails the requested report rather than silently truncating. Native runtime
checksum remains the existing host invocation-bound identity, not self-asserted
by WASM. Project1.8 prevents old1.7 readers silently discarding new case payload;
old absence is preserved and no request/history is fabricated. These two
repository-specific refinements differ from optional direction recommendations
and were explicitly submitted for review.

Concrete-interface attempt PID439856 (opencode-go/mimo-v2.6-pro, requested
medium) ended without any verdict: provider400 error `messages[3].tool_calls[1]
is missing a function name`. Empty output and .err are retained, not acceptance.
A single serial no-tools retry PID440483 uses the full INTERFACE text, prior
independent design review and actual coordinator-read source excerpts in its
saved prompt. Same explicit provider/model/medium. It can review that supplied
contract/context but cannot claim its own fresh source/test/hash inspection.
Raw files: `interface-review-prompt.md`, `interface-review.md/.err`,
`interface-review-2-prompt.md`, `interface-review-2.md/.err`, all external-local.

Retry completed: **ACCEPT**, final concrete contract only. No material findings.
Review boundary is supplied contract/source excerpts and previous independent
source review; not fresh full-source/test/hash execution. One nonblocking note
asks confirmation that result burnout_time is declared motor duration: coordinator
read six_dof.rs result initializer (currently2857), `burnout_time: motor.burn_time`,
confirming it. No source change required. Full response retained externally.

Contract accepted before runtime edits/new native calls; committed feb3c1a.
Implementation now exists in uncommitted WIP under that repinned lease; see
IMPLEMENTATION-WIP.md for source inventory/checks/failures and exact continuation.

## Implementation source review and later runtime finding

PID515128 completed **ACCEPT**, no material source-level findings, against
SOURCE-INVENTORY-1. Explicit opencode-go/mimo-v2.6-pro / medium / no-tools; full
current diff/new sources/contract supplied as text attachment. Not fresh
filesystem/test/hash execution. Raw `implementation-review.md/.err` retained.
It specifically did NOT approve changed WASM/browser or physical/release gates.

Three nonblocking residuals closed with additional tests, no production math
change: actual evaluator CP=J/C bits and inherited1e-4 floor; actual evaluator's
exclusive powered flag at declared burn time (not a trajectory root); requested
running/failed/cancelled-as-failed jobs never archived. SOURCE-INVENTORY-2 records
that test-only supplement and prospective browser driver.

Intentionally built new WASM b32e7b7c… from target-rmp10, not historical sealed
target-rmp01. Real browser-2 then found a genuine signed-zero persistence loss
missed by initial source review/manufactured fixtures: default JSON.stringify
changed native -0 to0. Added2 red project/trace tests before serializer fix;
no raw-retention contract weakened. New reportJson helper preserves -0.0, with
collision/escaped-string/key/raw-float tests, used by project and both trace
writers. Signed-zero-safe external artifacts from browser-3 onward. All failed
browser/checks retained in RESULT.md, no overwritten run directories.

## Final focused fix and software-runtime evidence review — ACCEPT

PID535810 completed **ACCEPT**, no material correctness/claim/evidence findings.
Explicit opencode-go/mimo-v2.6-pro / medium / no-tools.
Full current changed sources/diffs, new serializer/tests/browser driver, real
WASM preservation test, prior review, SOURCE-INVENTORY-3 (37files), final browser8
metrics and RESULT supplied via `final-review-input.md` attachment. It is again
supplied-source/data review, NOT fresh filesystem/hash/test execution or broad
physical/mission/team/platform/release acceptance. Raw final-review.md/.err
external-local; read actual disposition, not silence/process exit.

Author verification:191core/98engine,348frontend/27files, TypeScript clean;
actual WASM off/on old-value preservation; Vite2 build and browser8/Chromium156/
CSP real-worker/save/reopen/motor-alternative/import/ZIP trace pass with exact
new asset/recorded identity and signed-zero retention. Counts refer to selected
simulate_flight command, separately account startup and background previews.
Bounded serializer-fix/software-runtime evidence accepted, parent RMP10 partial.
No change to scientific/numerical-reserve/parity/team/platform/release gates.

Optional residual closure: numeric space argument is already TypeScript-inferred
and all actual callers default2, not arbitrary untyped string indentation.
Saved-output-only sign witness now explicitly verifies8000000000000000 for the
same raw field in actual worker/saved variant/inspector trace/downloaded project/
trace; analyzer and input hashes portable. No new engine/browser calls. Full
348tests/27files rerun green on final source (`ts-expanded-4.log`), closing the
last test-only path/decode edit timing. All37 source/test/driver hashes still
match SOURCE-INVENTORY-3. No further reviewer/compute process remains.
