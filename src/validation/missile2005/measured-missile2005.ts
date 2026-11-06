/**
 * NASA/TM-2005-213541 configuration-3 primary balance data. Source: the ASCII
 * tabulated file in the supplement to NTRS record 20050165156, under
 * TM213541_data_files/data-files/ASCII-tabulated. All rows use test-specific
 * runs with PHI=0°, FINSET=1 (all tail deflections 0°), and RNFT=1.5 million/ft.
 *
 * CAF is reported as AF/(q Aref), where Aref=0.0541 ft². Raw α-bracketing
 * samples are retained; the benchmark linearly interpolates CAF to α=0 rather
 * than treating the nearest nonzero-alpha sample as a zero-angle measurement.
 * Test Description, printed p. 7 / PDF p. 11: cavity pressure acts over the
 * entire beveled base area and its axial force is subtracted from CAF.
 * Compare with non-base drag; adding modeled base drag mismatches the data.
 * NTRS states the NASA work is U.S. Government work and public use is permitted.
 */
export interface Missile2005CaPoint {
  readonly mach: number;
  readonly test: 1041 | 1670 | 1529;
  readonly run: number;
  readonly alphaLowDeg: number;
  readonly cafLow: number;
  readonly alphaHighDeg: number;
  readonly cafHigh: number;
}

/** Clean body-tail configuration 3 (SN-no S-T); no strakes are installed. */
export const MISSILE2005_CONFIG_3_CA_POINTS = [
  { mach: 0.60, test: 1041, run: 1412, alphaLowDeg: -1.99, cafLow: 0.1647, alphaHighDeg: 0.01, cafHigh: 0.1689 },
  { mach: 0.90, test: 1041, run: 1392, alphaLowDeg: -0.02, cafLow: 0.1746, alphaHighDeg: 2.00, cafHigh: 0.1842 },
  { mach: 1.19, test: 1041, run: 1372, alphaLowDeg: -2.02, cafLow: 0.2886, alphaHighDeg: 0.01, cafHigh: 0.2965 },
  { mach: 1.70, test: 1670, run: 655, alphaLowDeg: -0.19, cafLow: 0.3021, alphaHighDeg: 1.80, cafHigh: 0.3055 },
  { mach: 2.36, test: 1670, run: 666, alphaLowDeg: -0.29, cafLow: 0.2625, alphaHighDeg: 0.68, cafHigh: 0.2637 },
  { mach: 2.86, test: 1670, run: 677, alphaLowDeg: -0.07, cafLow: 0.2303, alphaHighDeg: 0.93, cafHigh: 0.2271 },
  { mach: 3.95, test: 1529, run: 251, alphaLowDeg: -0.46, cafLow: 0.1839, alphaHighDeg: 0.51, cafHigh: 0.1855 },
] as const satisfies readonly Missile2005CaPoint[];

/**
 * Source point retained but quarantined: configuration 1 has long strakes,
 * unlike the scored no-strake configuration 3, and M=4.63 exceeds the current
 * production curve's M=4.0 limit. Neither geometry substitution nor extrapolation
 * is used to manufacture a residual.
 */
export const QUARANTINED_MISSILE2005_CA_POINTS = [
  {
    configuration: 1,
    mach: 4.63,
    test: 1529,
    run: 210,
    alphaLowDeg: -0.17,
    cafLow: 0.2456,
    alphaHighDeg: 0.82,
    cafHigh: 0.2430,
    reason: 'long strakes differ from scored configuration 3; also outside the M=4.0 production sweep',
  },
] as const;
