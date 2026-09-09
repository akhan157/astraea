/**
 * Round-13 Event Root-State Restart + Roll-Limiter Removal Acceptance
 * (audit §3.7/§4)
 *
 * Exercises:
 *   1. FSM same-bracket CHRONOLOGICAL ordering (not code order), one-shot
 *      monotonicity, fail-fast finite/increasing-time validation.
 *   2. Low-apogee (main deployed AT apogee) and abnormal-path (main deployed
 *      at touchdown) recovery rules.
 *   3. Driving-engine restart semantics: re-feeding the FSM from a resolved
 *      root resolves successive crossings in time order (transition-restart).
 *   4. Full-flight simulation: strictly increasing localized event times,
 *      deterministic output, timestep-phase sweep consistency, and a
 *      root-grounded touchdown velocity (no hidden overshoot clipping).
 */

import { describe, it, expect } from 'vitest';
import { detectEvents, NEWTON_EVENT_STATE, EventState, EventSamplePair } from '../dynamics/events';
import { simulate6DofFlight, selectNextCandidate, eventCrossedAtRoot, clampRailBaseContact } from './sixDofSimulator';
import { RigidState } from '../dynamics/rigidBody';
import { PRESET_ESTES_ALPHA } from '../store/rocketStore';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';

const BASE_FLIGHT = {
  railLength: 1.0,
  railElevationDeg: 90.0,
  railAzimuthDeg: 0.0,
  windSpeedSurface: 3.0,
  windAzimuthDeg: 90.0,
  mainDeployAltitudeAGL: 250,
  finCantAngleDeg: 0.0,
};

function tick(
  st: EventState,
  prevS: EventSamplePair,
  t: number,
  rail: number,
  vz: number,
  alt: number,
  burnTime = 10.0,
  mainDeployAlt = 250
) {
  const ev = detectEvents(st, prevS, {
    t,
    altitudeAlongRail: rail,
    railLength: 1.0,
    burnTime,
    verticalVelocity: vz,
    altitude: alt,
    mainDeployAlt,
  });
  return { ev, next: { t, altitudeAlongRail: rail, verticalVelocity: vz, altitude: alt } };
}

describe('event-restart FSM: chronological ordering (audit 3.7)', () => {
  it('returns same-bracket events sorted by localized time, not code order', () => {
    // Bracket [0.2, 0.6]: burnout at t=0.3, rail crossing at t≈0.333.
    // Code-append order would be [RAIL_EXIT, MOTOR_BURNOUT]; chronological
    // order must be [MOTOR_BURNOUT, RAIL_EXIT].
    const prevS: EventSamplePair = { t: 0.2, altitudeAlongRail: 1.0, verticalVelocity: 25, altitude: 500 };
    const ev = detectEvents({ ...NEWTON_EVENT_STATE }, prevS, {
      t: 0.6,
      altitudeAlongRail: 4.0, // rail crossing at 0.2 + (2-1)/(4-1)*0.4 = 0.3333
      railLength: 2.0,
      burnTime: 0.3,
      verticalVelocity: 25,
      altitude: 500,
      mainDeployAlt: 250,
    });
    expect(ev.events.map((e) => e.name)).toEqual(['MOTOR_BURNOUT', 'RAIL_EXIT']);
    expect(ev.events[0].time).toBeLessThan(ev.events[1].time);
    // fires mirror the chronological order (no bare 'NONE' when events fired)
    expect(ev.fires).toEqual(['MOTOR_BURNOUT', 'RAIL_EXIT']);
    expect(ev.state.hasBurnedOut).toBe(true);
    expect(ev.state.hasLeftRail).toBe(true);
  });

  it('preserves dependency order on same-instant ties (apogee before main)', () => {
    // Apogee crossing with the apogee altitude below the main threshold:
    // MAIN_DEPLOY fires AT the apogee root, tied instant — apogee first.
    const prevS: EventSamplePair = { t: 1.0, altitudeAlongRail: 3.0, verticalVelocity: 4.0, altitude: 240 };
    const ev = detectEvents(
      { ...NEWTON_EVENT_STATE, hasLeftRail: true, hasBurnedOut: true },
      prevS,
      {
        t: 1.1,
        altitudeAlongRail: 3.0,
        railLength: 1.0,
        burnTime: 0.5,
        verticalVelocity: -5.0,
        altitude: 230,
        mainDeployAlt: 250,
      }
    );
    expect(ev.events.map((e) => e.name)).toEqual(['APOGEE_DROGUE', 'MAIN_DEPLOY']);
    expect(ev.events[0].time).toBe(ev.events[1].time);
    // Single main deployment even though the terminal-altitude path was open.
    expect(ev.fires.filter((f) => f === 'MAIN_DEPLOY')).toHaveLength(1);
  });

  it('keeps apogee gated on rail exit AND burnout', () => {
    let st = { ...NEWTON_EVENT_STATE };
    let prevS: EventSamplePair = { t: 0, altitudeAlongRail: 0, verticalVelocity: 0, altitude: 9000 };
    let apogeeFired = false;
    for (let i = 1; i <= 5; i++) {
      const t = i * 0.05;
      const r = tick(st, prevS, t, 1.0, -3, 9000 - t, 10.0);
      st = r.ev.state;
      prevS = r.next;
      if (r.ev.fires.includes('APOGEE_DROGUE')) apogeeFired = true;
    }
    expect(apogeeFired).toBe(false);
    expect(st.isApogeeReached).toBe(false);
  });

  it('defers a PRE-BURNOUT vertical-velocity zero-crossing until burnout opens the gate', () => {
    // Bracket A: crossing observed while the gate is CLOSED (burnout has not
    // fired) — the root is stashed. Bracket B: burnout opens the last gate
    // while the vehicle is descending, so apogee becomes actionable AT
    // burnout, never retroactively before its prerequisite.
    let st: EventState = { ...NEWTON_EVENT_STATE, hasLeftRail: true };
    let prevS: EventSamplePair = { t: 0.3, altitudeAlongRail: 3.0, verticalVelocity: 2.0, altitude: 700 };
    const rA = detectEvents(st, prevS, {
      t: 0.35,
      altitudeAlongRail: 3.0,
      railLength: 1.0,
      burnTime: 0.4, // NOT yet reached
      verticalVelocity: -1.0,
      altitude: 695,
      mainDeployAlt: 250,
    });
    // Gate closed: apogee withheld but the crossing root is stashed.
    expect(rA.events.map((e) => e.name)).toEqual([]);
    expect(rA.state.pendingApogeeTime).toBeDefined();
    expect(rA.state.pendingApogeeTime!).toBeGreaterThan(0.3);

    // Bracket B: burnout fires at 0.4; vehicle still descending.
    const rB = detectEvents(rA.state, { t: 0.35, altitudeAlongRail: 3.0, verticalVelocity: -1.0, altitude: 695 }, {
      t: 0.5,
      altitudeAlongRail: 3.0,
      railLength: 1.0,
      burnTime: 0.4,
      verticalVelocity: -2.0,
      altitude: 690,
      mainDeployAlt: 250,
    });
    const names = rB.events.map((e) => e.name);
    expect(names).toContain('MOTOR_BURNOUT');
    expect(names).toContain('APOGEE_DROGUE');
    const apo = rB.events.find((e) => e.name === 'APOGEE_DROGUE');
    // The physical zero-cross root was 0.3333, but the event cannot become
    // actionable before its burnout prerequisite at 0.4.
    expect(apo!.time).toBeCloseTo(0.4, 12);
    expect(rB.events.find((e) => e.name === 'MOTOR_BURNOUT')!.time).toBe(apo!.time);
    expect(rB.state.isApogeeReached).toBe(true);
    expect(rB.state.pendingApogeeTime).toBeUndefined();
  });
});

describe('event-restart FSM: fail-fast validation (audit 3.7)', () => {
  it('rejects non-finite kinematics', () => {
    const prevS: EventSamplePair = { t: 0, altitudeAlongRail: 0, verticalVelocity: 0, altitude: 0 };
    const bad = {
      t: 0.1,
      altitudeAlongRail: 1.0,
      railLength: 1.0,
      burnTime: 1.0,
      verticalVelocity: 0,
      altitude: 0,
      mainDeployAlt: 250,
    };
    expect(() => detectEvents({ ...NEWTON_EVENT_STATE }, prevS, { ...bad, altitude: Number.NaN })).toThrow();
    expect(() => detectEvents({ ...NEWTON_EVENT_STATE }, prevS, { ...bad, t: Number.POSITIVE_INFINITY })).toThrow();
  });

  it('rejects non-increasing bracket time', () => {
    const prevS: EventSamplePair = { t: 0.1, altitudeAlongRail: 1.0, verticalVelocity: 0, altitude: 0 };
    const inp = {
      t: 0.1, // NOT > prevS.t
      altitudeAlongRail: 2.0,
      railLength: 1.0,
      burnTime: 1.0,
      verticalVelocity: 0,
      altitude: 0,
      mainDeployAlt: 250,
    };
    expect(() => detectEvents({ ...NEWTON_EVENT_STATE }, prevS, inp)).toThrow(/strictly increase/);
    expect(() => detectEvents({ ...NEWTON_EVENT_STATE }, prevS, { ...inp, t: 0.05 })).toThrow(/strictly increase/);
  });
});

describe('event-restart FSM: low-apogee + abnormal main paths (audit 3.7)', () => {
  it('deploys the main AT apogee when the apogee altitude is below the threshold', () => {
    // Apogee crossing with altitude continuing from 480 -> 470 (already below
    // mainDeployAlt 500): no descending h_main crossing can ever occur.
    const prevS: EventSamplePair = { t: 5.0, altitudeAlongRail: 3.0, verticalVelocity: 1.0, altitude: 480 };
    const ev = detectEvents(
      { ...NEWTON_EVENT_STATE, hasLeftRail: true, hasBurnedOut: true },
      prevS,
      {
        t: 5.1,
        altitudeAlongRail: 3.0,
        railLength: 1.0,
        burnTime: 0.5,
        verticalVelocity: -1.0,
        altitude: 470,
        mainDeployAlt: 500,
      }
    );
    const apo = ev.events.find((e) => e.name === 'APOGEE_DROGUE');
    const main = ev.events.find((e) => e.name === 'MAIN_DEPLOY');
    expect(apo).toBeDefined();
    expect(main).toBeDefined();
    expect(main!.time).toBe(apo!.time);
    expect(ev.state.isApogeeReached).toBe(true);
    expect(ev.state.isMainDeployed).toBe(true);
  });

  it('deploys the main at touchdown when the descending h_main crossing never occurs', () => {
    // Full-fidelity abnormal descent: apogee reached high, then the descent
    // misses the h_main crossing entirely (touchdown above h_main).
    let st: EventState = { ...NEWTON_EVENT_STATE, hasLeftRail: true, hasBurnedOut: true };
    let prevS: EventSamplePair = { t: 10.0, altitudeAlongRail: 3.0, verticalVelocity: 0, altitude: 300 };
    let mainFired = false;
    let touchdownFired = false;
    // Descending from 300m with h_main=290 and touchdown at 30m above ground:
    // the main must appear AT the touchdown instant, explicitly.
    for (let i = 1; i <= 30; i++) {
      const t = 10.0 + i * 0.1;
      const alt = Math.max(0, 300 - i * 9.0); // 300 -> 30 (touchdown alt is 0 at i=33.3)
      const r = tick(st, prevS, t, 3.0, -9, alt, 0.5, 290);
      st = r.ev.state;
      prevS = r.next;
      if (r.ev.fires.includes('MAIN_DEPLOY')) mainFired = true;
      if (r.ev.fires.includes('TOUCHDOWN')) touchdownFired = true;
    }
    // The descent reaches alt 0 at i=33.3 — we only ran 30 ticks (alt=30):
    // no touchdown yet, and no main crossing of 290 (descended through it
    // between i=13 (183) and i=14 (174)... 300-290 happens at i≈1.1.
    expect(mainFired).toBe(true);
    expect(touchdownFired).toBe(false);
    // Now the abnormal terminal bracket: 15 -> 0 m with main STILL undeployed
    // (h_main set absurdly high so it was crossed before apogee... set it to
    // 400: descent from 300 is entirely below, so the main never crossed).
    st = { ...NEWTON_EVENT_STATE, hasLeftRail: true, hasBurnedOut: true, isApogeeReached: true };
    prevS = { t: 20.0, altitudeAlongRail: 3.0, verticalVelocity: -9, altitude: 15 };
    const ev = detectEvents(st, prevS, {
      t: 20.1,
      altitudeAlongRail: 3.0,
      railLength: 1.0,
      burnTime: 0.5,
      verticalVelocity: -9,
      altitude: -1.0,
      mainDeployAlt: 400,
    });
    const td = ev.events.find((e) => e.name === 'TOUCHDOWN');
    const main = ev.events.find((e) => e.name === 'MAIN_DEPLOY');
    expect(td).toBeDefined();
    expect(main).toBeDefined();
    expect(main!.time).toBe(td!.time);
    expect(ev.state.touchedDown).toBe(true);
    expect(ev.state.isMainDeployed).toBe(true);
  });
});

describe('event-restart FSM: transition-restart sequence (audit 3.7)', () => {
  // Mirror of the simulator's applyFsmTransition: advance the FSM state by
  // EXACTLY ONE event, then re-detect — the driving engine resolves roots
  // one at a time in chronological order.
  const applyOne = (st: EventState, name: string): EventState => {
    const s = { ...st };
    if (name === 'RAIL_EXIT') s.hasLeftRail = true;
    if (name === 'MOTOR_BURNOUT') s.hasBurnedOut = true;
    if (name === 'APOGEE_DROGUE') s.isApogeeReached = true;
    if (name === 'MAIN_DEPLOY') s.isMainDeployed = true;
    if (name === 'TOUCHDOWN') s.touchedDown = true;
    return s;
  };

  it('resolves rail -> burnout -> apogee in chronological order via root re-feed', () => {
    // One coarse bracket [0, 1] containing three crossings; the DRIVING
    // engine restarts from each resolved root: detect, take the EARLIEST
    // event, apply it, re-detect on (root, t].
    const burnTime = 0.4;
    const detectAt = (st: EventState, base: EventSamplePair, t: number) =>
      detectEvents(st, base, {
        t,
        altitudeAlongRail: 1.2 * t, // rail length 1.0 crossed at t = 0.8333
        railLength: 1.0,
        burnTime,
        verticalVelocity: Math.max(-6, 20 - t * 30), // vz zero-cross at 0.6667
        altitude: 500,
        mainDeployAlt: 250,
      });

    let st: EventState = { ...NEWTON_EVENT_STATE };
    let base: EventSamplePair = { t: 0, altitudeAlongRail: 0, verticalVelocity: 20, altitude: 500 };
    const fired: Array<{ name: string; time: number }> = [];
    while (base.t < 1.0 - 1e-12) {
      const r = detectAt(st, base, 1.0);
      if (r.events.length === 0) break;
      const earliestTime = r.events[0].time;
      const tied = r.events.filter((event) => Math.abs(event.time - earliestTime) <= 1e-12);
      for (const event of tied) {
        fired.push({ name: event.name, time: event.time });
        st = applyOne(st, event.name);
      }
      // Restart bracket from the resolved root after every same-time
      // prerequisite/dependent transition has been applied.
      base = {
        t: earliestTime,
        altitudeAlongRail: 1.2 * earliestTime,
        verticalVelocity: Math.max(-6, 20 - earliestTime * 30),
        altitude: 500,
      };
    }
    // Burnout opens at 0.4. The physical vz root is 0.6667, but rail is the
    // last prerequisite at 0.8333, so rail and apogee transition together in
    // dependency order rather than emitting apogee retroactively.
    expect(fired.map((f) => f.name)).toEqual(['MOTOR_BURNOUT', 'RAIL_EXIT', 'APOGEE_DROGUE']);
    expect(fired[2].time).toBe(fired[1].time);
    for (let i = 1; i < fired.length; i++) {
      expect(fired[i].time).toBeGreaterThanOrEqual(fired[i - 1].time);
    }
    expect(st.hasBurnedOut).toBe(true);
    expect(st.isApogeeReached).toBe(true);
    expect(st.hasLeftRail).toBe(true);
  });

  it('never refires a one-shot event across restarts', () => {
    let st: EventState = { ...NEWTON_EVENT_STATE };
    const prevS: EventSamplePair = { t: 0, altitudeAlongRail: 0, verticalVelocity: 20, altitude: 500 };
    const ev = detectEvents(st, prevS, {
      t: 1.0,
      altitudeAlongRail: 2.0,
      railLength: 1.0,
      burnTime: 0.4,
      verticalVelocity: 20,
      altitude: 500,
      mainDeployAlt: 250,
    });
    st = ev.state;
    const count = (es: EventState, n: number) => {
      let c = 0;
      for (let i = 0; i < n; i++) {
        // Degenerate re-presentation of the SAME root bracket must not
        // re-fire rail/burnout.
        const r = detectEvents(es, prevS, {
          t: 1.0,
          altitudeAlongRail: 2.0,
          railLength: 1.0,
          burnTime: 0.4,
          verticalVelocity: 20,
          altitude: 500,
          mainDeployAlt: 250,
        });
        es = r.state;
        c += r.fires.filter((f) => f === 'RAIL_EXIT' || f === 'MOTOR_BURNOUT').length;
      }
      return c;
    };
    expect(count(st, 5)).toBe(0);
    expect(st.hasLeftRail).toBe(true);
    expect(st.hasBurnedOut).toBe(true);
  });
});

describe('event-restart full-flight: no hidden clipping (audit 3.7/4)', () => {
  it('produces strictly increasing localized event times and a root-grounded touchdown', () => {
    const res = simulate6DofFlight(PRESET_ESTES_ALPHA, CERTIFIED_MOTORS.estes_c6, BASE_FLIGHT);
    expect(res.terminated).toBe(true);

    // Strictly increasing event times; the core flight sequence in order.
    let prev = -1;
    for (const e of res.events) {
      expect(e.time).toBeGreaterThan(prev);
      expect(Number.isFinite(e.time)).toBe(true);
      prev = e.time;
    }
    expect(res.events.length).toBeGreaterThanOrEqual(6);
    const names = res.events.map((e) => e.name);
    expect(names).toContain('Launch Rail Departure');
    expect(names).toContain('Motor Burnout');
    expect(names).toContain('Apogee & Drogue Deployment');
    expect(names).toContain('Main Parachute Deployment');
    expect(names).toContain('Ground Touchdown');

    // Root-grounded touchdown velocity: the landing speed is the vehicle
    // speed AT the reconstructed crossing — no post-terrain-clamp overshoot.
    expect(res.landingVelocity).toBeGreaterThan(0);
    expect(res.landingVelocity).toBeLessThan(8);
    const last = res.telemetry[res.telemetry.length - 1];
    expect(Math.abs(res.landingVelocity - last.speed)).toBeLessThan(2.5);

    // Apogee metrics resolve consistently with the localized event.
    const apo = res.events.find((e) => e.name.includes('Apogee'));
    expect(Math.abs(apo!.time - res.apogeeTime)).toBeLessThan(1e-6);
    expect(res.apogeeAltitude).toBeGreaterThan(50);
    expect(res.apogeeAltitude).toBeLessThan(1000);
  });

  it('is deterministic across identical runs', () => {
    const a = simulate6DofFlight(PRESET_ESTES_ALPHA, CERTIFIED_MOTORS.estes_c6, BASE_FLIGHT);
    const b = simulate6DofFlight(PRESET_ESTES_ALPHA, CERTIFIED_MOTORS.estes_c6, BASE_FLIGHT);
    expect(Math.abs(a.apogeeAltitude - b.apogeeAltitude)).toBeLessThanOrEqual(1e-6);
    expect(a.events.length).toBe(b.events.length);
    a.events.forEach((e, i) => expect(Math.abs(e.time - b.events[i].time)).toBeLessThanOrEqual(1e-6));
  });

  it('stays consistent across timestep/bisection phase boundaries', () => {
    const runs = [0.005, 0.01, 0.02].map((dt) =>
      simulate6DofFlight(PRESET_ESTES_ALPHA, CERTIFIED_MOTORS.estes_c6, { ...BASE_FLIGHT, timeStep: dt })
    );
    const apogees = runs.map((r) => r.apogeeAltitude);
    const apogeeSpread = Math.max(...apogees) - Math.min(...apogees);
    expect(apogeeSpread).toBeLessThan(1.0);
    const railExitV = runs.map((r) => r.railExitVelocity);
    expect(Math.max(...railExitV) - Math.min(...railExitV)).toBeLessThan(1.0);
    runs.forEach((r) => expect(r.terminated).toBe(true));
    // Event ordering survives every phase: no crossing ever lands outside
    // chronological order.
    for (const r of runs) {
      let prevT = -1e-9;
      for (const e of r.events) {
        expect(e.time).toBeGreaterThan(prevT);
        prevT = e.time;
      }
    }
  });

  it('roll limiter removed: no fin cant leaves roll at zero; cant spins freely', () => {
    // With zero fin cant the coupled dynamics must produce no roll torque:
    // p stays at 0 (the removed limiter cannot inject or suppress anything).
    const noCant = simulate6DofFlight(PRESET_ESTES_ALPHA, CERTIFIED_MOTORS.estes_c6, BASE_FLIGHT);
    const pmax = Math.max(...noCant.telemetry.map((t) => Math.abs(t.angularVelocity.p)));
    expect(pmax).toBeLessThan(1e-6);

    // With fin cant the integrator spins the roll rate up (no cliff/equilibrium
    // overwrite): the max rate must exceed the old equilibrium bound (1.41
    // rad/s at 1° cant, r_body = 0.0124 m) that the limiter held it to.
    const cant = simulate6DofFlight(PRESET_ESTES_ALPHA, CERTIFIED_MOTORS.estes_c6, {
      ...BASE_FLIGHT,
      finCantAngleDeg: 1.0,
    });
    const cantMax = Math.max(...cant.telemetry.map((t) => Math.abs(t.angularVelocity.p)));
    expect(cantMax).toBeGreaterThan(1.41);
  });
});

describe('production event policy: refined selection, root ties, base contact (Round-16 audit §6)', () => {
  it('serves the earliest refined root when chord order inverts (rail vs burnout)', () => {
    // Chord estimates rank rail exit (0.2) before burnout (0.3), but
    // refinement places the true rail root after the burn boundary.
    // selectNextCandidate must serve burnout (index 1), not det.events[0]:
    // the old loop broke on the first chord time and skipped the selection.
    const idx = selectNextCandidate(['RAIL_EXIT', 'MOTOR_BURNOUT'], [0.5, 0.3]);
    expect(idx).toBe(1);
    // No inversion: chord-first free candidate refines first.
    expect(selectNextCandidate(['RAIL_EXIT', 'MOTOR_BURNOUT'], [0.2, 0.3])).toBe(0);
  });

  it('never serves a dependent transition ahead of an earlier rail/burnout root', () => {
    // Apogee chord-first, but a rail root refines earlier: rail must go first
    // so its prerequisite is committed before apogee applies.
    expect(selectNextCandidate(['APOGEE_DROGUE', 'RAIL_EXIT'], [0.4, 0.3])).toBe(1);
    // Dependent candidates keep FSM order among themselves.
    expect(selectNextCandidate(['APOGEE_DROGUE', 'MAIN_DEPLOY'], [0.4, 0.4])).toBe(0);
  });

  it('evaluates FSM-simultaneous ties at the committed root state', () => {
    const rail = { x: 0, y: 0, z: 1 };
    const above: RigidState = {
      r: { x: 0, y: 0, z: 300 }, v: { x: 0, y: 0, z: -5 },
      q: { w: 1, x: 0, y: 0, z: 0 }, w: { x: 0, y: 0, z: 0 },
    };
    const below: RigidState = { ...above, r: { x: 0, y: 0, z: 200 } };
    // Same-instant main tie applies only when the root is actually at or
    // below the deployment threshold — never on chord equality alone.
    expect(eventCrossedAtRoot('MAIN_DEPLOY', above, rail, 1.0, 250)).toBe(false);
    expect(eventCrossedAtRoot('MAIN_DEPLOY', below, rail, 1.0, 250)).toBe(true);
    // Apogee applies only with nonpositive root vertical velocity.
    expect(eventCrossedAtRoot('APOGEE_DROGUE', above, rail, 1.0, 250)).toBe(true);
    expect(eventCrossedAtRoot('APOGEE_DROGUE', { ...above, v: { x: 0, y: 0, z: 3 } }, rail, 1.0, 250)).toBe(false);
    // Rail and touchdown predicates bracket their own roots.
    expect(eventCrossedAtRoot('RAIL_EXIT', { ...above, r: { x: 0, y: 0, z: 0.5 } }, rail, 1.0, 250)).toBe(false);
    expect(eventCrossedAtRoot('RAIL_EXIT', { ...above, r: { x: 0, y: 0, z: 1.5 } }, rail, 1.0, 250)).toBe(true);
    expect(eventCrossedAtRoot('TOUCHDOWN', { ...above, r: { x: 0, y: 0, z: -0.5 } }, rail, 1.0, 250)).toBe(true);
  });

  it('projects penetrating base states without touching outward motion', () => {
    const rail = { x: 0, y: 0, z: 1 };
    // Penetrating with inward velocity: position returns to the stop plane
    // and the inward component is removed; transverse velocity is preserved.
    const pos = { x: 1, y: 2, z: -0.05 };
    const vel = { x: 3, y: -1, z: -2 };
    clampRailBaseContact(pos, vel, rail);
    expect(pos.z).toBe(0);
    expect(pos.x).toBe(1);
    expect(vel.z).toBe(0);
    expect(vel.x).toBe(3);
    // Outward motion is untouched.
    const pos2 = { x: 0, y: 0, z: 0.5 };
    const vel2 = { x: 0, y: 0, z: 4 };
    clampRailBaseContact(pos2, vel2, rail);
    expect(pos2.z).toBe(0.5);
    expect(vel2.z).toBe(4);
  });
});