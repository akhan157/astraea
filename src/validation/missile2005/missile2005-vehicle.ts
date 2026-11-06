/**
 * NASA/TM-2005-213541 configuration 3 (small nose, strakes removed, tails on).
 * Geometry digitized from NASA/TM-2005-213541, Figs. 6 and 9 (PDF pp. 42–43,
 * printed pp. 38–39); the unstraked configuration matches this harness's
 * available body-and-tail model. U.S. Government work; NASA NTRS marks public
 * use permitted. Structural material/wall values below are placeholders and
 * are not inputs to the axial-drag score.
 */
import type { RocketVehicle } from '../../core/types';

const IN = 0.0254;
const wall = 0.001;
const diameter = (inches: number): number => inches * IN;

export const MISSILE2005_BODY_DIAMETER_IN = 3.15;
export const MISSILE2005_TOTAL_LENGTH_IN = 42.528;
export const MISSILE2005_REFERENCE_AREA_FT2 = 0.0541;
export const MISSILE2005_REYNOLDS_PER_METER = 1.5e6 / 0.3048;

/** Configuration 3: SN-no S-T, used for the report-only residuals. */
export const MISSILE2005_CONFIG_3: RocketVehicle = {
  id: 'nasa-tm-2005-213541-config-3',
  name: 'NASA/TM-2005-213541 configuration 3 (small nose, no strakes, tails on)',
  version: '1',
  author: 'NASA/TM-2005-213541 reconstruction',
  notes:
    'Small-nose body with no strakes and four undeflected tail fins. The report ' +
    'dimensions are represented directly; the nose profile is approximated as ' +
    'an ogive. Material and 1 mm shell thickness are unverified placeholders; ' +
    'neither is used by the axial-drag residual.',
  components: [
    {
      id: 'missile2005-nose',
      name: 'Baseline small nose (report contour approximated as ogive)',
      type: 'nosecone',
      materialId: 'aluminum',
      shape: 'ogive',
      length: diameter(6.293),
      baseDiameter: diameter(2.694),
      wallThickness: wall,
      isHollow: true,
    },
    {
      id: 'missile2005-forward-body',
      name: 'Forward body, 2.694 in diameter',
      type: 'bodytube',
      materialId: 'aluminum',
      length: diameter(7.410),
      outerDiameter: diameter(2.694),
      innerDiameter: diameter(2.694) - 2 * wall,
    },
    {
      id: 'missile2005-diameter-transition',
      name: 'Body expansion, 2.694 to 3.150 in',
      type: 'transition',
      materialId: 'aluminum',
      length: diameter(3.875),
      foreDiameter: diameter(2.694),
      aftDiameter: diameter(3.150),
      wallThickness: wall,
      isHollow: true,
    },
    {
      id: 'missile2005-main-body',
      name: 'Main body, 3.150 in diameter',
      type: 'bodytube',
      materialId: 'aluminum',
      length: diameter(23.579),
      outerDiameter: diameter(3.150),
      innerDiameter: diameter(3.150) - 2 * wall,
    },
    {
      id: 'missile2005-boattail',
      name: 'Aft boattail, 3.150 to 3.040 in',
      type: 'transition',
      materialId: 'aluminum',
      length: diameter(1.371),
      foreDiameter: diameter(3.150),
      aftDiameter: diameter(3.040),
      wallThickness: wall,
      isHollow: true,
    },
    {
      id: 'missile2005-fins',
      name: 'Four cruciform tail fins',
      type: 'trapezoidfinset',
      materialId: 'aluminum',
      finCount: 4,
      rootChord: diameter(1.992),
      tipChord: diameter(1.213),
      span: diameter(1.953),
      sweepLength: diameter(0.630),
      thickness: diameter(0.110),
      crossSection: 'double_wedge',
      // Fig. 9 root leading edge at MS 39.165 in; the last body tube starts at
      // MS 17.578 in. axialOffset is measured from that last body-tube front.
      axialOffset: diameter(39.165 - 17.578),
    },
  ],
};
