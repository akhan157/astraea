/**
 * Astraea nozzle chemistry — ideal-gas equilibrium post-processing.
 *
 * ---------------------------------------------------------------------------
 * MODEL ASSUMPTIONS (closed-form approximation; NO Gibbs-minimization loop)
 * ---------------------------------------------------------------------------
 * 1. Chamber equilibrium is approximated as a **constant-volume (rigid
 *    vessel) adiabatic flame** at a fixed, closed-form product composition.
 *    The composition is supplied by the caller (pure input to
 *    `equilibriumTemperature`, and a documented representative mixture for
 *    the APCP preset) and the energy balance solves the single unknown T.
 *    There is deliberately no free-energy minimization over species amounts;
 *    the mixture is "frozen" for the entire nozzle expansion.
 *
 * 2. Thermodynamic data: NASA-7 (seven-coefficient) polynomial fits
 *    cp/R = a1 + a2·T + a3·T² + a4·T³ + a5·T⁴ from the public-domain NASA
 *    report B.J. McBride, S. Gordon, M.A. Reno, "Coefficients for Computing
 *    Thermodynamic and Transport Properties of Individual Species", NASA
 *    TM-4513 (1993), for H2O, CO2, CO, N2, HCl, H2, O2, O, H and condensed
 *    Al2O3(alpha/liquid). Each species carries a low range (200/300–1000 K)
 *    and a high range (1000–6000 K) switched at 1000 K. Formation enthalpies
 *    are standard 298.15 K values in J/kmol.
 *
 * 3. Al2O3 is condensed (alpha below 2327 K, liquid above). Its enthalpy of
 *    fusion ≈ 111.1 kJ/mol (derived from the NASA fit enthalpy offsets at
 *    2327 K) is folded into the sensible-energy integral, and the condensed
 *    phase contributes to the mixture heat capacity (effective frozen gamma
 *    including condensed products). O, H and O2 gas species are supported so
 *    the preset mixture can carry its documented dissociation surrogate.
 *
 * 4. Energy balance: the released (negative) internal energy of forming the
 *    product mixture from its reference state at 298.15 K is balanced against
 *    the sensible cv integral:
 *
 *        Σ n_i·∫298^T cv_i dT = −ΔU_rxn(298)
 *        ΔU_rxn = Σ n_i·(ΔfH_i − R·T0·νgas,i) − Σ n_r·ΔfU_r
 *
 *    νgas is the gas-mole delta of the species' formation reaction from the
 *    elements (H2O: −½, CO: +½, all others 0) — the ideal-gas U = H − RT
 *    bookkeeping. The reference state of unlisted feeds is the elements at
 *    298.15 K (ΔfU = 0), which makes `equilibriumTemperature` a filter for a
 *    closed-form composition; the APCP preset additionally charges the
 *    reactants' actual formation energy (AP solid −295.7 kJ/mol, HTPB +111
 *    kJ/mol, Al 0) so the rigid-vessel release matches the published chamber
 *    temperature for this propellant class (~3500 K; e.g. Shuttle SRB
 *    69.9% AP / 16% Al / 14.3% PBAN adiabetic T ≈ 3578 K).
 *
 * 5. All inputs are SI: pressure in Pa, temperature in K, energy in J,
 *    molar amounts in kmol, mass in kg. Every public function validates
 *    inputs — a NaN, ±Inf or non-positive physical quantity throws.
 *
 * 6. Scope boundary: nothing in this module takes `burnRateCoeff` (the
 *    grain-lane constant linear burn rate in src/propulsion/grainRegression.
 *    ts). That coefficient is a validated, time-axis-only input: it maps
 *    burned web depth to a wall-clock time increment and never participates
 *    in — or alters — any geometry trace or chamber equilibrium computed
 *    here.
 * ---------------------------------------------------------------------------
 */

export type SpeciesName =
  | 'H2O' | 'CO2' | 'CO' | 'N2' | 'HCl' | 'Al2O3'
  | 'H2' | 'O2' | 'O' | 'H';

/** Universal gas constant, J/(kmol·K). */
export const R_UNIVERSAL = 8_314.46261815324;
/** Reference temperature of the NASA-7 fits / formation enthalpies, K. */
export const STANDARD_TEMPERATURE = 298.15;
/** Standard gravity, m/s² (conventional Isp basis). */
export const G0 = 9.80665;
/** NASA-7 low/high polynomial switch temperature, K. */
export const POLY_SWITCH_K = 1000;
/** Melting point of condensed Al2O3, K. */
export const AL2O3_MELT_K = 2327;
/** Liquid-Al2O3 cp/R (constant), NASA TM-4513 fit for 2327–6000 K. */
export const AL2O3_LIQUID_CPR = 23.148241;
/** Al2O3 enthalpy of fusion at 2327 K, J/kmol (NASA fit enthalpy offsets). */
export const AL2O3_FUSION_J_PER_KMOL = 111_085_912;

export interface Nasa7Species {
  /** cp/R = a1 + a2T + a3T² + a4T³ + a5T⁴, low-temperature range (≤1000 K) */
  aLow: readonly number[];
  /** cp/R coefficients, high-temperature range (≥1000 K) */
  aHigh: readonly number[];
  /** standard formation enthalpy at 298.15 K, J/kmol */
  formationEnthalpy: number;
  /** molar mass, kg/kmol */
  molecularWeight: number;
  /** condensed phase: contributes cp but no ideal-gas −R term */
  condensed: boolean;
  /** gas-mole delta of the formation reaction from the elements, J (U=H−RT) */
  vFormGas: number;
}

export const SPECIES: Record<SpeciesName, Nasa7Species> = {
  H2O: {
    aLow:  [4.19864056, -0.0020364341, 6.52040211e-06, -5.48797062e-09, 1.77197817e-12],
    aHigh: [2.67703787, 0.00297318329, -7.7376969e-07, 9.44336689e-11, -4.26900959e-15],
    formationEnthalpy: -241826000, molecularWeight: 18.01528, condensed: false, vFormGas: -0.5,
  },
  H2: {
    aLow:  [2.34433112, 0.00798052075, -1.9478151e-05, 2.01572094e-08, -7.37611761e-12],
    aHigh: [2.93286579, 0.000826607967, -1.46402335e-07, 1.54100359e-11, -6.88804432e-16],
    formationEnthalpy: 0, molecularWeight: 2.01588, condensed: false, vFormGas: 0,
  },
  CO2: {
    aLow:  [2.35677352, 0.00898459677, -7.12356269e-06, 2.45919022e-09, -1.43699548e-13],
    aHigh: [4.63659493, 0.00274131991, -9.95828531e-07, 1.60373011e-10, -9.16103468e-15],
    formationEnthalpy: -393522000, molecularWeight: 44.00980, condensed: false, vFormGas: 0,
  },
  CO: {
    aLow:  [3.57953347, -0.00061035368, 1.01681433e-06, 9.07005884e-10, -9.04424499e-13],
    aHigh: [3.04848583, 0.00135172818, -4.85794075e-07, 7.88536486e-11, -4.69807489e-15],
    formationEnthalpy: -110527000, molecularWeight: 28.01012, condensed: false, vFormGas: 0.5,
  },
  N2: {
    aLow:  [3.53100528, -0.000123660987, -5.02999437e-07, 2.43530612e-09, -1.40881235e-12],
    aHigh: [2.95257626, 0.00139690057, -4.92631691e-07, 7.86010367e-11, -4.60755321e-15],
    formationEnthalpy: 0, molecularWeight: 28.01348, condensed: false, vFormGas: 0,
  },
  HCl: {
    aLow:  [3.5248171, 2.9984862e-05, -8.6221891e-07, 2.0979721e-09, -9.8658191e-13],
    aHigh: [2.7665884, 0.0014381883, -4.6993e-07, 7.3499408e-11, -4.3731106e-15],
    formationEnthalpy: -92312000, molecularWeight: 36.46098, condensed: false, vFormGas: 0,
  },
  O2: {
    aLow:  [3.78245636, -0.00299673415, 9.847302e-06, -9.68129508e-09, 3.24372836e-12],
    aHigh: [3.66096083, 0.000656365523, -1.41149485e-07, 2.05797658e-11, -1.29913248e-15],
    formationEnthalpy: 0, molecularWeight: 31.99880, condensed: false, vFormGas: 0,
  },
  O: {
    aLow:  [3.1682671, -0.00327931884, 6.64306396e-06, -6.12806624e-09, 2.11265971e-12],
    aHigh: [2.54363697, -2.73162486e-05, -4.1902952e-09, 4.95481845e-12, -4.79553694e-16],
    formationEnthalpy: 249170000, molecularWeight: 15.99940, condensed: false, vFormGas: 0,
  },
  H: {
    aLow:  [2.5, 0, 0, 0, 0],
    aHigh: [2.50000286, -5.65334214e-09, 3.63251723e-12, -9.1994972e-16, 7.95260746e-20],
    formationEnthalpy: 217999000, molecularWeight: 1.00794, condensed: false, vFormGas: 0,
  },
  Al2O3: {
    aLow:  [-4.9138309, 0.079398443, -0.00013237918, 1.044675e-07, -3.156633e-11],
    aHigh: [11.833666, 0.0037708878, -1.7863191e-07, -5.6008807e-10, 1.4076825e-13],
    formationEnthalpy: -1675690000, molecularWeight: 101.96123, condensed: true, vFormGas: 0,
  },
};

export function isKnownSpecies(name: string): name is SpeciesName {
  return Object.prototype.hasOwnProperty.call(SPECIES, name);
}

function cpAt(s: Nasa7Species, t: number): number {
  const a = t < POLY_SWITCH_K ? s.aLow : s.aHigh;
  let v = (a[4] as number) * t + (a[3] as number);
  v = v * t + (a[2] as number);
  v = v * t + (a[1] as number);
  return v * t + (a[0] as number);
}

function cpAl2O3(t: number): number {
  return t >= AL2O3_MELT_K ? AL2O3_LIQUID_CPR : cpAt(SPECIES.Al2O3, t);
}

/** cp/R of a species at temperature T (K), piecewise NASA-7 (raises on bad T). */
export function cpRatio(species: SpeciesName, temperature: number): number {
  if (!Number.isFinite(temperature) || temperature <= 0) {
    throw new RangeError(`cpRatio: temperature must be finite and positive, got ${temperature}`);
  }
  return species === 'Al2O3' ? cpAl2O3(temperature) : cpAt(SPECIES[species], temperature);
}

/** ∫ a1 + a2x + a3x² + a4x³ + a5x⁴ dx evaluated at x. */
function polyIntegral(a: readonly number[], x: number): number {
  return (a[0] as number) * x
    + (a[1] as number) * (x * x) / 2
    + (a[2] as number) * (x ** 3) / 3
    + (a[3] as number) * (x ** 4) / 4
    + (a[4] as number) * (x ** 5) / 5;
}

/** ∫cp dT from 298.15 K to T, J/kmol (includes Al2O3 melting latent heat). */
export function sensibleEnthalpy(species: SpeciesName, temperature: number): number {
  if (!Number.isFinite(temperature) || temperature < STANDARD_TEMPERATURE) {
    throw new RangeError(`sensibleEnthalpy: temperature must be finite and ≥ 298.15 K, got ${temperature}`);
  }
  const s = SPECIES[species];
  const r = R_UNIVERSAL;
  if (species !== 'Al2O3') {
    if (temperature <= POLY_SWITCH_K) {
      return r * (polyIntegral(s.aLow, temperature) - polyIntegral(s.aLow, STANDARD_TEMPERATURE));
    }
    const lo = r * (polyIntegral(s.aLow, POLY_SWITCH_K) - polyIntegral(s.aLow, STANDARD_TEMPERATURE));
    return lo + r * (polyIntegral(s.aHigh, temperature) - polyIntegral(s.aHigh, POLY_SWITCH_K));
  }
  // Al2O3: alpha crystal (low poly) up to 1000 K, alpha (high poly)
  // 1000–2327 K, fusion at 2327 K, then constant-cp liquid above.
  if (temperature <= POLY_SWITCH_K) {
    return r * (polyIntegral(s.aLow, temperature) - polyIntegral(s.aLow, STANDARD_TEMPERATURE));
  }
  const toSwitch = r * (polyIntegral(s.aLow, POLY_SWITCH_K) - polyIntegral(s.aLow, STANDARD_TEMPERATURE));
  if (temperature < AL2O3_MELT_K) {
    return toSwitch + r * (polyIntegral(s.aHigh, temperature) - polyIntegral(s.aHigh, POLY_SWITCH_K));
  }
  const alphaToMelt = r * (polyIntegral(s.aHigh, AL2O3_MELT_K) - polyIntegral(s.aHigh, POLY_SWITCH_K));
  const liquid = r * AL2O3_LIQUID_CPR * (temperature - AL2O3_MELT_K);
  return toSwitch + alphaToMelt + AL2O3_FUSION_J_PER_KMOL + liquid;
}

/** ∫cv dT from 298.15 K to T, J/kmol (cv = cp − R gases; cv ≈ cp condensed). */
export function sensibleCv(species: SpeciesName, temperature: number): number {
  const h = sensibleEnthalpy(species, temperature);
  return SPECIES[species].condensed ? h : h - R_UNIVERSAL * (temperature - STANDARD_TEMPERATURE);
}

export interface Reactant {
  species: SpeciesName;
  /** molar amount, kmol */
  moles: number;
}

/**
 * Rigid-vessel (constant-volume) adiabatic flame temperature of a closed-form
 * equilibrium mixture, K (see module header, assumptions 1–4).
 *
 *   Σ n_i·∫298^T cv_i dT = −ΔU_rxn        ΔU_rxn = Σ n_i·ΔfU_i − feedU
 *
 * The default reference state is the elements at 298.15 K (feedU = 0), which
 * makes this function the balance for forming the given composition from
 * elemental feedstock — the natural read of "adiabatic flame of this
 * mixture". The APCP preset additionally charges the true propellant
 * formation energy (AP solid, HTPB) through the same solver, and is
 * therefore the number to compare against published chamber temperatures.
 *
 * ΔU_rxn must be negative enough for a root: the left-hand side is strictly
 * increasing (cv > 0), solved by bisection on [300, 8000] K. Throws on
 * nonfinite/empty inputs or when no root exists on the bracket.
 */
export function equilibriumTemperature(
  reactants: readonly Reactant[],
  chamberPressure: number,
): number {
  return solveFlame(reactants, chamberPressure, 0);
}

function solveFlame(reactants: readonly Reactant[], chamberPressure: number, feedU: number): number {
  if (!Number.isFinite(chamberPressure) || chamberPressure <= 0) {
    throw new RangeError(`equilibriumTemperature: chamber pressure must be finite and > 0, got ${chamberPressure}`);
  }
  if (reactants.length === 0) {
    throw new RangeError('equilibriumTemperature: empty reactants');
  }
  let productU = 0;
  for (const r of reactants) {
    if (!Number.isFinite(r.moles) || r.moles <= 0) {
      throw new RangeError(`equilibriumTemperature: moles must be finite and > 0 (${r.species}: ${r.moles})`);
    }
    const s = SPECIES[r.species];
    if (!s) {
      throw new TypeError(`unknown species: ${r.species}`);
    }
    productU += r.moles * (s.formationEnthalpy - R_UNIVERSAL * STANDARD_TEMPERATURE * s.vFormGas);
  }
  const deltaU = productU - feedU;
  const f = (t: number): number => {
    let sum = 0;
    for (const r of reactants) {
      sum += r.moles * sensibleCv(r.species, t);
    }
    return sum + deltaU;
  };
  // The bracket is capped at 6000 K — the top of the NASA-7 high-range
  // validity; extrapolating beyond it corrupts the polynomial sign.
  const lo = STANDARD_TEMPERATURE;
  const hi = 6000;
  const fLo = f(lo);
  const fHi = f(hi);
  if (fLo === 0) {
    return lo;
  }
  if (fHi === 0) {
    return hi;
  }
  if (fLo * fHi > 0) {
    throw new Error(`equilibriumTemperature: no root in [298.15, 6000] K (ΔU = ${deltaU} J)`);
  }
  let a = lo;
  let b = hi;
  let fa = fLo;
  for (let i = 0; i < 600; i++) {
    const m = 0.5 * (a + b);
    const fm = f(m);
    if (fm === 0) {
      return m;
    }
    if (fa * fm < 0) {
      b = m;
    } else {
      a = m;
      fa = fm;
    }
  }
  return 0.5 * (a + b);
}

/* ------------------------------------------------------------------ *
 * Representative APCP preset                                          *
 * ------------------------------------------------------------------ */

// Documented representative equilibrium mixture for 70% AP / 18% Al / 12%
// HTPB by mass (kmol per kg of propellant). Element counts match the feed
// (H 37.165, O 23.831, C 8.889, N 5.958, Cl 5.958, Al 6.672); the O/H/O2
// minority is the aggregate-dissociation surrogate (module header, §4).
const APCP_MIXTURE: readonly Reactant[] = [
  { species: 'H2O',  moles: 2.0 },
  { species: 'H2',   moles: 11.85358 },
  { species: 'CO',   moles: 8.388 },
  { species: 'CO2',  moles: 0.5 },
  { species: 'O2',   moles: 0.3 },
  { species: 'O',    moles: 1.836 },
  { species: 'H',    moles: 3.5 },
  { species: 'N2',   moles: 2.97897 },
  { species: 'HCl',  moles: 5.95794 },
  { species: 'Al2O3', moles: 3.3358 },
];

/** Feed formation internal energy of the 1-kg APCP charge, J (AP −295.7,
 *  H2B +111 kJ/mol · element blocks; Al 0). */
const APCP_FEED_U_J = -1_515_100_000;

/** Chamber pressure for the APCP reference preset, Pa (100 bar). */
export const APCP_REFERENCE_PRESSURE = 10_000_000;

function mixtureMolWeight(mixture: readonly Reactant[]): number {
  let mass = 0;
  let moles = 0;
  for (const c of mixture) {
    mass += c.moles * SPECIES[c.species].molecularWeight;
    moles += c.moles;
  }
  return mass / moles;
}

function mixtureGamma(mixture: readonly Reactant[], temperature: number): number {
  let cpRSum = 0;
  let cvRSum = 0;
  let mass = 0;
  for (const c of mixture) {
    const s = SPECIES[c.species];
    const cpR = cpRatio(c.species, temperature);
    cpRSum += c.moles * cpR;
    // cv = cp − R for gases; condensed phases have cv = cp (no −R term).
    cvRSum += c.moles * (cpR - (s.condensed ? 0 : 1));
    mass += c.moles * s.molecularWeight;
  }
  const cp = R_UNIVERSAL * cpRSum / mass;
  const cv = R_UNIVERSAL * cvRSum / mass;
  if (!(cv > 0) || !(cp > 0)) {
    throw new RangeError(`mixtureGamma: non-positive heat capacity at ${temperature} K`);
  }
  return cp / cv;
}

export interface ApcpEquilibrium {
  /** adiabatic chamber temperature, K */
  Tc: number;
  /** frozen-mixture cp/cv at Tc (incl. condensed Al2O3) */
  gamma: number;
  /** mixture molar mass, kg/kmol */
  molWeight: number;
}

/**
 * Representative APCP chamber equilibrium (70% AP / 18% Al / 12% HTPB by
 * mass), self-consistently recomputed from the documented mixture and feed
 * energy via the rigid-vessel balance.
 */
export function apcpEquilibrium(chamberPressure = APCP_REFERENCE_PRESSURE): ApcpEquilibrium {
  if (!Number.isFinite(chamberPressure) || chamberPressure <= 0) {
    throw new RangeError(`apcpEquilibrium: chamber pressure must be finite and > 0, got ${chamberPressure}`);
  }
  const Tc = solveFlame(APCP_MIXTURE, chamberPressure, APCP_FEED_U_J);
  return {
    Tc,
    gamma: mixtureGamma(APCP_MIXTURE, Tc),
    molWeight: mixtureMolWeight(APCP_MIXTURE),
  };
}

/* ------------------------------------------------------------------ *
 *  Isentropic nozzle performance                                      *
 * ------------------------------------------------------------------ */

export interface NozzlePerformance {
  /** vacuum specific impulse, s (pa = 0) */
  ispVac: number;
  /** sea-level specific impulse, s (pa = 101325 Pa) */
  ispSea: number;
  /** characteristic velocity c*, m/s */
  cstar: number;
  /** vacuum thrust coefficient */
  cfVac: number;
  /** sea-level thrust coefficient */
  cfSea: number;
  /** exit-plane Mach number for the pressure ratio pc/pe */
  exitMach: number;
}

/**
 * Frozen-chemistry isentropic nozzle performance from chamber, exit and
 * ambient pressures.
 *
 *   R       = R_UNIVERSAL / molWeight                     [J/(kg·K)]
 *   cstar   = sqrt(R·Tc) / sqrt(γ·(2/(γ+1))^((γ+1)/(γ−1)))
 *   Me      = sqrt(((pc/pe)^((γ−1)/γ) − 1)·2/(γ−1))
 *   Ae/At   = (1/Me)·( (2/(γ+1))·(1+(γ−1)/2·Me²) )^((γ+1)/(2(γ−1)))
 *   Cf      = sqrt( (2γ²/(γ−1))·(2/(γ+1))^((γ+1)/(γ−1))·(1−(pe/pc)^((γ−1)/γ)) )
 *             + ((pe − pa)/pc)·(Ae/At)
 *   Isp     = cstar·Cf / g0
 *
 * All inputs SI (Pa, K, kg/kmol). Throws on NaN/±Inf, non-positive values,
 * γ ≤ 1 or pe ≥ pc (un-choked flow).
 */
export function performance(
  Tc: number,
  gamma: number,
  molWeight: number,
  pc: number,
  pe: number,
  pa: number,
): NozzlePerformance {
  for (const [name, v] of [
    ['Tc', Tc], ['gamma', gamma], ['molWeight', molWeight],
    ['pc', pc], ['pe', pe],
  ] as const) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new RangeError(`performance: ${name} must be finite and > 0, got ${v}`);
    }
  }
  // Ambient pressure may be zero (vacuum) but never negative/non-finite.
  if (!Number.isFinite(pa) || pa < 0) {
    throw new RangeError(`performance: pa must be finite and ≥ 0, got ${pa}`);
  }
  if (!(gamma > 1)) {
    throw new RangeError(`performance: gamma must be > 1, got ${gamma}`);
  }
  if (!(pc > pe)) {
    throw new RangeError(`performance: requires pc > pe (choked flow), pc=${pc}, pe=${pe}`);
  }

  const gasConstant = R_UNIVERSAL / molWeight;

  const exitMach = Math.sqrt(((pc / pe) ** ((gamma - 1) / gamma) - 1) * 2 / (gamma - 1));

  const expTerm = (2 / (gamma + 1)) ** ((gamma + 1) / (gamma - 1));
  const cstar = Math.sqrt(gasConstant * Tc) / Math.sqrt(gamma * expTerm);

  const areaRatio = (1 / exitMach)
    * ((2 / (gamma + 1)) * (1 + (gamma - 1) / 2 * exitMach * exitMach))
      ** ((gamma + 1) / (2 * (gamma - 1)));

  const idealTerm = Math.sqrt((2 * gamma * gamma / (gamma - 1))
    * expTerm * (1 - (pe / pc) ** ((gamma - 1) / gamma)));

  const cfVac = idealTerm + (pe / pc) * areaRatio;
  const cfSea = idealTerm + ((pe - pa) / pc) * areaRatio;

  return {
    ispVac: cstar * cfVac / G0,
    ispSea: cstar * cfSea / G0,
    cstar,
    cfVac,
    cfSea,
    exitMach,
  };
}