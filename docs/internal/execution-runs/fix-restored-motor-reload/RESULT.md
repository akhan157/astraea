# Result — author; not self-accepted

Base: 160ca58521e6e421607149b8abc28b9d940b4766. Test commit: a5a267b. Product commit: 5cefc88cea2e5dbadeacc84d5250e936b9d70eb0.

`adoptProject` restores unbundled IDs regardless of provenance, keeping bundled IDs reserved. The requested content comparison is not implemented: the instruction to register differing bundled-ID content conflicts with the instruction never to replace the bundled motor and the explicit collision test. The implementation preserves the bundled motor by skipping every bundled ID, including a mismatched record. This needs independent review; a conflicting project record remains in the project envelope but does not become the runtime motor.

Tests: `src/state/motorReload.test.ts` covers working-session and file recovery for certified restored and imported .eng records, readiness, and a bundled-ID collision. On base, `pnpm exec vitest run src/state/motorReload.test.ts --maxWorkers=2` failed 3 and passed 2: both restored paths and collision failed; both imported retention cases passed. On product commit: 5 passed.

- `pnpm exec tsc --noEmit`: exit 0.
- `CARGO_BUILD_JOBS=2 pnpm build`: exit 0. An initial uncapped build was interrupted and restarted capped.
- `pnpm exec vitest run --maxWorkers=2`: exit 1; 182 files passed, 2 failed; 2147 tests passed, 2 failed. Monte Carlo rail elevation timed out after 300000 ms; ShareFlightCard could not find `Source file` at line 52. This suite ran concurrently with browser smoke.
- `pnpm exec vitest run src/sim/monteCarlo.test.ts --maxWorkers=2`: exit 0, 30 passed, 165.26 s.
- `pnpm exec vitest run src/console/evidence/ShareFlightCard.test.tsx --maxWorkers=2`: exit 0, 3 passed.
- `CARGO_BUILD_JOBS=2 pnpm test:browser`: exit 0. Saved inputs reproduced via native WASM; accuracy bundle default journey passed (372 m baseline). Last lines: imported log survives Verify -> Flight -> Verify; flight bundle files/log bytes/checksum passed. No journey edits.

Initial full test run began before engine build and was interrupted; it is not a verdict. No push, merge or smoke script edits. Review and integration remain with orchestrator.
