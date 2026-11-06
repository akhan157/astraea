# RMP12b review record — contract, implementation and results

All reviews by fresh ephemeral, no-history, read-only sessions of the installed
author model (mimo-v2.6-pro, high reasoning; tools limited to `read`), prompted
from frozen documents and pinned commits. One Codex-route attempt hit its usage
limit mid-review and is retained. **Independent authorship reasoning from clean
contexts, not multi-model scientific consensus and not qualification.** Raw
prompts/transcripts/reviews: external-only
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp12-candidate-controls/`.

## 1. Contract (`CONTRACT.md`/`EXPERIMENT.json`) — ACCEPT after three rounds

1. **REQUEST_CHANGES — 5 material issues:** wholesale `effectiveInputs`
   stripping masked input drift; no mechanism instrumentation (null results
   uninterpretable); report-location collision with frozen exclusion lists;
   negative refusals unpinned to reason/phase; explicit-inherited policy-ID
   ambiguity. Minimal bounded fixes applied.
2. **REQUEST_CHANGES — 2 residuals:** request-diff rule unsatisfiable for F/G
   (fixed with per-case `caseDeltaSets` recorded per attempt in the ledger);
   mechanism evidence lacked an emission location (fixed: sidecar outside the
   compared report; F/G N/A-with-reason). Four minors adopted.
3. **REQUEST_CHANGES — 1 residual + 4 minors:** strict effectiveInputs rule
   rescoped to A-vs-B only; C–G compare against `caseDeltaSets` minus the
   controls leaf. Minors adopted (B in straddle group, horizon name mapping,
   delta-set ledger recording, top-level residual-floor rule).
4. **ACCEPT.** Frozen bytes hashed in the run directory; one optional wording
   nit deliberately not applied post-acceptance to preserve accepted bytes.

## 2. Implementation (`b8c4e39`) — REQUEST_CHANGES → fixes → ACCEPT

**REQUEST_CHANGES — 3 material issues.** The blocking one: `diagnosticNumerics`
was injected at the profile document root where `deny_unknown_fields` would have
refused all seven controlled attempts and burned the frozen no-retry budget
before any result. Also: F/G mechanism rows missing "N/A with reason"; B
mirroring A's mechanism counts was reported but unasserted. Verified sound
elsewhere: knot clipping semantics (bitwise endpoints, no stage beyond, growth
untouched, legacy byte-identical), DTO fail-closed at both levels, identity
semantics including profile-envelope binding and replay, report/sidecar
separation, checker delta-set/attempt/seal logic, no production/legacy/physics
changes.

Fixes in `d734bc3`/`3f40fcc`/`ab0dbb0`: controls nested under `candidate`
(builder + tests assert root never gains keys); one fail-closed alias resolves
the frozen bare `caseDeltaSets` entry to the nested DTO location (strict
observed==expected equality aborts root/both/neither placement); F/G N/A rows;
A/B mechanism-identity integrity term; adopted hardening (bPolicyId assertion,
sidecar parse in try, absent-preimage digests pinned to the RMP07a recorded
values, `comparisonsUnresolved` flag, residual-floor placement, reference-control
failure recording, frozen-input path fix). **Focused re-review: ACCEPT** —
blocker genuinely closed, alias fail-closed, no new defect.

## 3. Results/interpretation — REQUEST_CHANGES → substantiation → re-review

**REQUEST_CHANGES — 2 record-level issues** (numerical conclusions judged sound
and honestly scoped; no failure laundering; no budget mishandling):
- I1: the seal's reseal note claimed the two pre-flight failures were
  "retained/described in RESULT" before any RESULT existed. Fixed:
  `run-1/pre-seal-invocations.json` records both invocations with zero-attempt
  attestation and an explicit raw-log-loss limitation, and `RESULT.md` now
  exists and describes them.
- I2: "C≡E bitwise" lacked its own bit-aware comparison row. Fixed: post-hoc
  saved-output analysis (zero native calls) adds the row — **zero changed
  leaves** stripping only `contentIdentity`/`activePolicies` + the
  `diagnosticNumerics` leaf, identities differ — and the claim is worded as
  "inert once knots were split — in this case".

Non-blocking items adopted: burnout-event residuals surfaced per case; D's
confound characterized precisely (samples bit-identical to A through 0.20 s;
one extra rejection near the 0.209 s knot; 22 events over 21 knots);
`status: pass` documented as plan conformance only; numerical-root/mismatch-floor
caveats and exact 43.7×/49.0× factors; commit ordering stated.

One residual in the same record-claim class was then found (B1): the post-hoc
`hashChecksAllMatch` asserted reservation-hash verification the script never
performed, and missing files passed vacuously. Fixed: all four kinds map to
exact paths/keys with per-case `match`/`mismatch`/`missing-file`/`not-recorded`
states, anti-vacuous guards, reservations genuinely verified (the legacy row's
input hash is honestly `not-recorded` on the row and hash-verified in its
reservation); prose aligned. **Final narrow re-review: ACCEPT.**

## 4. Post-hoc saved-output analysis

`run-1/analysis-posthoc.json` (zero native calls, no retries, result.json/plan/
seal untouched): every recorded stdout/stderr/reservation/input hash recomputed
against raw bytes and matching, with per-kind per-case states (missing files
report `missing-file`; the legacy row's input hash lives in its reservation and
is marked `not-recorded` on the row); bit-aware C-vs-E row; burnout residuals (C/E 1.42e-4 m / 5.79e-5 m/s vs
A 6.93e-3 m / 3.18e-3 m/s at the declared 1.86 s); A/D divergence structure.

## Standing interpretation rules carried forward

- The retained default failure and RMP12a's nine-attempt study are immutable
  history; C/E optional passes never close RMP12-C02.
- The knot-split effect is established for one synthetic vertical case at 20 ms
  macro steps only; any default/tolerance policy change needs a new frozen
  experiment, broader applicable evidence and RMP05 decision budgets.
- The reference root is a numerical bracket of the implemented stepping routine;
  C/E residuals sit near the declared model-mismatch floor.

Review raw hashes are recorded in `EVIDENCE.json` (`review.rawHashes`).
