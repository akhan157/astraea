/**
 * Astraea OpenRocket (.ork) File Adapter
 * Bi-directional import and export for OpenRocket XML / ZIP archives.
 */

import JSZip from 'jszip';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import {
  RocketVehicle,
  RocketComponent,
  NoseconeComponent,
  BodyTubeComponent,
  TransitionComponent,
  TrapezoidFinSetComponent,
  EllipticalFinSetComponent,
  ParachuteComponent,
  MassComponent,
  NoseconeShape,
  FinCrossSection,
  STANDARD_MATERIALS,
} from '../core/types';

export class InvalidOrkFileError extends Error {
  constructor(message: string) {
    super(`Invalid OpenRocket (.ork) file: ${message}`);
    this.name = 'InvalidOrkFileError';
  }
}

/**
 * Maps OpenRocket nosecone shape string to Astraea shape
 */
function mapNoseconeShape(orkShape: string | undefined): NoseconeShape {
  const shape = (orkShape || '').toUpperCase();
  if (shape.includes('CONICAL')) return 'conical';
  if (shape.includes('PARABOLIC') || shape.includes('POWER')) return 'parabolic';
  if (shape.includes('HAACK') || shape.includes('VONKARMAN') || shape.includes('VON_KARMAN')) return 'vonkarman';
  if (shape.includes('ELLIPSOID') || shape.includes('ELLIPTICAL')) return 'elliptical';
  return 'ogive';
}

/**
 * Maps OpenRocket fin cross section
 */
function mapFinCrossSection(crossSection: string | undefined): FinCrossSection {
  const cs = (crossSection || '').toUpperCase();
  if (cs.includes('ROUND')) return 'rounded';
  if (cs.includes('AIRFOIL')) return 'airfoil';
  if (cs.includes('WEDGE')) return 'double_wedge';
  return 'square';
}

/**
 * Safely parses numeric value from XML node
 */
function parseNum(val: unknown, fallback: number = 0): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}
/**
 * Material identity round-trip (F2: export→import mass fidelity).
 *
 * OpenRocket writes structural materials as `<material type="bulk"
 * density="…">Name</material>` on nosecones, tubes, transitions and fin
 * sets. Astraea's exporter writes the same shape with two guarantees of its
 * own: `density` is SI kg/m³ (the unit of STANDARD_MATERIALS) and the
 * element text is the Astraea material id when the component's material is
 * catalogued. Import resolution prefers an exact catalog id, then a catalog
 * display-name match, then the nearest catalog density within 5%, and keeps
 * the legacy hardcoded default when the element is absent (third-party and
 * legacy files). Unknown ids/densities also fall back rather than fail.
 */
function materialElement(materialId: string | undefined): unknown {
  if (!materialId) return undefined;
  const catalogued = STANDARD_MATERIALS[materialId];
  return {
    material: {
      '@_type': 'bulk',
      ...(catalogued ? { '@_density': catalogued.density } : {}),
      '#text': materialId,
    },
  };
}

function resolveMaterialId(sub: Record<string, unknown>, fallback: string): string {
  const raw = sub.material as unknown;
  const node = (
    typeof raw === 'string' ? { '#text': raw } : (raw as Record<string, unknown> | null)
  ) as { '#text'?: unknown; '@_density'?: unknown; density?: unknown } | null;
  if (!node) return fallback;
  const text = typeof node['#text'] === 'string' ? (node['#text'] as string).trim() : '';
  if (text) {
    const byId = Object.keys(STANDARD_MATERIALS).find((id) => id.toLowerCase() === text.toLowerCase());
    if (byId) return byId;
    const byName = Object.keys(STANDARD_MATERIALS).find(
      (id) => STANDARD_MATERIALS[id].name.toLowerCase() === text.toLowerCase()
    );
    if (byName) return byName;
  }
  const density = parseNum(node['@_density'] ?? node.density, Number.NaN);
  if (Number.isFinite(density) && (density as number) > 0) {
    let best: string | null = null;
    let bestRel = 0.05;
    for (const [id, mat] of Object.entries(STANDARD_MATERIALS)) {
      const rel = Math.abs(mat.density - (density as number)) / (density as number);
      if (rel < bestRel) {
        bestRel = rel;
        best = id;
      }
    }
    if (best) return best;
  }
  return fallback;
}

/**
 * Parses an OpenRocket (.ork) buffer or ArrayBuffer into a normalized RocketVehicle
 */
export async function parseOrkFile(data: ArrayBuffer | Uint8Array): Promise<RocketVehicle> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (err) {
    throw new InvalidOrkFileError(`Archive extraction failed: ${(err as Error).message}`);
  }

  // Find rocket.ork XML entry
  const xmlEntry = zip.file('rocket.ork') || Object.values(zip.files).find((f) => f.name.endsWith('.ork') || f.name.endsWith('.xml'));
  if (!xmlEntry) {
    throw new InvalidOrkFileError('No rocket.ork XML file found inside archive');
  }

  const xmlText = await xmlEntry.async('string');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
  });

  let parsedXml: Record<string, unknown>;
  try {
    parsedXml = parser.parse(xmlText);
  } catch (err) {
    throw new InvalidOrkFileError(`XML parse failed: ${(err as Error).message}`);
  }

  const root = (parsedXml.openrocket || parsedXml.rocket) as Record<string, unknown>;
  if (!root) {
    throw new InvalidOrkFileError('Missing root openrocket tag');
  }

  const rocketNode = (root.rocket || root) as Record<string, unknown>;
  const rocketName = (rocketNode.name as string) || 'Imported Rocket';
  const components: RocketComponent[] = [];

  // Recursively collect components from subcomponents trees
  function traverseSubcomponents(node: Record<string, unknown>, parentBodyTube?: { length: number; outerDiameter: number }) {
    if (!node) return;

    for (const [key, val] of Object.entries(node)) {
      const items = Array.isArray(val) ? val : [val];

      for (const item of items) {
        if (!item || typeof item !== 'object') continue;

        const sub = item as Record<string, unknown>;
        const name = (sub.name as string) || key;
        const id = `ork-${key}-${Math.random().toString(36).substring(2, 9)}`;

        if (key === 'nosecone') {
          const length = parseNum(sub.length, 0.15);
          const aftRadius = parseNum(sub.aftradius, 0.025);
          const thickness = parseNum(sub.thickness, 0.002);
          const shape = mapNoseconeShape(sub.shape as string);

          const nose: NoseconeComponent = {
            id,
            name: name || 'Nose Cone',
            type: 'nosecone',
            shape,
            length,
            baseDiameter: aftRadius * 2,
            wallThickness: thickness,
            isHollow: thickness > 0,
            materialId: resolveMaterialId(sub, 'cardboard'),
            massOverride: sub.overridemass ? parseNum(sub.overridemass) : undefined,
          };
          components.push(nose);
        } else if (key === 'bodytube') {
          const length = parseNum(sub.length, 0.4);
          const radius = parseNum(sub.radius, 0.025);
          const thickness = parseNum(sub.thickness, 0.0015);

          const tube: BodyTubeComponent = {
            id,
            name: name || 'Body Tube',
            type: 'bodytube',
            length,
            outerDiameter: radius * 2,
            innerDiameter: Math.max(0, (radius - thickness) * 2),
            materialId: resolveMaterialId(sub, 'cardboard'),
            massOverride: sub.overridemass ? parseNum(sub.overridemass) : undefined,
          };
          components.push(tube);

          if (sub.subcomponents) {
            traverseSubcomponents(sub.subcomponents as Record<string, unknown>, {
              length,
              outerDiameter: radius * 2,
            });
          }
          continue; // Already traversed children
        } else if (key === 'transition') {
          const length = parseNum(sub.length, 0.05);
          const foreRadius = parseNum(sub.foreradius, 0.025);
          const aftRadius = parseNum(sub.aftradius, 0.02);
          const thickness = parseNum(sub.thickness, 0.0015);

          const transition: TransitionComponent = {
            id,
            name: name || 'Transition',
            type: 'transition',
            length,
            foreDiameter: foreRadius * 2,
            aftDiameter: aftRadius * 2,
            wallThickness: thickness,
            isHollow: thickness > 0,
            materialId: resolveMaterialId(sub, 'cardboard'),
            massOverride: sub.overridemass ? parseNum(sub.overridemass) : undefined,
          };
          components.push(transition);
        } else if (key === 'trapezoidfinset') {
          const finCount = Math.round(parseNum(sub.fincount, 3));
          const rootChord = parseNum(sub.rootchord, 0.08);
          const tipChord = parseNum(sub.tipchord, 0.03);
          const span = parseNum(sub.height, 0.06);
          const sweepLength = parseNum(sub.sweeplength, 0.02);
          const thickness = parseNum(sub.thickness, 0.002);
          const crossSection = mapFinCrossSection(sub.crosssection as string);

          // Position inside body tube (offset from aft or front)
          let axialOffset = 0;
          if (parentBodyTube) {
            axialOffset = Math.max(0, parentBodyTube.length - rootChord);
          }

          const fins: TrapezoidFinSetComponent = {
            id,
            name: name || 'Trapezoidal Fins',
            type: 'trapezoidfinset',
            finCount,
            rootChord,
            tipChord,
            span,
            sweepLength,
            thickness,
            crossSection,
            axialOffset,
            materialId: resolveMaterialId(sub, 'balsa'),
            massOverride: sub.overridemass ? parseNum(sub.overridemass) : undefined,
          };
          components.push(fins);
        } else if (key === 'ellipticalfinset') {
          const finCount = Math.round(parseNum(sub.fincount, 3));
          const rootChord = parseNum(sub.rootchord, 0.08);
          const span = parseNum(sub.height, 0.06);
          const thickness = parseNum(sub.thickness, 0.002);

          let axialOffset = 0;
          if (parentBodyTube) {
            axialOffset = Math.max(0, parentBodyTube.length - rootChord);
          }

          const fins: EllipticalFinSetComponent = {
            id,
            name: name || 'Elliptical Fins',
            type: 'ellipticalfinset',
            finCount,
            rootChord,
            span,
            thickness,
            axialOffset,
            materialId: resolveMaterialId(sub, 'balsa'),
            massOverride: sub.overridemass ? parseNum(sub.overridemass) : undefined,
          };
          components.push(fins);
        } else if (key === 'parachute') {
          const diameter = parseNum(sub.diameter, 0.3);
          const cd = parseNum(sub.cd, 0.8);
          const mass = parseNum(sub.overridemass || sub.mass, 0.02);

          const parachute: ParachuteComponent = {
            id,
            name: name || 'Parachute',
            type: 'parachute',
            diameter,
            cd,
            mass,
            axialOffset: 0.05,
            materialId: resolveMaterialId(sub, 'cardboard'),
          };
          components.push(parachute);
        } else if (key === 'masscomponent') {
          const mass = parseNum(sub.mass || sub.overridemass, 0.015);
          const length = parseNum(sub.length, 0.03);

          const massComp: MassComponent = {
            id,
            name: name || 'Mass Component',
            type: 'masscomponent',
            mass,
            length,
            axialOffset: 0.05,
            materialId: resolveMaterialId(sub, 'cardboard'),
          };
          components.push(massComp);
        }

        // Subcomponents under stages, etc.
        if (sub.subcomponents && typeof sub.subcomponents === 'object') {
          traverseSubcomponents(sub.subcomponents as Record<string, unknown>, parentBodyTube);
        }
      }
    }
  }

  // Start traversal from stage or rocket root
  if (rocketNode.subcomponents) {
    traverseSubcomponents(rocketNode.subcomponents as Record<string, unknown>);
  }

  if (components.length === 0) {
    throw new InvalidOrkFileError('No recognizable rocket components found in file');
  }

  return {
    id: `vehicle-${Date.now()}`,
    name: rocketName,
    version: '1.0',
    author: (rocketNode.designer as string) || 'OpenRocket Import',
    notes: 'Imported from OpenRocket (.ork)',
    components,
  };
}

/**
 * Exports a RocketVehicle to an OpenRocket (.ork) ZIP archive containing rocket.ork XML
 */
export async function exportToOrk(vehicle: RocketVehicle): Promise<Uint8Array> {
  const zip = new JSZip();

  // Find components (every kind the importer understands is exported; F2:
  // silently dropped transitions/parachutes/mass parts drifted length and
  // mass on re-import).
  const nose = vehicle.components.find((c) => c.type === 'nosecone') as NoseconeComponent | undefined;
  const bodyTubes = vehicle.components.filter((c) => c.type === 'bodytube') as BodyTubeComponent[];
  const transitions = vehicle.components.filter((c) => c.type === 'transition') as TransitionComponent[];
  const parachutes = vehicle.components.filter((c) => c.type === 'parachute') as ParachuteComponent[];
  const massParts = vehicle.components.filter((c) => c.type === 'masscomponent') as MassComponent[];
  const fins = vehicle.components.find((c) => c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset');

  // Construct XML object
  const orkXmlObj = {
    '?xml': { '@_version': '1.0', '@_encoding': 'utf-8' },
    openrocket: {
      '@_version': '1.9',
      '@_creator': 'Astraea Rocket Engineering Workstation',
      rocket: {
        name: vehicle.name,
        designer: vehicle.author || 'Astraea User',
        subcomponents: {
          stage: {
            name: 'Sustainer Stage',
            subcomponents: {
              nosecone: nose
                ? {
                    name: nose.name,
                    shape: nose.shape.toUpperCase(),
                    length: nose.length,
                    aftradius: nose.baseDiameter / 2,
                    thickness: nose.wallThickness,
                    ...(nose.massOverride ? { overridemass: nose.massOverride } : {}),
                    ...(materialElement(nose.materialId) as object),
                  }
                : undefined,
              bodytube: bodyTubes.map((bt) => ({
                name: bt.name,
                length: bt.length,
                radius: bt.outerDiameter / 2,
                thickness: (bt.outerDiameter - bt.innerDiameter) / 2,
                ...(bt.massOverride ? { overridemass: bt.massOverride } : {}),
                ...(materialElement(bt.materialId) as object),
                subcomponents:
                  fins && bt === bodyTubes[bodyTubes.length - 1]
                    ? fins.type === 'trapezoidfinset'
                      ? {
                          trapezoidfinset: {
                            name: fins.name,
                            fincount: fins.finCount,
                            rootchord: fins.rootChord,
                            tipchord: fins.tipChord,
                            height: fins.span,
                            sweeplength: fins.sweepLength,
                            thickness: fins.thickness,
                            crosssection: fins.crossSection.toUpperCase(),
                            ...(materialElement(fins.materialId) as object),
                          },
                        }
                      : {
                          ellipticalfinset: {
                            name: fins.name,
                            fincount: fins.finCount,
                            rootchord: fins.rootChord,
                            height: fins.span,
                            thickness: fins.thickness,
                            ...(materialElement(fins.materialId) as object),
                          },
                        }
                    : undefined,
              })),
              transition: transitions.length
                ? transitions.map((tr) => ({
                name: tr.name,
                length: tr.length,
                foreradius: tr.foreDiameter / 2,
                aftradius: tr.aftDiameter / 2,
                thickness: tr.wallThickness,
                ...(tr.massOverride ? { overridemass: tr.massOverride } : {}),
                ...(materialElement(tr.materialId) as object),
              }))
                : undefined,
              parachute: parachutes.length
                ? parachutes.map((ch) => ({
                name: ch.name,
                diameter: ch.diameter,
                cd: ch.cd,
                overridemass: ch.mass,
                ...(materialElement(ch.materialId) as object),
              }))
                : undefined,
              masscomponent: massParts.length
                ? massParts.map((mc) => ({
                name: mc.name,
                mass: mc.mass,
                length: mc.length,
                ...(materialElement(mc.materialId) as object),
              }))
                : undefined,
            },
          },
        },
      },
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    indentBy: '  ',
  });

  const xmlOutput = builder.build(orkXmlObj);
  zip.file('rocket.ork', xmlOutput);

  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
