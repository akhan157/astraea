/**
 * Astraea RockSim (.rkt) File Adapter — Export
 * Writes a RocketVehicle as Apogee RockSim XML, mirroring the exact node and
 * attribute names that src/formats/rktParser.ts reads (Len/AftDia/OD/ID,
 * ForeDia, FinSet/SemiSpan/SweepDistance, Dia/Weight, Mass, ShapeCode,
 * Stage*Parts, AttachedParts). Units follow the parser's contract: lengths in
 * mm, masses in grams, and every geometric field shown keeps the SI value
 * carried by the normalized vehicle.
 *
 * Unsupported component types fail closed: the export throws an
 * UnsupportedRktComponentError naming the component rather than emitting a
 * node the importer would misread or drop.
 */

import {
  RocketVehicle,
  RocketComponent,
  NoseconeShape,
} from '../core/types';

export class UnsupportedRktComponentError extends Error {
  constructor(component: RocketComponent) {
    super(
      `Unsupported RockSim (.rkt) component type "${component.type}" on component "${component.name}": ` +
        'RockSim export supports nosecone, bodytube, transition, trapezoidfinset, masscomponent, and parachute.',
    );
    this.name = 'UnsupportedRktComponentError';
  }
}

/** XML text escaping (attribute-safe; used for element text). */
function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Converts a normalized SI value (m or kg) into the RockSim unit the parser
 * reads (mm or g): value * 1000, rounded to 3 decimal places so float noise
 * (e.g. 311.00000000000006) never leaks into the file.
 */
function toRktUnit(value: number): number {
  return Math.round(value * 1000 * 1000) / 1000;
}

/**
 * Maps Astraea NoseconeShape to the RockSim ShapeCode the parser reads.
 * 1 = Ogive, 2 = Conical, 3 = Parabolic, 4 = Elliptical. Von Kármán has no
 * RockSim code and is exported as ogive (what the parser maps it back to).
 */
function shapeCode(shape: NoseconeShape): number {
  switch (shape) {
    case 'conical': return 2;
    case 'parabolic': return 3;
    case 'elliptical': return 4;
    case 'ogive':
    case 'vonkarman':
    default: return 1;
  }
}

/**
 * Exports a RocketVehicle as a RockSim (.rkt) XML string.
 * Throws UnsupportedRktComponentError on component types the RockSim format
 * cannot represent (elliptical fin sets are read back as trapezoid by the
 * importer, so they are refused rather than silently lossy).
 */
export function exportRkt(vehicle: RocketVehicle): string {
  assertSupported(vehicle.components);

  const lines: string[] = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<RockSimDocument>',
    '  <FileVersion>4</FileVersion>',
    '  <DesignInformation>',
    '    <RocketDesign>',
    `      <Name>${xmlEscape(vehicle.name)}</Name>`,
    `      <Designer>${xmlEscape(vehicle.author || 'Astraea User')}</Designer>`,
    '      <Stage3Parts>',
  ];

  // Fin/parachute/mass components attach to the most recent body tube, exactly
  // where the importer's traverseAttached looks for them (AttachedParts).
  let attachedParts: string[] | null = null;

  const closeBodyTube = (): void => {
    if (attachedParts) {
      if (attachedParts.length > 0) {
        lines.push('          <AttachedParts>');
        lines.push(...attachedParts);
        lines.push('          </AttachedParts>');
      }
      lines.push('        </BodyTube>');
      attachedParts = null;
    }
  };

  for (const comp of vehicle.components) {
    switch (comp.type) {
      case 'nosecone': {
        closeBodyTube();
        lines.push(
          '        <NoseCone>',
          `          <PartName>${xmlEscape(comp.name)}</PartName>`,
          `          <ShapeCode>${shapeCode(comp.shape)}</ShapeCode>`,
          `          <Len>${toRktUnit(comp.length)}</Len>`,
          `          <AftDia>${toRktUnit(comp.baseDiameter)}</AftDia>`,
          `          <WallThickness>${toRktUnit(comp.wallThickness)}</WallThickness>`,
          '        </NoseCone>',
        );
        break;
      }
      case 'bodytube': {
        closeBodyTube();
        lines.push(
          '        <BodyTube>',
          `          <PartName>${xmlEscape(comp.name)}</PartName>`,
          `          <Len>${toRktUnit(comp.length)}</Len>`,
          `          <OD>${toRktUnit(comp.outerDiameter)}</OD>`,
          `          <ID>${toRktUnit(comp.innerDiameter)}</ID>`,
        );
        if (comp.isMotorMount) {
          lines.push('          <MotorMount>');
          if (comp.assignedMotorId) {
            lines.push(`            <Motor>${xmlEscape(comp.assignedMotorId)}</Motor>`);
          }
          lines.push('          </MotorMount>');
        }
        attachedParts = [];
        break;
      }
      case 'transition': {
        closeBodyTube();
        lines.push(
          '        <Transition>',
          `          <PartName>${xmlEscape(comp.name)}</PartName>`,
          `          <Len>${toRktUnit(comp.length)}</Len>`,
          `          <ForeDia>${toRktUnit(comp.foreDiameter)}</ForeDia>`,
          `          <AftDia>${toRktUnit(comp.aftDiameter)}</AftDia>`,
          `          <WallThickness>${toRktUnit(comp.wallThickness)}</WallThickness>`,
          '        </Transition>',
        );
        break;
      }
      case 'trapezoidfinset': {
        assertAttachedTube(comp, attachedParts);
        attachedParts.push(
          '          <FinSet>',
          `            <PartName>${xmlEscape(comp.name)}</PartName>`,
          `            <FinCount>${comp.finCount}</FinCount>`,
          `            <RootChord>${toRktUnit(comp.rootChord)}</RootChord>`,
          `            <TipChord>${toRktUnit(comp.tipChord)}</TipChord>`,
          `            <SemiSpan>${toRktUnit(comp.span)}</SemiSpan>`,
          `            <SweepDistance>${toRktUnit(comp.sweepLength)}</SweepDistance>`,
          `            <Thickness>${toRktUnit(comp.thickness)}</Thickness>`,
          '          </FinSet>',
        );
        break;
      }
      case 'masscomponent': {
        assertAttachedTube(comp, attachedParts);
        attachedParts.push(
          '          <MassObject>',
          `            <PartName>${xmlEscape(comp.name)}</PartName>`,
          `            <Mass>${toRktUnit(comp.mass)}</Mass>`,
          '          </MassObject>',
        );
        break;
      }
      case 'parachute': {
        assertAttachedTube(comp, attachedParts);
        attachedParts.push(
          '          <Parachute>',
          `            <PartName>${xmlEscape(comp.name)}</PartName>`,
          `            <Dia>${toRktUnit(comp.diameter)}</Dia>`,
          `            <Cd>${comp.cd}</Cd>`,
          `            <Weight>${toRktUnit(comp.mass)}</Weight>`,
          '          </Parachute>',
        );
        break;
      }
      case 'ellipticalfinset':
      default:
        // Fail closed: never emit a node the importer would misread.
        throw new UnsupportedRktComponentError(comp);
    }
  }
  closeBodyTube();

  lines.push('      </Stage3Parts>', '    </RocketDesign>', '  </DesignInformation>', '</RockSimDocument>');
  return lines.join('\n');
}

/** Validates every component before any XML is emitted (fail closed up front). */
function assertSupported(components: RocketComponent[]): void {
  for (const comp of components) {
    switch (comp.type) {
      case 'nosecone':
      case 'bodytube':
      case 'transition':
      case 'trapezoidfinset':
      case 'masscomponent':
      case 'parachute':
        break;
      default:
        throw new UnsupportedRktComponentError(comp);
    }
  }
}

/**
 * Fin sets, parachutes, and mass components physically attach to a body tube;
 * the importer only finds them nested there. A component of this kind with no
 * preceding body tube cannot be represented — fail closed rather than emit
 * XML the importer would silently drop.
 */
function assertAttachedTube(comp: RocketComponent, attachedParts: string[] | null): asserts attachedParts is string[] {
  if (attachedParts === null) {
    throw new Error(
      `Cannot export RockSim (.rkt) component "${comp.name}" (${comp.type}): ` +
        'fin sets, parachutes, and mass components must attach to a body tube, but none precedes it.',
    );
  }
}