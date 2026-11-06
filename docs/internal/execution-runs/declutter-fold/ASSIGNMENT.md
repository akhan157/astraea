# Lane: declutter-fold

## Pin

- Branch: created by T3 `delegate_task` (worktree isolation) from `frontend/design` at the
  commit that adds this file. Rename it to `declutter-fold`.
- Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.

## Owner direction (2026-11-05)

The owner said "there's too much info at once". They rejected an answer-first redesign
because it changed the UI and labels too much. They then approved a minimal fold-only
version, shown as real-app screenshots with only the long text folded:
`.paseo/worktrees/3s8t98rp/evidence-declutter-fold/approved-preview/` (`*-before.png`,
`*-after.png`). Owner words: "I approve."

**Rule: change as little as possible.** Keep the layout, labels, wording, colours and
components exactly as they are. Only fold long text. Delete nothing.

## Exact changes

1. **Airframe and Aero readout card** (`src/console/stages/Airframe.tsx`, the live
   stability card). The amber line "Above generic geometry band (>3 cal). Weathercocking
   requires flight analysis." and the grey line "Component rollup only; selected motor
   and powered-flight margin history unavailable." become **one line** (the amber text
   first, then the grey text) that truncates with an ellipsis. An inline **"More"**
   expands both lines in full, in their original colours. Use or extend the existing
   `src/console/kit/Caveat.tsx` pattern (button, `aria-expanded`, keyboard-operable).
2. **Aero "Stability breakdown" intro** ("Subsonic component geometry and mass rollup;
   excludes…"): the same one-line fold, but **only when it overflows**. At widths where
   it fits, show it unchanged with no "More".
3. **Verify gate reasons** (`src/console/kit/Status.tsx` `GateRow`, `[data-gate-reason]`):
   one line with an ellipsis and an inline "More", **only when the reason overflows**.
   Short reasons show unchanged. Clicking "More" expands that reason in place. A
   **failing** gate's reason is always shown in full: never fold a failure.
4. **Verify "Validation · does the model match reality?"** (`src/console/stages/Verify.tsx:55`):
   the existing card starts **collapsed**, showing only its existing heading row with
   a chevron. Clicking the heading row (a button with `aria-expanded`) reveals the
   current content unchanged: paragraph, Flight evidence, Altimetry, etc. Once opened,
   it stays open for the session.

"More" styling: the existing Caveat "More" (underlined, muted, 11 px). No new colours.

## Tests and journeys

- Unit tests for each fold: the full text stays in the DOM and is reachable via "More";
  no "More" when the text fits (where jsdom can measure it, otherwise test the
  overflow decision helper); failing gates are never folded; Validation starts closed
  and opens on click.
- `scripts/preview-journeys.mjs`: the `ui-polish-pass` assertion "gate reasons must not
  be clipped" must be **replaced, per owner direction**, by "each gate reason is either
  fully visible, or shows a More control and, after clicking it, is fully visible
  (scrollWidth ≤ clientWidth, scrollHeight ≤ clientHeight)". Apply the same rule to the
  Flight Results basis cells only if you fold them; this lane does not fold them, so
  leave that assertion unchanged.
- Journeys that import a flight log, calibrate or share on Verify must first open the
  Validation card by clicking its heading. Add only that step; change nothing else in
  those journeys.
- Add a journey: the Airframe card shows a single caveat line plus "More"; clicking it
  shows both full sentences.

## Non-negotiables

- **No image reading.** Your model cannot read images, and reading one crashes the
  session. Verify with DOM and numbers. The coordinator does the visual checks.
- No label, wording, colour, layout or component-style changes beyond the folds above.
  No engine/physics/schema changes.
- The author cannot self-accept. Run `free -h` first. Use `vitest --maxWorkers=2`.
  Run long commands in the foreground. No subagents. No push or merge. Leave the
  `vite preview` on port 4173 alone.

## Gate 1

Send: the exact components/lines you will change, how "only when overflowing" is decided
(ResizeObserver plus a measure, recomputed on resize), and the journey edits (exact
lines). Then stop for approval.

## Report

`docs/internal/execution-runs/declutter-fold/RESULT.md` + `EVIDENCE.json`. Run tsc, the full
vitest suite, `pnpm build` and `pnpm test:browser`. Commit with
`git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`.
