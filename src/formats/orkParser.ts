/**
 * Astraea OpenRocket (.ork) File Adapter
 * Bi-directional import and export for OpenRocket XML / ZIP archives.
 */

import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
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
 * catalogued. Import resolution (see resolveMaterialId) prefers an exact
 * catalog id, then a catalog display-name match, then the nearest catalog
 * density within 5%, and keeps the legacy hardcoded default when the
 * element is absent (third-party and legacy files).
 */
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
 * Attribute group key used by fast-xml-parser in preserveOrder mode
 * (attributesGroupName): a single ': @'-style entry per element holding the
 * '@_'-prefixed attribute map.
 */
const ATTR_GROUP_KEY = ':@';

/**
 * Extracts the scalar value and attributes from a preserveOrder child entry
 * ({tag: [ {': @': attrs}, {'#text': value} ]}). Returns null when the entry
 * contains nested elements (a structural node, not a scalar).
 */
function orderedScalarValue(value: unknown): { attrs: Record<string, unknown>; text: unknown } | null {
  const arr = Array.isArray(value) ? value : [value];
  const attrs: Record<string, unknown> = {};
  const texts: unknown[] = [];
  for (const item of arr) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const keys = Object.keys(item as Record<string, unknown>);
      if (keys.length === 1 && keys[0] === ATTR_GROUP_KEY) {
        Object.assign(attrs, ((item as Record<string, unknown>)[ATTR_GROUP_KEY] ?? {}) as Record<string, unknown>);
        continue;
      }
      if (keys.length === 1 && keys[0] === '#text') {
        const t = (item as Record<string, unknown>)['#text'];
        if (t !== undefined) texts.push(t);
        continue;
      }
      return null; // nested element list → structural node
    }
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      texts.push(item);
    }
  }
  return { attrs, text: texts.length === 0 ? undefined : texts.length === 1 ? texts[0] : texts };
}

/**
 * Converts one preserveOrder element ({tag: [child entries]}) into the plain
 * shape the per-component readers expect: scalar children become primitives,
 * repeated tags become arrays, tagged attributes are merged as '@_'-prefixed
 * keys, and nested subcomponents stay as the raw ordered child list so the
 * traversal keeps exact document order.
 */
function orderedNodeToLegacy(entry: Record<string, unknown>): { tag: string; plain: Record<string, unknown> } {
  const tag = Object.keys(entry).find((k) => k !== ATTR_GROUP_KEY) ?? '';
  const plain: Record<string, unknown> = {};
  const kids = entry[tag];
  if (kids !== undefined) {
    const arr = Array.isArray(kids) ? kids : [kids];
    for (const kid of arr) {
      if (!kid || typeof kid !== 'object' || Array.isArray(kid)) continue;
      const [k, v] = Object.entries(kid as Record<string, unknown>)[0];
      if (k === ATTR_GROUP_KEY) {
        Object.assign(plain, (v ?? {}) as Record<string, unknown>);
        continue;
      }
      if (k === '#text') {
        plain['#text'] = v;
        continue;
      }
      const scalar = orderedScalarValue(v);
      let value: unknown;
      if (scalar === null) {
        value = v; // nested element list — kept raw (document order preserved)
      } else if (scalar.text === undefined) {
        value = Object.keys(scalar.attrs).length > 0 ? scalar.attrs : undefined;
      } else if (Object.keys(scalar.attrs).length > 0) {
        value = { ...scalar.attrs, '#text': scalar.text };
      } else {
        value = scalar.text;
      }
      if (value === undefined) continue;
      if (Object.prototype.hasOwnProperty.call(plain, k)) {
        if (Array.isArray(plain[k])) (plain[k] as unknown[]).push(value);
        else plain[k] = [plain[k], value];
      } else {
        plain[k] = value;
      }
    }
  }
  return { tag, plain };
}

/**
 * Merges an ordered child list (array of {tag: [...]} entries) into a plain
 * object keyed by element name, preserving attributes and repeated tags.
 * Used to lift a named container (e.g. the rocket node) out of its parent's
 * child list, where each entry is one direct child element.
 */
function orderedListToPlain(entries: unknown[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const { tag, plain } = orderedNodeToLegacy(raw as Record<string, unknown>);
    if (!tag) continue;
    // Text-only entries ({name: [{'#text': 'X'}]}) collapse to the scalar;
    // entries with attributes or structure stay objects.
    const keys = Object.keys(plain);
    const value = keys.length === 1 && keys[0] === '#text' ? plain['#text'] : plain;
    if (Object.prototype.hasOwnProperty.call(out, tag)) {
      out[tag] = Array.isArray(out[tag]) ? [...(out[tag] as unknown[]), value] : [out[tag], value];
    } else {
      out[tag] = value;
    }
  }
  return out;
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
    // Ordered-JS output: elements keep exact document order instead of being
    // regrouped by tag name (non-adjacent repeats like bodytube/transition/
    // bodytube otherwise collapse into one bodytube list at its first
    // occurrence, silently reordering the axial chain).
    preserveOrder: true,
  });

  let parsedXml: unknown;
  try {
    parsedXml = parser.parse(xmlText);
  } catch (err) {
    throw new InvalidOrkFileError(`XML parse failed: ${(err as Error).message}`);
  }

  const rootEntries = Array.isArray(parsedXml) ? (parsedXml as unknown[]) : [parsedXml];
  const rootEntry =
    rootEntries.find((e) => {
      if (!e || typeof e !== 'object') return false;
      return Object.keys(e as Record<string, unknown>).some((k) => k !== ':@' && k[0] !== '?' && k[0] !== '!');
    }) ?? {};
  const rootInfo = orderedNodeToLegacy(rootEntry as Record<string, unknown>);
  if (!rootInfo.tag) {
    throw new InvalidOrkFileError('Missing root openrocket tag');
  }

  let rocketNode: Record<string, unknown>;
  if (rootInfo.tag === 'rocket') {
    rocketNode = rootInfo.plain;
  } else if (Array.isArray(rootInfo.plain.rocket) && (rootInfo.plain.rocket as unknown[]).length > 0) {
    rocketNode = orderedListToPlain(rootInfo.plain.rocket as unknown[]);
  } else {
    throw new InvalidOrkFileError('Missing root openrocket tag');
  }

  const rocketName = (rocketNode.name as string) || 'Imported Rocket';
  const components: RocketComponent[] = [];

  // Recursively collect components from subcomponents trees. `node` is the
  // ordered child list (preserveOrder format); each entry is one component
  // or container in exact document order.
  function traverseSubcomponents(node: unknown, parentBodyTube?: { length: number; outerDiameter: number }) {
    if (!node) return;

    const entries = Array.isArray(node) ? (node as unknown[]) : [node];

    for (const rawEntry of entries) {
      if (!rawEntry || typeof rawEntry !== 'object') continue;

      const { tag: key, plain: sub } = orderedNodeToLegacy(rawEntry as Record<string, unknown>);
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
          traverseSubcomponents(sub.subcomponents, {
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

        // Position inside body tube (offset from the tube's front; the
        // exporter records it explicitly so round-trips keep the design
        // seat. Third-party files without the element default to the
        // aft seat (parent length - root chord), as before.
        let axialOffset = 0;
        if (sub.axialoffset !== undefined) {
          axialOffset = Math.max(0, parseNum(sub.axialoffset, 0));
        } else if (parentBodyTube) {
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
        if (sub.axialoffset !== undefined) {
          axialOffset = Math.max(0, parseNum(sub.axialoffset, 0));
        } else if (parentBodyTube) {
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
          axialOffset: sub.axialoffset !== undefined ? Math.max(0, parseNum(sub.axialoffset, 0)) : 0.05,
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
          axialOffset: sub.axialoffset !== undefined ? Math.max(0, parseNum(sub.axialoffset, 0)) : 0.05,
          materialId: resolveMaterialId(sub, 'cardboard'),
        };
        components.push(massComp);
      }

      // Subcomponents under stages, etc.
      if (sub.subcomponents && typeof sub.subcomponents === 'object') {
        traverseSubcomponents(sub.subcomponents, parentBodyTube);
      }
    }
  }

  // Start traversal from stage or rocket root
  if (rocketNode.subcomponents) {
    traverseSubcomponents(rocketNode.subcomponents);
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
 * Minimal deterministic XML rendering for the .ork document.
 *
 * The plain-object XMLBuilder cannot emit heterogeneous sibling elements in
 * a caller-chosen order (array items inherit the array key as their tag),
 * and the ordered-JS builder in this fast-xml-builder version silently
 * drops ALL attributes — which would destroy material identity on import.
 * So the exporter renders the fixed OpenRocket structure directly: every
 * string here is either a literal tag, a numeric field, or a user-provided
 * name/material id, all of which are escaped below.
 */
function escXmlText(value: unknown): string {
  return String(value).replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'));
}

function escXmlAttr(value: unknown): string {
  return escXmlText(value).replace(/"/g, '&quot;');
}

/** Text-only element (`<tag>value</tag>`) rendered at an absolute depth. */
function textEl(tag: string, value: unknown, depth: number): string {
  return '  '.repeat(depth) + `<${tag}>${escXmlText(value)}</${tag}>`;
}

/**
 * Structural element with optional attributes. `children` are pre-rendered
 * strings at their own absolute depths (depth + 1 for direct children).
 */
function el(tag: string, attrs: Record<string, unknown> | undefined, children: string[], depth: number): string {
  const attrStr = attrs
    ? ' ' + Object.entries(attrs).map(([k, v]) => `${k}="${escXmlAttr(v)}"`).join(' ')
    : '';
  const ind = '  '.repeat(depth);
  if (children.length === 0) return `${ind}<${tag}${attrStr}/>`;
  return `${ind}<${tag}${attrStr}>\n${children.join('\n')}\n${ind}</${tag}>`;
}

/** Structural material element (`<material type="bulk" density="…">id</material>`). */
function materialXml(materialId: string | undefined, depth: number): string {
  if (!materialId) return '';
  const catalogued = STANDARD_MATERIALS[materialId];
  const attrs: Record<string, unknown> = { type: 'bulk' };
  if (catalogued) attrs.density = catalogued.density;
  return el('material', attrs, ['  '.repeat(depth + 1) + escXmlText(materialId)], depth);
}

/**
 * Exports a RocketVehicle to an OpenRocket (.ork) ZIP archive containing rocket.ork XML
 */
export async function exportToOrk(vehicle: RocketVehicle): Promise<Uint8Array> {
  const zip = new JSZip();

  // Every kind the importer understands is exported (F2: silently dropped
  // transitions/parachutes/mass parts drifted length and mass on re-import).
  // Serialization is a SINGLE ORDERED PASS over vehicle.components so the
  // .ork document order matches the axial chain — order fixes CG/CP/margin
  // drift on re-import, which type-grouped serialization caused. As before,
  // only the first fin set is written, nested under the LAST body tube so
  // its axial position is ambiguous only when fins precede that tube.
  const finSet = vehicle.components.find(
    (c) => c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset'
  ) as TrapezoidFinSetComponent | EllipticalFinSetComponent | undefined;

  type ElementSpec = { tag: string; kids: string[] };
  const specs: ElementSpec[] = [];
  let finHost: ElementSpec | null = null;

  for (const comp of vehicle.components) {
    if (comp.type === 'nosecone') {
      const kids = [
        textEl('name', comp.name, 6),
        textEl('shape', comp.shape.toUpperCase(), 6),
        textEl('length', comp.length, 6),
        textEl('aftradius', comp.baseDiameter / 2, 6),
        textEl('thickness', comp.wallThickness, 6),
      ];
      if (comp.massOverride) kids.push(textEl('overridemass', comp.massOverride, 6));
      const mat = materialXml(comp.materialId, 6);
      if (mat) kids.push(mat);
      specs.push({ tag: 'nosecone', kids });
    } else if (comp.type === 'bodytube') {
      const kids = [
        textEl('name', comp.name, 6),
        textEl('length', comp.length, 6),
        textEl('radius', comp.outerDiameter / 2, 6),
        textEl('thickness', (comp.outerDiameter - comp.innerDiameter) / 2, 6),
      ];
      if (comp.massOverride) kids.push(textEl('overridemass', comp.massOverride, 6));
      const mat = materialXml(comp.materialId, 6);
      if (mat) kids.push(mat);
      specs.push({ tag: 'bodytube', kids });
      finHost = specs[specs.length - 1];
    } else if (comp.type === 'transition') {
      const kids = [
        textEl('name', comp.name, 6),
        textEl('length', comp.length, 6),
        textEl('foreradius', comp.foreDiameter / 2, 6),
        textEl('aftradius', comp.aftDiameter / 2, 6),
        textEl('thickness', comp.wallThickness, 6),
      ];
      if (comp.massOverride) kids.push(textEl('overridemass', comp.massOverride, 6));
      const mat = materialXml(comp.materialId, 6);
      if (mat) kids.push(mat);
      specs.push({ tag: 'transition', kids });
    } else if (comp.type === 'parachute') {
      const kids = [
        textEl('name', comp.name, 6),
        textEl('diameter', comp.diameter, 6),
        textEl('cd', comp.cd, 6),
        textEl('overridemass', comp.mass, 6),
      ];
      if (comp.axialOffset !== undefined) kids.push(textEl('axialoffset', comp.axialOffset, 6));
      const mat = materialXml(comp.materialId, 6);
      if (mat) kids.push(mat);
      specs.push({ tag: 'parachute', kids });
    } else if (comp.type === 'masscomponent') {
      const kids = [
        textEl('name', comp.name, 6),
        textEl('mass', comp.mass, 6),
        textEl('length', comp.length, 6),
      ];
      if (comp.axialOffset !== undefined) kids.push(textEl('axialoffset', comp.axialOffset, 6));
      const mat = materialXml(comp.materialId, 6);
      if (mat) kids.push(mat);
      specs.push({ tag: 'masscomponent', kids });
    }
    // Fin sets are deferred: the first one nests under the last body tube.
  }

  if (finSet && finHost) {
    const finKids =
      finSet.type === 'trapezoidfinset'
        ? [
            textEl('name', finSet.name, 8),
            textEl('fincount', finSet.finCount, 8),
            textEl('rootchord', finSet.rootChord, 8),
            textEl('tipchord', finSet.tipChord, 8),
            textEl('height', finSet.span, 8),
            textEl('sweeplength', finSet.sweepLength, 8),
            textEl('thickness', finSet.thickness, 8),
            textEl('crosssection', finSet.crossSection.toUpperCase(), 8),
          ]
        : [
            textEl('name', finSet.name, 8),
            textEl('fincount', finSet.finCount, 8),
            textEl('rootchord', finSet.rootChord, 8),
            textEl('height', finSet.span, 8),
            textEl('thickness', finSet.thickness, 8),
          ];
    // Explicit axial seat offset (m, from the parent tube's front): the
    // importer restores it verbatim so the fin mass and aero surface do not
    // drift when the recomputed aft-seat default differs from the design.
    if (finSet.axialOffset !== undefined) finKids.push(textEl('axialoffset', finSet.axialOffset, 8));
    const finMat = materialXml(finSet.materialId, 8);
    if (finMat) finKids.push(finMat);
    const finTag = finSet.type === 'trapezoidfinset' ? 'trapezoidfinset' : 'ellipticalfinset';
    finHost.kids.push(el('subcomponents', undefined, [el(finTag, undefined, finKids, 7)], 6));
  }

  const componentXml = specs.map((s) => el(s.tag, undefined, s.kids, 5));

  const xmlOutput = [
    '<?xml version="1.0" encoding="utf-8"?>',
    el(
      'openrocket',
      { version: '1.9', creator: 'Astraea Rocket Engineering Workstation' },
      [
        el('rocket', undefined, [
          textEl('name', vehicle.name, 2),
          textEl('designer', vehicle.author || 'Astraea User', 2),
          el('subcomponents', undefined, [
            el('stage', undefined, [
              textEl('name', 'Sustainer Stage', 4),
              el('subcomponents', undefined, componentXml, 4),
            ], 3),
          ], 2),
        ], 1),
      ],
      0
    ),
  ].join('\n');

  zip.file('rocket.ork', xmlOutput);

  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
