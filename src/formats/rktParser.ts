/**
 * Astraea RockSim (.rkt) File Adapter
 * Native XML parser for Apogee RockSim rocket design files.
 */

import { XMLParser } from 'fast-xml-parser';
import {
  RocketVehicle,
  RocketComponent,
  NoseconeComponent,
  BodyTubeComponent,
  TransitionComponent,
  TrapezoidFinSetComponent,
  ParachuteComponent,
  MassComponent,
  NoseconeShape,
} from '../core/types';

export class InvalidRktFileError extends Error {
  constructor(message: string) {
    super(`Invalid RockSim (.rkt) file: ${message}`);
    this.name = 'InvalidRktFileError';
  }
}

/**
 * Maps RockSim ShapeCode to Astraea NoseconeShape
 * 1 = Ogive, 2 = Conical, 3 = Parabolic, 4 = Elliptical
 */
function mapShapeCode(code: unknown): NoseconeShape {
  const codeStr = String(code || '').trim();
  if (codeStr === '2' || codeStr.toLowerCase().includes('conic')) return 'conical';
  if (codeStr === '3' || codeStr.toLowerCase().includes('parabol')) return 'parabolic';
  if (codeStr === '4' || codeStr.toLowerCase().includes('ellip')) return 'elliptical';
  return 'ogive';
}

function parseMm(val: unknown, fallbackMm: number = 0): number {
  if (typeof val === 'number') return val / 1000;
  if (typeof val === 'string') {
    const num = parseFloat(val);
    return Number.isFinite(num) ? num / 1000 : fallbackMm / 1000;
  }
  return fallbackMm / 1000;
}

function parseGrams(val: unknown, fallbackGrams: number = 0): number {
  if (typeof val === 'number') return val / 1000;
  if (typeof val === 'string') {
    const num = parseFloat(val);
    return Number.isFinite(num) ? num / 1000 : fallbackGrams / 1000;
  }
  return fallbackGrams / 1000;
}

/**
 * Parses a RockSim (.rkt) XML string into a normalized RocketVehicle
 */
export function parseRktString(xmlContent: string): RocketVehicle {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    preserveOrder: true,
  });
  // Object-mode XML groups repeated tags (tube/transition/tube becomes
  // tube/tube/transition). Retain sibling order alongside the field lookup.
  const order = new WeakMap<object, Array<[string, unknown]>>();
  const entries = (node: Record<string, unknown>): Array<[string, unknown]> => order.get(node) ?? Object.entries(node);
  function fields(nodes: Array<Record<string, unknown>>): unknown {
    if (nodes.length === 0) return '';
    if (nodes.length === 1 && '#text' in nodes[0]) return nodes[0]['#text'];
    const result: Record<string, unknown> = Object.create(null);
    const siblings: Array<[string, unknown]> = [];
    for (const node of nodes) {
      // Canonical subset fields are child elements. Do not silently discard
      // recognized override attributes while constructing that field view.
      const attributes = node[':@'] as Record<string, unknown> | undefined;
      if (attributes && ['@_KnownMass', '@_KnownCG', '@_UseKnownMass', '@_UseKnownCG'].some((key) => key in attributes)) {
        throw new InvalidRktFileError('Unsupported mass/CG override attributes; only child-element metadata with explicit false/0 flags is supported.');
      }
      for (const [key, children] of Object.entries(node)) {
        if (key === ':@' || key === '#text') continue;
        const value = fields(children as Array<Record<string, unknown>>);
        siblings.push([key, value]);
        if (Object.prototype.hasOwnProperty.call(result, key)) {
          const previous = result[key];
          result[key] = Array.isArray(previous) ? [...previous, value] : [previous, value];
        } else result[key] = value;
      }
    }
    order.set(result, siblings);
    return result;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = fields(parser.parse(xmlContent)) as Record<string, unknown>;
  } catch (err) {
    if (err instanceof InvalidRktFileError) throw err;
    throw new InvalidRktFileError(`XML parsing failed: ${(err as Error).message}`);
  }

  const root = (parsed.RockSimDocument || parsed) as Record<string, unknown>;
  const designInfo = (root.DesignInformation || {}) as Record<string, unknown>;
  const rocketDesign = (designInfo.RocketDesign || {}) as Record<string, unknown>;

  const vehicleName = (rocketDesign.Name as string) || (rocketDesign.RocketName as string) || 'RockSim Vehicle';
  // This subset has no proven vendor mass/CG override mapping. Only explicit
  // false/0 flags make Known* metadata unambiguously inactive; never infer units.
  const disabled = (value: unknown): boolean => value === false || value === 0 || value === '0' || value === 'false';
  function refuseOverrides(node: Record<string, unknown>, scope: string): void {
    const name = String(node.PartName ?? node.Name ?? scope);
    const massDisabled = disabled(node.UseKnownMass);
    const cgDisabled = disabled(node.UseKnownCG);
    if ((node.UseKnownMass !== undefined && !massDisabled) ||
        (node.UseKnownCG !== undefined && !disabled(node.UseKnownCG)) ||
        (node.KnownMass !== undefined && !massDisabled) ||
        (node.KnownCG !== undefined && !cgDisabled)) {
      throw new InvalidRktFileError(`Unsupported mass/CG override on '${name}'; only explicitly disabled (false/0) KnownMass/KnownCG metadata is supported.`);
    }
    for (const [key, value] of entries(node)) {
      if (value && typeof value === 'object') refuseOverrides(value as Record<string, unknown>, `${scope}/${key}`);
    }
  }
  refuseOverrides(rocketDesign, vehicleName);
  const components: RocketComponent[] = [];

  // Stages can be Stage3Parts (sustainer), Stage2Parts (booster), Stage1Parts
  const stageKeys = Object.keys(rocketDesign).filter((k) => k.startsWith('Stage') && k.endsWith('Parts'));
  const targetStages = stageKeys.length > 0 ? stageKeys : ['Stage3Parts'];

  for (const stageKey of targetStages) {
    const stage = rocketDesign[stageKey];
    if (!stage || typeof stage !== 'object') continue;

    traverseStage(stage as Record<string, unknown>);
  }

  function traverseStage(stageObj: Record<string, unknown>) {
    let lastTubeLen = 0.4;

    for (const [key, val] of entries(stageObj)) {
      const items = Array.isArray(val) ? val : [val];

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const part = item as Record<string, unknown>;
        const partName = (part.PartName as string) || (part.Name as string) || key;
        const id = `rkt-${key.toLowerCase()}-${Math.random().toString(36).substring(2, 9)}`;

        if (key.toLowerCase() === 'nosecone') {
          const length = parseMm(part.Len, 150);
          const aftDia = parseMm(part.AftDia, 40);
          const thickness = parseMm(part.WallThickness, 2);
          const shape = mapShapeCode(part.ShapeCode);

          const nose: NoseconeComponent = {
            id,
            name: partName,
            type: 'nosecone',
            shape,
            length,
            baseDiameter: aftDia,
            wallThickness: thickness,
            isHollow: thickness > 0,
            materialId: 'pla_3dprint',
          };
          components.push(nose);
        } else if (key.toLowerCase() === 'bodytube') {
          const length = parseMm(part.Len, 400);
          const od = parseMm(part.OD, 40);
          const idDia = parseMm(part.ID, 38);
          lastTubeLen = length;

          const tube: BodyTubeComponent = {
            id,
            name: partName,
            type: 'bodytube',
            length,
            outerDiameter: od,
            innerDiameter: idDia,
            materialId: 'cardboard',
          };
          // Motor mount: child <MotorMount> carries the seated motor reference
          // written by rktExport. Absent in legacy files -> unflagged mount.
          // An empty <MotorMount/> parses to "" (fast-xml-parser empty-node
          // value); that is still a present mount, so presence is the test.
          if (part.MotorMount !== undefined) {
            const mount = typeof part.MotorMount === 'object' && part.MotorMount
              ? (part.MotorMount as Record<string, unknown>)
              : {};
            tube.isMotorMount = true;
            if (mount.Motor !== undefined && mount.Motor !== '') tube.assignedMotorId = String(mount.Motor);
          }
          components.push(tube);

          // Check for sub-parts attached to body tube
          if (part.AttachedParts && typeof part.AttachedParts === 'object') {
            traverseAttached(part.AttachedParts as Record<string, unknown>, lastTubeLen);
          } else {
            // Direct child tags
            traverseAttached(part, lastTubeLen);
          }
        } else if (key.toLowerCase() === 'transition') {
          const length = parseMm(part.Len, 80);
          const foreDia = parseMm(part.ForeDia, 40);
          const aftDia = parseMm(part.AftDia, 30);
          const thickness = parseMm(part.WallThickness, 2);

          const trans: TransitionComponent = {
            id,
            name: partName,
            type: 'transition',
            length,
            foreDiameter: foreDia,
            aftDiameter: aftDia,
            wallThickness: thickness,
            isHollow: thickness > 0,
            materialId: 'cardboard',
          };
          components.push(trans);
        }
      }
    }
  }

  function traverseAttached(attachedObj: Record<string, unknown>, parentTubeLength: number) {
    for (const [subKey, subVal] of entries(attachedObj)) {
      const subItems = Array.isArray(subVal) ? subVal : [subVal];

      for (const item of subItems) {
        if (!item || typeof item !== 'object') continue;
        const subPart = item as Record<string, unknown>;
        const subName = (subPart.PartName as string) || (subPart.Name as string) || subKey;
        const subId = `rkt-${subKey.toLowerCase()}-${Math.random().toString(36).substring(2, 9)}`;

        if (subKey.toLowerCase().includes('finset')) {
          const finCount = Math.round(parseFloat(String(subPart.FinCount || 3)) || 3);
          const rootChord = parseMm(subPart.RootChord, 80);
          const tipChord = parseMm(subPart.TipChord, 30);
          const span = parseMm(subPart.SemiSpan, 60);
          const sweep = parseMm(subPart.SweepDistance, 30);
          const thickness = parseMm(subPart.Thickness, 3);

          const fins: TrapezoidFinSetComponent = {
            id: subId,
            name: subName,
            type: 'trapezoidfinset',
            finCount,
            rootChord,
            tipChord,
            span,
            sweepLength: sweep,
            thickness,
            crossSection: 'rounded',
            axialOffset: Math.max(0, parentTubeLength - rootChord),
            materialId: 'plywood',
          };
          components.push(fins);
        } else if (subKey.toLowerCase() === 'parachute') {
          const dia = parseMm(subPart.Dia, 300);
          const cd = parseFloat(String(subPart.Cd || 0.8)) || 0.8;
          const mass = parseGrams(subPart.Weight, 25);

          const chute: ParachuteComponent = {
            id: subId,
            name: subName,
            type: 'parachute',
            diameter: dia,
            cd,
            mass,
            axialOffset: 0.05,
            materialId: 'cardboard',
          };
          components.push(chute);
        } else if (subKey.toLowerCase() === 'massobject') {
          const mass = parseGrams(subPart.Mass, 50);

          const massComp: MassComponent = {
            id: subId,
            name: subName,
            type: 'masscomponent',
            mass,
            length: 0.05,
            axialOffset: 0.05,
            materialId: 'cardboard',
          };
          components.push(massComp);
        }
      }
    }
  }

  if (components.length === 0) {
    throw new InvalidRktFileError('No recognizable rocket components found in RockSim XML');
  }

  return {
    id: `rkt-vehicle-${Date.now()}`,
    name: vehicleName,
    version: '1.0',
    author: (rocketDesign.Designer as string) || 'RockSim Import',
    notes: 'Imported from Apogee RockSim (.rkt)',
    components,
  };
}
