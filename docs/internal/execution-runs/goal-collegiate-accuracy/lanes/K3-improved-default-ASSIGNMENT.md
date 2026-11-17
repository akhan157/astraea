# Lane assignment: K3, improved model as the default

Status: **dispatched 2026-11-15.**

- Base: `goal/collegiate-accuracy` after L0 (`848e7f2`) plus spec Amendment 3.
- The author works in an isolated checkout made from that commit.
- The author **does not run git add or commit**; the orchestrator commits the lane.

## Why

- Owner K3 (approved 2026-11-14): the improved model becomes the default for the designs it
  supports, and the old model is kept for the shapes it refuses.
- It lands **opt-in first**, with identity proofs, and needs its own Gate 1.
- Measured gain in arm B over arm A: 9.60 % → 5.62 % average error, 13 → 18 of 20 within ±10 %
  (`STEP0-BENCHMARK-SPEC.md` §2).

## Facts the Gate 1 must address (orchestrator scouting, `9801ad7`)

- Opt-in today is the vehicle field `flightDragSource: 'calibrated'`:
  - type: `src/core/types.ts:256`
  - checkbox: `src/console/stages/AeroControls.tsx:193`
  - carried to the engine options: `src/application/caseResolver.ts:120`
- Admission: when the opt-in is set, the beta built-up aero-model selection is required. A
  missing selection is refused (`src/application/flightAdmission.ts:64`,
  `builtUpDragRefusalText`).
- Engine: `resolve_flight_drag` (`crates/astraea-engine/src/models.rs`, about line 1370) falls
  back to `Refused { reason }` (legacy tables) for shapes the improved model cannot build.
  This is the required fallback; Gate 1 must cite the line where Refused flies legacy.
- Spaceport America template: improved drag refuses its fins on the boattail, so the template
  flies legacy drag (option-2 RESULT).

## Gate 1 must answer

1. **What "default" means.** One of:
   - new projects and templates only;
   - every design without an explicit choice, saved files included.

   State how existing saved projects and old run archives keep their recorded identity.
   Recorded runs are never rewritten.
2. **The beta-selection requirement.** Drop it for the default path, auto-select, or keep it.
   State the user impact of each.
3. **Blank inputs.** What a team with no nozzle exit, tip radius or site temperature gets.
   This is gated by P3 (arm C ≥ arm A in every regime).
4. **Template identity table** (expected before/after for all three) → **owner hard stop (c)**
   before any template default changes.
5. **Wording.** The result screen states which drag model flew, and the fallback reason for
   refused shapes, using existing strings where possible (minimal UI change).

## Acceptance

- The frozen benchmark rules P1–P7 and P10 are met on the candidate WASM.
- Opt-in-first step: a no-option identity proof on the three templates and the cohort
  (bit-identical while the default is off).
- Build, `tsc`, unit, engine and browser smoke pass, plus a built-app screenshot of every
  changed screen.
- Author: codex `gpt-6.1-terra`, medium effort. Reviewer: a non-OpenAI family. No
  self-acceptance.

## Added at dispatch (2026-11-15, from L0 / spec Amendment 3)

**Numbers the default must beat (baseline WASM):**

| Arm | Error / within ±10 % | Result against the rules |
|---|---|---|
| A, today's default | 9.60 % / 13 | — |
| B, improved model with site temperature, nozzle option and tip radius | 5.62 % / 18 | Passes P1 and P2 exactly |
| C, improved model with those blank | 5.35 % / 16 | **Fails P1** (16 < 18); **fails P2** on transonic (6 < 7) and supersonic (6.94 % > 6.07 %, 3 < 4) |

**So the default flight has to carry B's inputs wherever the design has them:**

- the site temperature (`site.temperatureC`, `src/application/caseResolver.ts:116`);
- the nozzle exit;
- the nose tip radius.

Gate 1 must say exactly what the default does when each one is blank. Do not invent a hidden
value. Any fill-in, such as a standard-atmosphere temperature at the site altitude, is a design
decision: name it in Gate 1 with its expected effect on the C row, and check it on the L0
runner before you claim it.

**The candidate is measured with the L0 tools:**

- `docs/internal/execution-runs/L0-benchmark-harness/cohort.probe.ts`, with
  `L0_WASM=<candidate wasm>` and `L0_WASM_SHA256=<its hash>`;
- `summarize.cjs`.

The summarizer's baseline-reproduction assertion applies to the native A and B rows, which
come from the archived step-0 file and are unaffected by the candidate. Add a candidate
comparison script that applies P1, P2 and P3 to the candidate's WASM rows.

**Arms after the change:**

- **A** stays "manifest options only".
- With K3, A **is** the new default, and must meet P1 and P2.
- The old default must remain reachable as an explicit legacy choice, so A/B/C history stays
  comparable.

## First deliverable (Gate 1)

Gate 1 is a design note sent before material edits. It must cover:

- items 1–5 above, plus the blank-input rule;
- the files to change, with file:line;
- the identity plan:
  - opt-in-first commit, under which no-option flights stay bit-identical on the three
    templates and the cohort;
  - then the default-switch commit, with the expected template deltas;
- the falsifier.

**The default switch is owner hard stop (c).** The lane may implement it on its branch, but it
does not merge until the owner approves the template table.
