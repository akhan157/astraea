# Lane assignment: K5, team-validation transfer (research Gate 1 first)

Status: **research Gate 1 dispatched 2026-11-15**, after the K3 (`c2b31dd`) and K4 (`3bde5ae`) merges.

## Pin (filled at dispatch)

| | |
|---|---|
| Base | `goal/collegiate-accuracy` after K3 (and K4 if it is merged by then), SHA filled at dispatch |
| Author | codex `gpt-6.1-terra`, medium effort. Never Sol, never xhigh |
| Reviewer | a non-OpenAI family. No self-acceptance |

The author's first reply is `cwd confirmed <pwd> branch <branch> HEAD <sha>`.

## Why

- **Owner K5 (approved 2026-11-14):** team validation transfer, **with research Gate 1 first, because transfer accuracy is unproven** (GOAL.md H4 and Revision 3).
- **The aim:** carry a team's fitted drag correction to a changed motor, mass or site on the same airframe, and from a subscale to a full-scale with similar geometry. The prediction band may tighten only as far as the evidence supports.
- **Today:** "Fit drag to this log" (`src/console/evidence/CalibrationCard.tsx`) applies only while airframe, motor, site and options all match the fitted flight (`src/application/calibrationApplicability.ts`). Scorecard CA-01 is development-only, on one vehicle.
- **After K3:** a calibration is fitted against **legacy** drag only. A project that holds one and made no drag choice stays on legacy (K3 commit 3, `resolvedDragChoice`). Gate 1 must decide which drag model a transferable correction is fitted against, and how it interacts with the K3 default.

## This lane's first turn is research only: no source edits

Gate 1 note:
1. **The evidence in hand for transfer.** The rule is no new flights and no sealed data.
   - List every same-airframe pair that development data holds. Candidates are in the R40 cohort (rabia ×2, full-metal-jacket ×2, the calisp series if it really is one airframe), F67W (now development data), and any dev vehicle.
   - For each pair, say what changed between the flights: motor, mass, site.
   - For subscale to full-scale: is there any pair at all? If none, that half is **external**. Name the exact input that would unblock it.
2. **A test protocol** that would show transfer helps:
   - fit on flight 1, predict flight 2;
   - compare against the default model with no correction, measured as apogee error on flight 2;
   - fix the decision rule before running it.

   With n this small, state what result would count as "no evidence it helps". In that case the lane stops and is recorded as **dropped**.
3. **Mechanism options** (only if the evidence supports one), each with its user impact, against the current exact-case rule. Examples:
   - a scale applied as is;
   - a scale with a widened band;
   - a transfer limited to specific changes, such as motor only.
4. **Band honesty:** how the shown band or K4 line would change, and from what measured numbers.
5. **Files that would change** (file:line), and whether the engine changes. If it does, the WASM is rebuilt from the goal-worktree path (Amendment 1), and that build is the orchestrator's job.
6. **Falsifier.**

## Non-negotiables

- No tuning to sealed or held-out data. Do not open `/home/ak/astraea-evidence/R6-public-cohort/`, the book library or `docs/flight-validation/round2-results.md`.
- No physics, threshold or tolerance change to make a check pass. No relaxed assertions.
- No push, network or downloads; install only with `pnpm install --offline --frozen-lockfile`. Run `free -h` first, and use two jobs per run.
- Do not edit GOAL.md, the STEP0 files, GOAL-HANDOFF.md, the register, the manifest or the board.

## Acceptance (if Gate 1 approves an implementation)

- Opt-in first, with identity proofs: the three templates and the cohort are bit-identical with no calibration.
- The frozen benchmark P1–P7 and P10 are unchanged on the candidate.
- The transfer test table from the protocol in point 2, every pair reported.
- Built-app screenshots of the changed card.
- A **dropped** result is a valid outcome and is recorded with its numbers.

## Report format

The report is `RESULT.md` and `EVIDENCE.json` in `docs/internal/execution-runs/K5-team-validation-transfer/`. The author's last line is `branch <branch> head <sha>`.
