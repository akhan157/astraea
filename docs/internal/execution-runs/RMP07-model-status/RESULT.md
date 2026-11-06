# RMP07e — accepted model & evidence status panel

Pinned dispatch base `3a40d80f1237baf00c186a982bca6ac722eb6a06`. Read-only
status surface for goal criteria 3/5/6: teammates see, without developer help,
which model/engine produced results and what the evidence does and does not
establish. No new claims, no computed gates, no candidate activation, no
physics/identity/schema changes.

## Delivered

- **Model & evidence status panel** in Build (before the pre-export check):
  - Resolved flight-model IDs (`modelId`/`environmentId`/`mechanicalModelId`/
    `calibrationPolicyId`) with the explicit note that IDs name the model
    contract — not an executable checksum, not an accuracy claim. Wording is
    "Resolved against the supported legacy model contract" (the review removed
    an unsupported "explicitly selected" provenance assertion).
  - Result vs current engine identity with honest attribution for every state:
    same / different / unknown, "differences cannot be attributed to the design
    alone" unless identical bytes are proven. Attribution wording lives in one
    pure `engineAttribution()` shared by render and tests.
  - Calibration binding state: none / active legacy (binding unverified) /
    bound to model / inactive foreign ("does not affect runs").
  - Validation scope: the **exact** pre-existing beta accuracy claim (now a
    shared constant used by both the banner and the panel, literally pinned in
    tests) plus the accuracy-doc link and the separation of software
    verification from physical/numerical qualification ("ongoing").
- No status word reads as qualified/validated; warn tone only on
  different/unknown engine states and inactive calibration.

## Verification and review

- **284 tests / 19 affected files pass** (5 panel tests: exact claim literal
  pin; model row without provenance/qualification overclaim; all four
  calibration states; all four engine-attribution strings with the honest
  documented `same`-branch stub limitation; seeded run-driven branch selection
  and warn tones). TypeScript clean; Vite production build passes.
- Independent review: REQUEST_CHANGES (M1 unsupported provenance phrase; M2
  untested attribution branches; M3 unpinned claim wording) → fixes → **ACCEPT**.
  Two reviewer-suggested one-line assertion strengthenings adopted
  post-acceptance. [REVIEW](REVIEW.md) keeps both rounds.
- Two test iterations fixed harness-only issues (duplicate render; CSS
  hex-vs-rgb serialization → explicit `data-engine-tone` state). No product
  wording changed to make tests pass.

## Scope and limits

Restates established facts only: the beta claim is byte-identical to the
pre-existing banner sentence; the ID disclaimer restates the flightModel
contract header; calibration wording matches CalibrationCard. **RMP07-C07 stays
in_progress** — this is existing-legacy status visibility, not full
computational/domain/quantity qualification display for a candidate provider.
No candidate identity surface until a candidate exists in the app. Local
commits only; nothing pushed.

## Next

RMP07 remaining: consumer consistency (C04) and explicit migration difference
reports; or the reviewed knot-split numerical experiment across regimes. Default
policy changes still need RMP08–10 evidence and RMP05 decision budgets.
