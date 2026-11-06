/**
 * What changed since the committed run, and which results that makes stale.
 * This drives the amber "changed" markers and the read-only "why is this
 * stale" view (the dependency idea from the Flow concept).
 */
import { motorContentKey, stableStringify } from '../application/caseResolver';
import type { Design, StageId } from './store';

export type Input = 'geometry' | 'mass' | 'motor' | 'launch' | 'recovery' | 'fin material' | 'calibration';
export interface Change { id: string; partId?: string; field: string; label: string; from: unknown; to: unknown; input: Input }

export const FIELD_LABELS: Record<string, string> = {
  length: 'Length', baseDiameter: 'Base diameter', wallThickness: 'Wall', shape: 'Profile', outerDiameter: 'Outer diameter', innerDiameter: 'Inner diameter',
  foreDiameter: 'Fore diameter', aftDiameter: 'Aft diameter', finCount: 'Fin count', rootChord: 'Root chord', tipChord: 'Tip chord', span: 'Span', sweepLength: 'Sweep',
  thickness: 'Thickness', crossSection: 'Cross-section', axialOffset: 'Position', materialId: 'Material', massOverride: 'Weighed mass', mass: 'Mass', diameter: 'Diameter', cd: 'Cd',
  railLength: 'Rail length', railElevationDeg: 'Rail angle', railAzimuthDeg: 'Rail azimuth', launchAltitudeASL: 'Site elevation', windSpeedSurface: 'Wind', windAzimuthDeg: 'Wind from',
  mainDeployAltitudeAGL: 'Main deploy', motorId: 'Motor', motorCurve: 'Motor curve', shearPa: 'Fin shear modulus', dragCalibration: 'Drag calibration'
};

function inputFor(type: string, field: string): Input {
  if (type === 'parachute') return 'recovery';
  if (field === 'materialId' || field === 'massOverride' || field === 'mass') return field === 'materialId' && type.includes('fin') ? 'fin material' : 'mass';
  return 'geometry';
}

/**
 * Content key of the motor a design flies, or null when the design carries no
 * catalog or does not resolve one. Freshness keys on this (audit divergence 5):
 * importing a replacement under an id already in use changes the flown motor
 * without changing `motorId`, and must still show as a change.
 */
function motorKeyOf(d: Design): string | null {
  const motor = d.motors?.[d.motorId];
  return motor === undefined ? null : motorContentKey(motor);
}

export function diffDesigns(a: Design, b: Design): Change[] {
  const out: Change[] = [];
  const byId = new Map(a.vehicle.components.map((c) => [c.id, c]));
  for (const c of b.vehicle.components) {
    const o = byId.get(c.id);
    if (!o) { out.push({ id: `${c.id}:added`, partId: c.id, field: 'added', label: `${c.name} added`, from: null, to: c.name, input: 'geometry' }); continue; }
    for (const k of new Set([...Object.keys(o), ...Object.keys(c)])) {
      if (k === 'name' || k === 'color' || k === 'comment' || k === 'id' || k === 'type') continue;
      const va = (o as unknown as Record<string, unknown>)[k], vb = (c as unknown as Record<string, unknown>)[k];
      if (va !== vb) out.push({ id: `${c.id}:${String(k)}`, partId: c.id, field: String(k), label: `${c.name} · ${FIELD_LABELS[String(k)] ?? String(k)}`, from: va, to: vb, input: inputFor(c.type, String(k)) });
    }
  }
  for (const o of a.vehicle.components) if (!b.vehicle.components.some((c) => c.id === o.id)) out.push({ id: `${o.id}:removed`, partId: o.id, field: 'removed', label: `${o.name} removed`, from: o.name, to: null, input: 'geometry' });
  if (a.motorId !== b.motorId) {
    out.push({ id: 'motor', field: 'motorId', label: 'Motor', from: a.motorId, to: b.motorId, input: 'motor' });
  } else {
    const before = motorKeyOf(a);
    const after = motorKeyOf(b);
    if (before !== null && after !== null && before !== after) {
      out.push({ id: 'motor:content', field: 'motorCurve', label: 'Motor curve', from: before, to: after, input: 'motor' });
    }
  }
  for (const k of Object.keys(b.options) as (keyof Design['options'])[]) {
    // The drag scale is reported once, as the calibration, below.
    if (k === 'dragCdScale') continue;
    if (a.options[k] !== b.options[k]) out.push({ id: `opt:${k}`, field: k, label: FIELD_LABELS[k] ?? k, from: a.options[k], to: b.options[k], input: k === 'mainDeployAltitudeAGL' ? 'recovery' : 'launch' });
  }
  if (a.shearPa !== b.shearPa) out.push({ id: 'shear', field: 'shearPa', label: FIELD_LABELS.shearPa, from: a.shearPa, to: b.shearPa, input: 'fin material' });
  if (stableStringify(a.dragCalibration ?? null) !== stableStringify(b.dragCalibration ?? null)) {
    out.push({
      id: 'calibration',
      field: 'dragCalibration',
      label: FIELD_LABELS.dragCalibration,
      from: a.dragCalibration === undefined ? 'none' : `scale ${a.dragCalibration.scale.toFixed(3)}`,
      to: b.dragCalibration === undefined ? 'none' : `scale ${b.dragCalibration.scale.toFixed(3)}`,
      input: 'calibration',
    });
  }
  return out;
}

/** Which inputs each stage's committed results depend on. Live stages (Airframe, Motor, Aero) never go stale. */
export const DEPENDS: Partial<Record<StageId, Input[]>> = {
  flight: ['geometry', 'mass', 'motor', 'launch', 'fin material', 'calibration'],
  recovery: ['geometry', 'mass', 'motor', 'launch', 'recovery', 'calibration'],
  verify: ['geometry', 'mass', 'motor', 'launch', 'recovery', 'fin material', 'calibration'],
  build: ['geometry', 'mass', 'motor', 'launch', 'recovery', 'fin material', 'calibration']
};
export const RESULTS_OF: Partial<Record<StageId, string>> = {
  flight: 'trajectory, events, flutter margin, Monte Carlo',
  recovery: 'descent and landing results',
  verify: 'flight, recovery and flutter gates',
  build: 'the pre-export check'
};

export function staleReasons(stage: StageId, changes: Change[]): Change[] {
  const deps = DEPENDS[stage];
  return deps ? changes.filter((c) => deps.includes(c.input)) : [];
}
