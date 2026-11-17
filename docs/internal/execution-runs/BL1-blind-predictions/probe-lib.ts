// BL1 blind-prediction probe helpers. TESTS/PROBE ONLY — no product code.
//
// Inputs are the two stripped design XMLs, the app's own ORK import path, the
// app's own motor database, and the released WASM. It never reads a flight log,
// an outcome, the R6 custody tree or a published result.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { parseOrkFile } from '../../../../src/formats/orkParser';
import { parseRaspEng } from '../../../../src/formats/engParser';
import { CERTIFIED_MOTORS, type MotorSpec } from '../../../../src/propulsion/motorDatabase';
import { sixDofOptions, type LaunchConfig } from '../../../../src/console/data/adapter';
import { flightRunOptions } from '../../../../src/application/caseResolver';
import { foldRailElevationDeg, gaussian, mulberry32, subSeedOf } from '../../../../src/sim/monteCarlo';
import { instantiateEngine, type EngineInstance } from '../../../../src/engine/core';
import { vehicleDto, motorDto } from '../../../../src/tauri/dto';
import type { RocketVehicle } from '../../../../src/core/types';

export const WASM_PATH = new URL('../../../../src/engine/astraea_engine.wasm', import.meta.url);
export const WASM_SHA256 = '4c1ec4ed7192f0f0eab9206481e74d2627c3a2f8010376a69f9194df10824535';

export const DESIGN_DIR = '/home/ak/astraea-evidence/goal-collegiate-accuracy/step4-blind/design';
export const MOTOR_DIR = '/home/ak/astraea-evidence/goal-collegiate-accuracy/step4-blind/motors';
export const DESIGNS = {
  V001: {
    path: `${DESIGN_DIR}/V001-Estes_Emerald_Streak.design.xml`,
    sha256: '275a50c5f5318aec031066af216c9719a724d55b15740b0b3b26cbf8ceec5e98',
    /** Stage (whole sustainer) overrides declared by the design. */
    declared: { structuralMassKg: 0.07161000000000001, cgM: 0.31496, cgOverridden: false },
  },
  V002: {
    path: `${DESIGN_DIR}/V002-DDVulcanite.design.xml`,
    sha256: '18e54445961696bb1ffc9af670816faa2febd3b94a439ad8429b79c25230ad67',
    declared: { structuralMassKg: 1.0552000000000001, cgM: 0.739775, cgOverridden: true },
  },
} as const;

export type DesignKey = keyof typeof DESIGNS;

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function loadEngine(): Promise<{ engine: EngineInstance; sha256: string }> {
  const bytes = readFileSync(WASM_PATH);
  const digest = sha256(bytes);
  if (digest !== WASM_SHA256) throw new Error(`WASM sha256 ${digest} != frozen ${WASM_SHA256}`);
  return { engine: await instantiateEngine(bytes), sha256: digest };
}

export function readDesign(key: DesignKey): { xml: string; sha256: string } {
  const { path, sha256: expected } = DESIGNS[key];
  const bytes = readFileSync(path);
  const digest = sha256(bytes);
  if (digest !== expected) throw new Error(`${key} design sha256 ${digest} != frozen ${expected}`);
  return { xml: bytes.toString('utf8'), sha256: digest };
}

/** The staged file is the ORK's rocket.ork XML with <simulations>/<flightdata> removed. */
export async function importAsOrk(xml: string): Promise<RocketVehicle> {
  const zip = new JSZip();
  zip.file('rocket.ork', xml);
  return parseOrkFile(await zip.generateAsync({ type: 'uint8array' }));
}

export interface DeclaredOverride {
  tag: string;
  name: string;
  massKg?: number;
  cgM?: number;
  cgApplies: boolean;
}

export interface DeclaredFinSeat {
  name: string;
  method: 'top' | 'middle' | 'bottom';
  valueM: number;
  parentLengthM: number;
}

interface OrderedNode { tag: string; kids: unknown[]; attrs: Record<string, unknown> }

const ATTR_GROUP = ':@';

function orderedNodes(kids: unknown): OrderedNode[] {
  if (!Array.isArray(kids)) return [];
  const out: OrderedNode[] = [];
  for (const kid of kids) {
    if (!kid || typeof kid !== 'object' || Array.isArray(kid)) continue;
    const record = kid as Record<string, unknown>;
    const tag = Object.keys(record).find((k) => k !== ATTR_GROUP);
    if (tag === undefined) continue;
    const value = record[tag];
    const attrs = (record[ATTR_GROUP] ?? {}) as Record<string, unknown>;
    out.push({ tag, kids: Array.isArray(value) ? value : [], attrs });
  }
  return out;
}

function directText(node: OrderedNode): string | undefined {
  for (const kid of node.kids) {
    if (!kid || typeof kid !== 'object' || Array.isArray(kid)) continue;
    if (!('#text' in kid)) continue;
    const text = (kid as Record<string, unknown>)['#text'];
    if (typeof text === 'string' || typeof text === 'number') return String(text);
  }
  return undefined;
}

function childNode(node: OrderedNode, tag: string): OrderedNode | undefined {
  return orderedNodes(node.kids).find((child) => child.tag === tag);
}

function childText(node: OrderedNode, tag: string): string | undefined {
  const child = childNode(node, tag);
  return child === undefined ? undefined : directText(child);
}

const DESIGN_COMPONENT_TAGS = new Set([
  'nosecone', 'bodytube', 'transition', 'parachute', 'masscomponent', 'tubecoupler',
  'innertube', 'bulkhead', 'centeringring', 'stage', 'parallelstage',
]);

/**
 * The design's own mass/CG declarations and fin seats, read from the XML before
 * the importer touches it. The app's ORK path refuses the mass/CG overrides
 * (orkParser.ts:354-356) and cannot read a nested element's `method` attribute
 * (fast-xml-parser puts it beside the child list; orderedNodeToLegacy never
 * merges it), so these values are re-applied after import — taken from the
 * design, never invented.
 */
export function collectDesignDeclarations(xml: string): { overrides: DeclaredOverride[]; finSeats: DeclaredFinSeat[] } {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', textNodeName: '#text', preserveOrder: true });
  const parsed: unknown = parser.parse(xml);
  const overrides: DeclaredOverride[] = [];
  const finSeats: DeclaredFinSeat[] = [];
  const walk = (nodes: OrderedNode[], parentLength: number | null): void => {
    for (const node of nodes) {
      if (node.tag === '#text') continue;
      const length = childText(node, 'length');
      if (node.tag.endsWith('finset') && parentLength !== null) {
        const axial = childNode(node, 'axialoffset');
        const text = axial === undefined ? undefined : directText(axial);
        if (text !== undefined) {
          const rawMethod = String(axial?.attrs['@_method'] ?? 'top').toLowerCase();
          const method = rawMethod === 'middle' || rawMethod === 'bottom' ? rawMethod : 'top';
          finSeats.push({ name: childText(node, 'name') ?? node.tag, method, valueM: Number(text), parentLengthM: parentLength });
        }
      }
      if (node.tag.endsWith('finset') || DESIGN_COMPONENT_TAGS.has(node.tag)) {
        const mass = childText(node, 'overridemass');
        const cg = childText(node, 'overridecg');
        const cgFlag = childText(node, 'overridesubcomponentscg');
        if (mass !== undefined || cg !== undefined) {
          overrides.push({
            tag: node.tag,
            name: childText(node, 'name') ?? node.tag,
            ...(mass === undefined ? {} : { massKg: Number(mass) }),
            ...(cg === undefined ? {} : { cgM: Number(cg) }),
            // ORK applies a CG override on an assembly only with this flag;
            // on a mass-bearing part it applies whenever declared.
            cgApplies: cg !== undefined && (node.tag !== 'stage' || cgFlag === 'true'),
          });
        }
      }
      walk(orderedNodes(node.kids), node.tag === 'bodytube' && length !== undefined ? Number(length) : parentLength);
    }
  };
  walk(orderedNodes(parsed), null);
  return { overrides, finSeats };
}

const STAGE_OVERRIDE_TAGS = ['overridemass', 'overridesubcomponentsmass', 'overridecg', 'overridesubcomponentscg'] as const;

/**
 * Projection used ONLY to let the app's importer build geometry from a design
 * whose mass/CG overrides it refuses. Removes exactly the elements the importer
 * refuses: the four stage-level overrides and every component `overridecg`
 * (`overridemass` elements stay and are imported normally). Declared values are
 * re-applied after import.
 */
export function projectForImport(xml: string): { xml: string; removed: string[] } {
  const stageStart = xml.indexOf('<stage>');
  const subcomponents = xml.indexOf('<subcomponents>', stageStart);
  if (stageStart < 0 || subcomponents < 0) throw new Error('design has no <stage> block');
  let head = xml.slice(stageStart, subcomponents);
  const removed: string[] = [];
  for (const tag of STAGE_OVERRIDE_TAGS) {
    const re = new RegExp(`\\s*<${tag}>[^<]*</${tag}>`, 'g');
    head = head.replace(re, () => {
      removed.push(`stage/${tag}`);
      return '';
    });
  }
  const rest = xml.slice(subcomponents).replace(/\s*<overridecg>[^<]*<\/overridecg>/g, () => {
    removed.push('component/overridecg');
    return '';
  });
  return { xml: xml.slice(0, stageStart) + head + rest, removed };
}

/** Writes the design's declared component CGs into the imported vehicle, in document order. */
export function applyDeclaredComponentCg(
  vehicle: RocketVehicle,
  declared: DeclaredOverride[],
): { vehicle: RocketVehicle; applied: Array<{ name: string; cgM: number }> } {
  const queues = new Map<string, number[]>();
  for (const d of declared) {
    if (!d.cgApplies || d.cgM === undefined) continue;
    const key = `${d.tag}|${d.name}`;
    queues.set(key, [...(queues.get(key) ?? []), d.cgM]);
  }
  const applied: Array<{ name: string; cgM: number }> = [];
  const components = vehicle.components.map((c) => {
    const cg = queues.get(`${c.type}|${c.name}`)?.shift();
    if (cg === undefined) return c;
    applied.push({ name: c.name, cgM: cg });
    return { ...c, cgOverride: cg };
  });
  return { vehicle: { ...vehicle, components }, applied };
}

/** Root chord the engine's planform analysis uses, from the imported component. */
function rootChordOf(component: RocketVehicle['components'][number]): number {
  if (component.type === 'freeformfinset') {
    const minY = Math.min(...component.points.map((p) => p.y));
    const root = component.points.filter((p) => p.y === minY).map((p) => p.x);
    return Math.max(...root) - Math.min(...root);
  }
  if (component.type === 'trapezoidfinset' || component.type === 'ellipticalfinset') return component.rootChord;
  throw new Error(`root chord undefined for ${component.type}`);
}

/**
 * Re-applies the design's declared fin seats, in document order, using the
 * app's own seat rule (orkParser.ts:88-94): offset from the parent tube's front.
 * Needed because the nested `method` attribute never reaches the importer, so a
 * bottom-edge seat is read as a top offset when the value is non-zero.
 */
export function applyDeclaredFinSeats(
  vehicle: RocketVehicle,
  seats: DeclaredFinSeat[],
): { vehicle: RocketVehicle; applied: Array<{ name: string; seatM: number; designMethod: string; designValueM: number }> } {
  const queue = [...seats];
  const applied: Array<{ name: string; seatM: number; designMethod: string; designValueM: number }> = [];
  const components = vehicle.components.map((c) => {
    if (!c.type.endsWith('finset')) return c;
    const seat = queue.shift();
    if (seat === undefined) return c;
    const rootChord = rootChordOf(c);
    const base = seat.method === 'bottom' ? seat.parentLengthM - rootChord
      : seat.method === 'middle' ? (seat.parentLengthM - rootChord) / 2 : 0;
    const seatM = Math.max(0, base + seat.valueM);
    applied.push({ name: c.name, seatM, designMethod: seat.method, designValueM: seat.valueM });
    return { ...c, axialOffset: seatM };
  });
  return { vehicle: { ...vehicle, components }, applied };
}

export interface MassRollup {
  totalMass: number;
  cg: number;
  totalLength: number;
  maxDiameter: number;
  referenceDiameter: number;
  components: Array<{ id: string; mass: number; globalCG: number; axialStart: number; axialEnd: number; length: number }>;
}

export function rollup(engine: EngineInstance, vehicle: RocketVehicle): MassRollup {
  return engine.call<MassRollup>('aggregate_mass', { vehicle: vehicleDto(vehicle) });
}

/**
 * Re-applies the design's declared stage (structural) mass and, when declared,
 * the stage CG, with one mass component. This is the documented reconstruction
 * for a design the app refuses to import: geometry and component masses are the
 * importer's; the stage override becomes a vehicle-level point mass, which is
 * exactly what the override states. Mass and (when overridden) total CG are
 * asserted before the vehicle is used.
 */
export function applyDeclaredStageOverride(
  engine: EngineInstance,
  vehicle: RocketVehicle,
  declared: { structuralMassKg: number; cgM: number; cgOverridden: boolean },
): { vehicle: RocketVehicle; base: MassRollup; applied: MassRollup; deltaKg: number; offsetM: number } {
  const base = rollup(engine, vehicle);
  const deltaKg = declared.structuralMassKg - base.totalMass;
  if (!(deltaKg > 0) || !Number.isFinite(deltaKg)) {
    throw new Error(`declared stage mass ${declared.structuralMassKg} kg is not above the importer's ${base.totalMass} kg`);
  }
  // The rollup lists one entry per vehicle component, in order. The last body
  // tube is where a mass component's axialOffset is referenced from (mass.rs:787).
  const lastTubeIndex = vehicle.components.reduce(
    (last, c, index) => (c.type === 'bodytube' ? index : last),
    vehicle.components.length - 1,
  );
  const lastTubeStart = base.components[lastTubeIndex].axialStart;
  const length = 0.01;
  // Target: declared total mass; the declared stage CG when the design
  // overrides it, otherwise the importer's own CG (overridecg on the stage is
  // inert with overridesubcomponentscg=false).
  const targetCg = declared.cgOverridden
    ? declared.cgM
    : base.cg;
  const pointCg = declared.cgOverridden
    ? (declared.structuralMassKg * targetCg - base.totalMass * base.cg) / deltaKg
    : base.cg;
  let offset = pointCg - length / 2 - lastTubeStart;
  const mass = {
    id: 'bl1-declared-stage-mass',
    name: 'Declared stage mass (design override)',
    type: 'masscomponent' as const,
    materialId: 'cardboard',
    mass: deltaKg,
    length,
    axialOffset: offset,
  };
  let candidate: RocketVehicle = { ...vehicle, components: [...vehicle.components, mass] };
  let applied = rollup(engine, candidate);
  // One linear correction for the point mass's realised global CG.
  const realised = applied.components[applied.components.length - 1].globalCG;
  offset += pointCg - realised;
  candidate = { ...vehicle, components: [...vehicle.components, { ...mass, axialOffset: offset }] };
  applied = rollup(engine, candidate);
  const massErr = Math.abs(applied.totalMass - declared.structuralMassKg);
  if (massErr > 1e-9) throw new Error(`stage mass not reproduced: ${applied.totalMass} (err ${massErr})`);
  if (declared.cgOverridden) {
    const cgErr = Math.abs(applied.cg - declared.cgM);
    if (cgErr > 1e-6) throw new Error(`stage CG not reproduced: ${applied.cg} (err ${cgErr})`);
  }
  return { vehicle: candidate, base, applied, deltaKg, offsetM: offset };
}

/** The app's new-design launch defaults (src/application/workspace.ts DEFAULT_WORKSPACE). */
export const APP_DEFAULT_LAUNCH: LaunchConfig = {
  railLength: 3.0,
  railElevationDeg: 85,
  railAzimuthDeg: 0,
  windSpeedSurface: 3.0,
  windAzimuthDeg: 0,
  finCantAngleDeg: 0,
  mainDeployAltitudeAGL: 300,
};

export function flightOptions(vehicle: RocketVehicle, launch: LaunchConfig = APP_DEFAULT_LAUNCH): Record<string, unknown> {
  return { ...sixDofOptions(launch), ...flightRunOptions(vehicle) };
}

/** The subset of the engine's flight result this lane consumes. */
export interface FlightResult {
  apogeeAltitude: number;
  apogeeTime: number;
  landingMass: number;
  flightDuration: number;
  events: Array<{ kind?: string; name?: string; time?: number; description?: string }>;
  maxMach: number;
  maxVelocity: number;
  landingPosition: { x: number; y: number; z: number };
  validity: string;
  terminated: boolean;
  terminationReason: string;
  runManifest: Record<string, unknown>;
}

export function fly(
  engine: EngineInstance,
  vehicle: RocketVehicle,
  motorId: keyof typeof CERTIFIED_MOTORS,
  options: Record<string, unknown>,
): FlightResult {
  return engine.call<FlightResult>('simulate_flight', {
    vehicle: vehicleDto(vehicle),
    motor: motorDto(CERTIFIED_MOTORS[motorId]),
    options,
  });
}

/** The full declared-design reconstruction for one sealed set. */
export async function reconstructDesign(engine: EngineInstance, key: DesignKey) {
  const design = readDesign(key);
  const { overrides, finSeats } = collectDesignDeclarations(design.xml);
  const projection = projectForImport(design.xml);
  const imported = await importAsOrk(projection.xml);
  const cg = applyDeclaredComponentCg(imported, overrides);
  const seats = applyDeclaredFinSeats(cg.vehicle, finSeats);
  const stage = applyDeclaredStageOverride(engine, seats.vehicle, DESIGNS[key].declared);
  return {
    key,
    designSha256: design.sha256,
    declaredOverrides: overrides,
    declaredFinSeats: finSeats,
    projectionRemoved: projection.removed,
    importedVehicle: imported,
    withDeclaredCg: cg,
    withDeclaredFinSeats: seats,
    vehicle: stage.vehicle,
    importerRollup: stage.base,
    finalRollup: stage.applied,
    stagePointMass: { deltaKg: stage.deltaKg, offsetM: stage.offsetM },
  };
}

/** The app's new-design Monte Carlo defaults (src/application/workspace.ts DEFAULT_WORKSPACE). */
export const APP_DEFAULT_MC = {
  nRuns: 1000,
  seed: 20260927,
  sigmas: { windAzimuthDegSigma: 10, railAngleDegSigma: 1, impulsePctSigma: 5 },
} as const;

export interface McRun { runIndex: number; apogeeASL: number; maxMach: number; landing: { x: number; y: number }; validity: string }

/**
 * One app-ensemble run: the same per-run sub-seed and draw order the engine's
 * monte_carlo uses (wind azimuth -> rail elevation with fold -> impulse), then
 * the same flight. Only apogee is read back; the app's ensemble command returns
 * landing points only (spec Amendment 2).
 */
export function ensembleRun(
  engine: EngineInstance,
  vehicle: RocketVehicle,
  motorId: keyof typeof CERTIFIED_MOTORS,
  options: Record<string, unknown>,
  cfg: typeof APP_DEFAULT_MC,
  runIndex: number,
): McRun {
  const rng = mulberry32(subSeedOf(cfg.seed, runIndex));
  const o = { ...options };
  o.windAzimuthDeg = (options.windAzimuthDeg as number) + gaussian(rng) * cfg.sigmas.windAzimuthDegSigma;
  const railBase = options.railElevationDeg as number;
  o.railElevationDeg = foldRailElevationDeg(railBase + gaussian(rng) * cfg.sigmas.railAngleDegSigma);
  const impulseScale = 1 + (cfg.sigmas.impulsePctSigma / 100) * gaussian(rng);
  const motor = motorDto(CERTIFIED_MOTORS[motorId]);
  const curve = (motor.thrustCurve as Array<{ time: number; thrust: number }>).map((p) => ({ time: p.time, thrust: p.thrust * impulseScale }));
  const flight = engine.call<FlightResult>('simulate_flight', {
    vehicle: vehicleDto(vehicle),
    motor: { ...motor, thrustCurve: curve, maxThrust: (motor.maxThrust as number) * impulseScale },
    options: o,
  });
  return { runIndex, apogeeASL: flight.apogeeAltitude, maxMach: flight.maxMach, landing: { x: flight.landingPosition.x, y: flight.landingPosition.y }, validity: flight.validity };
}

/** Nearest-rank percentile of a sorted sample, matching the engine's rule. */
export function percentile(sorted: readonly number[], pct: number): number {
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

/** The engine's own ensemble chunk, for cross-checking the per-run replication. */
export function engineChunk(
  engine: EngineInstance,
  vehicle: RocketVehicle,
  motorId: keyof typeof CERTIFIED_MOTORS,
  options: Record<string, unknown>,
  cfg: typeof APP_DEFAULT_MC,
  runStart: number,
  runEnd: number,
): { runStart: number; runEnd: number; landings: Array<{ x: number; y: number }>; runs: Array<{ runIndex: number; endpoint: { x: number; y: number } | null }>; axialDrag: string } {
  return engine.call('run_ensemble_chunk', {
    req: {
      vehicle: vehicleDto(vehicle),
      motor: motorDto(CERTIFIED_MOTORS[motorId]),
      options,
      sigmas: cfg.sigmas,
      nRuns: cfg.nRuns,
      seed: cfg.seed,
      version: 'per-run-v2',
      runStart,
      runEnd,
    },
  });
}

/** The four downloaded curves, their frozen hashes and their declared source. */
export const MOTOR_FILES = {
  d13w: { file: 'AeroTech_D13W.eng', sha256: '1940ce3c415493c8a6ee11d1755ab1ed255b5dc11eb5108697953cd6ba1cf325', source: 'cert', motorId: '5f4294d20002310000000021' },
  questC6: { file: 'Quest_C6.eng', sha256: '08d25d4fd9778d1fdc9419e0bc2c1ee76655d31d3f83d7a5020b3a585f340b71', source: 'cert', motorId: '5f4294d20002310000000016' },
  i140w: { file: 'AeroTech_HP-I140W.eng', sha256: '7986dc11a24863383fe0ac631683c986fe2a96bea7aa6f43bd24a98eeddd098d', source: 'mfr', motorId: '5f4294d200023100000003f5' },
  j270w: { file: 'AeroTech_HP-J270W.eng', sha256: '602eda39374796cfa4b72afec2b29b44fd57bd3b992daed1f0d5fbc8f0c2e3ad', source: 'mfr', motorId: '5f4294d200023100000003f7' },
} as const;

export type DownloadedMotor = keyof typeof MOTOR_FILES;

export function loadMotor(key: DownloadedMotor): { motor: MotorSpec; sha256: string; file: string; source: string; motorId: string } {
  const spec = MOTOR_FILES[key];
  const path = `${MOTOR_DIR}/${spec.file}`;
  const bytes = readFileSync(path);
  const digest = sha256(bytes);
  // The folder's own checksum file is the authority; the frozen literal must agree.
  const line = readFileSync(`${MOTOR_DIR}/SHA256SUMS`, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.trim().endsWith(spec.file));
  const expected = line?.trim().split(/\s+/)[0];
  if (expected === undefined) throw new Error(`SHA256SUMS has no entry for ${spec.file}`);
  if (expected !== spec.sha256) throw new Error(`frozen hash for ${spec.file} disagrees with SHA256SUMS`);
  if (digest !== expected) throw new Error(`${spec.file} sha256 ${digest} != SHA256SUMS ${expected}`);
  return { motor: parseRaspEng(bytes.toString('utf8')), sha256: digest, file: spec.file, source: spec.source, motorId: spec.motorId };
}

/** One flight with an arbitrary parsed motor record. */
export function flyWithMotor(
  engine: EngineInstance,
  vehicle: RocketVehicle,
  motor: MotorSpec,
  options: Record<string, unknown>,
): FlightResult {
  return engine.call<FlightResult>('simulate_flight', { vehicle: vehicleDto(vehicle), motor: motorDto(motor), options });
}

/**
 * One app-ensemble run with an arbitrary motor record and an optional base
 * impulse scale (used only for the manufacturer-data bracket). Same sub-seed,
 * draw order and curve scaling as the engine ensemble.
 */
export function ensembleRunWithMotor(
  engine: EngineInstance,
  vehicle: RocketVehicle,
  motor: MotorSpec,
  options: Record<string, unknown>,
  cfg: typeof APP_DEFAULT_MC,
  runIndex: number,
  baseImpulseScale = 1,
): McRun {
  const rng = mulberry32(subSeedOf(cfg.seed, runIndex));
  const o = { ...options };
  o.windAzimuthDeg = (options.windAzimuthDeg as number) + gaussian(rng) * cfg.sigmas.windAzimuthDegSigma;
  const railBase = options.railElevationDeg as number;
  o.railElevationDeg = foldRailElevationDeg(railBase + gaussian(rng) * cfg.sigmas.railAngleDegSigma);
  const impulseScale = baseImpulseScale * (1 + (cfg.sigmas.impulsePctSigma / 100) * gaussian(rng));
  const dto = motorDto(motor);
  const curve = (dto.thrustCurve as Array<{ time: number; thrust: number }>).map((p) => ({ time: p.time, thrust: p.thrust * impulseScale }));
  const flight = engine.call<FlightResult>('simulate_flight', {
    vehicle: vehicleDto(vehicle),
    motor: { ...dto, thrustCurve: curve, maxThrust: (dto.maxThrust as number) * impulseScale },
    options: o,
  });
  return { runIndex, apogeeASL: flight.apogeeAltitude, maxMach: flight.maxMach, landing: { x: flight.landingPosition.x, y: flight.landingPosition.y }, validity: flight.validity };
}

export function engineChunkWithMotor(
  engine: EngineInstance,
  vehicle: RocketVehicle,
  motor: MotorSpec,
  options: Record<string, unknown>,
  cfg: typeof APP_DEFAULT_MC,
  runStart: number,
  runEnd: number,
): { runStart: number; runEnd: number; landings: Array<{ x: number; y: number }>; runs: Array<{ runIndex: number; endpoint: { x: number; y: number } | null }>; axialDrag: string } {
  return engine.call('run_ensemble_chunk', {
    req: {
      vehicle: vehicleDto(vehicle),
      motor: motorDto(motor),
      options,
      sigmas: cfg.sigmas,
      nRuns: cfg.nRuns,
      seed: cfg.seed,
      version: 'per-run-v2',
      runStart,
      runEnd,
    },
  });
}
