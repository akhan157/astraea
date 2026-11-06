# RMP10 — display/output consumer sweep (A1–A4, A7)

Base `ae8c54b` (branch `rmp10-display-measurement`). Owner: single worktree
agent. Coordinator accepted the scope split and owns register/manifest/TASKS,
independent review and browser proof. **No self-acceptance.** Parent RMP10 stays
partial; C01/C04/C07 remain `in_progress`.

## Delivered

1. **A2 — honest landing-energy basis (one production label change).**
   `src/console/data/adapter.ts:149-153,382` now qualifies landing energy as
   whole-vehicle kinetic energy from one lumped mass (airframe plus remaining
   propellant) with per-section/suspended-section energy explicitly uncomputed.
   The two `landing_energy` gate reasons (`adapter.ts:449-451`) attribute the
   20 J screen to the engine's internal screen and state that per-section energy
   and the limit's basis are not established here. The engine computation
   (`crates/astraea-core/src/six_dof.rs:2844-2847`: `landing_mass = dry_mass +
   motor_mass_at(t)`, `landing_ke = 0.5·m·v²`), `LANDING_ENERGY_GATE = 20`
   (`adapter.ts:48`), every threshold and the archived schema are untouched.
   The reason flows into the Build trace and the archived dictionary because both
   copy the summary `Result` reason; no new field/dictionary entry.
2. **A3 — departure claim scoped in both gate branches.**
   The failing `rail_exit` branch now also states that first rotational freedom
   and competition compliance are not assessed (`adapter.ts:401`), matching the
   existing pass branch and the `railTravel` manifest note (`adapter.ts:469`).
3. **A1/A3/A4/A5/A6/A7 — consumer-matrix assertions** (no other production
   change; sweep found no duplicate interval, no second dictionary and no
   delta leak):
   - `src/console/data/outputContracts.test.ts:20-27,30-43,46-53,55-59`
   - `src/console/data/recoveryResults.test.ts:113-137`
   - `src/console/stages/recoveryResults.test.tsx:132-149`
   - `src/console/stages/SavedRuns.test.tsx:269-278,300-302,491`
   - `src/console/evidence/MomentArmHistoryPanel.test.tsx:21-26`
   - `src/console/stages/siteAndTelemetry.test.tsx:52-56`

## Consumer matrix (claim → asset → assertion)

| Item | Verdict | Consumer claim (file:line) | Assertion that fails if the claim regresses |
|---|---|---|---|
| A1 interval | already single-source; proven | `src/console/data/recoveryResults.ts:107-122` is the only interval computation; `Recovery.tsx:42` renders it; `SavedRuns.tsx:193-205` renders the archived one | readout value === trace `apogeeToTouchdown` === archived value, label rendered once, no interval row in the Flight comparison (`recoveryResults.test.tsx:132-149`); only `apogeeToTouchdown` key matches `/touchdown\|descent/i` (`recoveryResults.test.ts:128-137`, `outputContracts` trace) |
| A1 dictionary | already single-source; proven | `recoveryResults.ts:67-99` is the only producer; `Build.tsx:113` and `SavedRuns.tsx` consume it; `savedFlightOutputs.ts:11-17` is the only id list | trace outputs deep-equal archived outputs and share `OUTPUT_DICTIONARY_REVISION` (`recoveryResults.test.tsx:141-146`) |
| A2 mass basis | **fixed** | `adapter.ts:149-153,382,449-451` | pre-fix red: `before-fix-a2.log` 2 failed; post-fix `outputContracts.test.ts:30-43` asserts lumped basis, "per-section … not computed", value 14.2/25 unchanged, threshold `<= 20 J`, and no regulation claim |
| A3 guide | pass+fail branches scoped | `adapter.ts:379,400-401,469`; `Flight.tsx:229-230` | `outputContracts.test.ts:22-26` asserts the release-only basis in both gate branches; `siteAndTelemetry.test.tsx:52-56` asserts the guide note keeps its limitation |
| A4 contact/trigger | honest; proven | `six_dof.rs:2844` (z=0 plane per manifest), `Recovery.tsx:42` (recorded interval, not deployment), `MomentArmHistoryPanel.tsx:25` (rail/canopy flags only) | `outputContracts.test.ts:46-53` asserts the declared ground datum and that unsupported-scope still discloses terrain-relative deployment and rail tip-off |
| A5 button | honest (no button geometry anywhere); proven | `Flight.tsx:229-230` is the only button/guide consumer text; `transonicAero.ts:615` `protuberanceCd = 0` is not surfaced | `siteAndTelemetry.test.tsx:55` asserts the guide note does not claim button/lug modelling |
| A6 burnout | honest; proven | `MomentArmHistoryPanel.tsx:25,35,37` ("before declared burnout", "not an independently observed burnout", "no dynamic-stability … assessment") | `MomentArmHistoryPanel.test.tsx:21-26` exercises the exact-burnout-sample branch; `outputContracts.test.ts:55-59` pins the sampled-only manifest claim |
| A7 deltas | no leak found; regressions added | `SavedRuns.tsx:35,190-205` (flag-based value gating + `deltaBlocked`), `Flight.tsx:117-130`, `flightLanding.ts:16-21` | `SavedRuns.test.tsx:269-278` (timeout/non-nominal interval deltas `N/A` with recorded reason), `:300-302` (legacy summary has no interval row), `:491` (an archive advertising an available numeric interval still cannot render value/delta), `recoveryResults.test.ts:113-126` (delayed marker, missing clock, non-nominal → numeric or null+reason, never a fabricated delta input) |

"A7 export/trace" is the Build trace `outputs` object (`Build.tsx:108-124`);
"archive summary" is `SimCase.summary`, which has no interval field
(`SavedRuns.test.tsx:269`) and whose landing metrics stay gated
(`SavedRuns.test.tsx:290-302`).

## Checks actually run (this source only)

- `pnpm install --offline --frozen-lockfile` (setup; no repo change).
- `node node_modules/typescript/bin/tsc --noEmit` → exit 0
  (`evidence-rmp10-display-measurement/tsc-final.log`).
- Focused affected vitest, `--maxWorkers=2`, 9 files → **105 passed / 9 files**,
  exit 0 (`evidence-rmp10-display-measurement/affected-final.log`): adapter/
  recovery pure contracts, `consoleData`, `runCases`, `savedFlightOutputs`,
  `Recovery`, `Flight` comparison, `SavedRuns`, `MomentArmHistoryPanel`,
  `siteAndTelemetry`.
- Red proof for A2/A3: base `adapter.ts` + new tests → 2 failed / 6 passed
  (`before-fix-a2.log`); restored fixed adapter → green above.
- No full suite, no Vite build, no browser, no Rust/WASM, no numerical study.

## Failed attempts (retained, not hidden)

1. `affected-1.log` — 4 files failed. Three UI files could not resolve
   `./astraea_engine.wasm?url` because the generated asset is gitignored
   (`.gitignore:6`) and absent. Also two real failures: the fail-branch rail
   reason lacked the scope sentence (fixed in production, see A3) and the new
   manifest test called `toFlightRun` without the required invocation identity
   (test-only fix).
2. A first harness config placed outside the repo could not resolve `vitest`/
   `@vitejs/plugin-react` (`affected-2.log`, startup error). Replaced by a
   repo-root untracked config with a virtual data-URL module for the absent
   asset only; it was deleted after the run. No engine bytes were created,
   copied or executed; every test uses the stub engine.
3. `affected-3.log` — 3 failures from my own wrong expectation: the fixture
   interval is 155.7 s (apogee 42.5, flight 198.2), not 20 s. Corrected the
   expectation; the product value was never changed.

## Engine identity (not verified here)

`src/engine/astraea_engine.wasm` is gitignored and **absent** in this worktree.
Per coordinator decision this lane did not restore, copy, hash or rebuild any
engine binary, and does not repeat either recorded SHA as locally verified.
Engine identity is owned by the merged integration. The harness workaround above
exists only so UI test modules resolve; it is not an engine artifact and cannot
support any runtime claim.

## Remaining scope

- **A-items:** none known; the sweep found no second interval, no second
  dictionary and no leaked interval/landing delta. A5/A6 were already honest.
- **B — genuinely external (unchanged):** measured guide/button geometry and both
  button positions; first-rotational-freedom and departure-speed observation
  (photogate/video/time error); altimeter dual-event trigger configuration and
  delays; measured mass/CG/inertia; per-section recovery masses/CdA and
  opening-shock loads; terrain/datum; vendor motor records/rights; approved
  accuracy/decision budgets and the basis of the 20 J screen; competition rule
  revision pins (ESRA 2027 REV P1, NASA USLI §2.14); per-section energy,
  terrain-relative or delayed/failed deployment and partial guide constraints
  (engine/model additions requiring review); native OS install/relaunch
  acceptance.
- C01/C04/C07 are not closed: through-burnout/unified-provider/mechanics decision
  qualification, full guide/contact/button/section/trigger/measurement
  qualification and broader replay qualification all still need the external
  evidence above. No PASS, no register/manifest/TASKS change in this lane, no
  physical/empirical claim, no push/publication.
