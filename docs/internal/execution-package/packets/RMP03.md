# RMP03 — T1b — source-specific imports and sparse capabilities

## Purpose/status

Source-profile/prerequisite inspection independently reviewed at `689c111`;
[findings](../../execution-runs/RMP03-RMP04-prerequisites/RESULT.md).
Actual vendor export/schema unavailable in inspected fixtures; C01 blocked,
C02–C05 not newly run. No parser was invented from documentation, and no
complete-load, physical or product qualification follows. Generic early contract
work remains possible; actual source-specific implementation stays parked.

## Prerequisites (closure versus early work)

- Early work can define capability distinctions and synthetic conversion fixtures against P0/T1a.
- Closure requires a lawfully available actual export and independently reviewed source-specific headers, units and conventions.
- Coordinate flight integration with RMP01 and project/model identities with RMP07; parsing can remain in separate modules.

## Required reading

- STOP/migration handoff (private coordination notes)
- [Full roadmap](../../roadmap-to-collegiate-1.0-2026-10-26.md)
- Model routing (private coordination notes)
- [Existing T1a schema/boundary](../../accuracy-program/diagnostics/T1a-supplied-static-table-diagnostic-2026-10-26.md)
- [P0 frame/wrench contract](../../accuracy-program/first-batch-2026-10-26/P0-contract.md)
- [Vendor/API findings](../../accuracy-program/execution-2026-10-25/alternative-paths.md)
- [Comparison input contract](../../accuracy-program/comparison-input-contract-v0.1.md)

## Files owned/prohibited/shared leases

- CREATE `crates/astraea-engine/src/aero_import/` and adjacent focused fixtures after source format selection; proposed paths, not existing APIs.
- Existing `crates/astraea-engine/src/supplied_aero.rs` is a shared lease with RMP01; retain strict complete-static semantics.
- Shared leases: `commands.rs`, `lib.rs`, model DTOs and frontend formats require coordinator sequencing; do not edit production WASM/defaults.
- All proposed CREATE paths require dispatch-time existence/ownership check; preserve unrelated dirty work and negotiate shared edits sequentially.

## Frozen decisions

- RASAero AeroPlots documentation shows CA/CN/CL/CD powered/off quantities; actual CSV schema and independent Cm export remain unverified.
- RocketPy GenericSurface `cn` is yaw moment; RASAero `CN` is normal force. Never case-fold these into the same quantity.
- T1a accepts complete canonical total CF/CM at fixed conditions; sparse CD is a partial capability, not a complete-load table.
- Missing moments/rates/axes remain unavailable; no zero-fill, moment from Cd/CP or implicit body-drag addition.

## Ordered implementation/review substeps and commit boundaries

1. Commit 1: write source-profile evidence table using actual export/manual/version; record unknown headers rather than inventing CSV.
2. On an available lawful vendor runtime, generate a synthetic export and retain executable/input/output hashes and visible/exported comparison.
3. Commit 2: implement parser in a source-specific module with exact header/version/units rejection and original-byte hash retention.
4. Implement explicit sparse capability metadata separately from complete T1a tables; distinguish drag-only, static force and independent full moment.
5. Commit 3: implement reviewed basis/reference/datum mapping; exercise signed nonzero vectors and pure couple fixtures.
6. Represent only supported dimensions; add Re/roll/beta/power axes only when source evidence and interpolation rules exist.
7. Commit 4: malformed/domain/identity fixtures and source reviewer corrections; no live flight activation in parser commit.
8. Integrate shared DTO/command registrations sequentially after independent convention review; hand off supported capabilities and gaps.

## Input/output contracts and source fields

- Input: original export bytes/hash, source tool/version, rights, geometry identity, options and actual field dictionary.
- Record each quantity definition, coordinate basis/sign, dimensionality, S/L, datum, alpha/beta units, Mach/Re, roll/rates and powered/base conditions.
- Output: normalized quantities with source lineage, availability/reason, qualified grid and interpolation/out-of-domain policy.
- Complete total static route requires every CF/CM component at every supported node; partial route cannot claim load/trajectory support.
- T1a existing schema uses `machAxis`, `alphaRadAxis`, `nodes`, fixedConditions, explicit identities and reject-outside-grid.

## Acceptance checks

| ID | Mechanism | Pass condition | Evidence |
| --- | --- | --- | --- |
| RMP03-C01 (Real schema) | compare parser against preserved actual export and documentation | all accepted headers/units evidenced; unknown/malformed fields reject | source profile and fixture hashes |
| RMP03-C02 (Availability) | remove Cm/rate/force components from fixtures | capability becomes unavailable or complete-table request rejects; no zeros fabricated | negative fixtures/results |
| RMP03-C03 (Loads invariant) | transform basis/S/L and translate moment datum | same dimensional wrench under both descriptions, including zero-force couple | independent algebra review |
| RMP03-C04 (Grid/domain) | exercise duplicate/unsorted/hole and edge/outside requests | malformed grids reject; no hidden clamping/extrapolation/fallback | boundary result matrix |
| RMP03-C05 (Identity) | change geometry/power/Re/conditions | stale or mismatched data cannot promote to complete-load use | identity rejection evidence |

## Negative/failure cases

- Do not infer a vendor format from an illustrative schema in an architectural note. No actual CSV was generated by that note.
- This packet does not reconstruct missing moments from CN-plus-CP. Retain missing independent moment data as unavailable and preserve only supported partial capabilities; any future reconstruction requires a separate scope/review.

## Exact permitted checks or required prerequisites

- Future prerequisite: locked Rust tools/dependencies actually present on the new host and synthetic fixtures contain no protected outcomes.
- Existing bounded regression: `cargo test --offline --locked --manifest-path crates/astraea-engine/Cargo.toml --test supplied_aero_diagnostic` (one Cargo job).
- New adapter tests need to be authored and named after selecting the real format; no nonexistent named suite is a runnable acceptance command.
- Do not invoke historical `/workspace/astraea-plan/env.sh`; configure declared toolchain and isolated target on the new host.
- Commands above are future resumed-work checks unless explicitly read-only packaging checks; this package records no new executions.

## Evidence to save

- Save original-format rights/availability record, field/convention matrix, parser fixture hashes and capability results.
- Save conversion derivation, rejection cases, exact commands/tool/source identities and independent review.
- Record pinned base, owner/model/effort, exact commands/exit status, source/input/artifact hashes, review disposition, limitations and next action.
- Historical external logs/binaries may be unavailable; identify missing artifacts honestly and never count retained hashes as fresh execution.

## Escalation/stop decisions

- If independent Cm or required axes are absent, deliver honest partial adapter and mark complete-load integration blocked.
- Escalate ambiguous basis/datum or licensing; do not fetch runtime/dependencies or distribute vendor files without authority.
- Preserve defaults/main and stopped automation; no external contact, holdout access, paid/remote operation or publication is implied.

## Successor/ready-made agent assignment prompt

RMP01/RMP06 integrate approved provider capabilities; RMP11 uses normalized source exports.

> Build bounded source-specific normalization from an actual permitted export. Keep sparse quantities unavailable, distinguish RocketPy cn from RASAero CN, preserve T1a complete-load rejection. Own new parser modules; negotiate shared DTO leases and deliver conversion/rejection evidence.
> Before work pin current integration base, inspect dirty state/active runs, name exact leases and resource budget, and retain completed evidence. Independent material-science/convention review is required where applicable.
