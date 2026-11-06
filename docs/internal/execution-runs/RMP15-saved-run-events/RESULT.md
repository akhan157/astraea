# RMP15b — retained recorded flight events for saved runs (project 1.9.0)

Source 65ef81ef45b84a4b0f4cfe110fd8a3ca866f84db, base df94473. Independent review ACCEPT (no material findings);
three nonblocking follow-ups applied. Parent RMP15 partial.

## Delivered

- Project schema 1.9.0. 1.8.0 → 1.9.0 identity migration; old cases keep
  absent `events`. Any pre-1.9 document declaring case `events` refuses before
  adoption; 1.8.0 documents with momentArmHistory remain valid (the pre-1.8
  refusal kept its meaning).
- `src/application/flightEvents.ts`: canonical timeline labels (moved from
  adapter.ts, wording unchanged) and strict `parseSavedFlightEvents` (≤64,
  exact keys, kind/label pairing, derived iff Sampled Max-Q, finite, t ≥ 0,
  non-decreasing). Flight-only; ensemble cases refuse events.
- Saved flight cases retain the run's exact timeline; a timeline failing the
  parser is omitted, never repaired.
- Saved runs: read-only “Recorded events” table (raw values) per flight case,
  with disclosures (drogue row = activation marker; main = vertical speed
  magnitude; Sampled Max-Q = display sample; modeled, not measured), or an
  explicit unavailable message.

No engine/core/WASM/physics/event-policy/key/default change.

## Verification (external root; RAW-ARTIFACTS.json)

- before-fix: 5 fail/61 pass + missing module; one malformed-refusal test was
  vacuous pre-fix (1.9.0 then unknown) — recorded in exit-status.log.
- Two existing manufactured old-format fixtures (SavedRuns legacy ensemble,
  runInputs 1.6 downgrade) carried the new field and were correctly refused;
  fixtures corrected (ASSIGNMENT lease extension), no guard relaxed.
- full src 121 files/1512 tests (full-src-2); after review follow-ups affected
  64 files/737 tests; tsc clean; Vite pass; WASM b32e7b7c… unchanged.
- Built-site smoke (in lease): real WASM run → 7 recorded event rows → Save to
  this browser → reload → Open saved project → same 7 rows. Author-attested.
  Not observed: file download/import, non-nominal runs.

## Remaining

Full telemetry/trajectory retention for read-only historical plots; export
trace inclusion of events; RMP15-C02–C05 journeys and native platforms. C01 in
progress only. No push/release/team/physical acceptance.
