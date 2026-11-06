# Candidate app correction — supplementary coordinating review

Source inspected: correction `99f2a56` plus final source `59e5566`, records
`9c7982a509196263feea2de232a1a6539cb3c808`. **REQUEST CHANGES**, not integrated.
Native OpenAI coordinator, independent of DeepSeek author family. Findings below
are now independently exercised on the actual production-CSP built UI/parser.
No author is active at this review point; temporary parent server/browser stopped.

## F2b: unsupported ensemble action can release an active candidate admission

`src/console/store.ts:705-710` refuses a candidate ensemble by setting
`jobs.running: false`, even if a candidate run is currently preparing/executing.
It leaves the active runToken/candidateAbort intact. A subsequent Run can then
pass the busy check and supersede/overlap that still-active request.

LSP references show an actual reachable UI path: WSView.runMonteCarlo is called
by command-palette Run Monte Carlo · 100 flights, `Shell.tsx:293`, even under a
candidate selection. Hiding the Flight tab's ensemble panel does not guard this
shared action. The early refusal must preserve another active job's admission,
cancellation and busy state. Retain explicit unsupported-consumer refusal and no
legacy dispatch. Use the public action/actual command palette as the reproduction,
not a source-text test. Do not add retries or a new pool.

## F1 follow-through: retained archive self-consistency

The correction validates query state/flags versus finalState, but does not
compare the retained final sample's position/velocity/flags with those same
values. Also, the declared first/last/event/peak sample policy retains ALL
samples when sampleCount <=5000, yet the archive parser accepts fewer in that
case. Event-adjacency import check at candidateResult.ts:779-782 is guaranteed
by first=0/last=final and every event in [0,final]; it cannot itself establish
adjacent context was retained. Do not describe that check as stronger evidence
than it is.

Coordinator direct parser accepted the original actual result and both negative
variants. Actual current-schema export was then produced through the real built
app's save-file download fallback (native picker unavailable in headless context).
The 1.13 file contains one real candidate run,201 samples, actual invoked WASM
`da38461e247274f605b52abe06e71fad2c8eadbd76d55aa0ee31f069d0ce9ac6`.
Both actual malformed file imports were ACCEPTED with an Imported notification:
- retained final positionM[2] alone increased by 1m; finalState/query unchanged;
- rail-before sample at0.5300000000000002s omitted, leaving200 of201 below5000 cap.

Durable sibling evidence: `coordinator-correction-parser-probes.json`,
`coordinator-actual-saved-1.13.astraea.json`, negative files
`coordinator-saved-{final-sample,omitted-context}-tamper-1.13.astraea.json`,
`coordinator-malformed-actual-imports.json` and `coordinator-malformed-accepted.webp`.
These are intentional synthetic negative fixtures, not manufactured measurements;
original first-implementation evidence/files were not edited or relabelled.

Complete the already-requested final-state/flags/position/velocity and declared
retention-policy consistency. For decimated runs distinguish checkable metadata
from facts unavailable without the original unretained samples; no fake proof
or duplicated physics. Generated selection must really preserve event/peak context.

## Actual F2b runtime proof

Held delivery of exactly ONE genuine aggregate_mass Worker reply, unmodified,
on the normal2s/.01s request; did not enlarge requests or mock numeric outputs.
Before palette action Run was disabled and Cancel available. Selecting the real
palette's Run Monte Carlo displayed the correct refusal BUT re-enabled both Run
buttons while the first real reply remained held and removed Cancel. Another
actual Run admitted a second mass request and a real simulate_candidate call.
Released the exact first reply afterward; superseded token guard prevented its
later dispatch. Actual second run completed and displayed qualified current
candidate output. No legacy ensemble was dispatched. Receipt:
`coordinator-palette-admission.json`; actual served/recorded WASM same SHA above,
1827192bytes, exact production CSP. The partial first screenshot is retained as
partial, not full-size visual proof. Automation-only wait/global-observer errors
are disclosed in the receipt; no product/CSP failure is inferred from them.

## Unapproved envelope bump

Approved gate: project1.12/v3 over integration's1.11. Correction changed to1.13,
added an identity-only1.12->1.13 step and now rejects even the original compatible
1.12 candidate file (actual UI error observed). No scientific/schema reason or
prior gate for that additional bump was supplied. Comment claiming1.12 predates
candidate selection contradicts the lane's actual retained1.12 implementation.
Keep historical evidence intact. Prefer the original approved1.12 cutover with
strict corrected validation and legacy1.11 migration; remove the unnecessary
version/identity step and migrate every current caller/harness/record. If a real
changed-format contract requires1.13, explain its exact changed fields/semantics
and receive a coordinating gate BEFORE implementing more version changes. Do
not silently repin tests, erase prior receipts or call old candidate files
pre-candidate legacy. This is not owner escalation for routine version hygiene.

## Focused correction authorization

Same author/lane: fix F2b and F1 retained-state/policy contradictions, restore
approved envelope version absent an actual gated format change, update required
changelog/docs and retain original failures. No Rust/physics/default/IO-budget
changes, no new source acquisition. Add meaningful regressions, focused checks,
typecheck/build and actual production-CSP proof; final full suite as needed after
coherent edits, max2 jobs/offline/memory rules. Do not rerun these observed
failures merely to confirm them. Prove AFTER the fix, preserve open document on
malformed import and active busy/cancel identity on unsupported palette action.
Do not describe refused secondary consumers as temporary placeholders 'in this
increment'; state their actual unsupported selected-contract status. No new
feature/ensemble/solver is requested. Author cannot self-accept or change the
integration register/manifest/TASKS/handoff. Return exact small source/record
commits and durable receipts; parent continues the entire native goal.
