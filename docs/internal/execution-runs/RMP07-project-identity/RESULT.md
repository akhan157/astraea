# RMP07b — accepted legacy project selection and versioned model-bound archives

Base `acd5b97569db7ca01a91c01b80796c2bac0654e5`; source
`db169e1f6d3e2d3eca9f1c3f26904a1ff746cc3c`. Existing intended branch/worktree
preserved; no other worktree moved or reset. This extends the existing roadmap,
not a new product promise or activation of the native candidate.

## Delivered

- Project schema **1.7.0** supports a strict optional `flightModel` descriptor.
  Only the exact current legacy model/environment/mechanics/global scale policy
  is accepted. Newly assembled projects pin it explicitly; old/no-selection
  projects remain legacy without invented historical metadata.
- New dispatch captures use **archive version2** with an immutable model
  selection. Historical version1 archives remain version1 and retain original
  inputs, summaries and known/unknown invocation identities. Version2 missing
  provenance and version1 with injected selection are refused, not normalized
  into a convenient legacy result.
- Unknown/candidate/model/environment/policy/source fields are refused before
  file/storage replacement or capture. Selection-bearing bare or nested vehicles
  are refused before vehicle normalization can silently drop the declaration.
  Ordinary no-selection bare vehicles remain supported.
- Saved-input loading restores the archive's version2 selection, or absence for
  version1, rather than inheriting today's selection. Motor pins, weather,
  calibration and undo/redo preservation remain intact. Implicit and explicit
  legacy inputs retain the same existing freshness keys and runtime values.
- This descriptor names a selected contract, **not** an executable checksum,
  cryptographic input identity, source eligibility or physical qualification.
  Actual invoked-buffer `EngineIdentity` remains separate. RMP07a native bit
  identities/replay are not mislabeled as app runs.

## Fresh checks

**236 tests pass across 15 affected files**, covering model/archive/schema,
project storage and IO, stale saves, concurrent/pending work, saved-run restore,
undo/redo, motor history, worker identity and the generated WASM engine. This is
an affected suite, not a claim to have rerun all frontend/scientific tests.
TypeScript passes; the production Vite build passes.

The missing generated legacy WASM was intentionally rebuilt from the unchanged
current engine/core source with two Cargo jobs, then used by the built site.
Actual source asset and built asset SHA256:
`b971b222d7e3df8c10ff268a3a540effc847adc209b6e52b8d5a0b2b08898337`.
This is the **new measured local artifact**, not the old historical checksum.
No engine/core source, physical equation, default, native-candidate dispatch or
dependency lock changed in this increment. No artifact was published/deployed.

A bounded real **Chromium156.0.8078.4** journey under the exact built production
CSP passed using the shipped synthetic preset only, no mocked app/store/engine:
new explicit model capture; Save/reload/Open/rerun; unsupported versioned and
bare-file refusals preserve project; synthetic1.6/version1 migration; saved-input
loading; fresh version2 run without rewriting version1 history. Both fetched
WASM hashes and case invocation hashes match the actual new asset. No runtime
page errors or outgoing external requests occurred. No older broad calibration/
empirical browser journey was run; only its now-stale schema assertion was updated.
Linux fallback Chromium is not Windows/macOS/native installer/team acceptance.

Independent source review initially found the bare-vehicle normalization bypass;
it was fixed, tested and re-reviewed **ACCEPT**. [Review](REVIEW.md) preserves
both dispositions. Runtime/build assertions were executed by the coordinator;
reviewer did not independently rerun them.

## Acceptance and remaining gates

- **RMP07-C02 PASS:** old/no-provider project and archive behavior remains legacy;
  Save/Open/reopen and migration do not regenerate historical predictions.
- C01 remains in_progress: native content identity from RMP07a is retained;
  the complete future app/provider content-key contract is not closed here.
- C03/C05/C06/C08 in_progress: current legacy calibration non-leak/refusal,
  persistence/failure and actual built-runtime boundaries have bounded evidence;
  complete candidate/source/environment integration and journeys remain open.
- C04/C07 remain not_run for new candidate consumer/status exposure. No candidate
  query/plot/worker/ensemble selection UI was introduced. A future opt-in path
  still needs common effective provider/source/environment identity, inactive
  incompatible calibration and honest domain/completion/qualification display.
- RMP12's provisional coarse-rail diagnostic failure remains failed. This was
  not a rerun of its nine-attempt experiment or new numerical/empirical accuracy
  qualification. RMP03 actual vendor sources and RMP06 local axial startup/source
  coverage remain independent dependencies, not guessed schemas/physics.

## Retained failures, availability and resources

The first browser attempt waited for a status row that exists only inside a
closed menu. The app had successfully imported the synthetic old project; the
checker was corrected to await its visible import disclosure, not to weaken a
product check. The initial source-review bypass finding and corrective rework
are retained. All failed/passing logs are local and inventoried.

Dependency setup reused 280 packages offline with lifecycle scripts disabled.
pnpm unexpectedly added executable-manager metadata despite frozen install;
only those task-created additions were precisely removed and the lock is byte-
unchanged. The locally required Playwright headless shell/FFmpeg were downloaded;
no system installer, running user browser/profile or credentials were touched.

Portable: [EVIDENCE](EVIDENCE.json), [browser checks](browser-checks.json), source,
synthetic fixtures/checker/tests, assignment and review. Full synthetic project
snapshots, reviewer transcripts and raw logs stay outside Git at
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp07-project-identity/`; generated
node_modules/WASM/dist and browser binaries are local, not committed. About
10GiB available RAM was checked before heavy work. Cargo/test/build concurrency
was capped at two; reviewers were serial. Every task browser/server/reviewer/
build ended; the lease is released. Only untracked `.pi/` goal state remains.

## Next concrete work

Continue existing RMP07 calibration/provenance compatibility and visible model
status, preserving legacy behavior and old artifacts. Read the current fit/
engine/source/selection contracts before changing application of any scale;
new candidate runtime exposure remains separately gated. Do not infer that
missing team data blocks all product engineering, nor that software tests
establish real-flight accuracy. Existing owner boundaries remain: no push,
release/deployment, paid capacity, outreach, protected outcomes or automation
restart. The Version 1 goal and original 18 packets remain active and unfinished.
