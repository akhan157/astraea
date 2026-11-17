# R39 hand-off to the frontend coordinator (supersedes R38's `84271a4`)

- Branch `r39/e1b-continuity` @ coordinator fixup tip (source `fded3bb` + docs/comments
  fixups + this folder's `REVIEW.md`; see `REVIEW.md` in this folder). Built on R38's
  hand-off branch `r38/e1b-backport` @ `84271a4`, which was created from
  `frontend/design` @ `8fd48f0`. Not merged or pushed by the research branch.
- What it changes (owner approved blend + identity bump 2026-11-09): base drag in
  `0.9 ≤ r < 1` is now a smoothstep blend of the historical boattail law and the
  TN D-4821 cylinder law (was: hard step at r = 1, e.g. M 1.0 0.379 → 0.184).
  Post-change max step 2.19e-4; `r ≥ 1` and `r < 0.9` bit-identical to `84271a4`;
  shipped presets (Alpha r 1.0, NSL r 1.0, Spaceport r 0.8627) delta exactly 0.0.
- `PRESSURE_SOURCE_ID` now ends `@r39-blend-0.9-1.0`; the axial source ledger
  carries it for every pressure component. Any UI text or snapshot pinning the old
  `@3d9ca93` string will need updating.
- The blend is an unsourced continuity device, not a measured law; the `r < 0.9`
  boattail fit still over-predicts on small bases (R33). Provenance table updated
  in `docs/internal/aero-provenance.md`.
- Evidence: `docs/internal/execution-runs/R39-e1b-continuity/RESULT.md` and
  `EVIDENCE.json` (author-measured, not register PASS); raw grids at
  `/home/ak/astraea-evidence/R39-e1b-continuity/`. Reviews: `REVIEW.md` in this
  folder (coordinator + Haiku 5.5 + Kimi K3.1 Pro, all ACCEPT WITH COMMENTS,
  no blocking findings).
- The frontend coordinator owns the merge, browser checks and any UI wording.
