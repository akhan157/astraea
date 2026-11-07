# Pinned state and completed evidence

## Repository/branch ledger

| Item | Exact state |
| --- | --- |
| Repository | private `akhan157/astraea` |
| Completed branch | `delivery/integration-20261024`; start from its current remote head |
| Accepted engineering |5ea3141;154 core/61 engine/10 native friction cases at that source |
| Full roadmap |d583f56; documentation-only |
| First portable migration |9594c7d69673f028e851e5a23c8bb5b2b6108578 |
| Interrupted candidate |branch `engineering/candidate-flight-20261026`, ccc6c983e08873ec47d1585a3946cb856cea8949; based on d583f56 |
| WIP source |only core lib.rs/six_dof.rs edits; declares absent flight_provider.rs; untested/incomplete |
| New updater lane |proposal only; no files/builds/keys/installations before stop |
| Old automation |disabled; old candidate/updater agents interrupted |

The production WASM was not rebuilt for the diagnostic/private-driver work. Its
recorded SHA256 is
`c1a1a177d56b73e4f5862d29098743e0bc31f51499d1c7534776b34ba2e8c4fe`.
Do not assume a local dist/cache exists, or that this SHA proves the same file
was downloaded/executed on a new machine. The actual-runtime identity path is
already implemented and must be used when a new build is offered.

## Current owner product direction

The [owner-confirmed 1.0 release bar](OWNER-1.0-RELEASE-BAR.md) is a dependable,
useful general-public product with Binghamton University's rocketry team as the
first intended collegiate customer—not a prototype they must validate/repair for
us. Support meaningful team design variation, not only one fitted preset. A
possible general/validated option is not an approved experimental-only downgrade.
No team agreement, actual design envelope, numerical budgets, scientific passes
or release authority are inferred. Park data-dependent claims, not all independent
engineering; RMP05 forms are not a universal development stop.

## Completed work: no new assignment unless changed behavior warrants it

| Completed packet | Reuse this evidence / scope |
| --- | --- |
| Project/motor/history/async IO preservation |[delivery review](../delivery-review-2026-10-24.md); source defects fixed, not all possible vendor combinations |
| Complete saved inputs and executed engine identity |[reproduction review](../delivery-review-2026-10-25-repro.md); schema1.6/new archives; old summaries remain unreconstructable |
| Signed normal sums and scoped calibration |engineering checkpoint (private coordination notes); no identified single causal accuracy repair |
| P0 source/axis/moment contract |[accepted contract](../accuracy-program/first-batch-2026-10-26/P0-contract.md) and independent review |
| A1a/b/c static/core/real geometry/JSON diagnostics |[adapter review](../accuracy-program/diagnostics/A1b-integration-review-2026-10-26.md), [A1c](../accuracy-program/diagnostics/A1c-integration-review-2026-10-26.md) |
| E1a/T1a environment/canonical supplied static tables |[integration review](../accuracy-program/diagnostics/E1a-T1a-integration-review-2026-10-26.md); unqualified, no actual full vendor adapter |
| E1b local friction and A1d-1 private driver |[latest review](../accuracy-program/diagnostics/E1b-A1d1-integration-review-2026-10-26.md); no candidate flight yet |
| RMP01 / A1d-2 native candidate |[run record](../execution-runs/RMP01-20261026/RESULT.md); bounded SB1 + inherited rate couple + declared canopy through the shared driver, query/curves, separate result schema; independent review ACCEPT. Native-only: no dispatch/GUI/default/WASM, physical/empirical status open |
| RMP06a direct total axial / E1 consumption |[run result](../execution-runs/RMP06-local-axial/RESULT.md); source `15be61b`, direct inherited subsonic zero-incidence total, component ledger, actual typed E1, native-only helper; independent high-effort audit ACCEPT. Parent RMP06 partial: no shared flight/query/curves, stage-clock/AGL mapping, cache or startup-source extension |
| RMP06b actual E1 native profile bridge |[bridge result](../execution-runs/RMP06-profile-bridge/RESULT.md); `cfdded2` independently accepted, actual profile through candidate trajectory/query/curves and burnout/landing reads; exact fractional epoch validity/launch MSL+AGL/datum; prescribed axial source only. Parent local-source/cache/product qualification open |
| RMP02a source eligibility/custody |[result](../execution-runs/RMP02-source-eligibility/RESULT.md); reviewed explicit geometry/paired-evidence exclusions,64 retained entries/25 Python guard tests; C01/C05 pass,0 qualified cases. Parent signs/datum/base/native-density/geometry and physical closure remain open |
| RMP03/RMP04 prerequisite review |[findings](../execution-runs/RMP03-RMP04-prerequisites/RESULT.md); actual vendor export/schema and inspected offline desktop/image/dependency prerequisites unavailable; technical constraints accepted, no parser/guard/apply checks passed. Continue independently unblocked native work |
| RMP12a new native numerical reference |[result](../execution-runs/RMP12-native-reference/RESULT.md); independent experiment/report ACCEPT including retained20ms rail diagnostic failure(105.0167us>100us),9 attempts once/9 analytic tests; no adaptive/full6D/nativeWASM/mission budget closure or default change |
| RMP05a input-only preparation |[request](evidence/RMP05/README.md) and [result](../execution-runs/RMP05-input-only/RESULT.md);10 unselected decisions/7 input-gap groups,0 agreed budgets/rights signoffs. Responsible owner/custodian case and agreement required;no scientific pass,outcomes kept sealed |
| N1 old-model numerical study |first-batch record (private coordination notes);20 bounded calls, not universal convergence |
| Linux native/packaging |portable checkpoint (private coordination notes); embedded/extracted smoke, not installed interactive/platform acceptance |
| Updater transport/lifecycle/download |[UP1c review](../delivery-review-2026-10-26-updater-download-verification.md); no executable apply/relaunch proof |

A standalone synthetic legacy before/after pair around A1d-1 produced identical
1,969,393byte serialized output, SHA256
`f37d195fc903e3599603706a9e3f6b95b152d7a79b4639a31f50fa4f64972249`.
This is one implementation-preservation fixture, not a fresh measured flight.
Raw before/after files are not in this clone; the original input is recoverable
from the existing synthetic telemetry fixture without inspecting new outcomes.

## Claims that remain open

Candidate dynamics exist only as the reviewed bounded native diagnostic above;
they are not a default or exposed product model. New static/rate composition and
bounded result semantics are implemented for that diagnostic, but no candidate
touchdown flight, qualified axial/environment source or physical qualification
exists. E1 friction remains a component, not total drag. RMP06a now composes it
with explicitly identified inherited pressure/edge/base terms for a separate
direct total-axial diagnostic, not candidate flight or product activation. Its
nonzero low-Re support gap prevents a source-only launch. The native E1 bridge
now runs with the already-explicit prescribed source, without concealing that
gap. Native RMP06-C04 passes; C05/C07/C08 remain unclosed.
T1a accepts canonical complete static tables, not arbitrary RASAero CSV. ARCAS
geometry/conditions are not exact matches by assertion. Native/supplied methods,
qualified weather/mechanics/recovery, actual flight evidence, team/platform and
release gates remain open. No single global validated badge is justified.

The initial SB1 computational policy M<0.8/incidence<=5deg is not the intended
collegiate mission boundary and is not a physically validated envelope. Primary
use is the target; an initially companion-only product needs an explicit promise
and release decision, not an autonomous relabeling of an incomplete result.
