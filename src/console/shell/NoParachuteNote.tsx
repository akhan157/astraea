import type { JSX } from 'react';
import type { RocketComponent } from '../../core/types';
import { Note } from '../evidence/studioKit';

/**
 * Current-design inventory fact: any parachute component counts, regardless of
 * its size or deployment settings. This is deliberately not a recovery rule.
 */
export function hasParachute(components: readonly RocketComponent[]): boolean {
  return components.some((component) => component.type === 'parachute');
}

/**
 * A quiet amber note for a current design with no parachute at all. It never
 * blocks a run, judges descent, or reads an older committed run.
 */
export function NoParachuteNote({ components, className }: {
  components: readonly RocketComponent[];
  className?: string;
}): JSX.Element | null {
  if (hasParachute(components)) return null;
  return (
    <div className={className} data-no-parachute-note="">
      <Note tone="warn">No parachute in this design.</Note>
    </div>
  );
}
