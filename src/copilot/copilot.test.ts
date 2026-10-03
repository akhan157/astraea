import { beforeEach, describe, expect, it } from 'vitest';
import { computeRocketStability } from '../aero/barrowman';
import { explainStability, explainStabilityAnalysis } from '../aero/stabilityBreakdown';
import type { RocketVehicle, TrapezoidFinSetComponent } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';
import type { SixDofOptions, SixDofSimulationResult } from '../sim/sixDofSimulator';
import type { LaunchOptions } from '../application/caseResolver';
import { PRESET_ESTES_ALPHA, useRocketStore } from '../store/rocketStore';
import { useEditBufferStore } from '../store/editBufferStore';
import { applyFix } from './apply';
import { answer } from './assistant';
import { bisect } from './bisect';
import { DEFAULT_CHECK_PROFILE, runChecks, type CheckProfile } from './checks';
import type { CopilotEngine, FlightCase } from './engine';
import { computeDescentFix, computeRailExitFix, computeStabilityFix, mainParachute } from './fixes';
import { matchIntent } from './intents';

// ---------------------------------------------------------------------------
// Test engine: TS Barrowman oracle for stability (test-only; the runtime
// engine is the native bridge) and a closed-form flight model so searches are
// deterministic: rail exit = sqrt(2·a·L), touchdown = k / main diameter.
// ---------------------------------------------------------------------------

const RAIL_ACCEL = 100; // m/s²
const DESCENT_K = 2.4; // m²/s

function fakeFlight(vehicle: RocketVehicle, options: SixDofOptions, overrides: Partial<SixDofSimulationResult> = {}) {
  const main = mainParachute(vehicle);
  const rail = options.railLength ?? 3;
  return {
    apogeeAltitude: 1000,
    railExitVelocity: Math.sqrt(2 * RAIL_ACCEL * rail),
    landingVelocity: main ? DESCENT_K / main.chute.diameter : 40,
    landingDistance: main ? 100 * main.chute.diameter : 0,
    terminated: true,
    touchdownNominal: true,
    validity: 'PASS',
    enveloped: true,
    ...overrides,
  } as SixDofSimulationResult;
}

function makeEngine(overrides: Partial<SixDofSimulationResult> = {}): CopilotEngine & { calls: number } {
  const engine = {
    calls: 0,
    stability: async (v: RocketVehicle) => {
      engine.calls += 1;
      return computeRocketStability(v);
    },
    simulate: async (v: RocketVehicle, _m: MotorSpec, o: SixDofOptions) => {
      engine.calls += 1;
      return fakeFlight(v, o, overrides);
    },
  };
  return engine;
}

const unavailableEngine: CopilotEngine = {
  stability: () => Promise.reject(new Error('Tauri IPC is unavailable')),
  simulate: () => Promise.reject(new Error('Tauri IPC is unavailable')),
};

const LAUNCH: LaunchOptions = {
  railLengthM: 3,
  railElevationDeg: 85,
  railAzimuthDeg: 0,
  windSpeedMps: 3,
  windAzimuthDeg: 0,
  finCantDeg: 0,
  mainDeployAltitudeM: 150,
};
const FLIGHT_CASE: FlightCase = { motor: { id: 'test-motor' } as MotorSpec, launch: LAUNCH };

const vehicle: RocketVehicle = PRESET_ESTES_ALPHA;
const fin = vehicle.components.find((c) => c.id === 'alpha-fins') as TrapezoidFinSetComponent;
const withSpan = (span: number): RocketVehicle => ({
  ...vehicle,
  components: vehicle.components.map((c) => (c.id === fin.id ? { ...c, span } : c)),
});

describe('copilot checks', () => {
  it('judges stability with the engine margin and labels it Modeled', async () => {
    const margin = computeRocketStability(vehicle).staticMarginCalibers;
    const profile: CheckProfile = { ...DEFAULT_CHECK_PROFILE, maxStabilityCal: margin - 0.5 };
    const run = await runChecks(vehicle, makeEngine(), null, profile);
    const high = run.results.find((r) => r.id === 'stability-high')!;
    expect(high.status).toBe('fail');
    expect(high.value?.value).toBe(margin);
    expect(high.value?.confidence).toBe('Modeled');
    expect(run.results.find((r) => r.id === 'stability-low')!.status).toBe('pass');
  });

  it('fails closed when the engine is unavailable', async () => {
    const run = await runChecks(vehicle, unavailableEngine, FLIGHT_CASE);
    expect(run.results.every((r) => r.status === 'not-evaluated')).toBe(true);
    expect(run.results[0].message).toMatch(/Engine unavailable/);
    expect(run.results.find((r) => r.id === 'rail-exit')!.message).toMatch(/Simulation failed/);
  });

  it('does not evaluate flight checks without a flight case', async () => {
    const run = await runChecks(vehicle, makeEngine(), null);
    for (const id of ['rail-exit', 'descent-rate', 'apogee-target'] as const) {
      expect(run.results.find((r) => r.id === id)!.status).toBe('not-evaluated');
    }
  });

  it('judges rail exit, descent and apogee from the flight result', async () => {
    const profile: CheckProfile = { ...DEFAULT_CHECK_PROFILE, targetApogeeM: 1100 };
    const run = await runChecks(vehicle, makeEngine(), FLIGHT_CASE, profile);
    const byId = Object.fromEntries(run.results.map((r) => [r.id, r]));
    expect(byId['rail-exit'].status).toBe('fail'); // sqrt(600) ≈ 24.5 < 30
    expect(byId['descent-rate'].status).toBe('fail'); // 2.4 / 0.305 ≈ 7.87 > 7.6
    expect(byId['apogee-target'].status).toBe('fail'); // 1000 vs 1100 is 9.1% off
    expect(byId['apogee-target'].message).toMatch(/9\.1% below/);
  });

  it('does not judge apogee without a target or descent without a nominal touchdown', async () => {
    const run = await runChecks(vehicle, makeEngine({ touchdownNominal: false }), FLIGHT_CASE);
    const byId = Object.fromEntries(run.results.map((r) => [r.id, r]));
    expect(byId['apogee-target'].status).toBe('not-evaluated');
    expect(byId['descent-rate'].status).toBe('not-evaluated');
  });

  it('marks out-of-envelope and UNKNOWN runs as Extrapolated and Unknown', async () => {
    const ext = await runChecks(vehicle, makeEngine({ enveloped: false }), FLIGHT_CASE);
    expect(ext.results.find((r) => r.id === 'rail-exit')!.value?.confidence).toBe('Extrapolated');
    const unk = await runChecks(vehicle, makeEngine({ validity: 'UNKNOWN' }), FLIGHT_CASE);
    expect(unk.results.find((r) => r.id === 'rail-exit')!.value?.confidence).toBe('Unknown');
  });
});

describe('bisect', () => {
  it('finds a bracketed root', async () => {
    const r = await bisect(async (x) => x * x - 2, { lo: 0, hi: 2, fTolerance: 1e-6, xTolerance: 1e-9, maxIterations: 100 });
    expect(r.kind).toBe('found');
    if (r.kind === 'found') expect(r.x).toBeCloseTo(Math.SQRT2, 5);
  });

  it('refuses to extrapolate when the interval does not bracket the target', async () => {
    const r = await bisect(async (x) => x + 10, { lo: 0, hi: 1, fTolerance: 1e-6, xTolerance: 1e-9, maxIterations: 10 });
    expect(r).toEqual({ kind: 'not-bracketed', fLo: 10, fHi: 11, calls: 2 });
  });
});

describe('copilot fixes', () => {
  it.each([
    ['overstable', fin.span * 1.8],
    ['understable', fin.span * 0.5],
  ])('computes a fin-span fix for an %s design whose after-margin is the engine value', async (_label, span) => {
    const design = withSpan(span);
    const before = computeRocketStability(design);
    const fix = await computeStabilityFix('stability-high', design, before, makeEngine(), DEFAULT_CHECK_PROFILE);
    expect(fix.kind).toBe('vehicle-edit');
    if (fix.kind !== 'vehicle-edit') return;
    const after = computeRocketStability(withSpan(fix.edit.after));
    const margin = fix.deltas.find((d) => d.label === 'Static margin')!;
    expect(margin.before.value).toBe(before.staticMarginCalibers);
    expect(margin.after.value).toBe(after.staticMarginCalibers);
    expect(Math.abs(after.staticMarginCalibers - 2.2)).toBeLessThan(0.1);
    expect(Math.round(fix.edit.after / 0.0005) * 0.0005).toBeCloseTo(fix.edit.after, 12);
    expect(fix.caveats.some((c) => /not re-simulated/.test(c))).toBe(true);
  });

  it('includes flight deltas when a flight case is given', async () => {
    const design = withSpan(fin.span * 1.8);
    const fix = await computeStabilityFix(
      'stability-high', design, computeRocketStability(design), makeEngine(), DEFAULT_CHECK_PROFILE,
      FLIGHT_CASE, fakeFlight(design, {}),
    );
    expect(fix.kind === 'vehicle-edit' && fix.deltas.map((d) => d.label)).toContain('Apogee');
  });

  it('declines to pick between multiple fin sets', async () => {
    const twoFins: RocketVehicle = { ...vehicle, components: [...vehicle.components, { ...fin, id: 'canards', name: 'Canards' }] };
    const fix = await computeStabilityFix('stability-high', twoFins, computeRocketStability(twoFins), makeEngine(), DEFAULT_CHECK_PROFILE);
    expect(fix).toMatchObject({ kind: 'no-fix' });
  });

  it('reports no fix when the target is out of reach instead of guessing', async () => {
    const profile = { ...DEFAULT_CHECK_PROFILE, stabilityFixTargetCal: 500 };
    const fix = await computeStabilityFix('stability-low', vehicle, computeRocketStability(vehicle), makeEngine(), profile);
    expect(fix.kind).toBe('no-fix');
    if (fix.kind === 'no-fix') expect(fix.reason).toMatch(/does not reach/);
  });

  it('enlarges the main parachute until touchdown passes', async () => {
    const before = fakeFlight(vehicle, {});
    const fix = await computeDescentFix(vehicle, before, makeEngine(), DEFAULT_CHECK_PROFILE, FLIGHT_CASE);
    expect(fix.kind).toBe('vehicle-edit');
    if (fix.kind !== 'vehicle-edit') return;
    expect(fix.edit.componentId).toBe('alpha-chute');
    const after = fix.deltas.find((d) => d.label === 'Touchdown velocity')!.after.value;
    expect(after).toBeLessThanOrEqual(7.6);
    expect(after).toBe(DESCENT_K / fix.edit.after);
    expect(fix.caveats.some((c) => /one parachute/.test(c))).toBe(true);
  });

  it('gives rail-length advice that it cannot apply', async () => {
    const before = fakeFlight(vehicle, { railLength: 3 });
    const fix = await computeRailExitFix(vehicle, before, makeEngine(), DEFAULT_CHECK_PROFILE, FLIGHT_CASE);
    expect(fix.kind).toBe('advice');
    if (fix.kind !== 'advice') return;
    expect(fix.deltas[0].after.value).toBeGreaterThanOrEqual(30);
    expect(applyFix(fix)).toMatchObject({ ok: false });
  });

  it('picks the second parachute as main, like the native engine', () => {
    const two: RocketVehicle = {
      ...vehicle,
      components: [...vehicle.components, { id: 'main', name: 'Main', type: 'parachute', diameter: 1, cd: 0.8, mass: 0.1, axialOffset: 0, materialId: 'cardboard' }],
    };
    expect(mainParachute(two)?.chute.id).toBe('main');
  });
});

describe('applying a fix', () => {
  beforeEach(() => {
    useRocketStore.setState({ vehicle: withSpan(fin.span * 1.8), history: [] });
    useEditBufferStore.getState().discardAll();
  });

  async function overstableFix() {
    const design = useRocketStore.getState().vehicle;
    return computeStabilityFix('stability-high', design, computeRocketStability(design), makeEngine(), DEFAULT_CHECK_PROFILE);
  }

  it('stages the edit without touching the design, and Apply commits one undoable step', async () => {
    const fix = await overstableFix();
    const committed = useRocketStore.getState().vehicle;
    expect(applyFix(fix)).toEqual({ ok: true });
    expect(useRocketStore.getState().vehicle).toBe(committed);
    expect(useEditBufferStore.getState().pendingCount()).toBe(1);

    useEditBufferStore.getState().applyAll();
    const fins = useRocketStore.getState().vehicle.components.find((c) => c.id === fin.id) as TrapezoidFinSetComponent;
    expect(fix.kind === 'vehicle-edit' && fins.span).toBe(fix.kind === 'vehicle-edit' && fix.edit.after);
    expect(useRocketStore.getState().history).toHaveLength(1);
  });

  it('refuses when the design changed since the fix was computed', async () => {
    const fix = await overstableFix();
    useRocketStore.setState({ vehicle: withSpan(fin.span * 1.7) });
    expect(applyFix(fix)).toMatchObject({ ok: false, reason: expect.stringMatching(/changed/) });
    expect(useEditBufferStore.getState().pendingCount()).toBe(0);
  });

  it('refuses while other edits are pending', async () => {
    const fix = await overstableFix();
    useEditBufferStore.getState().stage('alpha-bt', { length: 0.4 });
    expect(applyFix(fix)).toMatchObject({ ok: false, reason: expect.stringMatching(/pending/) });
  });
});

describe('intent matching', () => {
  it.each([
    ['Why is my rocket overstable?', 'explain-stability'],
    ['is my rocket stable', 'explain-stability'],
    ['check my rocket', 'run-checks'],
    ['is it safe to fly?', 'run-checks'],
    ['how do I fix it', 'suggest-fixes'],
    ['what is rail exit velocity', 'define'],
    ['What does extrapolated mean?', 'define'],
    ['what can you do', 'help'],
    ['tell me a joke', 'unknown'],
    ['', 'unknown'],
  ])('%s → %s', (q, kind) => {
    expect(matchIntent(q).kind).toBe(kind);
  });

  it('finds the right glossary topic', () => {
    const intent = matchIntent('what is rail exit velocity');
    expect(intent.kind === 'define' && intent.topic.id).toBe('rail-exit-velocity');
  });
});

describe('assistant answers', () => {
  const ctx = { vehicle, engine: makeEngine(), flightCase: FLIGHT_CASE };

  it('explains stability from the engine result', async () => {
    const reply = await answer('why is my rocket overstable', ctx);
    expect(reply.paragraphs).toEqual(explainStability(vehicle).plainLanguage);
    expect(reply.quantities?.[0].value.value).toBe(computeRocketStability(vehicle).staticMarginCalibers);
  });

  it('says so when the engine is unavailable instead of answering', async () => {
    const reply = await answer('why is my rocket overstable', { ...ctx, engine: unavailableEngine });
    expect(reply.paragraphs.join(' ')).toMatch(/engine is unavailable/);
    expect(reply.quantities).toBeUndefined();
  });

  it('lists what it can do for questions it does not understand', async () => {
    const reply = await answer('tell me a joke', ctx);
    expect(reply.intent).toBe('unknown');
    expect(reply.paragraphs.length).toBeGreaterThan(1);
  });

  it('suggests a fix for each failing check', async () => {
    const reply = await answer('how do I fix it', ctx);
    const failing = reply.checks!.filter((c) => c.status === 'fail').map((c) => c.id);
    expect(reply.fixes!.map((f) => f.checkId)).toEqual(failing);
  });
});

describe('explainStabilityAnalysis', () => {
  it('matches explainStability for the same engine result', () => {
    const a = explainStabilityAnalysis(vehicle, computeRocketStability(vehicle));
    const b = explainStability(vehicle);
    expect(a.plainLanguage).toEqual(b.plainLanguage);
    expect(a.staticMarginCalibers).toBe(b.staticMarginCalibers);
  });
});
