# First bounded accuracy batch — 2026-10-26

Source baseline `00e768b`; resumed from preserved interruption artifacts.
No production physics/defaults, publication, external contacts or protected
outcomes changed. The following closes individual preparation/check gates,
not primary-use flight accuracy.

- [P0 contract](P0-contract.md) is accepted **for design and bounded implementation
  of the proposed provider only**. [Independent review](P0-independent-review.md)
  verified its frame/wrench/source equations after two clarifications: wind
  differences between velocity-reference stations, and omitted fin-CP motion
  above approximately Mach 0.5. Existing projects retain the legacy provider.
- [Algebra report](P0-algebra-check.json): 5,214 scalar assertions over independent
  basis construction, exact identities and selected analytic fixtures pass.
  The executable is `scripts/diagnostics/verify-coefficient-contract.py`.
  These assertions do not execute production aero, serialized migration or
  every required implementation fixture.
- [D1 extraction](D1/README.md): six provisional CN/Cm readings at Mach 1.2,
  with original and independently frozen reader passes. Source and digitization
  uncertainty remain separate; two readers are not two physical experiments.
  Two first-reader nominal-zero picks were grid intersections and are explicitly
  excluded. Full geometry, CA/base corrections, scan skew/nearzero overlap,
  D-4014 extraction and convention checks remain open. No fitted slopes or
  model acceptance follow. A separately frozen subsonic slice is needed for
  comparison within SB1's initial candidate support; these Mach 1.2/1.5 records
  cannot qualify its Mach-below-0.8 baseline.
- [N1 numerical results](../diagnostics/N1-numerical-controls-2026-10-26.md):
  all 20 authorized native calls completed once after four full DTO parity
  passes. Tight integration moved apogee by at most 0.018692 m in these cases;
  event-root refinement is reported separately. Ninety retained analytic cases
  and 108 root checks passed. No solver/default changes or universal numerical
  error bound follow. The historical preparer-script hash discrepancy remains
  disclosed; the actual generated source was independently verified.
- [Updater plan](UP0/plan.md) and [native bridge result](UP1a/RESULT.md): one real
  native request received HTTP204 and startup reached the root-present milestone.
  No global-API defect was found. The fixture process was stopped deliberately;
  this is not normal app completion, update signature/install/relaunch or
  production feed acceptance. Production channel configuration remains unchanged.

[Adoption identity](adoption-record.json) records the reviewed candidate and the
status-only annotation separately. Primary OpenRocket PDF and large native
binaries remain outside Git under the recorded external evidence root. D1
images are public NASA report figures, with original source hashes and citations.

The updater fixture's debug-only loopback configuration was compiled separately;
its immutable binary remains in external evidence. The coordinator restored the
shared native target to the verified original executable after the check, using
an atomic replacement. Cargo fingerprints were not edited: a future build must
use its intended Tauri configuration and verify its actual artifact identity.

Next: A1 implementation against P0 with independent review, D1 geometry/coefficient
qualification, and E1/T1 interfaces. Subsequent updater work covers controlled
offers/signatures/application/relaunch and stable/preview channel behavior.
Independent as-flown inputs, decision budgets, flight evidence, real platform
workflows and team reproduction remain necessary for collegiate primary use.
