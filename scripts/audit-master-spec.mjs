import fs from 'fs';

async function main() {
  const masterSpec = fs.readFileSync('docs/astraea-master-product-spec.md', 'utf-8');
  const vvBench = fs.readFileSync('src/sim/vv-benchmarks.test.ts', 'utf-8');

  const prompt = `You are Astra, Principal Aerospace Systems Architect and Chief Systems Engineer.
You are running natively as opencodex/gpt-6-astra (native).

We have executed every corrective gate you required in the fifth-round audit. SUITE STATUS: 42/42 tests pass.

=== WHAT WAS FIXED PER YOUR EXACT FINDINGS ===

[Gate B - benchmark observables]
1. QUATERNION RK4 INTEGRATION CORRECTED: Stages now advance q0 + h*k additively, final update is normalize(q + h/6*(k1+2k2+2k3+k4)). Verified standalone: old multiply() path produced a 180-degree rotate for a 1-rad step; additive produces the correct angle.
2. VV-002 now checks the INERTIAL ANGULAR-MOMENTUM VECTOR difference ||L_f - L_0|| / ||L_0|| over the full 100-rotation interval with max-drift sampling (not magnitude drift).
3. VV-003 now applies BODY-FRAME forces rotated through the tested quaternion, with a discriminative liveness guard proving the coupling is live; q and -q trajectories must coincide to 1e-9.
4. VV-004 now evaluates REAL production aerodynamics: getAtmosphereAt() + computeAerodynamicCurves() + Cd interpolation + assemble(0.5 rho V^2 A Cd), asserting load invariance under uniform frame translation AND liveness (load > 0.1 N).
5. VV-006 now includes: (a) analytic apogee zero-cross to 1e-5s, (b) NON-LINEAR descending-altitude quadratic root (main-deploy alt crossing) to 1e-5s via dense-output Newton refinement, (c) rail-exit ascending-direction-filtered crossing.

[Gate B5 - staging]
6. VV-005 now exercises THREE cases: on-axis contact + identity attitude; off-axis contact + non-identity attitude; lateral contact + transverse separation normal. Internal equal-opposite impulse pairs at a common contact point conserve total linear AND angular momentum about the fixed origin to <= 1e-6 relative.

[Gate A - production linkage]
7. VV-007 imports and executes the PRODUCTION simulate6DofFlight() from src/sim/sixDofSimulator.ts with the real Estes Alpha + certified Estes C6 motor: asserts finite, physically-bounded outputs (apogee 0-1000m, maxMach < 1.5), and exact run-to-run determinism (apogee repeatability <= 1e-6).

=== MASTER PRODUCT SPECIFICATION ===
${masterSpec}

=== EXECUTABLE V&V SUITE SOURCE ===
${vvBench}

Perform your rigorous sixth-round engineering audit:
1. Updated Executive Quality Score (1-10) for the spec with production-linked executable evidence (previously 5.5/10).
2. Verify Gates A and B2-B6 closures are mathematically/physically correct.
3. Explicit list: what remains (if anything) before you score 8.5+/10.
4. Final build-readiness verdict.`;

  console.log("Querying native Astra (gpt-6-astra) for 6th-round audit...");

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

  const data = await res.json();
  const critique = data.choices[0].message.content;
  console.log("\n=== ASTRA SIXTH-ROUND AUDIT REPORT ===\n");
  console.log(critique);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});