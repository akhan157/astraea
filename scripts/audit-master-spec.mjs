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
    'docs/astra-round13-audit.md',
    'src/dynamics/rigidBody.ts',
    'src/dynamics/rigidBody.adaptive.test.ts',
    'src/dynamics/loads.ts',
    'src/dynamics/loads.repair.test.ts',
    'src/dynamics/events.ts',
    'src/sim/sixDofSimulator.ts',
    'src/sim/event-restart.test.ts',
    'src/sim/vv-benchmarks.test.ts',
    'scripts/emit-benchmark-metadata.cjs',
    'scripts/emit-benchmark-metadata.test.cjs',
    'src/components/FlightSimulationTab.tsx',
  ];
  const sourceBundle = sourceFiles
    .map((file) => `\n\n===== ${file} =====\n${read(file)}`)
    .join('');

  const prompt = `You are Astra, Principal Aerospace Systems Architect and Chief Systems Engineer.
You are auditing Astraea Round 14 after the adversarial Round-13 report scored 4.6/10.

Audit only what the supplied sources and machine evidence establish. Do not accept the change summary as proof. Recompute the physics, numerical-method, event-causality, frame, validity, and evidence conclusions from source.

ROUND-14 CHANGE SUMMARY TO VERIFY:
- Production now uses adaptive Dormand-Prince 5(4) by default with the normative per-axis tolerances. Every stage reevaluates the authoritative loads assembly. Accepted steps expose continuous cubic-Hermite dense output used by event root refinement.
- Adaptive attitude error compares normalized fifth/fourth-order candidate attitudes geodesically. Entry and stage attitudes are unit-validated/projected. Rejection, trial count, nonfinite errors, callback loads, and representable progress fail closed.
- Mass, combined CG, parallel-axis inertias, inertia derivatives, and moment arms share the same instantaneous reference and motor depletion law, including the ignition right derivative.
- Aerodynamic drag opposes the complete air-relative vector. Signed paired alpha/beta and total incidence are retained. Normal slope is vehicle/Mach dependent. Free-flight validity uses the 15/30 degree and Mach 4/6 boundaries; recovery uses its active canopy model; unsupported results cannot be presented as PASS.
- Event candidates obey causal prerequisites. A pre-gate velocity root becomes actionable only at the last rail/burnout prerequisite. Production stops at reconstructed root state, applies tied transitions in dependency order, and integrates the remainder under post-transition dynamics. No roll-rate reset/limiter or ground-overshoot clip remains.
- Gate evidence is fail-closed and bound to a clean commit, exit-code-authoritative build/test execution, executed assertion records, source/execution count agreement, dependency versions, hashes, all legacy VV suites, and the three new discriminating acceptance files.
- UI results distinguish outcome, model-domain validity, and input freshness. A real browser exercise observed CURRENT -> STALE after an input change, UNKNOWN/OUT-OF-DOMAIN qualification, correct ENU landing coordinates, keyboard focus containment/restoration, and Escape close. Treat this sentence as operator evidence, not machine evidence.

FRESH MACHINE EVIDENCE:
${JSON.stringify(evidence, null, 2)}

SUPPLIED SPECIFICATIONS, PRIOR AUDIT, PRODUCTION SOURCES, TESTS, EVIDENCE EMITTER, AND UI:
${sourceBundle}

Deliver a rigorous Round-14 report:
1. One complete-product quality score from 1.0 to 10.0 and a build-readiness GO/NO-GO.
2. A gate table for 1r, 2, 3, 4, and 5. Mark each CLOSED, PARTIAL, or OPEN with exact evidence.
3. Recalculate quaternion/RK algebra, ENU/body mapping, variable-inertia derivative/reference, aero force directions/domain classification, adaptive step/error/dense-output behavior, and event prerequisite/restart causality.
4. Distinguish release blockers from non-blocking residual risk. State every remaining gap before a 9.0 score.
5. Audit evidence integrity itself: clean-commit binding, executed discriminating tests, counts, hashes, and any unsupported claim.

Do not award points for source volume, comments, or tests that do not discriminate the asserted defect.`;

  console.log('Querying native Astra (gpt-6-astra) for Round-14 consolidated audit...');
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
  fs.writeFileSync('scripts/astra-round14-audit.json', raw, 'utf-8');
  fs.writeFileSync('docs/astra-round14-audit.md', critique, 'utf-8');
  console.log('\n=== ASTRA ROUND-14 CONSOLIDATED AUDIT REPORT ===\n');
  console.log(critique);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});