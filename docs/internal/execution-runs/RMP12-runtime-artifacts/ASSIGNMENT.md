# RMP12 actual runtime artifact reproducibility — active assignment

Workspace/branch: `rmp12-runtime-artifacts`. Repinned activation base:
`9443d91b600f0762de6e166b97c54491f2f3dc62`. Candidate engine API is now
independently reviewed and integrated. First deliverable remains READ-ONLY;
no code edits or builds before proposal approval.

## Evidence and bounded goal

Read RMP12-knot-split/REVIEW.md and COORDINATOR-EVIDENCE.json. Recorded author WASM 68804608... differs from merged cf57158b... despite matching recorded source/lockfiles. Same-tree rebuild is stable; remap probes also differed. Cause is NOT established as path dependence. Binary SHA identities intentionally identify actual bytes. Native/WASM matched fixture comparison separately reports Euler singularity display differences; do not conflate that with build reproducibility.

Also read `RMP07-candidate-runtime/REVIEW.md` and COORDINATOR-EVIDENCE.json.
The subsequent runtime author artifact `307f585c…` differs from the coordinator's
`13da44d5a70af2bd4e8feee082f49277a4ce92e07fed97743d4d3aedf0022328`.
Both runtime invocations pass the bounded candidate parity checks; this does not
establish equivalent build inputs or byte reproducibility. Corrected checker
hashes and originals are retained separately. Raw evidence:
`../evidence-rmp07-candidate-runtime/` and `../evidence-rmp12-knot-split/`.
Compare actual build inputs and existing artifacts, not just recorded source
pins. Do not reproduce the prior premature conclusion of path dependence.

Determine the actual differing build inputs/compiler/linker/module sections and whether a source-preserving, maintainable reproducibility fix is warranted. Scope: scripts/build-engine.mjs and existing build configuration plus narrowly necessary artifact checks; no integrator, candidate model, physical equations, project schema or calibration-policy changes. Preserve all old artifacts/hashes and fit provenance. Rebuild-induced new hashes must be disclosed, never patched into historical evidence.

## Gate / acceptance

First deliver an evidence-based diagnosis and exact proposed fix/test contract. No remapping/stripping/flag change merely to obtain equal hashes without explaining what changed. Avoid public claims of cross-machine reproducibility from two paths on one host. If a fix changes offered output/identity semantics, stop at the coordinator decision gate. Only after approval, run controlled identical-source/lock/toolchain builds under at most two jobs, demonstrate actual runtime output/identity and report negative cases/remaining limits. Missing native platforms stay external; no tools/downloads or broad research benchmark.

## Shared operating contract

- Original preparation base `06952252ce937bdaabddbcc528ede8f3c6c427fd` is historical. Activation base is `9443d91b600f0762de6e166b97c54491f2f3dc62`. Confirm actual cwd, branch and HEAD in the first message.
- Author route: OMP direct `deepseek/deepseek-flash`, catalog name DeepSeek V4.1 Flash 1017, thinking `max`. No silent provider fallback.
- One running subagent across these lanes under the live host constraint. No subagents/reviewers spawned by the author. Check free memory before builds/browser work; below 2 GiB available stop. Compiler/test concurrency at most 2. Dedicated target directory per lane; stop temporary runtimes immediately.
- First delivery is a READ-ONLY scope/design proposal. No production edits, dependency installation, builds, tests, formatters or browser runs until coordinator approval. Writing this assignment/proposal is permitted.
- Read current global AGENTS, current TASKS routing, CONTROL-LOOP, DECISIONS and relevant packet/result/interface sections; preserve actual historical provider/effort in older records. Latest owner direct-provider/max instruction wins over stale routing prose.
- No physics/support/budget/default changes; no hidden fallback/blend, fixture retuning, relaxed assertions, manufactured measurements or historical identity rewrites. No protected outcomes, data acquisition, outreach, release, main merge, push or spending on new services.
- After approval: implement a coherent executable increment, reuse existing patterns; run affected final checks once after implementation, plus actual command/browser smoke on changed paths. Retain failed attempts. Deliver small local commits, RESULT/REVIEW-pending/EVIDENCE records with source/runtime/input hashes and exact limits. Do not self-accept.
- Coordinator exclusively owns acceptance-register.json, package manifest/index, TASKS and GOAL-HANDOFF. Do not edit them. Shared Rust/schema files have one owner; message coordinator before widening a lease.

