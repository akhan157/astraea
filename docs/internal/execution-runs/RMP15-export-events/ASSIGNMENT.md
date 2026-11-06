# RMP15e — recorded events and terminal state in exports

Goal increment 7/10. Base ddd475131ced4b5ffd141cbbbca3cd72426aef61; owner openai-codex/gpt-6.1-sol. Continue existing RMP15-C01 / RMP10-C06, no acceptance promotion.

## Observed gap and change

Build traces omit the committed run's event timeline and terminal state. Its KML preview checks current/valid/telemetry but not nominal touchdown, then labels the final telemetry location as a landing. Retain the exact recorded timeline and termination/nominal flags in the trace; require explicit recorded nominal touchdown for the existing landing KML export, both before review and at snapshot serialization. Do not rerun or reconstruct historical events when inputs change.

## Lease and boundaries

src/console/stages/Build.tsx, buildExport.test.tsx, CHANGELOG.md; this records directory, coordination TASKS.md and affected package progress records. Existing trace schema remains additive; project schema/physics/native bytes/defaults unchanged. Local ENU KML is an existing un-georeferenced interchange contract, not globe coordinates; this increment does not qualify or redesign georeferencing. No raw protected flight outcomes or RMP12 numerical studies.

## Acceptance and verification

- Trace retains actual recorded events, including derived sampled-Max-Q provenance, and termination/landing state on the reviewed snapshot after later edits.
- No touchdown export for timeout, abnormal landing or missing terminal evidence. Nominal current valid runs remain exportable; stale/invalid/no-telemetry refusals remain.
- Red/green consumer regressions for terminal-state refusal; exact-event copying is proved by a throwaway actual built-browser downloaded-trace witness, not a permanent forwarding test.
- Affected vitest (maxWorkers=2), tsc, Vite and bounded browser smoke; independent serial MiMo medium no-tools review. Resources: check free memory; no more than two compiler/test workers. No push or release.
- Evidence outside Git: sibling evidence-rmp15-export-events/. All failed attempts retained. Record source SHA and review before accepting increment.
