import type { RocketVehicle } from '../core/types';
export const PRESET_ESTES_ALPHA: RocketVehicle = {
  id: 'preset-estes-alpha',
  name: 'Estes Alpha III Replica',
  version: '1.0',
  author: 'Estes Industries / Astraea Preset',
  notes: 'Classic starter model rocket, high subsonic stability.',
  components: [
    {
      id: 'alpha-nc',
      name: 'Ogive Nosecone',
      type: 'nosecone',
      shape: 'ogive',
      length: 0.165,
      baseDiameter: 0.0248, // BT-50 (24.8mm)
      wallThickness: 0.0015,
      isHollow: true,
      materialId: 'pla_3dprint',
      color: '#ef4444', // Red
    },
    {
      id: 'alpha-bt',
      name: 'Main Body Tube (BT-50)',
      type: 'bodytube',
      length: 0.311, // 311 mm
      outerDiameter: 0.0248,
      innerDiameter: 0.0241,
      isMotorMount: true, // Estes C6 seats at this tube's aft end
      materialId: 'cardboard',
      color: '#ffffff',
    },
    {
      id: 'alpha-fins',
      name: 'Stabilizer Fins (3-Fin)',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.070,
      tipChord: 0.028,
      span: 0.051,
      sweepLength: 0.038,
      thickness: 0.002,
      crossSection: 'rounded',
      axialOffset: 0.241, // Near aft
      materialId: 'pla_3dprint',
      color: '#ef4444',
    },
    {
      id: 'alpha-chute',
      name: '12" Parachute',
      type: 'parachute',
      diameter: 0.305,
      cd: 0.8,
      mass: 0.008,
      axialOffset: 0.05,
      materialId: 'cardboard',
    },
  ],
};

export const PRESET_NASA_STUDENT_LAUNCH: RocketVehicle = {
  id: 'preset-nasa-sl',
  name: 'NASA Student Launch Target Vehicle',
  version: '1.0',
  author: 'University Rocketry Team',
  notes: 'High-power collegiate competition rocket (6-inch airframe, dual-deployment).',
  components: [
    {
      id: 'nsl-nc',
      name: 'Von Kármán Nosecone',
      type: 'nosecone',
      shape: 'vonkarman',
      length: 0.65,
      baseDiameter: 0.152, // 6 inches (152mm)
      wallThickness: 0.0035,
      isHollow: true,
      materialId: 'fiberglass',
      color: '#06b6d4', // Cyan
    },
    {
      id: 'nsl-bt1',
      name: 'Payload & Avionics Bay',
      type: 'bodytube',
      length: 0.75,
      outerDiameter: 0.152,
      innerDiameter: 0.145,
      materialId: 'fiberglass',
      color: '#18181b',
    },
    {
      id: 'nsl-trans',
      name: 'Airframe Coupler',
      type: 'bodytube',
      length: 0.12,
      outerDiameter: 0.152,
      innerDiameter: 0.146,
      materialId: 'aluminum',
      color: '#71717a',
    },
    {
      id: 'nsl-bt2',
      name: 'Booster & Motor Section',
      type: 'bodytube',
      length: 1.45,
      outerDiameter: 0.152,
      innerDiameter: 0.145,
      isMotorMount: true, // high-power motor seats at this section's aft end
      materialId: 'fiberglass',
      color: '#18181b',
    },
    {
      id: 'nsl-fins',
      name: 'High-Power Clipped Delta Fins',
      type: 'trapezoidfinset',
      finCount: 4,
      rootChord: 0.32,
      tipChord: 0.12,
      span: 0.18,
      sweepLength: 0.18,
      thickness: 0.0048,
      crossSection: 'airfoil',
      axialOffset: 1.10,
      materialId: 'carbonfiber',
      color: '#06b6d4',
    },
    {
      id: 'nsl-drogue',
      name: 'Drogue Parachute (Apogee)',
      type: 'parachute',
      diameter: 0.60,
      cd: 1.2,
      mass: 0.18,
      axialOffset: 0.20,
      materialId: 'cardboard',
    },
    {
      id: 'nsl-main',
      name: 'Main Parachute (700ft AGL)',
      type: 'parachute',
      diameter: 2.40,
      cd: 1.5,
      mass: 0.75,
      axialOffset: 0.85,
      materialId: 'cardboard',
    },
  ],
};

export const PRESET_SPACEPORT_AMERICA: RocketVehicle = {
  id: 'preset-sac-30k',
  name: 'Spaceport America practice Sounding Rocket',
  version: '1.0',
  author: 'Astraea Aerostructures',
  notes: 'Transonic/supersonic target altitude rocket with minimal drag fin profile.',
  components: [
    {
      id: 'sac-nc',
      name: 'Aluminum-Tip Von Kármán Nosecone',
      type: 'nosecone',
      shape: 'vonkarman',
      length: 0.70,
      baseDiameter: 0.102, // 4 inches (102mm)
      wallThickness: 0.003,
      isHollow: true,
      materialId: 'carbonfiber',
      color: '#f59e0b', // Amber
    },
    {
      id: 'sac-bt1',
      name: 'Carbon Fiber Filament Wound Fuselage',
      type: 'bodytube',
      length: 2.10,
      outerDiameter: 0.102,
      innerDiameter: 0.096,
      materialId: 'carbonfiber',
      color: '#27272a',
    },
    {
      id: 'sac-boattail',
      name: 'Aft Boattail Conical Transition',
      type: 'transition',
      length: 0.15,
      foreDiameter: 0.102,
      aftDiameter: 0.088, // 102mm down to 88mm
      wallThickness: 0.003,
      isHollow: true,
      materialId: 'aluminum',
      color: '#71717a',
    },
    {
      id: 'sac-fins',
      name: 'Supersonic Double-Wedge Fins',
      type: 'trapezoidfinset',
      finCount: 3,
      rootChord: 0.28,
      tipChord: 0.08,
      span: 0.14,
      sweepLength: 0.18,
      thickness: 0.004,
      crossSection: 'double_wedge',
      axialOffset: 1.80,
      materialId: 'aluminum',
      color: '#f59e0b',
    },
    // Dual deployment, as the NASA Student Launch preset above: first chute is
    // the apogee drogue, second is the main. Without both, the engine applies no
    // canopy drag and the practice flight lands ballistic (184 m/s, 2026-11-06).
    {
      id: 'sac-drogue',
      name: 'Drogue Parachute (Apogee)',
      type: 'parachute',
      diameter: 0.46, // 18 in
      cd: 1.2,
      mass: 0.12,
      axialOffset: 0.20, // from the fuselage start; 0.90 m from the nose
      materialId: 'cardboard',
    },
    {
      id: 'sac-main',
      name: 'Main Parachute (60 in)',
      type: 'parachute',
      diameter: 1.524, // 60 in
      cd: 1.5,
      mass: 0.55,
      axialOffset: 0.85, // from the fuselage start; 1.55 m from the nose
      materialId: 'cardboard',
    },
  ],
};

/**
 * Launch-site coordinates for the example designs (WGS84 decimal degrees),
 * keyed like PRESET_DESIGNS and matching each example mission's site label,
 * so the weather fetch asks about the place the mission names. These are
 * the named place itself (the city centre for a city), not a specific launch
 * field: set your field's own coordinates for a forecast at the pad.
 *
 * The Estes Alpha example flies from "Local field", which is no real place,
 * so it has none and the weather panel asks for them.
 */
export interface SiteCoordinates {
  /** The place, worded exactly like the example mission's site label. */
  label: string;
  latDeg: number;
  lonDeg: number;
}

export const PRESET_SITE_COORDINATES: Record<string, SiteCoordinates | null> = {
  estesAlpha: null,
  nasaStudent: { label: 'Huntsville, AL', latDeg: 34.7304, lonDeg: -86.5861 },
  spaceport: { label: 'Spaceport America, NM', latDeg: 32.9903, lonDeg: -106.9697 },
};

/**
 * The coordinates a workspace starts with when nothing set them
 * (DEFAULT_WORKSPACE.site): a placeholder, never a launch site anyone chose.
 */
export const PLACEHOLDER_SITE_COORDINATES: SiteCoordinates = { label: 'Seattle, WA', latDeg: 47.6062, lonDeg: -122.3321 };

/** Site lat/lon for an example design, or nothing when it has no real place. */
export function presetSiteCoordinates(key: string): { latDeg: number; lonDeg: number } | Record<string, never> {
  const site = PRESET_SITE_COORDINATES[key];
  return site ? { latDeg: site.latDeg, lonDeg: site.lonDeg } : {};
}

/** Every place Astraea can name from coordinates alone. */
const NAMED_SITES: SiteCoordinates[] = Object.values(PRESET_SITE_COORDINATES).filter((s): s is SiteCoordinates => s !== null);

/** Within about 1 km (0.01°) counts as the same named place. */
const SAME_PLACE_DEG = 0.01;

const near = (a: { latDeg: number; lonDeg: number }, b: { latDeg: number; lonDeg: number }): boolean =>
  Math.abs(a.latDeg - b.latDeg) <= SAME_PLACE_DEG && Math.abs(a.lonDeg - b.lonDeg) <= SAME_PLACE_DEG;

/** True when the coordinates are still the never-set placeholder. */
export function isPlaceholderSite(site: { latDeg: number; lonDeg: number }): boolean {
  return site.latDeg === PLACEHOLDER_SITE_COORDINATES.latDeg && site.lonDeg === PLACEHOLDER_SITE_COORDINATES.lonDeg;
}

/** The named place at these coordinates, or null when Astraea cannot name it. */
export function namedSiteAt(site: { latDeg: number; lonDeg: number }): SiteCoordinates | null {
  return NAMED_SITES.find((s) => near(s, site)) ?? null;
}

/** The known coordinates for a site label (case and spacing ignored), or null. */
export function namedSiteCalled(label: string): SiteCoordinates | null {
  const key = label.trim().toLowerCase().replace(/\s+/g, ' ');
  return NAMED_SITES.find((s) => s.label.toLowerCase() === key) ?? null;
}
