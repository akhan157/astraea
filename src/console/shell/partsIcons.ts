/**
 * Part-type icons, shared by the parts tree, the inspector and the palette.
 * Lives apart from `Shell.tsx` so the tree can import it without a cycle.
 */
import { Box, Cone, Cylinder, Rows3, Triangle, Umbrella, Weight } from 'lucide-react';
import type { RocketComponent } from '../../core/types';

export const PART_ICON: Record<RocketComponent['type'], typeof Box> = {
  nosecone: Triangle,
  bodytube: Cylinder,
  transition: Cone,
  trapezoidfinset: Rows3,
  ellipticalfinset: Rows3,
  freeformfinset: Rows3,
  masscomponent: Weight,
  parachute: Umbrella
};
