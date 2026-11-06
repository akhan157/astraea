# RMP15-C01 independent review

Reviewer: `opencode-go/mimo-v2.6-pro`, medium, no tools, supplied source/evidence
only. Author was `opencode-go/kimi-k3.1-pro` — a different model family, so the
review is independent of the author. Raw verdict:
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp15-saved-telemetry/review.md`.

## Verdict: ACCEPT

Five minor findings, none blocking. The reviewer confirmed retention is genuinely
source-bound, the 1.9.0 -> 1.10.0 migration is identity-only with no
reconstruction path, validation is exact-key and fail-closed, the optional-key
rule cannot smuggle an omitted required key, SavedRuns is strictly read-only
historical, the adjacent test edits are necessary schema consequences rather
than scope creep, and no DTO/default/tolerance was invented.

## Findings and dispositions

| # | Sev | Finding | Disposition |
| --- | --- | --- | --- |
| F1 | Minor | `MAX_SAVED_TELEMETRY_POINTS = 5000` is a duplicated literal documented as "the engine's own maximum", never cross-checked against the engine; drift would make genuine samples fail to save | **Applied post-review**: cited `crates/astraea-core/src/telemetry.rs:18` (`MAX_TELEMETRY_POINTS = 5000`) and added compile-time guard `PointKeysCoverEngineShape` so a new `SixDofTelemetryPoint` field breaks the build instead of silently refusing saves |
| F2 | Minor | Telemetry signed-zero write fidelity inferred, not asserted; the idempotence test would pass even if the writer normalized `-0` to `0` | **Applied post-review**: added `expect(once).toMatch(/"time":\s*-0\.0/)`. The first attempt at this assertion used `toContain('"time":-0')` and failed — **the assertion was wrong, not the code**: `stringifyReportJson` pretty-prints as `"time": -0.0`. Verified `reportJson.ts:1-16` preserves binary64 `-0` via its marker, and `writeProject` uses it. Write fidelity holds |
| F3 | Minor | Empty retained-series UI branch untested (RESULT claims it; tests cover populated and absent only) | **Recorded as residual coverage**, not reworked |
| F4 | Minor | `EVIDENCE.json` had `sourceSha: null`; RESULT.md still said "pending independent review" | **Applied post-review**: source SHA `db71c89` recorded, review disposition updated |
| F5 | Trivial | `stage` accepts whitespace-only strings; a legacy record with mismatched keys blocks the whole save rather than omitting telemetry | **Recorded**: deliberate and documented fail-closed behavior |

## Residual limitation (unchanged, accepted)

The retention binding is structural, not cryptographic: a hand-authored 1.10.0
document can declare arbitrary telemetry with forged `inputs` and
`engineIdentity`. That is inherent to a plain document format and is not claimed
to be tamper-proof.

This review accepts the bounded increment only. RMP15-C01 is progressed, not
closed: changed-provider/import/environment retention, export-trace
interoperability and F3 remain open scope. No acceptance-register status was
changed by the author.
