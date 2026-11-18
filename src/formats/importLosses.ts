/**
 * What a geometry import (OpenRocket .ork, RockSim .rkt) did not carry over,
 * named item by item.
 *
 * The parsers fill this while they read, so the disclosure names the parts,
 * stages, motors and simulations that are actually in the file instead of a
 * generic "some settings are not imported" line. Nothing here changes what is
 * imported; it only records what was left behind and why.
 */

export interface SkippedPart {
  /** The file's own element name for the part, e.g. `centeringring`, `LaunchLug`. */
  kind: string;
  /** The part's name in the file (or its element name when it has none). */
  name: string;
}

export interface ImportLosses {
  /** Parts with no Astraea counterpart: dropped, mass and position included. */
  skippedParts: SkippedPart[];
  /** Stage names merged into one airframe (listed only when there is more than one). */
  mergedStages: string[];
  /** Side boosters or pods whose parts were laid onto the main axis. */
  sideAssemblies: string[];
  /** Motors the file assigns, by designation; none of them is applied. */
  fileMotors: string[];
  /** Simulations stored in the file, by name; none is imported. */
  simulations: string[];
  /** Settings replaced by a fixed default, named with the default used. */
  defaulted: string[];
}

export function emptyImportLosses(): ImportLosses {
  return { skippedParts: [], mergedStages: [], sideAssemblies: [], fileMotors: [], simulations: [], defaulted: [] };
}

/** Plain-word labels for the part elements the readers skip. Unknown ones show their element name. */
const PART_LABELS: Record<string, string> = {
  innertube: 'inner tube',
  centeringring: 'centering ring',
  ring: 'centering ring',
  bulkhead: 'bulkhead',
  tubecoupler: 'tube coupler',
  engineblock: 'engine block',
  launchlug: 'launch lug',
  railbutton: 'rail button',
  shockcord: 'shock cord',
  streamer: 'streamer',
  sleeve: 'sleeve',
  massobject: 'mass object',
  subassembly: 'sub-assembly',
};

function partLabel(kind: string): string {
  return PART_LABELS[kind.toLowerCase()] ?? kind;
}

const quoted = (names: readonly string[]): string => names.map((n) => `“${n}”`).join(', ');

/** Unique, order-preserving. */
function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((v) => v.trim().length > 0))];
}

/**
 * One plain sentence per kind of loss, naming every item. Empty when the file
 * had nothing Astraea left behind beyond what its format note says.
 */
export function describeImportLosses(losses: ImportLosses): string[] {
  const lines: string[] = [];
  if (losses.skippedParts.length > 0) {
    const byKind = new Map<string, string[]>();
    for (const part of losses.skippedParts) {
      const label = partLabel(part.kind);
      byKind.set(label, [...(byKind.get(label) ?? []), part.name]);
    }
    const groups = [...byKind.entries()].map(([label, names]) => `${label}${names.length > 1 ? 's' : ''} ${quoted(names)}`);
    lines.push(`Dropped parts (no Astraea equivalent, so their mass is not counted): ${groups.join('; ')}.`);
  }
  const stages = unique(losses.mergedStages);
  if (stages.length > 1) lines.push(`Stages merged into one airframe: ${quoted(stages)}.`);
  const side = unique(losses.sideAssemblies);
  if (side.length > 0) lines.push(`Side boosters or pods laid onto the main body, not beside it: ${quoted(side)}. Check the airframe.`);
  const motors = unique(losses.fileMotors);
  if (motors.length > 0) lines.push(`Motor${motors.length > 1 ? 's' : ''} named in the file, not applied: ${motors.join(', ')}.`);
  const sims = unique(losses.simulations);
  if (sims.length > 0) lines.push(`Simulation${sims.length > 1 ? 's' : ''} in the file, not imported: ${quoted(sims)}.`);
  for (const note of losses.defaulted) lines.push(note);
  return lines;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decodes the five predefined XML entities and numeric references in element text. */
export function decodeXmlText(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name])
    .trim();
}
