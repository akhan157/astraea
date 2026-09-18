/**
 * Astraea Export Omission Previews (adapter matrix row 6, S7)
 *
 * Pure describers behind the InteropExportPanel download triggers for
 * RKT (exportRkt), ENG (exportToEng), KML (exportKml), STEP (exportStep),
 * and STL (exportStlBinary). Each describes, BEFORE any bytes are emitted,
 * exactly what the target format drops or refuses:
 *
 * - `refused`: inputs the exporter would throw on (fail-closed). A
 *   non-empty refusal list means `canExport` is false and the trigger must
 *   not download.
 * - `omissions`: lossy-but-exportable notes — fields the format cannot
 *   carry, so the user confirms the subset before downloading.
 *
 * The preview mirrors the exporter's own validation (RKT subset scan,
 * ENG validateMotorSpec gate, STEP/STL tessellation attempt) so the
 * preview and the download cannot disagree; the panel still surfaces
 * exporter errors fail-closed at confirm time.
 *
 * B-lane port note (frontend commit 26b71b7): the KML describers read the
 * S2 run surface (`src/store/runStore.ts`) here, not a telemetry field on
 * rocketStore. `lastSimRun()` projects the explicitly chosen committed run
 * (identity + runKey) with an EMPTY telemetry payload — the S4 job service
 * publishes payloads, and the projection never fabricates points. So the
 * KML trigger refuses a run whose telemetry payload has not been published,
 * and `buildKmlInputs` validates the payload structure at download time.
 * Exports are frozen snapshots of the chosen run at click time; live views
 * re-evaluate with their own freshness marker (synthesis §2 pattern 9).
 */

import type { RocketVehicle } from '../core/types';
import type { MotorSpec } from '../propulsion/motorDatabase';
import { validateMotorSpec } from '../propulsion/motorDatabase';
import { tessellateVehicle } from './stepExport';
import type { RunFreshness } from '../store/runStore';

export type ExportTriggerKind = 'rkt' | 'eng' | 'kml' | 'step' | 'stl';

export interface OmissionPreview {
  kind: ExportTriggerKind;
  title: string;
  filename: string;
  /** Blockers: the exporter would throw on these. Non-empty => no download. */
  refused: string[];
  /** Lossy-but-exportable notes the user confirms before downloading. */
  omissions: string[];
  canExport: boolean;
}

export interface KmlExportInputs {
  landings: Array<{ x: number; y: number }>;
  apogeeTrack: Array<{ x: number; y: number; z: number }>;
}

/**
 * KML input snapshot resolved from the S2 run store: the explicitly chosen
 * committed run's identity and freshness plus its single-trajectory
 * telemetry payload. The payload is `unknown[]` and empty until the S4 job
 * service publishes it — `buildKmlInputs` validates the structure at
 * download time and the describe path refuses nothing-to-serialize runs.
 */
export interface KmlRunSnapshot {
  /** S1 snapshot key the run was resolved under. */
  runKey: string;
  /** Run-store freshness marker; the export is a frozen snapshot of this run. */
  freshness: RunFreshness;
  /** Single-trajectory telemetry payload; empty until the S4 job service publishes. */
  telemetry: readonly unknown[];
}

/** File slug shared with the panel's existing triggers. */
export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-') || 'vehicle';
}

function preview(
  kind: ExportTriggerKind,
  title: string,
  filename: string,
  refused: string[],
  omissions: string[],
): OmissionPreview {
  return { kind, title, filename, refused, omissions, canExport: refused.length === 0 };
}

/**
 * RockSim (.rkt) subset preview. Supported: nosecone, bodytube,
 * transition, trapezoidfinset, masscomponent, parachute. Refused:
 * ellipticalfinset (the importer would read it back as trapezoid, so the
 * exporter fails closed rather than silently lossy) and fin/parachute/
 * mass components with no preceding body tube (the importer only finds
 * them nested under AttachedParts).
 */
export function describeRktPreview(vehicle: RocketVehicle): OmissionPreview {
  const refused: string[] = [];
  const omissions: string[] = [];
  let attachedTubeSeen = false;
  let vonKarman = 0;
  for (const comp of vehicle.components) {
    // Captured up front: every union member carries both, and the default
    // branch below narrows comp to never, where member access proves nothing.
    const compName: string = comp.name;
    const compKind: string = comp.type;
    switch (comp.type) {
      case 'nosecone':
        if (comp.shape === 'vonkarman') vonKarman++;
        break;
      case 'bodytube':
        attachedTubeSeen = true;
        break;
      case 'transition':
        break;
      case 'trapezoidfinset':
      case 'masscomponent':
      case 'parachute':
        if (!attachedTubeSeen) {
          refused.push(
            `"${comp.name}" (${comp.type}) has no preceding body tube: ` +
              'fin sets, parachutes, and mass components attach under a tube ' +
              'in RockSim and cannot be exported standalone.',
          );
        }
        break;
      case 'ellipticalfinset':
        refused.push(
          `"${comp.name}" (ellipticalfinset) is refused: RockSim has no ` +
            'elliptical fin-set node and the importer would read it back ' +
            'as a trapezoid fin set — export fails closed instead of silently lossy.',
        );
        break;
      default:
        refused.push(
          `"${compName}" carries an unsupported component type (${compKind}) ` +
            'with no RockSim representation.',
        );
        break;
    }
  }
  omissions.push('Component ids, materials, and colors are not serialized (geometry and mass only).');
  omissions.push(
    'Fin-set, parachute, and mass-component axial stations are carried only as ' +
      'tube attachment — exact axial offsets, fin cross-sections, wall thickness, ' +
      'and hollow interiors are not serialized.',
  );
  omissions.push('All components land in a single Stage3Parts block (no staging).');
  if (vonKarman > 0) {
    omissions.push(
      `${vonKarman} von K\u00e1rm\u00e1n nosecone${vonKarman === 1 ? '' : 's'} export as ogive ` +
        '(ShapeCode 1): RockSim has no von K\u00e1rm\u00e1n code.',
    );
  }
  return preview('rkt', 'RockSim (.rkt)', `${slugify(vehicle.name)}.rkt`, refused, omissions);
}

/**
 * RASP (.eng) motor preview. The record is validateMotorSpec-gated first —
 * an invalid record is refused, never a file the parser would reject.
 * Lossy notes: bare-number designation tokens cannot occupy the RASP name
 * column and are dropped; id/manufacturer/impulse-class/burn-time/dry-mass
 * are not serialized; the header impulse columns are informational (the
 * parser ignores them — the tabulated curve is the only authority).
 */
export function describeEngPreview(motor: MotorSpec): OmissionPreview {
  const filename = `${motor && motor.id ? motor.id : 'motor'}.eng`;
  try {
    validateMotorSpec(motor);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return preview('eng', 'RASP motor (.eng)', filename, [message], []);
  }
  const droppedTokens = motor.designation
    .trim()
    .split(/\s+/)
    .filter((t) => /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t));
  const omissions: string[] = [
    'Motor id, manufacturer, impulse class, burn time, and dry mass are not serialized.',
    'Header total-impulse / average-thrust / peak-thrust columns are informational only ' +
      '— the tabulated thrust curve is the sole authority on re-import.',
  ];
  if (droppedTokens.length > 0) {
    omissions.push(
      `Bare-number designation token${droppedTokens.length === 1 ? '' : 's'} ` +
        `"${droppedTokens.join(' ')}" ${droppedTokens.length === 1 ? 'is' : 'are'} dropped: ` +
        'the RASP name column cannot carry numbers without shifting the geometry/mass columns.',
    );
  }
  return preview('eng', 'RASP motor (.eng)', filename, [], omissions);
}

/**
 * Waiver-containment (.kml) preview. The landing cloud and flight path
 * come from the explicitly chosen committed run in the S2 run store: the
 * single touchdown point plus the full telemetry track. With no committed
 * run (or a run whose telemetry payload has not been published by the S4
 * job service) there is nothing to serialize — refused.
 *
 * Pattern 9 (synthesis §2): the export freezes the run snapshot at click
 * time and says so; live views re-evaluate with the run store's freshness
 * marker. A stale chosen run exports only under a frozen-snapshot label.
 */
export function describeKmlPreview(run: KmlRunSnapshot | null, slug: string): OmissionPreview {
  const filename = `${slug}-containment.kml`;
  if (!run) {
    return preview('kml', 'Waiver containment (.kml)', filename, [
      'No committed run yet — run Flight Sim first; the KML landing cloud ' +
        'and flight path are serialized from committed trajectory telemetry.',
    ], []);
  }
  if (run.telemetry.length === 0) {
    return preview('kml', 'Waiver containment (.kml)', filename, [
      `Run "${run.runKey}" carries no telemetry payload yet — the single-trajectory ` +
        'payload is published by the S4 job service, so there is nothing to serialize. ' +
        'This preview is a frozen snapshot of the chosen run at click time; live views ' +
        're-evaluate with their own freshness marker.',
    ], []);
  }
  const omissions: string[] = [
    'Coordinates are the simulation local ENU frame (metres from the pad), not ' +
      'georeferenced — the consumer must apply a georeferencing transform before globe use.',
    'Single committed trajectory only (touchdown point + flight path), not a Monte Carlo dispersion cloud.',
    'Exports freeze at click time: this file serializes the run snapshot exactly as ' +
      'committed under its runKey, not a re-evaluation of current inputs.',
  ];
  if (run.freshness === 'stale') {
    omissions.push(
      `Run "${run.runKey}" is STALE (inputs changed after it committed): the export is a ` +
        'frozen snapshot of that run at click time, and live views re-evaluate current ' +
        'inputs with a freshness marker.',
    );
  }
  return preview('kml', 'Waiver containment (.kml)', filename, [], omissions);
}

/** Guard: a published payload point must carry a finite position triple. */
function isPublishedTrackPoint(p: unknown): p is { position: { x: number; y: number; z: number } } {
  if (typeof p !== 'object' || p === null || !('position' in p)) return false;
  const pos = p.position;
  if (typeof pos !== 'object' || pos === null) return false;
  if (!('x' in pos) || !('y' in pos) || !('z' in pos)) return false;
  return (
    typeof pos.x === 'number' &&
    typeof pos.y === 'number' &&
    typeof pos.z === 'number' &&
    Number.isFinite(pos.x) &&
    Number.isFinite(pos.y) &&
    Number.isFinite(pos.z)
  );
}

/**
 * Resolves the KML inputs from a committed run snapshot (touchdown + track).
 * Fail-closed on the payload channel the S2 projection leaves empty today:
 * no points, or a structurally invalid point, throws instead of emitting a
 * fabricated track.
 */
export function buildKmlInputs(run: KmlRunSnapshot): KmlExportInputs {
  const telemetry = run.telemetry;
  if (telemetry.length === 0) {
    throw new Error('buildKmlInputs: committed run carries no telemetry points');
  }
  const positions = telemetry.map((p, i) => {
    if (!isPublishedTrackPoint(p)) {
      throw new TypeError(
        `buildKmlInputs: telemetry point ${i} is not a published track point ` +
          '(finite position.x/y/z required)',
      );
    }
    return p.position;
  });
  const last = positions[positions.length - 1];
  const landings = [{ x: last.x, y: last.y }];
  return { landings, apogeeTrack: positions };
}

function describeMeshPreview(
  vehicle: RocketVehicle,
  kind: 'step' | 'stl',
  title: string,
  extension: string,
): OmissionPreview {
  const filename = `${slugify(vehicle.name)}.${extension}`;
  const skipped: string[] = [];
  for (const comp of vehicle.components) {
    if (comp.type === 'masscomponent' || comp.type === 'parachute') skipped.push(comp.name);
  }
  let solidCount = 0;
  try {
    solidCount = tessellateVehicle(vehicle).solids.length;
  } catch (err) {
    // The tessellator is the authority: its refusal is the preview refusal,
    // so preview and download cannot disagree.
    const message = err instanceof Error ? err.message : String(err);
    return preview(kind, title, filename, [message], []);
  }
  const omissions: string[] = [
    `Outer mold line only: ${solidCount} faceted solid${solidCount === 1 ? '' : 's'}; ` +
      'hollow interiors, wall thickness, body-tube inner diameter, motor mounts, ' +
      'and fin cross-section shaping are not modeled.',
    'Faceted planar approximation — no BREP curves beyond straight facets.',
  ];
  if (skipped.length > 0) {
    omissions.push(
      `Skipped internal hardware (not outer-mold-line geometry): ${skipped.map((n) => `"${n}"`).join(', ')}.`,
    );
  }
  return { kind, title, filename, refused: [], omissions, canExport: true };
}

/**
 * STEP (AP203 OML solid-model) preview. OML-only: internal payload and
 * recovery hardware are skipped; the tessellator's own refusal (no axial
 * body, fin set before any tube, degenerate geometry) blocks the download.
 */
export function describeStepPreview(vehicle: RocketVehicle): OmissionPreview {
  const base = describeMeshPreview(vehicle, 'step', 'STEP solid model (.step)', 'step');
  if (!base.canExport) return base;
  return {
    ...base,
    omissions: [
      ...base.omissions,
      'SI metre LENGTH_UNIT declared, so hosts (FreeCAD, SolidWorks) open at true scale; ' +
        'solid ids are deterministic — repeat exports are byte-identical.',
    ],
  };
}

/**
 * Binary STL preview. Same OML mesh as STEP, plus the STL convention:
 * no unit declaration (SI metres by header text and documentation) and
 * facet normals recomputed from the stored winding.
 */
export function describeStlPreview(vehicle: RocketVehicle): OmissionPreview {
  const base = describeMeshPreview(vehicle, 'stl', 'Binary STL (.stl)', 'stl');
  if (!base.canExport) return base;
  return {
    ...base,
    omissions: [
      ...base.omissions,
      'STL carries no unit declaration: coordinates are SI metres by convention ' +
        '(noted in the 80-byte header); facet normals are recomputed from winding.',
    ],
  };
}