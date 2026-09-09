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
    'src/core/mass.test.ts',
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
You are auditing Astraea Round 17 after the adversarial Round-16 report scored 6.3/10 with NO-GO.

Audit only what the supplied sources and machine evidence establish. Do not accept the change summary as proof. Recompute the physics, numerical-method, event-causality, frame, validity, and evidence conclusions from source.

ROUND-17 CHANGE SUMMARY TO VERIFY:
- Kernel dense output uses exact bracket containment (no epsilon creep), exact-boundary state retrieval, and a consistent span-parameterized interpolant with an explicit accepted endpoint per bracket.
- Validity is transactional: the kernel reports worst validity per accepted step (rejected trials discarded); the driver folds only committed spans, rolling back superseded suffixes and re-recording the committed prefix. Macro/touchdown/rail-exit point evaluations fold with rail-bound scoping.
- Deferred apogee metrics come from the latched carried pending root (not the cleared fresh result); stashed activations never move the argmax position; abnormal ground impact competes as a global candidate with refined roots reused for selection and service; already-satisfied predicates serve at base without bisection; bisection returns the crossed side; selection is a general minimum with priority ties.
- Motors validate records (ordered zero-ended curves, wet/dry identity, positive geometry) with throwing generic fallbacks; mounts are unique with bore-fit and retention checks; impossible placements throw; dry mass has no floor; simulator entry validates every option.
- Mass geometry validates before overrides with strict hollowing, fin/chute/mass, material, offset, and total checks; cone centroid and shell corrections verified.
- UI uses screening-threshold wording, timeout-aware UNKNOWN, strict domain badge, reproducible failed-run snapshots, guarded aero preview; telemetry carries canonical quaternion plus an explicit run manifest with unsupported scope; legacy simulator is explicitly non-authoritative.
- Evidence requires and hashes the motor/mass/UI/emitter suites, rejects empty files and nonfinite aggregates, checks declared-range conformance, binds analysis to pre-execution sources, documents parser limits, and enforces fixed inventory, all-files-must-pass, boolean binding, HEAD recheck, raw-byte hashing, and duplicate-identity rejection.
- Production adversarial sweeps cover pre-burnout apogee activation, rail-return abnormal impact, same-bracket burnout/rail service, and sub-threshold main ties; dense exact-retrieval and triaxial dense-interior ladder tests added.

FRESH MACHINE EVIDENCE:
${JSON.stringify(evidence, null, 2)}

SUPPLIED SPECIFICATIONS, PRIOR AUDIT, PRODUCTION SOURCES, TESTS, EVIDENCE EMITTER, AND UI:
${sourceBundle}

Deliver a rigorous Round-17 report:
1. One complete-product quality score from 1.0 to 10.0 and a build-readiness GO/NO-GO.
2. A gate table for 1r, 2, 3, 4, and 5. Mark each CLOSED, PARTIAL, or OPEN with exact evidence.
3. Recalculate quaternion/RK algebra, ENU/body mapping, variable-inertia derivative/reference, aero force directions/domain classification, adaptive step/error/dense-output behavior, event prerequisite/restart causality, motor depletion law, and validity-to-safety propagation.
4. Distinguish release blockers from non-blocking residual risk. State every remaining gap before a 9.0 score.
5. Audit evidence integrity itself: clean-commit binding, executed discriminating tests, counts, hashes, and any unsupported claim.

Do not award points for source volume, comments, or tests that do not discriminate the asserted defect.`;

  console.log('Querying native Astra (gpt-6-astra) for Round-17 consolidated audit...');
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
  fs.writeFileSync('scripts/astra-round17-audit.json', raw, 'utf-8');
  fs.writeFileSync('docs/astra-round17-audit.md', critique, 'utf-8');
  console.log('\n=== ASTRA ROUND-17 CONSOLIDATED AUDIT REPORT ===\n');
  console.log(critique);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});