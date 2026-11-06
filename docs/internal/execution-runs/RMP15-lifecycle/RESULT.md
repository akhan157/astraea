# RMP15d — lifecycle evidence, RMP15-C03 PASS (current legacy paths)

Source fd15420aefd72512e58c2880df231640ede7e16a (tests only), base 121c688fab372e75b24b67cdb92b7420940bda8a. Review ACCEPT.

- Hypothesized overlap bug disproved (run() refuses while running); vacuous red
  and reverted production edit retained in exit-status.log.
- New tests: edit while a flight runs → result and saved case bound to the
  dispatched inputs, current key differs (stale), repeat requests refused;
  ensemble restart → old aborted, late chunks cannot relabel/finish the new job
  or leave a result (mutation-checked).
- Existing guards cited: epoch drop, token drop, job-id guard, undo terminal
  snapshot, preview supersession, two-tab stale-save refusal (RMP15c).
- Built site: four rapid Ctrl+Enter → exactly one new saved run, no errors.
- affected 67 files/785 tests, tsc clean, Vite (build-2), WASM b32e7b7c….

Scope: current legacy flight/ensemble paths; new providers must re-show.
Open notes: cancelled-ensemble status wording; late progress on terminal job.
