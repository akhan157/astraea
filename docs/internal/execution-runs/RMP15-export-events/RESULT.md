# RMP15e — recorded events and terminal state in exports

Goal increment 7/10. Base ddd475131ced4b5ffd141cbbbca3cd72426aef61.
App-layer output-consistency work. No physics, model, defaults, native/WASM
bytes or project schema change.

## Delivered scope

- Build export traces now carry the committed run's recorded `events` (the same
  list the saved-case contract writes, including derived Sampled Max-Q marked
  `derived: true`), `terminationReason` (or `null` where the run recorded none),
  `landingNominal`, `inputKey` and `engineIdentity`. Events are copied from the
  reviewed snapshot; nothing is recomputed or reconstructed when inputs change.
- The Flight-track (KML) export requires `terminationReason === 'touchdown'`
  **and** `summary.landingNominal`, enforced both in the pre-review refusal list
  and again inside `make` at snapshot serialization. Timeout, abnormal touchdown,
  missing terminal evidence and contradictory terminal evidence are refused
  before any download. Existing current / valid / telemetry refusals unchanged.
- CHANGELOG entry added (this landed after the supplied review input was
  assembled; the reviewer flagged the gap and the entry is present in the tree).

## Verification

- Red first: four new cases (`timeout`, `abnormal touchdown`, `missing terminal
  evidence`, `contradictory timeout`), each with validity `PASS`, failed exactly
  as expected (button not disabled) before the fix. Green after.
- Affected suites after fix: `buildExport`, `bundle`, `flightEvents`,
  `recoveryResults` — 19 tests in the final wording-locked rerun, 48 in the
  broader affected run; `tsc --noEmit` clean; `git diff --check` clean.
- Full source suite on the final tree: 124 files / 1542 tests pass.
- Actual built-browser witness (Playwright headless Chromium, production CSP,
  real worker + real WASM b32e7b7c…, pass-through postMessage observation only):
  one mount flight, 1 `simulate_flight` call, no export/view/edit rerun. The
  trace's 7 recorded events (including derived Sampled Max-Q) deep-equal the
  saved case's `events` array; `terminationReason: 'touchdown'`, `landingNominal:
  true`, `current: true` initially. After a real rail-length edit: `current:
  false` while `events` stay byte-identical, and the KML button becomes
  disabled. The exported ZIP's `.trace.json`, the pre-edit live trace and the
  saved case agree three ways on events; `terminationReason`/`landingNominal`/
  `engineIdentity`/`inputKey` agree with the saved case; the saved project keeps
  the pre-edit vehicle name, confirming snapshot semantics. Page error list empty.
- Event/termination copying is deliberately **not** a permanent forwarding test;
  the throwaway actual-browser downloaded-trace witness above is the proof, per
  the project's test policy.

## Review chronology

MiMo no-tools supplied-text review ACCEPT, no material findings. Five
non-blocking notes: CHANGELOG claimed but absent from the supplied diff (fixed
here — the entry now exists), `astraeaTrace: 1` unchanged while `simulation`
grew fields (additive; no external versioned trace contract found),
`landingNominal` emitted bare while `terminationReason` is `?? null` (typed
boolean in practice; left as is), refusal message unasserted (fixed — the four
cases now assert the wording), and event copying covered only by the throwaway
witness (acknowledged residual risk, deliberate).

## Retained limits

- KML coordinates remain the existing local ENU frame. This increment does not
  georeference, and the product's launch-site model carries altitude only (no
  latitude/longitude). No globe-coordinate claim.
- No physics, accuracy, decision-qualification or release claim.
- RMP10-C06 and RMP15-C01 remain `in_progress`.
- The installed managed-browser harness could not observe worker traffic in this
  checkout (its init scripts did not reach the page world), so the witness uses
  the repo's own Playwright binary. Disclosed, not suppressed.

External evidence: `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp15-export-events/`
— red/affected logs, `browser.json` (full witness), `browser-slim.json`,
`browser.png`, `bundle.zip`, `review-input.md`, `review.md`, `review.err`.
