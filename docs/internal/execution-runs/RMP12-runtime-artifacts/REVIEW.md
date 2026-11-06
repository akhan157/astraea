# Independent artifact disposition — 2026-10-28

**ACCEPT the bounded diagnosis; no production build change.** Coordinating
OpenAI review is independent of the prior DeepSeek author. Author did not
self-accept. Source under experiment remains `9443d91`.

## Independent checks

Read ASSIGNMENT, PROPOSAL, complete external EXPERIMENT-RESULT and commands,
retained inspection implementation, residual section report and roadmap RMP12
requirements. Recomputed every SHA-256 in external INDEX.sha256: **535 entries,
zero mismatches**. Index SHA-256:
`f6d0ca8eb4840193f3f8139a0453d1fbb2389515c15bb0dfc755efb485949307`.
Executed retained read-only section comparison on the actual two remapped WASMs:
sections 1/3/4/5/6/7/11 equal; 9/10 unequal; data segments equal. No new build or
runtime run is claimed. Original commands/build failures and proposal remain
historical; rejected T3/T5/T7 proposals are not accepted requirements.

## Decision and rationale

Select **explicit actual-byte identities with honest root-dependent limits**.
Roadmap RMP12-C04 requires checked source/schema, actual invoked bytes and
same-input numerical precision, not identical bytes across arbitrary roots.
Existing engine-SHA binding and calibration mismatch refusal remain necessary.
Use the integration checkout for delivered builds and record exact source,
root/toolchain/dependencies/configuration and actual produced/fetched hashes.
Each distinct executable needs its own affected runtime receipt; shape equality
never transfers runtime evidence. No reproducible-build claim across roots,
hosts or toolchains is permitted from this experiment.

Remap-only is rejected as insufficient. Canonical staging/symlink/cache/lock
architecture is disproportionate to this requirement and not approved. No
future byte/identity-changing flags are approved here. If a guard is separately
justified, it must validate before destination replacement, preserving last-good
asset; empty inherited encoded flags cannot suppress a subsequently appended
remap. Existing script is unchanged; no new guard is claimed.

Reopen if a release requirement explicitly demands cross-root/toolchain byte
reproducibility, unexplained same-root instability appears, or actual runtime
agreement/source-to-asset binding fails. Owner chooses any new release promise;
coordinator reviews a minimal new experiment before changing build identity.

RMP12-C04 remains in progress: retained wind3 Euler-display failures, broader
configurations and qualification stay open. Register counts do not change.
No empirical/source/budget/platform/release prerequisite is waived. Historical
hashes, calibration provenance and missing artifacts are not rewritten.
