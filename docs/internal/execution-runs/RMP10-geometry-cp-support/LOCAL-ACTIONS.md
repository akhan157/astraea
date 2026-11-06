# Blocked checks — what I can do from here

Companion to `BLOCKERS.md` (what/why). This file answers a narrower question: for
each blocked check, what can *this* lane still deliver without the missing data or
authority, and what genuinely has to come from someone else.

Three honest categories:

- **I can close it** — the block is our own design choice, not missing evidence.
- **I can shrink it** — I can build the receiver (worksheet, schema, script) so
  acceptance becomes mechanical when the input arrives, or reduce the ask.
- **Only others can** — the check is a measurement, a signature, an install or a
  decision by a named role; anything I produce would be fabrication or theatre.

| Check | What I can do from here | What still has to come from someone else |
| --- | --- | --- |
| RMP02-C02 | Build the convention worksheet (axis/sign/area/datum/base table) and a two-reading diff tool that flags any disagreement between readings before a value is used. | The source pages themselves, with rights, and a signed convention table. |
| RMP02-C03 | Same tool: it records two independent readings plus crops and refuses a single-reading case. | A second independent reading of those pages. |
| RMP02-C04 | Extend the worksheet with absolute-uncertainty columns and a refusal when an uncertainty envelope is missing; the near-zero logic is already exercised. | The source's absolute uncertainty and near-zero symbol definitions. |
| RMP03-C01 | Write the vendor-conformance runner *shell*: it takes a file, prints parser/availability/identity/grid results, and fails closed. Cannot validate it against a format we have never seen, so it stays unverified until a file exists. | One real, licensed vendor export with its producer version and docs. |
| RMP03-C02 | Provide the exact column-removal recipe the runner will apply once the format is known. | The real export. |
| RMP03-C03 | Provide the basis/S/L/datum transform worksheet with worked algebra (already derived); needs real numbers plugged in. | The vendor's actual wrench and datum. |
| RMP03-C04 | Provide the grid/domain probe list the runner will execute. | A real export containing a grid. |
| RMP03-C05 | Provide the identity-field checklist. | Real identity metadata. |
| RMP04-C01 | Write the exact disposable-machine script (identity/version/path/key combinations, expected rejections) so an operator only runs it. | A buildable desktop environment (WebKit, updater source, bundler/image). |
| RMP04-C02 | Write the consent observation protocol (what to click, which requests must not appear). | Signed A/B and a running app. |
| RMP04-C03 | Write the PID/version/package-hash capture script. | Authorized signing key and a disposable machine. |
| RMP04-C04 | Write the negative-key matrix (wrong key, tamper, rollback). | Test keys and artifacts to misuse. |
| RMP04-C05 | Write the interruption/restore protocol. | An installed runtime where failure can be injected safely. |
| RMP05-C01 | Turn the blank input form into a validating schema that refuses incomplete/inconsistent records, so data entry cannot silently produce an eligible-looking case. | The actual mission inputs and rights. |
| RMP05-C02 | Draft the custody declaration template and the sealed-outcome handling rules. | An independent permission review and a custodian signature. |
| RMP05-C03 | Draft the threshold record template with the rationale fields the owner signs. | The numeric thresholds and the owner's signature. |
| RMP05-C04 | Provide the dependency/exposure ledger format and an auditor checklist. | The real case set to audit. |
| RMP05-C05 | Produce the readiness matrix skeleton with every required sign-off slot. | Completed inputs, budgets and sign-offs. |
| RMP08-C01 | Provide the source-match worksheet (geometry/features/axes/refs/Re/roll/power/base) and a comparison script for a tabulated source. | The matched source data and a scientific reviewer's acceptance. |
| RMP08-C03 | Provide the paired force/moment comparison harness and the rejection rule ("CP-only cannot pass"). | Paired source measurements with uncertainty. |
| RMP08-C07 | **Produce the budget worksheet with the numbers we already have** (rail timing 3.28 µs vs 100 µs reserve, 0.15 mm / 9.3e-5 m/s position/velocity deltas, native/WASM 2.6e-16–1.4e-14 scaled) so a signer sees real contributions, not placeholders. | Signed development/numerical budgets. |
| RMP08-C08 | Assemble the review package (scope, claims, evidence index) so a reviewer spends time judging, not searching. | An independent scientific reviewer's verdict. |
| RMP09-C03 | Provide the guide/button geometry intake schema and the first-rotation event definition checklist. | Measured launcher geometry and the observation rule. |
| RMP09-C04 | Provide the recovery-configuration intake schema (trigger, latency, sections) and extend tests to the documented cases once known. | The actual altimeter/trigger configuration and suspended sections. |
| RMP09-C05 | Provide the per-section mass/energy worksheet. | Measured section masses and impact energy. |
| RMP09-C07 | Provide the measurement-comparison template (method, uncertainty, event definition per observation). | Eligible measured flights and budgets. |
| RMP10-C03 | **Produce the peak-budget worksheet** from the measured evidence already on file (53 Pa off-grid undershoot, unbounded narrow-peak miss at 1e3/1e6/1e9 Pa, 0.4 Pa rounding overshoot) so a resolution budget can be signed against actual misses. | The approved continuous-peak budget and independent refinement data. |
| RMP10-C04 | Provide the event-definition intake schema (button travel, altimeter trigger, mass/CG/inertia, terrain/datum) and the unit/definition audit we *can* do locally. | The measured configuration. |
| RMP10-C05 | Provide the structural-evidence worksheet and the claim/limit map per material and joint. | Material/joint/attachment evidence and recovery-rule definitions. |
| RMP11-C01…C05 | Write the comparator intake sheet: required version/licence, the quantity dictionary template, the exact-sign/ordering rules and the attribution labels. Every sub-check then becomes mechanical. | Lawful access to one pinned comparator and a permitted case. |
| RMP12-C02 | **Produce the error-contribution worksheet** with the measured rail/attitude/parity numbers and the budget slots a signer fills. | Owner-approved output allocations and broader independent reference data. |
| RMP12-C03 | Same worksheet with the interpolation/peak contributions already measured; state exactly which configurations a budget must cover. | The signed interpolation/peak budget. |
| RMP12-C06 | Assemble the conclusion template so the reserve arithmetic is visible the moment a budget exists. | The owner/team allocation. |
| RMP13-C02 | Run an identifiability analysis on the delivered fit (one global Cd scale from one coast window) and record which parameters are resolvable and which would need extra observations; refuse multi-parameter fits as unsupported. | Identifiable observations for any richer fit. |
| RMP13-C04 | Produce the exposure ledger and access-log format, and record the verifiable fact that no holdout or scoring data was accessed here. | A defined development/scoring split with custody. |
| RMP13-C05 | Keep the ensemble copy scenario-only (done) and provide the probability-claim worksheet mapping each proposed claim to its evidence. | Supported input ranges/correlations, observations and budgets. |
| RMP13-C07 | Produce the freeze checklist with every artifact slot and the ordering rule (freeze before access). | The signed freeze artifact. |
| RMP14-C01…C05 | Produce the freeze checklist, custody chronology template, scorer test-case list (boundary/failure/unscorable) and the identity-diff procedure. The scorer itself does not exist yet, so I cannot run it. | Independent outcomes, authorized release, a custodian and an agreed statistical protocol. |
| RMP15-C01 | **Delivered.** The app imports a prepared E1 environment selection, validates it strictly, dispatches the documented envelope, archives it verbatim, records the profile provenance and restores it from a saved case; refusals cover retained wind, altitude mismatch and malformed files. | Nothing further for this check. |
| RMP15-C04 | Provide the import-intake checklist (units, time base, datum, configuration provenance) and extend the round-trip test as soon as a permitted file exists. | Representative permitted vendor/telemetry files. |
| RMP16-C01 | **Delivered** (40cd9cf): source manifest, NSIS/MSI hashes, install and uninstall manifests on Windows 11 x64. | Nothing further for this check. |
| RMP16-C02 | **Delivered** (RETENTION limb): instrumented startup trace and smoke on the built package; historical 2f28c65 gap retained. | The preserved 2f28c65 package and the original observation machine, if the historical cause is ever wanted. |
| RMP16-C03 | **Executed locally**: NSIS+MSI install/uninstall, offline relaunch, native save/open, slot save, real run. | Owner-authorized signed update artifacts with the production key and feed. |
| RMP16-C04 | The update/recovery script exists (RMP04). | Signed A/B artifacts and feed authority. |
| RMP16-C05 | Uninstall receipted for program files and registry; still write the data-policy and context-loss checks. | Declared uninstall data policy + post-uninstall retention check, and a hardware-GPU or reviewed synthetic context-loss check. |
| RMP17-C01…C05 | Write the session protocol, manifest, rubric and assistance ledger so members can run independently without developer improvisation. | Two authorized team members and an eligible case package. |
| RMP18-C02 | **Produce the claims→gates matrix** (each claim, its current gate status, what would qualify it) so your promise decision is a choice among labelled options. | Your product-promise decision. |
| RMP18-C03 | Done: the log sink is gone, notices are generated and served, and the package audit now records that 7 of the 8 unlicensed packages are not distributed while `@react-three/fiber` (declared MIT, author named) is. | Rights determinations for the compiled-in NASA CEA subset and the shipped fiber notice text; the unpublished native closure enumeration. |
| RMP18-C04 | Draft the version/channel/support/migration document with the real evidence status. | Your version/channel decision and its review. |
| RMP18-C05 | Provide the final action checklist (what would be pushed/tagged/signed and with which identities). | Your explicit authorization. |

## The block that was ours, not theirs: RMP15-C01 — delivered

The engine already dispatched a documented E1 profile envelope; the app had no
way to accept one. That is now implemented (commit `0aa473f`):

- **Input**: a JSON file with exactly the engine's `environmentSelection`
  (`launchTimeUtcUnixS`, `launchAltitudeGeometricMslM`, `verticalDatumIdentity`,
  and the typed profile). Strictly validated; the engine remains the authority on
  coverage and values.
- **Behaviour**: the panel shows source identity, validity window, datum and knot
  count; the run takes its pad altitude from the declaration and requires 0 m/s
  surface wind (refused with a reason otherwise); the envelope is archived
  verbatim; the profile report schema is accepted; changing or clearing the
  selection marks the result stale without dispatching.
- **Proof**: unit tests for the refusal matrix, envelope mismatch, archive
  tampering, dispatch and freshness; a real engine-authored 1 MB profile report
  parsed by an uncommitted probe; a production-CSP journey that imports, runs,
  clears, re-imports, saves, reopens and reloads the selection with the executed
  WASM equal to the served asset.

## What I would not do, and why

I will not fabricate sensor data, source pages, vendor exports, budgets or
sign-off; will not sign a release decision on your behalf; will not call an
unverified format "supported"; and will not mark a check PASS because the
remaining path is inconvenient. Those are the four ways this kind of register
usually goes wrong.
