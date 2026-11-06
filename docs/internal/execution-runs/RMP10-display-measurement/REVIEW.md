# RMP10 display/output consumer sweep — independent coordinator review

Reviewer: coordinating OpenAI GPT session, independent of the DeepSeek author
family. Scope: bounded RMP10-C01/C04/C07 consumer-honesty sweep. **ACCEPT** for
this bounded increment; none of the three checks becomes PASS.

## What was accepted

- **A2 landing energy:** the readout and gate now state that the value is
  whole-vehicle kinetic energy from one lumped mass (airframe plus remaining
  propellant), that per-section/suspended-section recovery energy is not
  computed, and that the 20 J limit is the engine's internal screen with an
  unestablished basis. Verified in source (`src/console/data/adapter.ts`) and in
  the built UI: rendered reason reads "Above the engine's internal 20 J screen
  for the lumped whole-vehicle landing energy … Per-section energy and the
  limit's basis are not established here." The engine computation
  (`six_dof.rs` landing mass/KE), the 20 J value, gates and schema are unchanged.
- **A3 rail screen:** the failing `rail_exit` branch now carries the same
  no-first-rotational-freedom / no-competition-compliance scope as the passing
  branch. The asymmetry was a real defect found by the author's own test.
- **A1/A4/A5/A6/A7:** sweep-only, no production change. Proven by assertions
  that would fail on regression: one authoritative apogee→touchdown interval and
  no second dictionary id; declared flat z=0 contact plane and unsupported-scope
  disclosure; no lug/rail-button claim; moment-arm history labelled sampled-only
  and never an observed burnout; delta withholding preserved for unavailable
  interval, delayed/missing clocks, timeout, non-nominal and legacy records
  across the comparison table, historical table and archive summary.

## Verification performed

- Reviewed the four branch commits; production diff is two label sites only.
- Merged as `f489fe7` (branch head `9fb47e4`, base `ae8c54b`).
- Merged tree: `tsc --noEmit` exit 0; focused affected suite 9 files /
  **105 passed**. The author's red proof (2 failures against the old adapter)
  is retained in its evidence.
- Built site under the production CSP, 1440×1000: actual NASA preset flight;
  Recovery shows the lumped-mass screen text and `<= 20 J`; Flight shows the
  rail-guide scope text; zero browser runtime errors. Preview and browser
  stopped.
- Evidence: `evidence-rmp10-display-measurement/coordinator-browser.json` and
  `recovery-energy-label.webp`.

## Deviations and limits

- The author could not run UI tests in its worktree because the gitignored
  `astraea_engine.wasm` asset is absent there; it used a temporary, uncommitted
  vitest config with a virtual stub module and recorded that. No engine bytes
  were created, hashed or executed. In the merged tree the asset exists, and the
  same tests pass without any stub.
- Engine identity is **not** verified in this lane; it belongs to the merged
  integration.
- Remaining RMP10-C01/C04/C07 scope is external: measured guide/button geometry
  and positions, first-rotational-freedom observation, altimeter trigger
  configurations, measured mass/CG/inertia, per-section recovery masses/CdA and
  opening shock, terrain/datum, vendor motor records, approved budgets and the
  real basis of the 20 J limit, current rule pins, and any engine/model addition
  such as per-section energy or terrain-relative deployment. No physical
  qualification is claimed.
