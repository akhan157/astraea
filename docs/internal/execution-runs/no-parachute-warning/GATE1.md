# Lane `no-parachute-warning` — Gate 1: plan and tests

Author: OpenCode Go `opencode-go/deepseek-v4.1-flash` (variant max). The author does not
self-accept; this note asks the coordinator to approve the plan.

- Worktree `/home/ak/.t3/worktrees/astraeat3/t3-5f32a0c5`.
- Branch `no-parachute-warning` (renamed from T3's generated `t3/5f32a0c5`).
- HEAD `8b31787cb7e07164058d964e0a6f248eb0f451aa` (`8b31787`, contains this lane's
  `ASSIGNMENT.md`; `2d86d92` is an ancestor). Worktree clean.
- `node_modules` is absent in this fresh worktree. The first validation command will be
  `pnpm install --frozen-lockfile --prefer-offline`; that changes no tracked file.
- Host free memory at Gate 1: 7.2 GiB available. No heavy job has been started.

No source file has been touched.

## What exists now

- `src/console/shell/RunReadiness.tsx:11-26` renders the whole-design readiness line:
  the `<strong>Whole-design readiness</strong>` heading, the optional
  `· ready to run` span, the staged-airframe warning, the no-mount sentence and the
  preflight issue rows with their repair buttons. It reads `s.design.vehicle` through
  `currentPreflight()`; it has no recovery/parachute diagnostic.
- `src/console/stages/Recovery.tsx` has three content branches:
  - line 33: candidate flight model — `CandidateRefusalNotice` plus a note that no
    legacy recovery readout is substituted;
  - line 34: no committed run — the `No flight yet` empty state plus `RecoveryCard`;
  - lines 40-76: committed run — the stat grid, gates, descent events and the
    parachute table.
  `chutes` is already derived from `s.design.vehicle.components` at line 26, i.e. the
  current design, not the committed run.
- `src/console/kit/theme.ts:1` says amber is reserved for "changed since the committed
  run". The assignment explicitly approves a small amber note; see the decision below.
- `src/console/evidence/studioKit.tsx:94-96` already owns the small-note typography
  (`text-[11px] leading-snug`) and the `warn` tone (`C.warn`, `#F5B544`).

## Proposed implementation boundary (exact)

### 1. New `src/console/shell/NoParachuteNote.tsx`

A single small presentational component, no panel and no banner:

```tsx
import type { JSX } from 'react';
import type { RocketComponent } from '../../core/types';
import { Note } from '../evidence/studioKit';

/** Any parachute component counts; this is an inventory fact, not a configuration rule. */
export function hasParachute(components: readonly RocketComponent[]): boolean {
  return components.some((component) => component.type === 'parachute');
}

export function NoParachuteNote({ components, className }: {
  components: readonly RocketComponent[];
  className?: string;
}): JSX.Element | null {
  if (hasParachute(components)) return null;
  return (
    <div className={className} data-no-parachute-note="">
      <Note tone="warn">No parachute in this design.</Note>
    </div>
  );
}
```

- The exact rendered sentence is `No parachute in this design.` (one `<p>`, no suffix).
- `data-no-parachute-note` is a stable DOM hook for the browser check; it is not a
  user-facing label.
- The predicate is type-only: any `parachute` component hides the note, regardless of
  diameter, Cd, mass, packed length, order or deployment settings.

### 2. `src/console/shell/RunReadiness.tsx`

Import `NoParachuteNote` from `./NoParachuteNote` and render it immediately after the
existing `· ready to run` line and before the no-mount/preflight diagnostics:

```tsx
<strong>Whole-design readiness</strong>
{pending && <p>…existing staged-airframe warning…</p>}
{readiness.runnable && !pending && <span> · ready to run</span>}
<NoParachuteNote components={s.design.vehicle.components} />
{readiness.mounts.mounts.length === 0 && <p>…existing mount sentence…</p>}
{readiness.issues.map(…existing issue rows…)}
```

No existing sentence, button, readiness rule or color branch is changed.

### 3. `src/console/stages/Recovery.tsx`

Import `NoParachuteNote` and render it at the same point — directly under `StageHeader`,
before the branch's content — in all three branches:

- candidate branch (line 33): after `<StageHeader … />`, before `CandidateRefusalNotice`;
- no-run branch (line 34): after `<StageHeader … />`, before the `No flight yet` empty
  state;
- committed-run branch (line 40): after `<StageHeader … />`, before the scrollable stats
  `div`, so it stays above the results and is not dimmed by the stale-run opacity on the
  results container.

```tsx
<StageHeader stage="recovery" title="Recovery" … />
<NoParachuteNote components={s.design.vehicle.components} className="shrink-0 px-4 pt-3" />
```

When a parachute is present the component returns `null`, so there is no empty padded row.
No record, gate, stat, event table or `RecoveryCard` markup changes.

## Behavior

| Current design | Committed run | Flight readiness | Recovery |
|---|---|---|---|
| no `parachute` component | none | note shown | note shown in the no-run branch |
| no `parachute` component | run recorded with chutes | note shown | note shown; recorded stats/events still render |
| at least one `parachute` | none | note hidden | note hidden, even in the no-run branch |
| at least one `parachute` | run recorded without chutes | note hidden | note hidden; recorded stats/events still render |

- **Current design, not committed data.** The note reads
  `s.design.vehicle.components` only. It never reads `s.committed.run.events`,
  `s.committed.design` or the parachute table's recorded rows. A stale committed run with
  chute events does not suppress the note; a stale committed run without chutes does not
  create it.
- **Staged airframe drafts are not counted.** `s.design.vehicle` is the committed project
  design, matching `RunReadiness`'s existing "Staged airframe edits are not run inputs"
  rule. The UI's component add/remove actions (`consoleActions.addComponent` /
  `removeComponent`) commit immediately, so the note still disappears immediately when a
  parachute is added and appears immediately when the last chute is removed. A draft field
  edit does not move it.
- **Candidate behavior.** The candidate Recovery refusal branch gets the same current-design
  note. Candidate Flight has no `RunReadiness` surface at all, so it is unchanged; this
  lane does not add readiness UI to the candidate path.
- **No blocking.** No preflight issue, gate, validity state, threshold, tolerance, engine,
  schema, export or run-input change. Removing all parachutes still leaves
  `currentPreflight().runnable === true`; the note is text only.

## Tests — new `src/console/shell/noParachuteWarning.test.tsx`

`resetConsoleState()` loads `nasaStudent`, which has two parachutes; the tests remove them
with `consoleActions.removeComponent` and restore one with `consoleActions.addComponent`.
The committed-run cases install a `FlightPayload` exactly as
`src/console/stages/recoveryResults.test.tsx:27-33` does, with the design captured before
or after the chute change to make the run stale.

1. **Readiness: absent, present, returns.**
   - default design (two chutes): no `No parachute in this design.` in the
     `Run readiness` region;
   - remove both chutes: exact sentence appears, `data-no-parachute-note` is inside the
     region, inner `<p>` is amber (`rgb(245, 181, 68)`), and the region still says
     `ready to run`;
   - `currentPreflight().runnable` stays `true` and `currentPreflight().issues` stays empty;
   - add one parachute: note disappears immediately; `workspace`, `mission`, `shearPa`,
     `motorId`, `flightModel` and the motor records are unchanged by the add (only the
     vehicle component list changed).
2. **Readiness: stale committed run with chutes, current design without chutes.**
   - install a payload whose `design` is the two-chute NASA design, then remove both
     chutes and render `RunReadiness`; the note is still shown. This pins that the note
     does not come from the run archive.
3. **Recovery: no-run branch.**
   - no committed run, both chutes removed: `No flight yet` and the exact note are both
     present; the note precedes the empty-state text in DOM order.
   - add one parachute: note disappears, `No flight yet` remains.
4. **Recovery: committed run with chutes, current design without chutes.**
   - install a payload with the two-chute design, remove both chutes, render
     `RecoveryStage`; the note is present and the recorded `Landing speed` stat and
     descent table still render (the run is not blocked or hidden).
5. **Recovery: committed run without chutes, current design with a parachute.**
   - remove both chutes, install a payload with that no-chute design, add one parachute,
     render `RecoveryStage`; the note is absent while the recorded run remains visible.
     The fixture run's events still mention parachutes, so this also pins that events are
     not used as the signal.
6. **Flight: run authorization unchanged.**
   - no committed run, both chutes removed, render `FlightStage`; the `Run simulation`
     button is enabled, the readiness region shows the note, and `currentPreflight()` is
     runnable.
7. **Recovery: candidate branch.**
   - set the candidate flight-model selection from
     `src/application/candidate.fixture.ts`, remove both chutes, render `RecoveryStage`;
     the `Legacy recovery readout not evaluated` refusal and the note both render.

Existing focused tests re-run unchanged: `editBoundaries.test.tsx`,
`recoveryResults.test.tsx`, `flightLayout.test.tsx`, `stageRendering.test.tsx`. No
assertion in those files is relaxed.

## Narrow `scripts/preview-journeys.mjs` addition

Insert one self-contained block after the existing "all eight stages" pass
(`scripts/preview-journeys.mjs:156`), while the default NASA Student design and its
committed run are still loaded. It exercises the built UI, then restores the original
design and undo history for the rest of the journey:

1. On Flight, assert `[data-no-parachute-note]` count is 0 (the default design has chutes).
2. Go to Airframe; use the existing **Filter parts by name** field with `Parachute`;
   assert two treeitems; for each, hover the row and click its accessible
   `Remove component` button. Clear the name filter.
3. Go to Flight: assert the readiness region contains the exact note and the amber
   computed color, assert the stale-run banner is visible (the committed run still had
   chutes), and assert the banner `Run simulation` button is still enabled.
4. Go to Recovery: assert one note above the `Landing speed` stat (bounding-box `y` is
   smaller), and assert the recorded stats still render.
5. Go to Airframe; add a part → `Recovery parachute`. Go to Flight and Recovery and assert
   the note is gone in both.
6. Press the platform undo shortcut three times (undo add, undo main removal, undo drogue
   removal), then assert the two original treeitems are back. This restores the exact
   component list so every later journey check still sees the committed run as current.

No screenshot is taken or read by this author; the coordinator will inspect screenshots and
publish the design backup.

## Validation commands after approval

1. `pnpm install --frozen-lockfile --prefer-offline` (fresh worktree; `node_modules` absent).
2. `pnpm exec vitest run --maxWorkers=2 src/console/shell/noParachuteWarning.test.tsx src/console/shell/editBoundaries.test.tsx src/console/stages/recoveryResults.test.tsx src/console/stages/flightLayout.test.tsx src/console/stageRendering.test.tsx`
3. `pnpm exec tsc`
4. `PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build`
5. `ASTRAEA_BROWSER=chromium node scripts/browser-smoke.mjs` (production CSP, real
   Chromium; runs the full preview journey plus this block).
6. Re-check `free -h` before each heavy step; stop below 2 GiB available.
7. Record `RESULT.md` and `EVIDENCE.json` in this directory with exact commands, SHA,
   test counts, browser DOM output and the falsifier (the new readiness/recovery tests
   against the pin source fail because the note is missing), then commit for coordinator
   review. No push, merge, release, deploy or self-acceptance.

Full suite and all browser engines remain for the combined export.

## Decisions for the coordinator

1. **Amber note vs the theme comment.** `theme.ts:1` says amber is reserved for
   changed-since-run. The assignment explicitly approves a small amber note, so the
   recommendation is to leave the shared theme file untouched and accept this one
   documented exception. Updating the comment is a one-line option but touches a file
   outside this lane's owned surface.
2. **Candidate Recovery branch.** Recommendation: include the note there (it describes
   current design components even when the legacy recovery readout is refused). Candidate
   Flight gains nothing because it has no readiness area.
3. **Shared helper file.** Recommendation: add the small
   `src/console/shell/NoParachuteNote.tsx` so Flight readiness and Recovery cannot drift
   in wording, color or the type-only predicate. It contains no panel and no logic beyond
   `components.some(c => c.type === 'parachute')`.
4. **Staged drafts.** Recommendation: count only the committed current design, matching
   the existing readiness rule that staged airframe edits are not run inputs.

## What I need to proceed

Approval of this plan (or corrections to the four decisions above). On approval I implement
only the files listed here, run the validation above, and stop for coordinator review.
