import type { StabilityRow } from '../data/contract';

/** Part types the engine never models as a lifting surface; their rows are secondary. */
export const NON_LIFTING_TYPES: ReadonlySet<string> = new Set(['bodytube', 'parachute', 'masscomponent']);

/** Quiet-group divider above the secondary rows. */
export const NON_LIFTING_DIVIDER = 'Not lifting surfaces';

/** One footnote replaces the per-type sentences under the table. */
export const NON_LIFTING_FOOTNOTE = '— not modelled as a lifting surface in this subsonic rollup. These parts move the CG, not the CP.';

export interface BreakdownGroups {
  /** Rows that carry a positive normal-force slope, largest share first. */
  lifting: StabilityRow[];
  /** Non-lifting types and engine-reported exact zeros, in assembly order. */
  secondary: StabilityRow[];
  /** Unknown rows outside the non-lifting types: keep the engine's own reason. */
  warnings: StabilityRow[];
}

/**
 * Split the stability rollup into the table's three presentations.
 *
 * A null CNα is `unknown` (never a zero), so it can only be a non-lifting part
 * type or an unsupported geometry. An exact zero published by the engine is a
 * real number and stays a secondary row, but its CNα cell shows the zero.
 */
export function classifyBreakdownRows(
  rows: readonly StabilityRow[],
  typeOf: (partId: string) => string | undefined,
): BreakdownGroups {
  const lifting: StabilityRow[] = [];
  const secondary: StabilityRow[] = [];
  const warnings: StabilityRow[] = [];
  for (const row of rows) {
    if (row.cnAlpha.confidence === 'unknown') {
      if (NON_LIFTING_TYPES.has(typeOf(row.partId) ?? '')) secondary.push(row);
      else warnings.push(row);
    } else if (row.cnAlpha.value === 0) {
      secondary.push(row);
    } else {
      lifting.push(row);
    }
  }
  lifting.sort((a, b) => b.contributionPct - a.contributionPct);
  return { lifting, secondary, warnings };
}

/** Unknown rows whose part type has no plain-word label: keep the engine's own reason. */
export function unknownRowSentence(row: StabilityRow): string {
  return `${row.name}: CNα and CP are not reported. ${row.cnAlpha.reason}`;
}
