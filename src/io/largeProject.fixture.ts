/**
 * Test fixture: a valid project whose serialized size can exceed a chosen
 * budget without dropping telemetry or changing the schema. Not shipped in any
 * user path; imported only by size-policy tests.
 */
import type { SixDofTelemetryPoint } from '../sim/sixDofSimulator';
import { captureRunInputs } from '../application/runInputs';
import { createProjectEnvelope, type ProjectEnvelope } from '../formats/projectJson';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { PRESET_ESTES_ALPHA } from '../state/presets';

const SHA = 'a'.repeat(64);

/** One full retained display series, the same shape the engine emits. */
function telemetry(): SixDofTelemetryPoint[] {
  return Array.from({ length: 5000 }, (_, i) => ({
    time: i * 0.02,
    position: { x: 0, y: 0, z: i * 0.01 },
    velocity: { x: 0, y: 0, z: 10 },
    speed: 10,
    mach: 0.03,
    altitude: i * 0.01,
    acceleration: 1.5,
    angularVelocity: { p: 0, q: 0, r: 0 },
    angleOfAttackDeg: 0.5,
    q: { w: 1, x: 0, y: 0, z: 0 },
    pitchDeg: 89,
    rollDeg: 0,
    yawDeg: 0,
    drag: 1.2,
    thrust: 0,
    mass: 18.4,
    dynamicPressure: 12,
  }));
}

export function largeProject(caseCount: number): ProjectEnvelope {
  const base = createProjectEnvelope({
    vehicle: PRESET_ESTES_ALPHA,
    motorRecords: [{ id: 'estes_c6', motor: CERTIFIED_MOTORS.estes_c6, provenance: { source: 'certified' } }],
  });
  const cases = Array.from({ length: caseCount }, (_, i) => {
    const inputKey = `large-key-${i}`;
    const inputs = captureRunInputs(base, base.motorRecords[0], inputKey, undefined);
    return {
      id: `large-${i}`,
      kind: 'flight' as const,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      motorRecordId: 'estes_c6',
      summary: { inputKey },
      inputs,
      engineIdentity: { kind: 'production-rust-wasm' as const, sha256: SHA },
      telemetry: telemetry(),
    };
  });
  return { ...base, cases };
}
