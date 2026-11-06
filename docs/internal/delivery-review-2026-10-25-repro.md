# Saved-input reproduction and engine provenance — 2026-10-25

Subsequent [current-source Linux embedded smoke](delivery-review-2026-10-25-native.md)
records fresh native compilation/runtime evidence for source `761d6c3` and its
remaining installer/platform limits.

Saved runs now retain immutable dispatch-time vehicle, effective motor curve and
provenance, launch options, calibration, fin-shear setting, and actual ensemble
seed/count/sigmas/sampler. Manual/forecast profiles are archived as context;
flight still consumes surface wind. Archives contain no recursive project history
or new raw-log copies. Project schema 1.6 migrates older files without fabricating
missing historical inputs or hashes. New files require a reader supporting 1.6.

Build's Saved runs panel compares historical summaries and explicitly loads saved
inputs. Loading does not run a simulation or promote a historical result to current.
Ordinary Run computes a fresh result using the current engine. Engine mismatches
and unknown identities limit attribution of historical differences to design edits.

Effective historical motor records are pinned by content. Restoring creates an
independent editable working record; import and curve-edit paths cannot overwrite
historical pins. Restoring weather preserves retained legacy references under
collision-safe content aliases. New captures include active weather context only,
so historical pins do not recursively accumulate inside each new run archive.
Full project exports can include prior sites/context/source metadata; the UI and
flight-bundle disclosure state that explicitly.

Runtime identity is the SHA-256 of the exact buffer compiled to WebAssembly.
One fetch supplies compilation and hashing; replacement workers share that module
and identity. Metadata is captured with the actual invocation, not inferred from
a later selected backend. Flight, ensemble and calibration records retain it.
Differing known ensemble engines are refused. Missing/rejected crypto remains
unknown. Legacy or test-mode records never acquire a fabricated production hash.

Independent source review and integrated checks identified and corrected matching-
input result resurrection, mutation paths to archived motor pins, dangling weather
references and stale ensemble job displays. Loading is undoable; redo detaches
current results again. Older summary-only cases cannot load invented inputs.

The full integrated frontend suite passes 111 files/1,397 tests. TypeScript and
production Vite build pass. Full Chromium production-CSP acceptance passed in 134.335 s, including exact
compiled-byte hashes, archived curves/options, Save/Open and an explicit fresh
WASM run after loading saved inputs. Overlapping focused test counts are not added
together. Earlier failed schema-fixture assertions and their corrections remain
in external evidence logs.

No Rust solver, numerical oracle, prediction equation, accuracy threshold or
protected flight outcome changed. Prior scientific discrepancies remain open.
These are reproducibility improvements, not collegiate accuracy qualification.
Current user direction remains primary flight planning as the goal, with possible
interim alongside-tool use depending on feasibility. New accuracy assignments
await discussion; no weaker 1.0 acceptance promise was inferred.

Source/evidence: /workspace/astraea-plan/evidence/engine-provenance-20261025/,
variant-archive-20261025/, and bootstrap/repro-*. Logs record the usage interruption
message “try again at 4:22 PM”; no timezone/reset availability was inferred.
Nothing was pushed, merged, published, deployed or sent externally.
