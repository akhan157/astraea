# RMP07d independent source review — ACCEPT after one focused rework

Reviewer route: fresh ephemeral, no-history, read-only session of the installed
author model (mimo-v2.6-pro, high reasoning; `read` tool only). Independent
authorship reasoning from a clean context, **not multi-model scientific
consensus** and not qualification. Raw prompt/reviews external-only at
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp07-calibration-binding/`
(`review.md` SHA256 `ed68a803…`, `rereview.md` `73750cf1…`).

## Round 1 — REQUEST_CHANGES (2 material issues)

Verified sound: the fail-closed scale gate and declaration-only binding parse
(lenient binding can never activate/execute an unknown model; strict selection
gates unchanged), legacy semantics/keys byte-preserved, `unverified-legacy`
naming honest and the forward rule correctly encoded.

1. **An incompatible calibration joined run identity/input keys** —
   `launchCaseInput` built the LaunchCase from the raw project calibration while
   `designOf` filtered correctly; `snapshotCase` hashed it into `runKey`/`mcKey`,
   so the retention state produced contradictory records (scale 1 dispatched,
   calibration identity in the key) and a physics-no-op removal flipped keys.
   Fixed: `launchCaseInput` sources the active calibration from `design`; same
   object for every legacy/compatible state, keys unchanged; only the
   incompatible case changes. Key-level test added.
2. **Binding was recorded at apply time, not fit time** — a fit computed under
   selection A could be applied under B and would record binding B, the exact
   silent transfer RMP07d exists to prevent (type-unreachable today, live once a
   candidate selection exists). Fixed: `FitState.flightModel` captured at fit
   completion; the staleness key folds in the selection so switching selection
   stales the fit and blocks apply; apply and already-applied comparison use the
   fit-time binding.

Also corrected: `ProjectShape.flightModel` declaration had landed on the `Design`
interface (moved). Display honesty followups adopted: chip suppressed for
inactive artifacts; "remains applied" phrasing becomes "is inactive for the
current model" when the binding is incompatible. Refusal test strengthened to
whole-project identity. The well-formed foreign-binding Save/Open round-trip
test lives where the full valid record generator exists.

## Round 2 — ACCEPT

Both material issues verified closed in file text with genuine key-level
coverage; no new defects; legacy/compatible keys unchanged; fit-time capture
cannot mislabel a binding (fail-closed in both disagreement directions).
Optional followups honestly left: behavioral staleness test waits for a second
model; one jsdom `act()` wrapping nit; `alreadyApplied` render-time build guard
(pre-existing pattern).

This accepts the binding mechanism increment only — no candidate selection,
no fit/eligibility/physics/default change, no scientific qualification.
