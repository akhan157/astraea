# R39 coordinator review — base-drag continuity blend (r 0.9–1.0) + axial source-identity bump

Candidate `9229b3f` (source `fded3bb`, records `0a73fc5/a3ff65c/9229b3f`), code pin `84271a4`.
Author `opencode-go/deepseek-v4.1-flash` (cannot self-accept). Reviewers: Haiku 5.5
and Kimi K3.1 Pro (separate delegate tasks, both different families from the author).
Coordinator: Crouton Alpha.

**ACCEPTED.** Coordinator fixups (docs/comments only, no production values changed; author did not self-accept):

- C1 provenance row: `docs/internal/aero-provenance.md` boattail row relabelled `r < 0.9`,
  new unsourced-blend row `0.9 ≤ r < 1`.
- C3 `PROVENANCE` sentence in both `aero.rs` and `transonicAero.ts`: the
  `0.9 ≤ r < 1` smoothstep blend is an unsourced engineering continuity device
  (R39, owner-approved), not a measured law.

Other comments recorded without code change:

- C2 `EVIDENCE.json` check `"status": "pass"` means author-measured, not register PASS
  (RESULT §13 claims no PASS). Sealed evidence is not rewritten.
- C4 failing-before evidence is dump predicates from verbatim `84271a4` extracts, not the
  new test file run against an old checkout. Accepted as a reasonable surrogate.
- C5 continuity bound 0.01 is ~45× the measured max (2.19e-4); still fails the baseline
  by ~20×. Accepted.
- C6 Rust↔TS agreement (180,832 points, max |Δ| 0.0) is in external dumps only, not
  pinned by an in-repo test. Bar remains ≤1e-12.
- C7 owner visibility: shipped presets are exactly 0.0 (r 1.0, 1.0, 0.8627), but any
  user vehicle with base ratio in 0.9–1.0 sees a real change (synthetic NSL sweep
  apogee +4.3 m at r≈0.92 to +44.1 m at r≈0.999).
- WASM "rebuilt twice identically" was verified by hash on disk (`160ce4a2…c6c567`)
  by both reviewers, not by an independent second rebuild.

Coordinator re-ran on the fixed tree: `cargo test -j2` core **273/273 pass** (263+8+1+1);
`vitest run --maxWorkers=2 src/aero/transonicAero.test.ts` **13/13 pass**; `git diff --check` 0.
Reviewers ran read-only (hash checks, `cmp` of baseline extracts vs `84271a4`, Python
recomputation of TSV/JSON); neither rebuilt or ran suites.

Accepted result: max step across the band 0.1975 → 2.19e-4 (M 0.97, r 0.955); endpoint
|f(1−1e-12)−f(1)| max 4.3e-13; midpoint M 1.0/r 0.95 = 0.25459525 (Gate 1 amendment A);
within-language bit identity 0 mismatches (56,014 r≥1 + 64,016 r≤0.9, Rust and TS);
cross-language max |Δ| 0.0; preset deltas 0.0; `PRESSURE_SOURCE_ID …@r39-blend-0.9-1.0`
(3 symbolic occurrences, ledger probe confirmed). The blend removes the step; it does
not validate the boattail law (R33 still stands).

Next: superseding hand-off note in this folder for the frontend coordinator (branch
`r39/e1b-continuity` @ the fixup tip). No push, no app merge by the research branch.
E-2/E-4 re-attempts are queued behind this acceptance.
