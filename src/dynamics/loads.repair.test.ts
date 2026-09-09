/**
 * Production Loads Assembly repair tests (Round-13 audit §3.5/§3.6).
 *
 * Exercises the release-blocking physics in computeFlightLoads directly:
 *  1. inertiaDotB is the DERIVATIVE of inertiaB (finite-difference across the
 *     burn, same production mass law), with the combined-CG reference motion
 *     included — the audit §3.5 factor-of-two defect would fail this test.
 *  2. The instantaneous combined CG is returned and equals the closed-form
 *     two-body CG (both component inertias translated to it).
 *  3. Complete wind-axis drag vector: purely transverse flow produces a
 *     nonzero drag force (audit §3.6 — the old axial-only assembly returned
 *     zero), and the parachute path feeds the same complete vector.
 *  4. Signed paired incidence (contract §6): alpha = atan2(vBz, vBy); never
 *     folded toward zero for tail-side flow.
 *  5. Tail-first free-flight flow is bounded, not thrown: finite blunt-base
 *     drag with zero normal force and loadValidity = UNSUPPORTED; suspended
 *     recovery (canopy model) is the only tail-first-valid path.
 *  6. Vehicle + Mach dependent normal slope (no hardcoded cna = 12).
 *  7. Load-level validity classification at the aero-table Mach clamps.
 *  8. Damping moments vanish at zero airspeed (no Math.max(1, V) floor).
 */

import { describe, it, expect } from 'vitest';
import { computeFlightLoads, prepareVehicle } from './loads';
import {
  PRESET_ESTES_ALPHA,
  PRESET_NASA_STUDENT_LAUNCH,
} from '../store/rocketStore';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';

const MOTOR = CERTIFIED_MOTORS.estes_c6;
const BURN = MOTOR.burnTime;

const CFG = {
  vehicle: PRESET_ESTES_ALPHA,
  motor: MOTOR,
  launchAltitudeASL: 0,
  windSpeedSurface: 0,
  windAzimuthDeg: 90,
  finCantRad: 0,
};

const FLAGS_FREE = { drogueDeployed: false, mainDeployed: false };
const FLAGS_DROGUE = { drogueDeployed: true, mainDeployed: false };

const STATE = (
  v: { x: number; y: number; z: number },
  w: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
) => ({
  r: { x: 0, y: 0, z: 0 },
  v,
  q: { w: 1, x: 0, y: 0, z: 0 },
  w,
});

// Pure ascending axial flow, away from the burn endpoints (linear branch).
const AXIAL = { x: 0, y: 100, z: 0 };

describe('loads repair: instantaneous combined CG and inertia derivative', () => {
  it('inertiaDotB matches the central finite difference of inertiaB across burn', () => {
    const pv = prepareVehicle(PRESET_ESTES_ALPHA);
    const h = 1e-3;
    let maxRelErr = 0;
    for (const t of [0.2, 0.6, 1.0, 1.4]) {
      const Lm = computeFlightLoads(t - h, STATE(AXIAL), FLAGS_FREE, CFG, pv);
      const Lp = computeFlightLoads(t + h, STATE(AXIAL), FLAGS_FREE, CFG, pv);
      const L0 = computeFlightLoads(t, STATE(AXIAL), FLAGS_FREE, CFG, pv);
      const fd = (Lp.inertiaB.x - Lm.inertiaB.x) / (2 * h);
      const relErr = Math.abs(fd - L0.inertiaDotB.x) / Math.max(1e-12, Math.abs(L0.inertiaDotB.x));
      maxRelErr = Math.max(maxRelErr, relErr);
    }
    // Numerical accuracy of the central difference is ~1e-8 (probe); a factor
    // of ~1e4 headroom keeps this a hard physics gate, not a noise flake.
    // Ignition uses the right-hand derivative of the active burn law; it
    // must not report a zero inertia derivative for the first RHS stage.
    const ignition = computeFlightLoads(0, STATE(AXIAL), FLAGS_FREE, CFG, pv);
    const immediatelyAfter = computeFlightLoads(1e-6, STATE(AXIAL), FLAGS_FREE, CFG, pv);
    expect(ignition.inertiaDotB.x).toBeCloseTo(immediatelyAfter.inertiaDotB.x, 5);
    expect(Math.abs(ignition.inertiaDotB.x)).toBeGreaterThan(0);
    expect(maxRelErr).toBeLessThanOrEqual(1e-4);
  });

  it('returns the instantaneous combined CG exactly matching the two-body closed form', () => {
    const pv = prepareVehicle(PRESET_ESTES_ALPHA);
    const t = 0.9; // mid-burn: mass law and CG motion both live
    const motorSt = { currentMass: MOTOR.dryMass + MOTOR.propellantMass * (1 - t / BURN) };
    const xMot = Math.max(0, pv.totalLength - MOTOR.length / 2);
    const expected = (pv.vehicleDryMass * pv.baselineCg + motorSt.currentMass * xMot) /
      (pv.vehicleDryMass + motorSt.currentMass);
    const L = computeFlightLoads(t, STATE(AXIAL), FLAGS_FREE, CFG, pv);
    expect(L.combinedCg).toBeCloseTo(expected, 12);
    // Aero moment arm is referenced to THAT CG, not the dry baseline CG.
    expect(L.kinematics.cp - L.combinedCg).not.toBeCloseTo(L.kinematics.cp - pv.baselineCg, 3);
  });
});

describe('loads repair: complete wind-axis drag vector', () => {
  it('pure transverse flow produces nonzero drag force (old axial-only assembly returned zero)', () => {
    const pv = prepareVehicle(PRESET_ESTES_ALPHA);
    // v_air,B = (60, 0, 0): the axial (y) drag channel contributes NOTHING;
    // only the complete -D v/|v| vector can produce force here.
    const L = computeFlightLoads(0.5, STATE({ x: 60, y: 0, z: 0 }), FLAGS_FREE, CFG, pv);
    expect(L.kinematics.airspeed).toBeGreaterThan(50);
    expect(L.kinematics.dragAxial).toBeGreaterThan(0.1);
    // x-channel aero + normal force opposes the flow; gravity only acts in z.
    expect(L.forceN.x).toBeLessThan(-1);
    // Pure transverse flow is a 90° sideslip: no pitch incidence, beta = 90°.
    expect(L.kinematics.alphaDeg).toBeCloseTo(0, 6);
    expect(Math.abs(L.kinematics.betaDeg)).toBeCloseTo(90, 6);
    expect(L.loadValidity).toBe('UNSUPPORTED');
  });

  it('parachute path applies the complete drag vector concurrently with thrust/gravity', () => {
    const pv = prepareVehicle(PRESET_ESTES_ALPHA);
    const vB = { x: 4, y: -8, z: 3 }; // tail-first descent under drogue (t > burn)
    const speed = Math.sqrt(vB.x * vB.x + vB.y * vB.y + vB.z * vB.z);
    const L = computeFlightLoads(BURN + 0.2, STATE(vB), FLAGS_DROGUE, CFG, pv);
    const D = L.kinematics.dragAxial;
    expect(D).toBeGreaterThan(0.1);
    // With identity attitude and coasting (zero thrust), the only x-channel
    // force is -D·vx/V.
    expect(L.forceN.x).toBeCloseTo(-D * vB.x / speed, 6);
    // z-channel: same drag law minus weight.
    const g = 9.80665;
    expect(L.forceN.z).toBeCloseTo(-D * vB.z / speed - L.mass * g, 6);
  });
});

describe('loads repair: signed incidence and flow-domain enforcement', () => {
  it('alpha is signed paired atan2(vz, vy) and is never folded toward zero', () => {
    const pv = prepareVehicle(PRESET_ESTES_ALPHA);
    const Lp = computeFlightLoads(0.5, STATE({ x: 0, y: 50, z: 20 }), FLAGS_FREE, CFG, pv);
    const Ln = computeFlightLoads(0.5, STATE({ x: 0, y: 50, z: -20 }), FLAGS_FREE, CFG, pv);
    expect(Lp.kinematics.alphaDeg).toBeCloseTo(21.801, 3);
    expect(Ln.kinematics.alphaDeg).toBeCloseTo(-21.801, 3);
    // Folding (abs) would report small incidence here; signed total stays |21.8|.
    expect(Ln.kinematics.alphaTotalDeg).toBeCloseTo(21.801, 3);
    expect(Ln.kinematics.alphaDeg).not.toBeCloseTo(Ln.kinematics.alphaTotalDeg, 3);
  });

  it('bounds tail-first free-flight flow: finite blunt-base drag, zero normal force, UNSUPPORTED validity', () => {
    const pv = prepareVehicle(PRESET_ESTES_ALPHA);
    // Dominant reverse axial flow (side 10 vs aft 40 = flow from a cone
    // within 45° of the pure aft axis): the slender-body normal-force law is
    // undefined here. Production fails closed at the validity flag — never
    // silently nominal — but the stage must stay finite: the complete drag
    // vector (blunt-base drag) still applies, with zero normal force added.
    const tailFirst = STATE({ x: 10, y: -40, z: 0 });
    const speed = Math.sqrt(10 * 10 + 40 * 40);
    const L = computeFlightLoads(0.5, tailFirst, FLAGS_FREE, CFG, pv);
    expect(L.loadValidity).toBe('UNSUPPORTED');
    expect(Number.isFinite(L.forceN.x) && Number.isFinite(L.forceN.y) && Number.isFinite(L.forceN.z)).toBe(true);
    const D = L.kinematics.dragAxial;
    expect(D).toBeGreaterThan(0.1);
    // Complete drag vector only: x-channel force is -D·vx/V with NO
    // transverse normal-force contribution (cna = 0).
    expect(L.forceN.x).toBeCloseTo(-D * 10 / speed, 6);
    expect(L.kinematics.cna).toBeCloseTo(0, 12);
    // Under a deployed canopy the drag-vector model remains valid.
    const Ld = computeFlightLoads(BURN + 0.2, STATE({ x: 0, y: -40, z: 0 }), FLAGS_DROGUE, CFG, pv);
    expect(Ld.kinematics.alphaDeg).toBeCloseTo(180, 3);
    expect(Ld.kinematics.dragAxial).toBeGreaterThan(0.1);
    expect(Ld.loadValidity).toBe('VALID');
  });
});

describe('loads repair: Mach/vehicle-dependent normal slope and validity', () => {
  it('normal slope comes from the vehicle (Barrowman), not a hardcoded 12', () => {
    const pv = prepareVehicle(PRESET_ESTES_ALPHA);
    const pvNasa = prepareVehicle(PRESET_NASA_STUDENT_LAUNCH);
    const L = computeFlightLoads(0.5, STATE({ x: 0, y: 100, z: 0 }), FLAGS_FREE, CFG, pv);
    // Estes Alpha slender-body CNα ≈ 24 > 12: hardcoded 12 would fail this.
    expect(L.kinematics.cna).toBeGreaterThan(12);
    expect(pv.cna0).not.toBeCloseTo(pvNasa.cna0, 1);
  });

  it('normal slope degrades with Mach above 1 (supersonic fin effectiveness)', () => {
    const pv = prepareVehicle(PRESET_ESTES_ALPHA);
    const c0 = computeFlightLoads(0.5, STATE({ x: 0, y: 0.5 * 340.3, z: 0 }), FLAGS_FREE, CFG, pv).kinematics.cna;
    const c2 = computeFlightLoads(0.5, STATE({ x: 0, y: 2.5 * 340.3, z: 0 }), FLAGS_FREE, CFG, pv).kinematics.cna;
    expect(c2).toBeLessThan(c0);
  });

  it('classifies load validity across Mach and incidence envelopes', () => {
    const pv = prepareVehicle(PRESET_ESTES_ALPHA);
    const nominal = computeFlightLoads(0.5, STATE({ x: 0, y: 100, z: 0 }), FLAGS_FREE, CFG, pv);
    expect(nominal.loadValidity).toBe('VALID');
    const extrap = computeFlightLoads(0.5, STATE({ x: 0, y: 1500, z: 0 }), FLAGS_FREE, CFG, pv);
    expect(extrap.kinematics.mach).toBeGreaterThan(4);
    expect(extrap.loadValidity).toBe('EXTRAPOLATED');
    const unsup = computeFlightLoads(0.5, STATE({ x: 0, y: 2600, z: 0 }), FLAGS_FREE, CFG, pv);
    expect(unsup.kinematics.mach).toBeGreaterThan(6);
    expect(unsup.loadValidity).toBe('UNSUPPORTED');

    const incidence20 = computeFlightLoads(
      0.5,
      STATE({ x: 0, y: 100, z: 100 * Math.tan(20 * Math.PI / 180) }),
      FLAGS_FREE,
      CFG,
      pv
    );
    expect(incidence20.kinematics.alphaTotalDeg).toBeCloseTo(20, 6);
    expect(incidence20.loadValidity).toBe('EXTRAPOLATED');

    const incidence40 = computeFlightLoads(
      0.5,
      STATE({ x: 0, y: 100, z: 100 * Math.tan(40 * Math.PI / 180) }),
      FLAGS_FREE,
      CFG,
      pv
    );
    expect(incidence40.kinematics.alphaTotalDeg).toBeCloseTo(40, 6);
    expect(incidence40.loadValidity).toBe('UNSUPPORTED');
  });

  it('damping moments vanish at zero airspeed (no Math.max(1, V) floor)', () => {
    const pv = prepareVehicle(PRESET_ESTES_ALPHA);
    const L = computeFlightLoads(0.5, STATE({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }), FLAGS_FREE, CFG, pv);
    expect(L.kinematics.airspeed).toBe(0);
    expect(L.momentB.x).toBeCloseTo(0, 12);
    expect(L.momentB.y).toBe(0);
    expect(L.momentB.z).toBe(0);
  });
});