import fs from 'fs';
import { execFileSync } from 'child_process';

const read = (file) => fs.readFileSync(file, 'utf-8');

async function main() {
  // The audit consumes a fresh fail-closed artifact, not claimed command
  // output. This runner must start from a clean tree; the emitter independently
  // executes the production build and the complete Vitest suite.
  const evidenceText = execFileSync(
    process.execPath,
    ['scripts/emit-benchmark-metadata.cjs'],
    { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 }
  );
  const evidence = JSON.parse(evidenceText);
  if (evidence.passed !== true) {
    throw new Error(`Refusing to audit uncertifiable evidence: ${evidence.missing.join('; ')}`);
  }

  const sourceFiles = [
    'docs/astraea-master-product-spec.md',
    'docs/astraea-normative-physical-contract.md',
    'docs/astra-round14-audit.md',
    'src/dynamics/rigidBody.ts',
    'src/dynamics/rigidBody.adaptive.test.ts',
    'src/dynamics/loads.ts',
    'src/dynamics/loads.repair.test.ts',
    'src/dynamics/events.ts',
    'src/sim/sixDofSimulator.ts',
    'src/sim/sixDofSimulator.test.ts',
    'src/propulsion/motorDatabase.test.ts',
    'src/components/FlightSimulationTab.test.tsx',
    'src/sim/event-restart.test.ts',
    'src/sim/vv-benchmarks.test.ts',
    'src/sim/flightSimulator.ts',
    'src/propulsion/motorDatabase.ts',
    'src/core/mass.ts',
    'src/aero/transonicAero.ts',
    'src/aero/barrowman.ts',
    'scripts/emit-benchmark-metadata.cjs',
    'scripts/emit-benchmark-metadata.test.cjs',
    'src/components/FlightSimulationTab.tsx',
  ];
  const sourceBundle = sourceFiles
    .map((file) => `\n\n===== ${file} =====\n${read(file)}`)
    .join('');

  const prompt = `You are Astra, Principal Aerospace Systems Architect and Chief Systems Engineer.
You are auditing Astraea Round 16 after the adversarial Round-15 report scored 6.1/10 with NO-GO.

Audit only what the supplied sources and machine evidence establish. Do not accept the change summary as proof. Recompute the physics, numerical-method, event-causality, frame, validity, and evidence conclusions from source.

ROUND-16 CHANGE SUMMARY TO VERIFY:
- Motor depletion is authoritative on the thrust-curve integral (exact burnout continuity, exact flow-derivative consistency, no saturation or jumps) with an all-motor contract suite; nosecone centroid/hollowing corrected; geometry fails closed; motor mounts resolve assigned hardware.
- Production serves the explicitly selected refined event at its own root; FSM-simultaneous ties apply only when their predicate holds at the committed root; superseded future pending roots are invalidated; physical apogee metrics are separate from recovery activation; abnormal ground impact terminates independently; base contact projects nonpenetration; bracket transitions are capped.
- Terminal telemetry is full-precision canonical state; validity is transactional over committed segments with incidence-only rail scoping, full input finiteness, unsupported precedence, and abnormal-impact UNKNOWN; UI separates outcome/validity/limits, restricts competition claims, and records failed runs with inputs.
- Kernel records explicit accepted endpoints in dense output with exact endpoint stage times; fixed-step stages pre-validate; nonlinear coupled ladder demonstrated.
- Evidence enforces a fixed 14-suite inventory, all-files-must-pass, boolean binding fields, HEAD recheck, raw-byte hashing, expanded imported closure, suite-counter reconciliation, and duplicate-identity rejection; automated UI safety suite covers certified presentation and staleness.
- Adaptive solver: exact-end landing (endpoint-bound trials land exactly on tEnd), representable-progress rejection for stuck step-control trials, unconditional total-trial guard, every stage state validated before loadsAt, fixed-kernel inertiaDotB validation, nonlinear dense-output convergence and event-timing proof.
- Motor depletion is impulse-proportional (m_prop(t) = m_prop,total * (1 - I(t)/I_total)) with thrust-proportional mass flow feeding inertiaDot; the motor, mass, and aero implementations are bundled in this audit's evidence.
- Production commits detector bookkeeping through event-free brackets, refines competing rail/burnout roots before serving dependent transitions, reevaluates main-ties at the root state, and preserves the earliest stashed apogee root across partial application.
- Touchdown time, final state, landing mass, final telemetry, and flightDuration coincide exactly at the touchdown root.
- Active-model load validity from every stage evaluation propagates into final validity; EXTRAPOLATED/UNSUPPORTED excursions yield UNKNOWN and force all safety outputs closed. Rail-phase incidence is scoped to contact dynamics, not free-flight aero.
- Recovery is live only with parachute hardware AND flags; canopy drag carries no airframe-CP static moment; non-finite kinematics fail closed to UNSUPPORTED.
- Rail contact is unilateral (signed along-rail projection, base-contact hold) in both the stage RHS and display kinematics.
- Evidence requires every legacy suite, executes the substantive emitter self-tests in the certified command, binds pre/post source immutability, hashes the emitter plus imported physics plus UI, rejects unknown statuses and count disagreements, captures decimal digits correctly, self-hashes exactly per its advertised basis, and labels counts/residuals/solver-config honestly.
- UI safety labels read UNVERIFIED unless validity PASS and CURRENT; rail-exit incidence is labeled honestly; failed reruns clear stale results with an error record.

FRESH MACHINE EVIDENCE:
${JSON.stringify(evidence, null, 2)}

SUPPLIED SPECIFICATIONS, PRIOR AUDIT, PRODUCTION SOURCES, TESTS, EVIDENCE EMITTER, AND UI:
${sourceBundle}

Deliver a rigorous Round-16 report:
1. One complete-product quality score from 1.0 to 10.0 and a build-readiness GO/NO-GO.
2. A gate table for 1r, 2, 3, 4, and 5. Mark each CLOSED, PARTIAL, or OPEN with exact evidence.
3. Recalculate quaternion/RK algebra, ENU/body mapping, variable-inertia derivative/reference, aero force directions/domain classification, adaptive step/error/dense-output behavior, event prerequisite/restart causality, motor depletion law, and validity-to-safety propagation.
4. Distinguish release blockers from non-blocking residual risk. State every remaining gap before a 9.0 score.
5. Audit evidence integrity itself: clean-commit binding, executed discriminating tests, counts, hashes, and any unsupported claim.

Do not award points for source volume, comments, or tests that do not discriminate the asserted defect.`;

  console.log('Querying native Astra (gpt-6-astra) for Round-16 consolidated audit...');
  const res = await fetch('http://127.0.0.1:10100/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer opencodex-loopback',
    },
    body: JSON.stringify({
      model: 'gpt-6-astra',
      messages: [
        {
          role: 'system',
          content: 'You are Astra, Principal Aerospace Systems Architect and Chief Systems Engineer. Deliver an authoritative, deeply technical, adversarial audit.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenCodex ${res.status}: ${await res.text()}`);
  }
  const raw = await res.text();
  const data = JSON.parse(raw);
  const critique = data?.choices?.[0]?.message?.content;
  if (typeof critique !== 'string' || critique.length === 0) {
    throw new Error('Audit response did not contain report content');
  }
  fs.writeFileSync('scripts/astra-round16-audit.json', raw, 'utf-8');
  fs.writeFileSync('docs/astra-round16-audit.md', critique, 'utf-8');
  console.log('\n=== ASTRA ROUND-16 CONSOLIDATED AUDIT REPORT ===\n');
  console.log(critique);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});