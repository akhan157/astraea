/**
 * Astraea Production Flight-Event FSM (NORMATIVE)
 *
 * Pure, testable event-detection state machine used by sixDofSimulator.
 * Each tick presents the current kinematic state together with the PREVIOUS
 * tick's kinematic state, so genuine crossings can be bracketed and
 * root-localized to a sub-timestep time (P0-04/05).
 *
 * Direction-filtered, monotonic, one-shot events; each event returns its
 * root-localized time via `localizeCrossingFiltered`:
 *   RAIL_EXIT       : along-rail coordinate crosses L_rail (ascending)
 *   MOTOR_BURNOUT   : t crosses t_burnout (one-shot)
 *   APOGEE_DROGUE   : vertical velocity zero-cross, v<=0, after rail+burnout
 *   MAIN_DEPLOY     : altitude crosses h_main (descending, after apogee)
 *   TOUCHDOWN       : altitude crosses 0 (descending, after apogee)
 *
 * Event state transitions are one-shot and monotonic (no re-fire). Invalid
 * or out-of-sequence inputs are rejected by the direction/sequencing guards
 * and by fail-fast finite/increasing-time validation below.
 *
 * Ordering contract (round-13 audit 3.7): `events`/`fires` are returned in
 * CHRONOLOGICAL order of their localized crossing times (stable ties keep
 * dependency order — apogee before a same-instant main/touchdown). A returned
 * event time is the root *candidate* on the bracket's chord; the driving
 * simulator MUST rebuild the root state (restart at the localized time,
 * apply the transition, integrate the remainder) before further crossing
 * decisions. The driver guarantees each bracket's endpoints, so candidates
 * always root inside the bracket and the same-bracket event order is the
 * chronological order resolved by successive restarts — never code order.
 * A velocity zero-cross that precedes rail exit or burnout is stashed until
 * the last prerequisite opens. Its effective transition time is the maximum
 * of the physical zero-cross and both prerequisite times, so no dependent
 * event is emitted retroactively with a later state.
 *
 * Abnormal-flight rules (round-13 audit 3.7):
 *   - Apogee below the main threshold: the main deploys AT apogee (a
 *     descending h_main crossing can never occur).
 *   - Touchdown with the main still undeployed: the main deploys at impact
 *     (explicit recovery state instead of a silently lost deployment).
 */

export type AstraeaEvent = 'NONE' | 'RAIL_EXIT' | 'MOTOR_BURNOUT' | 'APOGEE_DROGUE' | 'MAIN_DEPLOY' | 'TOUCHDOWN';

export interface EventState {
  hasLeftRail: boolean;
  hasBurnedOut: boolean;
  isApogeeReached: boolean;
  isMainDeployed: boolean;
  touchedDown: boolean;
  /**
   * Root-stash for the audit 3.7 pre-burnout velocity-crossing fix: while the
   * apogee gate (rail + burnout) is closed, a descending vz zero-cross is
   * still localized and RETAINED (time + altitude), not dropped. Once the
   * gate opens with the vehicle still descending (inp vertical velocity <= 0),
   * APOGEE_DROGUE fires at the stashed crossing root.
   */
  pendingApogeeTime?: number;
  pendingApogeeAlt?: number;
}

export interface EventInput {
  t: number;
  /** current along-rail coordinate (m, signed projection onto rail axis) */
  altitudeAlongRail: number;
  railLength: number;
  burnTime: number;
  /** +up (m/s) */
  verticalVelocity: number;
  /** AGL (m) */
  altitude: number;
  mainDeployAlt: number;
}

export interface EventSamplePair {
  t: number;
  altitudeAlongRail: number;
  verticalVelocity: number;
  altitude: number;
}

export interface LocalizedEvent {
  name: AstraeaEvent;
  time: number;
}

export interface EventResult {
  fires: AstraeaEvent[];
  events: LocalizedEvent[];
  state: EventState;
}

export const NEWTON_EVENT_STATE: EventState = {
  hasLeftRail: false,
  hasBurnedOut: false,
  isApogeeReached: false,
  isMainDeployed: false,
  touchedDown: false,
};

/** One-shot monotonic event transition with root-localized event times. */
export function detectEvents(prev: EventState, prevS: EventSamplePair, inp: EventInput): EventResult {
  const s: EventState = {
    hasLeftRail: prev.hasLeftRail,
    hasBurnedOut: prev.hasBurnedOut,
    isApogeeReached: prev.isApogeeReached,
    isMainDeployed: prev.isMainDeployed,
    touchedDown: prev.touchedDown,
    pendingApogeeTime: prev.pendingApogeeTime,
    pendingApogeeAlt: prev.pendingApogeeAlt,
  };
  const events: LocalizedEvent[] = [];

  const finite =
    Number.isFinite(prevS.t) && Number.isFinite(prevS.altitudeAlongRail) &&
    Number.isFinite(prevS.verticalVelocity) && Number.isFinite(prevS.altitude) &&
    Number.isFinite(inp.t) && Number.isFinite(inp.altitudeAlongRail) &&
    Number.isFinite(inp.railLength) && Number.isFinite(inp.burnTime) &&
    Number.isFinite(inp.verticalVelocity) && Number.isFinite(inp.altitude) &&
    Number.isFinite(inp.mainDeployAlt) &&
    (prev.pendingApogeeTime === undefined || Number.isFinite(prev.pendingApogeeTime)) &&
    (prev.pendingApogeeAlt === undefined || Number.isFinite(prev.pendingApogeeAlt));
  if (!finite) {
    throw new Error('events FSM: non-finite kinematic input in detectEvents');
  }
  if (!(prevS.t < inp.t)) {
    throw new Error('events FSM: bracket time must strictly increase (prevS.t < inp.t)');
  }

  const altitudeAt = (time: number): number => {
    if (time <= prevS.t) return prevS.altitude;
    if (time >= inp.t) return inp.altitude;
    const fraction = (time - prevS.t) / (inp.t - prevS.t);
    return prevS.altitude + fraction * (inp.altitude - prevS.altitude);
  };

  // Resolve prerequisite crossings without letting a later event in this
  // bracket retroactively open a gate at an earlier time.
  const locRail = localizeCrossingFiltered(
    prevS.t, prevS.altitudeAlongRail, inp.t, inp.altitudeAlongRail, inp.railLength, 'ascending'
  );
  const railReadyTime = prev.hasLeftRail ? prevS.t : locRail >= 0 ? locRail : null;
  if (!prev.hasLeftRail && locRail >= 0) {
    s.hasLeftRail = true;
    events.push({ name: 'RAIL_EXIT', time: locRail });
  }

  const burnoutCrossed =
    !prev.hasBurnedOut && prevS.t < inp.burnTime && inp.t >= inp.burnTime;
  const burnoutReadyTime = prev.hasBurnedOut
    ? prevS.t
    : burnoutCrossed
      ? inp.burnTime
      : null;
  if (burnoutCrossed) {
    s.hasBurnedOut = true;
    events.push({ name: 'MOTOR_BURNOUT', time: inp.burnTime });
  }

  let apogeeReadyTime: number | null = prev.isApogeeReached ? prevS.t : null;
  if (!prev.isApogeeReached) {
    const locAp = localizeCrossingFiltered(
      prevS.t, prevS.verticalVelocity, inp.t, inp.verticalVelocity, 0, 'descending'
    );
    if (locAp >= 0 && s.pendingApogeeTime === undefined) {
      s.pendingApogeeTime = locAp;
      s.pendingApogeeAlt = altitudeAt(locAp);
    }

    if (
      railReadyTime !== null &&
      burnoutReadyTime !== null &&
      s.pendingApogeeTime !== undefined &&
      inp.verticalVelocity <= 0
    ) {
      // A zero crossing that preceded either prerequisite becomes actionable
      // when the LAST prerequisite opens, never at a retroactive timestamp.
      const apoTime = Math.max(s.pendingApogeeTime, railReadyTime, burnoutReadyTime);
      if (apoTime <= inp.t) {
        s.isApogeeReached = true;
        apogeeReadyTime = apoTime;
        s.pendingApogeeTime = undefined;
        s.pendingApogeeAlt = undefined;
        events.push({ name: 'APOGEE_DROGUE', time: apoTime });

        // If the vehicle is already below the main threshold when apogee
        // becomes actionable, no future descending threshold crossing exists.
        if (!s.isMainDeployed && altitudeAt(apoTime) <= inp.mainDeployAlt + 1e-12) {
          s.isMainDeployed = true;
          events.push({ name: 'MAIN_DEPLOY', time: apoTime });
        }
      }
    }
  }

  if (!s.isMainDeployed && s.isApogeeReached) {
    const locMain = localizeCrossingFiltered(
      prevS.t, prevS.altitude, inp.t, inp.altitude, inp.mainDeployAlt, 'descending'
    );
    if (locMain >= 0) {
      const mainTime = Math.max(locMain, apogeeReadyTime ?? prevS.t);
      if (mainTime <= inp.t) {
        s.isMainDeployed = true;
        events.push({ name: 'MAIN_DEPLOY', time: mainTime });
      }
    }
  }

  if (!s.touchedDown && s.isApogeeReached) {
    const locTd = localizeCrossingFiltered(
      prevS.t, prevS.altitude, inp.t, inp.altitude, 0, 'descending'
    );
    if (locTd >= 0) {
      const touchdownTime = Math.max(locTd, apogeeReadyTime ?? prevS.t);
      if (touchdownTime <= inp.t) {
        // Keep dependency order at an abnormal same-instant terminal path.
        if (!s.isMainDeployed) {
          s.isMainDeployed = true;
          events.push({ name: 'MAIN_DEPLOY', time: touchdownTime });
        }
        s.touchedDown = true;
        events.push({ name: 'TOUCHDOWN', time: touchdownTime });
      }
    }
  }

  const priority: Record<AstraeaEvent, number> = {
    NONE: 5,
    RAIL_EXIT: 0,
    MOTOR_BURNOUT: 1,
    APOGEE_DROGUE: 2,
    MAIN_DEPLOY: 3,
    TOUCHDOWN: 4,
  };
  events.sort((a, b) => a.time - b.time || priority[a.name] - priority[b.name]);
  const fires: AstraeaEvent[] = events.length === 0 ? ['NONE'] : events.map((event) => event.name);
  return { fires, state: s, events };
}

/**
 * Root-localized event timing (NORMATIVE P0-5).
 * Given two consecutive integration samples bracketing a threshold crossing
 * of a monotone quantity, returns the interpolated crossing time.
 * Linear Hermite interpolation on (t0, val0, t1, val1) -> crossing of `target`.
 * Used to localize RAIL_EXIT, MAIN_DEPLOY, TOUCHDOWN, and apogee zero-cross
 * to a sub-timestep time without requiring a finer integration timestep.
 */
export function localizeCrossing(
  t0: number,
  val0: number,
  t1: number,
  val1: number,
  target: number
): number {
  if (Math.abs(val1 - val0) < 1e-15) return t0;
  const frac = (target - val0) / (val1 - val0);
  return t0 + frac * (t1 - t0);
}

/**
 * Direction-filtered bracketing: checks that the crossing is in the
 * expected direction (ascending or descending) before localizing.
 * Returns the localized time, or -1 if the direction is wrong or the
 * target is not bracketed.
 */
export function localizeCrossingFiltered(
  t0: number,
  val0: number,
  t1: number,
  val1: number,
  target: number,
  direction: 'ascending' | 'descending'
): number {
  if (direction === 'ascending' && val1 <= val0) return -1;
  if (direction === 'descending' && val1 >= val0) return -1;
  // Bracket containment check
  const lo = Math.min(val0, val1);
  const hi = Math.max(val0, val1);
  if (target < lo || target > hi) return -1;
  return localizeCrossing(t0, val0, t1, val1, target);
}