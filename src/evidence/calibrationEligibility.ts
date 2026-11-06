/** Eligibility is a review of declared evidence, never independent verification.
 * All event bounds use the corresponding trajectory's time origin, in seconds.
 */
export interface CalibrationEventEvidence {
  earliestS: number;
  latestS: number;
  source: string;
}

export interface CalibrationConditionEvidence {
  status: 'supported' | 'unsupported';
  source: string;
}

export interface CalibrationSideEvidence {
  /** Final motor burnout: the latest possible time must precede all fit support. */
  burnout?: CalibrationEventEvidence;
  recovery?: { kind: 'first-event'; event: CalibrationEventEvidence }
    | { kind: 'absent-through'; throughS: number; source: string };
  /** Approximately vertical air-relative motion, including negligible lateral/wind effects. */
  verticalMotion?: CalibrationConditionEvidence;
  constantMass?: CalibrationConditionEvidence;
  /** Known separation or other mass changes; these override a supported declaration. */
  massChanges?: CalibrationEventEvidence[];
}

export interface CalibrationEvidence {
  log: CalibrationSideEvidence;
  model: CalibrationSideEvidence;
}

export interface CalibrationSupport { supportStartS: number; supportEndS: number }
export type CalibrationEligibilityStatus = 'conditional' | 'unverified' | 'unsupported';
export interface CalibrationEligibility {
  status: CalibrationEligibilityStatus;
  reasons: string[];
}

/** Canonical event-only snapshot. Condition edits cannot change a selection. */
export function calibrationEventEvidence(evidence: CalibrationEvidence): CalibrationEvidence {
  const parsed = parseCalibrationEvidence(evidence);
  const side = (e: CalibrationSideEvidence): CalibrationSideEvidence => ({
    ...(e.burnout === undefined ? {} : { burnout: e.burnout }),
    ...(e.recovery === undefined ? {} : { recovery: e.recovery }),
    ...(e.massChanges === undefined ? {} : { massChanges: e.massChanges }),
  });
  return { log: side(parsed.log), model: side(parsed.model) };
}

/** Explicit selection requires complete event evidence on both clocks. */
export function requireCalibrationEvents(evidence: CalibrationEvidence): CalibrationEvidence {
  const events = calibrationEventEvidence(evidence);
  for (const name of ['log', 'model'] as const) {
    const side = events[name];
    if (side.burnout === undefined || side.recovery === undefined) throw new Error(`event refit: ${name} needs source-attributed final burnout and recovery coverage`);
    const endS = side.recovery.kind === 'first-event' ? side.recovery.event.earliestS : side.recovery.throughS;
    if (side.burnout.latestS >= endS) throw new Error(`event refit: ${name} has overlapping event bounds; insufficient qualified support`);
  }
  return events;
}

/** Strict reader shared by persistence and the new-application guard. */
export function parseCalibrationEvidence(value: unknown): CalibrationEvidence {
  const object = (v: unknown): Record<string, unknown> => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) throw new Error('calibration evidence must be an object');
    return v as Record<string, unknown>;
  };
  const number = (v: unknown): number => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error('calibration evidence time must be finite');
    return v;
  };
  const source = (v: unknown): string => {
    if (typeof v !== 'string' || v.trim().length === 0) throw new Error('calibration evidence needs a source note');
    return v;
  };
  const event = (v: unknown): CalibrationEventEvidence => {
    const e = object(v);
    const earliestS = number(e.earliestS);
    const latestS = number(e.latestS);
    if (earliestS > latestS) throw new Error('calibration evidence event bounds are reversed');
    return { earliestS, latestS, source: source(e.source) };
  };
  const side = (v: unknown): CalibrationSideEvidence => {
    const e = object(v);
    const result: CalibrationSideEvidence = {};
    if (e.burnout !== undefined) result.burnout = event(e.burnout);
    if (e.recovery !== undefined) {
      const r = object(e.recovery);
      if (r.kind === 'first-event') result.recovery = { kind: r.kind, event: event(r.event) };
      else if (r.kind === 'absent-through') result.recovery = { kind: r.kind, throughS: number(r.throughS), source: source(r.source) };
      else throw new Error('calibration evidence recovery kind is invalid');
    }
    for (const k of ['verticalMotion', 'constantMass'] as const) {
      if (e[k] === undefined) continue;
      const c = object(e[k]);
      if (c.status !== 'supported' && c.status !== 'unsupported') throw new Error('calibration evidence condition status is invalid');
      result[k] = { status: c.status, source: source(c.source) };
    }
    if (e.massChanges !== undefined) {
      if (!Array.isArray(e.massChanges)) throw new Error('calibration evidence massChanges must be an array');
      result.massChanges = e.massChanges.map(event);
    }
    return result;
  };
  const raw = object(value);
  return { log: side(raw.log), model: side(raw.model) };
}

/** Conservative interval checks include filter neighborhoods, not just fit centres.
 * Overlap with an uncertain event interval is unsupported by this evidence.
 * No numerical wind or attitude tolerance is inferred from vertical velocity.
 */
export function assessCalibrationEligibility(
  windows: { log: CalibrationSupport; model: CalibrationSupport },
  evidence: CalibrationEvidence,
): CalibrationEligibility {
  evidence = parseCalibrationEvidence(evidence);
  const unknown: string[] = [];
  const unsupported: string[] = [];
  for (const side of ['log', 'model'] as const) {
    const w = windows[side];
    if (!Number.isFinite(w.supportStartS) || !Number.isFinite(w.supportEndS) || w.supportStartS > w.supportEndS) {
      throw new Error('calibration filter support is invalid');
    }
    const e = evidence[side];
    if (e.burnout === undefined) unknown.push(`${side}: final motor burnout is unverified`);
    else if (e.burnout.latestS > w.supportStartS) unsupported.push(`${side}: filter support may include thrust before final burnout`);
    if (e.recovery === undefined) unknown.push(`${side}: recovery-free filter support is unverified`);
    else if (e.recovery.kind === 'first-event') {
      if (e.recovery.event.earliestS <= w.supportEndS) unsupported.push(`${side}: filter support may include recovery deployment`);
    } else if (e.recovery.throughS < w.supportEndS) unknown.push(`${side}: recovery evidence does not cover the full filter support`);
    for (const condition of ['verticalMotion', 'constantMass'] as const) {
      const label = condition === 'verticalMotion' ? 'approximately vertical air-relative motion' : 'constant mass';
      if (e[condition] === undefined) unknown.push(`${side}: ${label} is unverified`);
      else if (e[condition].status === 'unsupported') unsupported.push(`${side}: ${label} is unsupported`);
    }
    if (e.massChanges?.some((event) => event.earliestS <= w.supportEndS && event.latestS >= w.supportStartS)) {
      unsupported.push(`${side}: filter support may include a separation or mass change`);
    }
  }
  return {
    status: unsupported.length > 0 ? 'unsupported' : unknown.length > 0 ? 'unverified' : 'conditional',
    reasons: [...unsupported, ...unknown],
  };
}

/** Only named native model events supply event evidence; proxies never do. */
export function modelCalibrationEventEvidence(events: readonly { name: string; time: number }[]): CalibrationSideEvidence {
  const exact = (event: { name: string; time: number }): CalibrationEventEvidence => ({
    earliestS: event.time, latestS: event.time, source: `Native model event: ${event.name} (model clock)`,
  });
  const burnouts = events.filter((e) => e.name === 'Motor Burnout' && Number.isFinite(e.time)).sort((a, b) => a.time - b.time);
  const recovery = events.filter((e) => (e.name === 'Apogee & Drogue Deployment' || e.name === 'Main Parachute Deployment') && Number.isFinite(e.time)).sort((a, b) => a.time - b.time);
  return {
    ...(burnouts.length === 0 ? {} : { burnout: exact(burnouts[burnouts.length - 1]) }),
    ...(recovery.length === 0 ? {} : { recovery: { kind: 'first-event' as const, event: exact(recovery[0]) } }),
    massChanges: events.filter((e) => e.name === 'Stage Separation' && Number.isFinite(e.time)).map(exact),
  };
}
