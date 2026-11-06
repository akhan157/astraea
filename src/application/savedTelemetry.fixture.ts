import type { SixDofTelemetryPoint } from '../sim/sixDofSimulator';

/** Manufactured display-point shapes for parser/archive tests; not flight evidence. */
export function savedTelemetryFixture(): SixDofTelemetryPoint[] {
  return [
    {
      time: -0,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      mach: 0,
      altitude: 0,
      acceleration: -9.81,
      angularVelocity: { p: 0, q: 0, r: 0 },
      angleOfAttackDeg: 0,
      q: { w: 1, x: 0, y: 0, z: 0 },
      pitchDeg: 90,
      rollDeg: 0,
      yawDeg: 0,
      drag: 0,
      thrust: 100,
      mass: 18.4,
      dynamicPressure: 0,
    },
    {
      time: 1.4,
      stage: 'B',
      stageTime: 1.4,
      motorTime: 1.2,
      position: { x: 0.2, y: -0.1, z: 3.66 },
      velocity: { x: 0.1, y: 0, z: 27.5 },
      speed: 27.5,
      mach: 0.08,
      altitude: 3.66,
      acceleration: 12.2,
      angularVelocity: { p: 0.01, q: -0.02, r: 0.03 },
      angleOfAttackDeg: 1.8,
      q: { w: 0.9, x: 0.1, y: 0.2, z: 0.3 },
      pitchDeg: 89,
      rollDeg: 2,
      yawDeg: -3,
      drag: 4.2,
      thrust: 90,
      mass: 18.3,
      dynamicPressure: 460,
    },
  ];
}
