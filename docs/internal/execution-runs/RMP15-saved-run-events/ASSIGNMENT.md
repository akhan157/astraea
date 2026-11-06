# RMP15b — retained recorded flight events for saved runs (project 1.9.0)

Exact base df94473 (source 041a8fc), branch execute-rmp01-package-c80e7d3 /
furry-fish. Coordinator/author: omp takeover session
(anthropic/claude-opus-5-5). Serial independent supplied-source review after
the regression-first fix. No other task owner/process. `.pi/` untracked.

## Source finding (RMP15-C01 gap; goal item 5)

A saved flight case keeps inputs, identity, flat scalar summary and (RMP10a)
moment-arm history, but not its event timeline. A teammate who reopens a
project cannot see when rail exit, burnout, drogue/main activation or
touchdown happened, or at what altitude, without rerunning — possibly on a
different engine. `FlightRun.events` already holds the adapter's timeline:
all six native events (ignition, rail exit, burnout, apogee·drogue
activation, main, touchdown — every native `SimEvent` name in six_dof.rs is
mapped, none dropped) plus one `derived: true` Sampled Max-Q taken from bounded
display samples.

## Contract

- Project schema **1.9.0**. Migration 1.8.0 → 1.9.0 is identity: old cases
  keep absent `events`; nothing is reconstructed. Any document older than 1.9.0
  that declares case `events` refuses before adoption (same fail-closed pattern
  as 1.8.0 history fields). The existing pre-1.8 refusal for
  `momentArmHistory`/`reportMomentArmHistory` keeps its meaning (1.8.0 documents
  carrying them stay valid).
- New optional flight-only `SimCase.events: SavedFlightEvent[]`, strict parser
  in `src/application/flightEvents.ts`: array ≤ 64; each object has exactly
  `t, kind, label, altitude, velocity` plus `derived: true` iff kind is
  `max_q`; kind in the existing `FlightEventKind` set; label equals the
  canonical label for that kind (labels moved from adapter.ts to this module,
  adapter imports them — no wording change); finite numbers, t ≥ 0,
  non-decreasing t. No cross-field clock tolerance with summary (display
  telemetry is rounded; RMP10b recovery-interval checks stay where they are).
- `withRunCases` retains `run.events` exactly (structuredClone) when they pass
  the parser; otherwise omits them (never partially kept or repaired).
- Saved runs shows a read-only “Recorded events” table per flight case with raw
  retained values, or “Recorded events unavailable for this run” when absent.
  Disclosures: apogee·drogue row is the recovery activation marker (physical
  peak time is `apogeeTimeS`); main reports vertical speed magnitude, Sampled
  Max-Q is a display sample (not a continuous peak), other rows the engine's
  event speed; historical record, not a fresh simulation.

No engine/core/bridge/WASM/physics/event-policy/key/options/default change.
Event values are model output, not measured or qualified.

## Exact lease

Own `src/formats/projectJson.ts`, `src/formats/projectJson.test.ts`,
new `src/application/flightEvents.ts` + `.test.ts`,
`src/application/runCases.ts` + `.test.ts`, `src/console/data/adapter.ts`
(label import only), `src/console/stages/SavedRuns.tsx` + `.test.tsx`,
`src/application/momentArmHistory.test.ts` (current-version literal only),
this records directory, coordination TASKS, package/tracker RMP15 notes.
Historical browser checkers pinning 1.8.0 are records of past runs and are not
edited or rerun.

## Verification plan

1. Red first: events retained through write/read; 1.8 doc with events refuses;
   1.8 doc without events migrates unchanged; malformed events refuse; Saved
   runs renders table / unavailable text.
2. Implement. Focused + affected tests (2 workers), tsc, Vite build (WASM
   unchanged, hash logged).
3. One bounded built-site smoke (explicitly in lease this time): preview server,
   one browser tab, startup flight + one clicked run, Build → Saved runs →
   Recorded events; then project download/reopen is NOT claimed unless done.
4. Independent supplied-source review; local commits; partial notes only.

External logs: /home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp15-saved-run-events/.
No RMP12/empirical runs, protected outcomes, push, contact or release.

## Lease extension during implementation (test-only, chronology retained)

`src/application/runInputs.test.ts` (one line): its manufactured “1.6.0”
document is downgraded from a fresh write, which now carries `events`; the new
fail-closed rule correctly refused it (full-src-1.log). The fixture now deletes
`events` like it already deleted engineIdentity, because a genuine 1.6 document
could not hold them. Likewise the existing SavedRuns legacy-ensemble fixture no
longer spreads the flight's events into a monteCarlo case. No production
guard was relaxed.
