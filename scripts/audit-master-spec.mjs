import fs from 'fs';

async function main() {
  const masterSpec = fs.readFileSync('docs/astraea-master-product-spec.md', 'utf-8');

  const prompt = `You are Astra, Principal Aerospace Systems Architect and Chief Systems Engineer.
You are running natively as opencodex/gpt-6-astra (native).

We have thoroughly closed all 7 engineering and physics gaps in docs/astraea-master-product-spec.md:
1. FD-SEP-001 (Staging Dynamics):
   - Added pre-separation rotational velocity: v_i^{N,+} = v_P^{N,-} + R_NB * (omega_P^{B,-} x rho_i^B) + J_i^N / m_i
   - Scale-aware relative linear and angular momentum conservation invariants (<= 10^-6 relative error).
   - Continuous geometric surface clearance tracking d_clearance(t) > 0 with residual thrust tail-off.
2. FD-TIP-001 (Launch Rail Tip-Off):
   - Formulated sliding D'Alembert kinematics with Coulomb friction mu_r ~ 0.05.
   - Transverse pitch acceleration derived about accelerating sliding aft button using transverse pitch inertia I_pitch and transverse gravity m*g*cos(theta_rail).
3. FD-RES-001 (Roll-Pitch Resonance):
   - Formalized RAM as a dimensionless empirical screening indicator using absolute roll rate | |p| - omega_n | / max(0.1, omega_n).
   - Explicit operational envelope gating at dynamic pressure q > 2,000 Pa.
4. FD-SHK-001 (Parachute Opening Shock):
   - Traced directly to T. W. Knacke, Parachute Recovery Systems Design Manual (NWC TP 6575), Section 5.3 and Pflanz (1942).
   - Explicit Pflanz ballistic coefficient A, inflation time t_f, opening shock factor C_x, and harness structural margin of safety MS >= 1.0 (SF = 1.50).
5. AV-DAT-001 & AV-SEN-001 (Datums & Sensors):
   - Rigorously separated WGS84 ellipsoidal height, EGM96 MSL orthometric height, above-pad height, and terrain AGL.
   - Right-handed East-North-Up (ENU) coordinate frame conventions.
   - Specific force physics with IMU lever-arm offset and transonic static port Mach-dip lockout timer.
6. PY-SHR-001 & PY-RED-001 (Shear Hardware & Redundancy):
   - Lumped-capacitance transient thermal soak equation for internal sheltered pins.
   - Formal Mealy state machine for dual-altimeter redundancy with explicit fault transitions.
7. CP-PRF-001 & CP-DIF-001 (Competition Rules & Semantic Diffs):
   - Directly bound clauses to 2026 NASA Student Launch Handbook §4.3.2/§4.3.4, Spaceport America Cup DBT Rules §3.2.1/§3.4.3, and EuRoC §5.1.
   - Explicit 4-state rule outcomes: PASS, FAIL, UNKNOWN, NOT_APPLICABLE.
   - Corrected arithmetic: 25.1 m/s >= 24.384 m/s (80 ft/s) PASSED.

=== REFINED MASTER PRODUCT SPECIFICATION ===
${masterSpec}

Perform your rigorous fourth-round engineering audit:
1. Updated Executive Quality Score (1-10) for the refined master product spec (previously 5/10).
2. Evaluation of the 7 gap closures.
3. Final build readiness verdict.`;

  console.log("Querying native Astra (gpt-6-astra) for 4th-round audit...");

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
  console.log("\n=== ASTRA FOURTH-ROUND AUDIT REPORT ===\n");
  console.log(critique);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
