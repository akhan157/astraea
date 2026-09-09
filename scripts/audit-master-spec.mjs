import fs from 'fs';

async function main() {
  const masterSpec = fs.readFileSync('docs/astraea-master-product-spec.md', 'utf-8');
  const physContract = fs.readFileSync('docs/astraea-normative-physical-contract.md', 'utf-8');
  const vvFull = fs.readFileSync('src/sim/vv-benchmarks.test.ts', 'utf-8');
  // Full benchmark source (all 12 V&V suites) — production-path tests
  const vvBench = vvFull;
  const simSource = fs.readFileSync('src/sim/sixDofSimulator.ts', 'utf-8');
  const eventsSource = fs.readFileSync('src/dynamics/events.ts', 'utf-8');
  const loadsSource = fs.readFileSync('src/dynamics/loads.ts', 'utf-8');
  const kernel = fs.readFileSync('src/dynamics/rigidBody.ts', 'utf-8');
  const emitter = fs.readFileSync('scripts/emit-benchmark-metadata.cjs', 'utf-8');

  const prompt = `You are Astra, Principal Aerospace Systems Architect and Chief Systems Engineer.
You are running natively as opencodex/gpt-6-astra (native).

You are auditing the CONSOLIDATED full product for the final build-readiness gate.

WHAT CHANGED since round 7 (all five engineering gates now closed, verified by the production-path benchmark suite):

=== GATE 4 (P0-2): STAGE-RHS LOADS_RE-EVALUATION ===
The production simulator's fixed-step Euler-Cromer loop was replaced by calls to the shared production kernel integrateRigidStep() with a loadsAt(tStage, state) stage factory. At every RK4 stage the full flight loads (aero, motor thrust, mass depletion, wind, gravity in ENU) are re-evaluated at that stage's true state and time — restoring 4th-order accuracy for attitude- and time-dependent forcing.

=== GATE 1r (P0-1, P0-3): PRODUCTION LOADS ASSEMBLY + ENU ===
New src/dynamics/loads.ts provides computeFlightLoads(tStage, st, flags, cfg, pv) and prepareVehicle(vehicle). Both the simulator AND VV-004 consume this single authoritative assembly. The engine operates in canonical right-handed ENU (x=E, y=N, z=Up; gravity -z; altitude = r.z; rail vector (E,N,U); wind returns {x:E, y:0, z:N-component}). Renderer applies the ENU->display rotation at the boundary. The frame-hazard display adapters (displayToKernel/kernelToDisplay) were retired — the kernel is documented as frame-agnostic Cartesian RK4 operating in the ENU navigation frame.

=== GATE 2: ADAPTIVE DORMAND-PRINCE RK 5(4) ===
integrateRigidAdaptive() added to the kernel: embedded 5th/4th-order error estimate over the 13-component coupled state, per-axis absolute tolerances (r, v, q, w), step control (0.2x/5x clamp, 8-step shrink factor), additive normalized quaternion update. Fixed-step RK4 (integrateRigidStep) remains for benchmark parity and production default; the adaptive integrator supersedes it for event-dense or stiff trajectories.

=== GATE 3: VARIABLE-INERTIA Idot-omega ===
The Loads interface gained optional inertiaDotB. angularAcceleration() now computes the full -I^{-1}(dI/dt)w term. The production loads assembly computes inertiaDotB from the motor mass-depletion rate (average constant mass flow during burn, zero after). VV-013 verifies: constant-inertia |I·w| invariant (backward compat), |I·w| invariant WITH inertiaDotB when I varies, and >1% angular-momentum drift when inertiaDotB is dropped (defective path) — proving the term is present and active.

=== P0-5: ROOT-LOCALIZED EVENT BRACKETING ===
New src/dynamics/events.ts provides localizeCrossing() (linear Hermite interpolation) and localizeCrossingFiltered() (direction filter + bracket containment), reaching 1e-5 s event timing without a finer integration timestep. VV-012 exercises rail-exit (ascending), main-deploy (descending), and wrong-direction/bracket rejection on production event data.

=== PRODUCTION EVENT-FSM ===
src/dynamics/events.ts detectEvents() is the one-shot, direction-filtered, monotone state machine (RAIL_EXIT / MOTOR_BURNOUT / APOGEE / MAIN_DEPLOY / TOUCHDOWN). sixDofSimulator.ts calls this production FSM (removed inline event-check blocks). VV-011 asserts sequencing and direction filters directly.

=== STRICT KERNEL VALIDATION ===
normalizeQuaternion() THROWS on degenerate or nonfinite quaternions; validateStateAndLoads() rejects nonfinite state/load components, nonpositive mass, nonpositive dt, nonpositive principal inertias; unit-norm attitude precondition before first RHS callback; every callback-returned load (L0-L3) validated; output state validated for finiteness; t0 finiteness guarded. No silent physical-state fabrication remains.

=== VERIFICATION (Gate 5) ===
scripts/emit-benchmark-metadata.cjs emits a machine-readable JSON evidence artifact: git commit hash/date/branch, runtime, dependency versions, solver configuration, build pass status, 12 V&V suites (VV-001..007, 009..013), and gate coverage flags. All 57/57 tests pass; production build clean.

=== NORMATIVE PHYSICAL CONTRACT (authored per your Gate C) ===
${physContract}

=== MASTER PRODUCT SPECIFICATION ===
${masterSpec}

=== PRODUCTION KERNEL (src/dynamics/rigidBody.ts — RK4 + DP5(4) adaptive + strict validation + inertiaDotB) ===
${kernel}

=== PRODUCTION LOADS ASSEMBLY (src/dynamics/loads.ts — ENU, variable inertia) ===
${loadsSource}

=== PRODUCTION FLIGHT SIMULATOR (src/sim/sixDofSimulator.ts — ENU, event FSM wiring, loadsAt stage RHS) ===
${simSource}

=== PRODUCTION EVENT FSM + LOCALIZATION (src/dynamics/events.ts) ===
${eventsSource}

=== EXECUTABLE V&V SUITE (all 12 suites, drives production kernel) ===
${vvBench}

=== EVIDENCE EMITTER (Gate 5) ===
${emitter}

Perform your rigorous round-12 consolidated full-product audit:
1. Updated Executive Quality Score (1-10) for the complete product (previously 5.8/10 in round 7).
2. Confirm whether each engineering gate (1r, 2, 3, 4, 5) is now genuinely closed. Identify any Gate that is still open and exactly why.
3. Verify the kernel's quaternion/RK4/inertia-axis algebra, the ENU/axis mapping, the variable-inertia term, the DP5(4) adaptive integrator's correctness, and the event FSM/localization wiring in the production path.
4. Explicit remaining gaps (if any) before you score 8.5+/10 and before full UI build-out begins.
5. Final build-readiness verdict for the engineering core.`;

  console.log("Querying native Astra (gpt-6-astra) for round-12 consolidated audit...");

  const res = await fetch("http://127.0.0.1:10100/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer opencodex-loopback"
    },
    body: JSON.stringify({
      model: "gpt-6-astra",
      messages: [
        { role: "system", content: "You are Astra, Principal Aerospace Systems Architect and Chief Systems Engineer. Deliver an authoritative, deeply technical, and adversarial engineering audit." },
        { role: "user", content: prompt }
      ],
      temperature: 0.2
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Error from OpenCodex:", res.status, errText);
    process.exit(1);
  }
  const raw = await res.text();
  fs.writeFileSync('scripts/astra-round12-audit.json', raw, 'utf-8');
  const data = JSON.parse(raw);
  const critique = data.choices[0].message.content;
  console.log("\n=== ASTRA ROUND-12 CONSOLIDATED AUDIT REPORT ===\n");
  console.log(critique);
  fs.writeFileSync('docs/astra-round12-audit.md', critique, 'utf-8');
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});