# What is still blocked, in plain language

59 of the 128 acceptance checks are blocked, and one more is a local slice not run yet. "Blocked" here means one specific
thing: the software side is finished, but the check needs an input, measurement or
authority decision that does not exist in this repository and that we must not
invent. None of these is a known bug, and none is waiting on more coding from us.

Three groups cover almost everything:

- **We would have to make up data.** Measured source tables, flight measurements,
  vendor files, an external comparator. Fabricating them would make the check pass
  on paper and worthless in reality.
- **We would have to make up a decision.** Release promise, signing keys, which
  claims to stand behind, which profile format the app should accept.
- **The check needs hardware or people we do not have here.** macOS installs,
  a hardware-GPU session, two independent team members, an independent
  scientific reviewer.

Each entry says what is missing, why the missing thing really blocks the check
(not just "nice to have"), and the smallest concrete step that would reopen it.

---

## RMP02 — using published aerodynamic source data (3 blocked)

**RMP02-C02 — Conventions.** *Needs:* the actual source pages/figures with their
axis, sign, reference-area and base-drag conventions. *Why:* "did we interpret the
source the way its author meant" cannot be answered from a summary; guesses are
exactly how sign and datum errors get in. *Unblock:* source custodian supplies the
original pages with rights, and an independent extraction reviewer signs the
convention table (which direction is positive, which area, which datum).

**RMP02-C03 — Extraction.** *Needs:* two independently read values from those
pages plus a resolution check. *Why:* one reading cannot detect a reading error;
there is nothing to compare against. *Unblock:* a second person reads the same
figures, both readings are recorded with crops, disagreements are either reconciled
or kept as an excluded case.

**RMP02-C04 — Near-zero behaviour.** *Needs:* the source's symbol definitions and
calibration near zero lift, plus its uncertainty. *Why:* at near-zero force the
relative error explodes; without absolute uncertainty any "it matches" verdict is
an artefact of division by almost zero. *Unblock:* source uncertainty envelopes
(absolute, not relative) for the small-coefficient region.

---

## RMP03 — vendor data import (5 blocked)

All five need the same missing object: **a real vendor export file we are allowed
to use**, with its producing version recorded.

**RMP03-C01 — Real schema.** *Why:* a parser validated against a file we typed
ourselves proves only that we can read our own file. *Unblock:* one vendor export
plus its documentation (headers, units, basis, datum).

**RMP03-C02 — Availability.** *Needs:* that file with some quantities removed.
*Why:* the point is to show "the file does not contain moment data, so the app says
unavailable instead of zero" — you cannot remove columns from a file you do not
have. *Unblock:* the real export, then delete the relevant columns.

**RMP03-C03 — Loads invariant.** *Needs:* the real wrench in the vendor's basis,
so it can be transformed to ours. *Why:* the algebra is ready, but there is no
source datum to transform. *Unblock:* real export with moment reference point.

**RMP03-C04 — Grid/domain.** *Needs:* a real export containing a grid, so
duplicate/unsorted/hole/outside cases exist naturally. *Why:* synthetic grids would
only test our own assumptions. *Unblock:* real export; then exercise its edges.

**RMP03-C05 — Identity.** *Needs:* the geometry/power/Reynolds/condition fields
that the vendor actually ships. *Why:* "stale data cannot be promoted" is only
meaningful against real identity metadata. *Unblock:* real export with its metadata.

---

## RMP04 — signed desktop update (5 blocked)

**RMP04-C01 — Guard.** *Needs:* a buildable desktop environment (WebKit
dependencies, updater source, bundler or an approved isolated image). *Why:* the
guard's whole job is to reject wrong targets; it cannot be executed if the app
cannot be built. *Unblock:* environment maintainer provides those prerequisites.

**RMP04-C02 — Consent.** *Needs:* a real signed B package and a running app to
click "Later". *Why:* the check is about behaviour before permission — that a
deferred update performs no fetch or mutation. *Unblock:* one signed A and B.

**RMP04-C03 — Actual apply.** *Needs:* signed A and B, an authorized signing key,
and a disposable machine. *Why:* it asserts the old process exits and a *different*
process reports the new version — only observable by installing. *Unblock:* owner
authorizes a disposable local apply and supplies the key scope.

**RMP04-C04 — Authenticity.** *Needs:* keys to deliberately misuse (wrong key,
tampered payload, signed-version rollback). *Why:* rejection cannot be shown
without something invalid to reject. *Unblock:* authorized test keys and artifacts.

**RMP04-C05 — Recovery.** *Needs:* an installed runtime where a failed write can be
injected safely. *Why:* injectable failure is the only way to observe recovery
without corrupting a real install. *Unblock:* that environment plus a documented
interruption method.

---

## RMP05 — real mission inputs and decisions (5 blocked)

**RMP05-C01 — Input fidelity.** *Needs:* the actual as-flown configuration,
mechanics, motor, guide, weather, recovery and sensor details, with rights.
*Why:* the check asks whether every input the mission needs is resolved or
explicitly blocked; there is no mission yet. *Unblock:* owner designates a case
owner who supplies those inputs.

**RMP05-C02 — Rights/custody.** *Needs:* an independent permission review and a
custodian declaration. *Why:* outcomes must stay sealed until permission exists;
the developer cannot grant it. *Unblock:* custodian signs scope and seals outcomes.

**RMP05-C03 — Decision budgets.** *Needs:* numeric thresholds per output, agreed
with a rationale. *Why:* "is the error acceptable" is a decision about the mission,
not something code can infer; blank forms are not thresholds. *Unblock:* owner
signs dated threshold records.

**RMP05-C04 — Independence.** *Needs:* the actual case set, so shared vehicles,
sensors and exposures can be audited. *Why:* dependency between cases can only be
assessed on real cases. *Unblock:* the case set (same as C01).

**RMP05-C05 — Readiness.** *Needs:* a completed freeze/readiness template with
sign-off. *Why:* only reviewed eligible inputs and agreed budgets may be promoted.
*Unblock:* complete and sign the template.

---

## RMP08 — aerodynamic coverage vs source (4 blocked)

**RMP08-C01 — Source match.** *Needs:* matched development data with the original
geometry, features, axes, references, Re, roll, power and base conventions.
*Why:* "our equations match the source" is unanswerable without the source's own
numbers. *Unblock:* source custodian plus scientific reviewer accept a bounded set.

**RMP08-C03 — Joint force/moment.** *Needs:* paired force **and** independent
moment data over the intended conditions, with uncertainty. *Why:* a CP that fits
while moments do not is exactly the failure this check exists to catch.
*Unblock:* paired measurement sets; CP-only agreement will not close it.

**RMP08-C07 — Development limits.** *Needs:* approved numerical budgets and the
development comparison set those budgets apply to. *Why:* "the residuals are small
enough" is meaningless without a stated "enough". *Unblock:* signed budgets from
RMP05/RMP12 owners.

**RMP08-C08 — Independent acceptance.** *Needs:* an independent scientific reviewer
for the selected material scope. *Why:* the author's own family cannot certify its
own physics; that is the rule this project set. *Unblock:* owner arranges the
review (same as RMP02/09 reviewers).

---

## RMP09 — mechanics and recovery configuration (4 blocked)

**RMP09-C03 — Guide event.** *Needs:* the actual guide/button geometry and the
observation rule for first rotational freedom. *Why:* without real button travel,
"left the rail" and "started rotating" are assumptions. *Unblock:* measured
geometry from the team's launcher.

**RMP09-C04 — Recovery sequence.** *Needs:* the actual trigger configuration and
latency, plus suspended-section data. *Why:* the single-body sequence is tested,
but trigger timing and independent sections are hardware facts. *Unblock:* the
team's recovery design and altimeter configuration.

**RMP09-C05 — Section energy.** *Needs:* per-section masses, suspension and
measured landing energy. *Why:* the current number is whole-vehicle; competition
scoring is per section. *Unblock:* measured section masses and impact data.

**RMP09-C07 — Measurement comparison.** *Needs:* eligible mass/CG, guide speed and
timing, recovery observations with uncertainty, plus budgets. *Why:* comparing our
model to reality needs reality. *Unblock:* measured flights with documented methods.

---

## RMP10 — claims about peaks, events and structure (3 blocked)

**RMP10-C03 — Peak evidence.** *Needs:* an approved resolution budget for
continuous peak magnitude/timing and independent refinement data. *Why:* the app
already refuses to call a sampled peak a continuous bound; promoting it needs the
budget that says how close is close enough. *Unblock:* signed peak budget.

**RMP10-C04 — Event agreement.** *Needs:* measured guide/button geometry,
altimeter trigger setup, mass/CG/inertia and terrain/datum. *Why:* the readouts
currently disclose their single-trigger and whole-vehicle scope; closing the check
requires the real configuration. *Unblock:* measured configuration from the team.

**RMP10-C05 — Structural scope.** *Needs:* material/joint/attachment evidence and
guided-recovery rule definitions. *Why:* stiffness, flutter and shock claims
cannot be bounded by software alone. *Unblock:* structural evidence plus rules.

---

## RMP11 — comparing against another simulator (5 blocked)

All five need **one lawful, pinned comparator** (an executable or API plus its
version, licence, and a dictionary that says which of its numbers mean the same as
ours). Every sub-check is about mapping, running and attributing that comparison,
so none can start without it.

- **C01 (Representability):** needs the comparator's field list to know what can be
  compared at all. *Unblock:* the quantity dictionary.
- **C02 (Wrench mapping):** needs its moment reference/datum to map forces and
  couples exactly once. *Unblock:* same, plus its sign conventions.
- **C03 (Synthetic trajectory):** needs to actually run it on a shared fixture.
  *Unblock:* licensed runtime access.
- **C04 (Attribution):** needs its results labelled separately from ours so no
  borrowed agreement becomes a native-accuracy claim. *Unblock:* a permitted case.
- **C05 (Residual honesty):** needs its clocks/peaks/failure records. *Unblock:*
  same comparator run with failures retained.

---

## RMP12 — numerical budgets (3 blocked)

**RMP12-C02 — Integrator/event.** *Needs:* owner-approved output numerical
allocations and independent reference/refinement data across the intended regimes.
*Why:* the integrator policy is approved and the attitude defect is fixed, but
"the remaining error is acceptable" is a budget decision. *Unblock:* signed budgets.

**RMP12-C03 — Interpolation/peaks.** *Needs:* approved interpolation/peak budgets
and whatever extra regimes those budgets define. *Why:* sample/event separation is
evidenced; adequate resolution cannot be declared without a target. *Unblock:* same
budget.

**RMP12-C06 — Budget conclusion.** *Needs:* the allocation signed by the owner/team.
*Why:* this check literally asks whether contributions are small enough for a
reserve that does not exist yet. *Unblock:* that signed reserve.

---

## RMP13 — uncertainty and prospective qualification (4 blocked)

**RMP13-C02 — Identifiability.** *Needs:* observations that can actually separate
the parameters being fitted. *Why:* fitting an unidentifiable parameter produces a
confident-looking number with no support. *Unblock:* independent observations.

**RMP13-C04 — No leakage.** *Needs:* a defined development/scoring split with
custody and an exposure ledger. *Why:* without a split there is nothing to enforce;
we did not touch any holdout, but "we did not" is not the same as "it is enforced".
*Unblock:* the split and ledger from the custodian.

**RMP13-C05 — Probability meaning.** *Needs:* supported input ranges/correlations
and eligible physical observations with budgets. *Why:* the ensemble is now
explicitly scenario-only; calling its percentages a landing probability needs
measured inputs. *Unblock:* that evidence.

**RMP13-C07 — Final freeze.** *Needs:* the signed freeze artifact (budgets, model,
discrepancy, sampling, metrics) agreed *before* unseen outcomes. *Why:* ordering is
the whole point; it cannot be reconstructed afterwards. *Unblock:* signed freeze.

---

## RMP14 — scoring against unseen outcomes (5 blocked)

All five need the same pipeline: **independently held outcomes + an authorized
release + a signed freeze + a custodian**. C01 checks the freeze is complete before
access, C02 the custody chronology, C03 the scorer on synthetic cases, C04 the
statistics, C05 that the scored identities still match the freeze. None can be
simulated locally without defeating the point (unseen outcomes are the one thing a
developer must not control). *Unblock:* owner authorizes release; custodian supplies
outcomes and scoring.

---

## RMP15 — interoperability with real files (1 blocked)

**RMP15-C04 — Interoperability with real files.** *Needs:* representative permitted
vendor/telemetry files with rights, units, time base, datum and configuration
provenance. *Why:* synthetic in-repo round trips are already covered; only real
files can prove unit/datum/geometry handling on real data. *Unblock:* same files as
RMP03.

---

## RMP16 — Windows/macOS acceptance (2 blocked, 3 pass)

Two checks pass from a real Windows 11 x64 run (`40cd9cf`; receipts in
`docs/internal/execution-runs/RMP16-platform-acceptance/`, independent review in
its `REVIEW.md`): the delivered source builds NSIS and MSI packages, both install
and uninstall, the installed app starts under the production CSP with a clean
startup trace, relaunches offline, saves and reopens the project through the
native dialogs, stores the local slot, and runs a simulation. C01 (artifact
identity), C02 (startup diagnosis, accepted on the packet's retained-gap limb) and
C05 (renderer-loss fallback plus the declared uninstall data policy and a
retention cycle) are recorded. The historical blank-WebView was not reproduced because that package
and the machine where it was seen are gone; that gap is retained, not papered
over.

What remains:
- **C03** needs an owner-authorized signed update (production key and feed);
  every other offered workflow is receipted.
- **C04** needs the same signed A/B artifacts and a controllable interruption.
- **C05** is recorded for the software-WebGL fallback and the uninstall data
  policy; a hardware-GPU driver reset was not tested.
macOS has no session at all. The Windows package is unsigned and is not a release
candidate. *Unblock:* owner signing authority (C03/C04); a hardware-GPU session or
a reviewed synthetic context-loss check plus the data-policy decision (C05); macOS
hardware.

---

## RMP19 — built-up aero model port (1 blocked, 9 pass, 1 not run)

Merged as a **hybrid beta**, off by default: `aero-buildup 1.1.0` is the
built-up method with Astraea's legacy total-drag override over Mach 0.80–1.20
(C1 weights summing to one, same sea-level reference atmosphere, component
breakdown withheld inside the band). Flight and Monte Carlo still refuse
pre-run until the flight path exists (1c).

Passing: TS↔Rust parity (216 points, worst 2.2e-16), hybrid panel/units with
truthful labels, identity and persistence (schema 1.13.0, version/term pairs,
defective-1b projects load but never execute), pre-run refusal, legacy
invariance, performance, no-vendor-assets, the engine-corpus gate (40 designs,
36,936 rows, worst 1.5535e-6, exact tier) and the user-facing provenance dialog
(self-contained, hash-addressable, with the four term classes and the six
unvalidated legacy constants).

Not run yet (local): the 1c flight coefficient path (C10). A candidate was
implemented and **failed the pre-registered 0.5 % gate** (24 of 27 single-stage
metrics above it; worst kinsel apogee 29.29 %; hybrid mean apogee 10.27 % vs
legacy 17.90 %). Attribution shows site/nozzle inputs do not explain the gap,
so no flight-model change was made; the candidate is not merged and the beta
stays panels-only. The owner (2026-11-01) kept the path held and authorized a
matched-state diagnostic to separate aero from solver; experimental enablement
was declined. The diagnostic found the coefficient model correct but the app
drops design inputs (surface finish, turbulence, fin airfoil/bevels/LE radius,
rail guides/lugs/shoe): with those inputs the method matches the engine to
0.001-0.456% per-flight mean CD, while the hybrid stays 0.09-6.86% and the
6-DOF/table replay difference stays 0.1-7.9% on 8/9 (mass/CG/thrust were not
independently measured). The input-plumbing fix is implemented on branch
`frontend/design` (typed inputs, project persistence, editor fields, and the
airfoil cross-section mapping to Subsonic NACA unless overridden); it is not yet
merged and would not by itself pass the end-to-end gate. The flight path remains
held. **Blocked:** default-on promotion — owner decision plus
held-out flights; the flight path itself now needs an owner-level acceptance
criterion or further model research, not a wider tolerance. Disclosed limitation: inside the band the hybrid uses the
legacy total, so the build-up base/protuberance/friction terms are overridden
there; C08 parity applies to the provider alone. Evidence:
`execution-runs/RMP19-aero-model-port/`.

---

## RMP17 — team usability (5 blocked)

All five need **two authorized collegiate team members** and an eligible case
package. C01 is one member rebuilding from supplied inputs; C02 a second
independent member reaching the same result without developer help; C03 whether
they interpret uncertainty and make a usable decision; C04 the save/reopen/compare/
export workflow surviving on a supported artifact; C05 the honest assistance ledger.
The developer cannot stand in for them, and a developer-run session does not count.
*Unblock:* owner arranges participation and access.

---

## RMP18 — release and rights (4 blocked)

**RMP18-C02 — Gate completeness.** *Needs:* the owner's product-promise decision
(which claims the release makes). *Why:* claims can only be traced to gates once
someone states the claims. *Unblock:* dated, scoped promise.

**RMP18-C03 — Rights/security boundary.** *Needs:* rights determinations for
material whose terms we cannot evidence: the NASA/TP-2002-211556 thermo subset
compiled into the engine, 8 shipped JavaScript packages with no installed licence
text, motor-curve provenance, and the 472-crate native closure. *Why:* the check is
"only authorized redistributable material ships" — we cannot assert that for
material whose terms we have not established. The local part is done: the private
path/URL log sink is gone, notices are generated and served (300,284 B), unresolved
items are named rather than asserted. *Unblock:* owner/source custodian records a
determination per item, or the item is removed.

**RMP18-C04 — Delivery coherence.** *Needs:* the owner version/channel decision and
a reviewed support/compatibility/migration draft. *Why:* promises must match real
platform and update behaviour, which RMP16 has demonstrated on Windows but not yet on macOS. *Unblock:*
that decision plus review.

**RMP18-C05 — Authority.** *Needs:* the owner's explicit final decision authorizing
release actions. *Why:* push, merge to main, tag, release, deploy, sign and feed
actions are owner-only; a readiness draft is not authority. *Unblock:* a dated
scoped decision.

---

## Fastest way to unblock the most

1. **One signed desktop update environment** (unblocks all of RMP04 and RMP16's
   mechanics, and RMP18-C04's platform half).
2. **One mission case from the team** with rights and thresholds (unblocks all of
   RMP05 and, with measurements, most of RMP09/RMP10/RMP13).
3. **One real vendor export** (unblocks all of RMP03 and RMP15-C04).
4. **One comparator** (unblocks all of RMP11).
5. **One budget sign-off** (RMP12-C02/C03/C06, RMP08-C07, RMP10-C03, RMP13-C05/07).
6. **One rights determination pass** (RMP18-C03, then C02/C05 with the owner
   decision).
7. **Two team members for a day** (all of RMP17).

---

## Status

**Locally completed engineering for the pre-port scope; not a qualified 1.0.**
Of 128 checks, 67 pass, 1 is reviewed not-applicable, 59 are blocked on named
external inputs, and 1 is a local slice not run yet (RMP19-C10 flight path 1c).
Every blocked check names its missing input, the responsible role and the
reopening condition; the independent reviews behind the passes are recorded in
the run evidence. The beta aero model is merged but off by default.

- **Source and records.** Branch `main` (the `continue-task` line is merged at
  `1246fda`); this document plus the run records under
  `docs/internal/execution-runs/`. The Windows platform receipt is the run
  `40cd9cf` / `40b01f9` / `e453985`, with raw artifacts and an independent review
  in `RMP16-platform-acceptance/`.
- **Current app build (0.9.0 beta).** Source `main` at `e2198ec` (+ docs). A
  production web bundle was built and the production-CSP journey passed: hybrid
  Aero panel, flight refusal while the beta is selected, provenance dialog,
  persistence, legacy run. The 0.9.0 Windows installer was rebuilt from this
  code (`67ebb49`, docs-only since) on 2026-11-02, installed and launched in the
  Windows 11 VM with the beta control and airfoil refusal visible (hashes and
  screenshots in `RMP16-platform-acceptance/raw/beta-rebuild-2026-11-02/`);
  it is unsigned and its updater signatures use a fixture key. The Linux
  desktop build lacks WebKitGTK. No release has been cut; 0.9.0 remains the
  unreleased beta.
- **Runnable build.** `pnpm build` builds the web bundle (engine WASM, `tsc`,
  Vite); `pnpm tauri build` builds the desktop packages. Exact commands and the
  toolchain are in the delivery record and in the Windows run's
  `raw/build-script.ps1`.
- **What is exercised.** The built app runs candidate and legacy journeys under
  the production CSP with the WASM engine (Linux production bundle and Windows
  installed package), saves/reopens projects and exports, and on Windows also
  installs/uninstalls both package formats, launches offline, and shows the
  renderer-loss fallback. The built-up aero model is an off-by-default,
  panels-only beta (hybrid, flight refuses pre-run); its provenance dialog and
  labels are browser-verified.
- **Why not 1.0.** The remaining 58 checks need measured/vendor data, approved
  numerical budgets, a licensed comparator, independent scientific/team
  reviews, rights determinations, signing/feed authority or macOS hardware.
  Supplying any of them reopens its checks; none can be manufactured locally.
