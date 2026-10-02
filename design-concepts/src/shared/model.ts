// Lightweight preview physics for the design prototypes.
// Barrowman CP, component mass rollup, and a 1-D point-mass flight.
// Good enough to make the UIs feel alive; not the Astraea engine.

export type NoseShape = 'ogive' | 'vonkarman' | 'conical' | 'elliptical';
export type Material = 'fiberglass' | 'carbon' | 'bluetube';

export interface Motor {
  id: string;
  name: string;
  maker: string;
  cls: string;
  diameter: number; // mm
  impulse: number; // N·s
  burn: number; // s
  avg: number; // N
  mass: number; // kg loaded
  prop: number; // kg propellant
  note: string;
}

export const MOTORS: Motor[] = [
  { id: 'I284W', name: 'I284W', maker: 'AeroTech', cls: 'I', diameter: 38, impulse: 600, burn: 2.1, avg: 284, mass: 0.59, prop: 0.31, note: 'White Lightning · long burn' },
  { id: 'J350W', name: 'J350W', maker: 'AeroTech', cls: 'J', diameter: 38, impulse: 700, burn: 2.0, avg: 350, mass: 0.73, prop: 0.37, note: 'White Lightning' },
  { id: 'J530IM', name: 'J530IM', maker: 'Cesaroni', cls: 'J', diameter: 54, impulse: 1000, burn: 1.9, avg: 530, mass: 1.02, prop: 0.53, note: 'Imax · fast burn' },
  { id: 'K550W', name: 'K550W', maker: 'AeroTech', cls: 'K', diameter: 54, impulse: 1600, burn: 2.9, avg: 550, mass: 1.49, prop: 0.92, note: 'White Lightning' },
  { id: 'K1100T', name: 'K1100T', maker: 'AeroTech', cls: 'K', diameter: 54, impulse: 2040, burn: 1.85, avg: 1100, mass: 1.75, prop: 1.03, note: 'Blue Thunder · high thrust' },
  { id: 'L1150R', name: 'L1150R', maker: 'AeroTech', cls: 'L', diameter: 75, impulse: 3500, burn: 3.0, avg: 1150, mass: 3.7, prop: 2.3, note: 'Redline' },
  { id: 'M1315W', name: 'M1315W', maker: 'AeroTech', cls: 'M', diameter: 75, impulse: 6400, burn: 4.9, avg: 1315, mass: 6.3, prop: 3.6, note: 'White Lightning · 10k ft class' }
];

export interface Design {
  name: string;
  noseShape: NoseShape;
  noseLength: number; // m
  diameter: number; // m
  bodyLength: number; // m
  finCount: number;
  finRoot: number; // m
  finTip: number; // m
  finSpan: number; // m
  finSweep: number; // m (leading edge sweep length)
  finThickness: number; // m
  material: Material;
  payload: number; // kg
  motorId: string;
  mainChute: number; // m diameter
  drogueChute: number; // m diameter
  mainDeploy: number; // m AGL
  launchAngle: number; // deg from vertical
  railLength: number; // m
  wind: number; // m/s
  targetApogee: number; // m
}

export const DEFAULT_DESIGN: Design = {
  name: 'Kestrel IV',
  noseShape: 'ogive',
  noseLength: 0.6,
  diameter: 0.13,
  bodyLength: 1.9,
  finCount: 3,
  finRoot: 0.24,
  finTip: 0.08,
  finSpan: 0.13,
  finSweep: 0.13,
  finThickness: 0.004,
  material: 'fiberglass',
  payload: 4.0,
  motorId: 'M1315W',
  mainChute: 2.1,
  drogueChute: 0.6,
  mainDeploy: 300,
  launchAngle: 4,
  railLength: 5.2,
  wind: 4.5,
  targetApogee: 3048
};

const DENSITY: Record<Material, number> = { fiberglass: 1850, carbon: 1550, bluetube: 1100 };
const WALL: Record<Material, number> = { fiberglass: 0.0022, carbon: 0.0018, bluetube: 0.0026 };
const NOSE_CP: Record<NoseShape, number> = { ogive: 0.466, vonkarman: 0.5, conical: 0.666, elliptical: 0.333 };
const NOSE_CD: Record<NoseShape, number> = { ogive: 0.0, vonkarman: -0.02, conical: 0.03, elliptical: 0.04 };
const NOSE_VOL: Record<NoseShape, number> = { ogive: 0.55, vonkarman: 0.5, conical: 0.33, elliptical: 0.66 };

export const motorById = (id: string) => MOTORS.find((m) => m.id === id) ?? MOTORS[0];

export function thrustAt(m: Motor, t: number): number {
  if (t < 0 || t > m.burn) return 0;
  const x = t / m.burn;
  // Spike, regressive plateau, tail-off. Normalised below to the rated impulse.
  const shape = x < 0.06 ? x / 0.06 * 1.35 : x < 0.85 ? 1.35 - 0.45 * ((x - 0.06) / 0.79) : 0.9 * (1 - (x - 0.85) / 0.15);
  return shape * (m.impulse / m.burn) / 0.989;
}

export interface MassItem { id: string; label: string; mass: number; x: number; group: string }

export function massItems(d: Design): MassItem[] {
  const rho = DENSITY[d.material];
  const wall = WALL[d.material];
  const r = d.diameter / 2;
  const m = motorById(d.motorId);
  const L = d.noseLength + d.bodyLength;
  const slant = Math.hypot(d.noseLength, r);
  const noseMass = Math.PI * r * slant * NOSE_VOL[d.noseShape] * 1.8 * wall * rho + 0.12;
  const bodyMass = 2 * Math.PI * r * d.bodyLength * wall * rho;
  const finArea = 0.5 * (d.finRoot + d.finTip) * d.finSpan;
  const finMass = d.finCount * finArea * d.finThickness * (d.material === 'bluetube' ? 1850 : rho);
  const motorLen = Math.min(d.bodyLength * 0.45, 0.25 + m.impulse / 9000);
  return [
    { id: 'nose', label: 'Nose cone', mass: noseMass, x: d.noseLength * 0.62, group: 'Airframe' },
    { id: 'payload', label: 'Payload', mass: d.payload, x: d.noseLength + 0.18, group: 'Payload' },
    { id: 'main', label: 'Main parachute', mass: 0.05 + d.mainChute * 0.17, x: d.noseLength + 0.42, group: 'Recovery' },
    { id: 'avionics', label: 'Avionics bay', mass: 0.62, x: d.noseLength + d.bodyLength * 0.42, group: 'Avionics' },
    { id: 'drogue', label: 'Drogue + harness', mass: 0.12 + d.drogueChute * 0.15, x: d.noseLength + d.bodyLength * 0.55, group: 'Recovery' },
    { id: 'body', label: 'Body tube', mass: bodyMass, x: d.noseLength + d.bodyLength / 2, group: 'Airframe' },
    { id: 'fins', label: `Fin set (${d.finCount}×)`, mass: finMass, x: L - d.finRoot * 0.55, group: 'Airframe' },
    { id: 'mount', label: 'Motor mount', mass: 0.18 + 0.35 * motorLen, x: L - motorLen / 2, group: 'Propulsion' },
    { id: 'motor', label: `${m.name} motor`, mass: m.mass, x: L - motorLen / 2, group: 'Propulsion' }
  ];
}

export interface Analysis {
  length: number;
  massDry: number;
  massLiftoff: number;
  cg: number;
  cgBurnout: number;
  cp: number;
  stability: number;
  stabilityBurnout: number;
  cd: number;
  finCNa: number;
  twr: number;
}

export function analyze(d: Design): Analysis {
  const items = massItems(d);
  const m = motorById(d.motorId);
  const L = d.noseLength + d.bodyLength;
  const massLiftoff = items.reduce((s, i) => s + i.mass, 0);
  const cg = items.reduce((s, i) => s + i.mass * i.x, 0) / massLiftoff;
  const motorX = items.find((i) => i.id === 'motor')!.x;
  const massBurn = massLiftoff - m.prop;
  const cgBurnout = (cg * massLiftoff - m.prop * motorX) / massBurn;

  // Barrowman
  const r = d.diameter / 2;
  const xn = NOSE_CP[d.noseShape] * d.noseLength;
  const lm = Math.hypot(d.finSpan, d.finSweep + d.finTip / 2 - d.finRoot / 2);
  const cr = d.finRoot, ct = d.finTip, s = d.finSpan;
  const interference = 1 + r / (s + r);
  const finCNa = interference * (4 * d.finCount * (s / d.diameter) ** 2) / (1 + Math.sqrt(1 + (2 * lm / (cr + ct)) ** 2));
  const xb = L - cr;
  const xf = xb + (d.finSweep / 3) * (cr + 2 * ct) / (cr + ct) + (1 / 6) * (cr + ct - (cr * ct) / (cr + ct));
  const cp = (2 * xn + finCNa * xf) / (2 + finCNa);

  const finArea = d.finCount * 0.5 * (cr + ct) * s;
  const ref = Math.PI * r * r;
  const cd = 0.34 + NOSE_CD[d.noseShape] + 0.03 * (finArea / ref) * (d.finThickness / 0.004) + 0.02 * (L / d.diameter) / 20;

  return {
    length: L,
    massDry: massBurn - (m.mass - m.prop),
    massLiftoff,
    cg,
    cgBurnout,
    cp,
    stability: (cp - cg) / d.diameter,
    stabilityBurnout: (cp - cgBurnout) / d.diameter,
    cd,
    finCNa,
    twr: (m.avg * 1.2) / (massLiftoff * 9.81)
  };
}

export interface SimPoint { t: number; h: number; v: number; a: number; mach: number; thrust: number; x: number }
export interface SimResult {
  series: SimPoint[];
  apogee: number;
  tApogee: number;
  vmax: number;
  machMax: number;
  amax: number;
  railExit: number;
  tBurnout: number;
  descentDrogue: number;
  descentMain: number;
  tLanding: number;
  drift: number;
  qmax: number;
}

const rhoAt = (h: number) => 1.225 * Math.exp(-h / 8500);
const sosAt = (h: number) => Math.max(295, 340.3 - 0.0041 * h);
const machCd = (cd: number, M: number) => cd * (M < 0.8 ? 1 : M < 1.05 ? 1 + 1.6 * (M - 0.8) / 0.25 : M < 1.4 ? 2.6 - 1.4 * (M - 1.05) / 0.35 : 1.2);

export function simulate(d: Design, a: Analysis = analyze(d), opts: { windScale?: number; thrustScale?: number; cdScale?: number } = {}): SimResult {
  const m = motorById(d.motorId);
  const ref = Math.PI * (d.diameter / 2) ** 2;
  const ts = opts.thrustScale ?? 1;
  const cs = opts.cdScale ?? 1;
  const theta = (d.launchAngle * Math.PI) / 180;
  let t = 0, h = 0, v = 0, x = 0, railExit = 0, vmax = 0, machMax = 0, amax = 0, qmax = 0;
  const dt = 0.01;
  const series: SimPoint[] = [];
  let acc = 0;
  for (let i = 0; i < 20000; i++) {
    const F = thrustAt(m, t) * ts;
    const burnFrac = Math.min(1, t / m.burn);
    const mass = a.massLiftoff - m.prop * burnFrac;
    const rho = rhoAt(h);
    const M = Math.abs(v) / sosAt(h);
    const D = 0.5 * rho * v * v * machCd(a.cd * cs, M) * ref;
    acc = (F - D * Math.sign(v)) / mass - 9.81 * Math.cos(theta);
    if (h <= 0 && acc < 0 && t < m.burn) acc = 0;
    v += acc * dt;
    h += v * Math.cos(theta) * dt;
    x += v * Math.sin(theta) * dt;
    t += dt;
    if (!railExit && h * 1 >= d.railLength * Math.cos(theta)) railExit = v;
    vmax = Math.max(vmax, v);
    machMax = Math.max(machMax, M);
    amax = Math.max(amax, acc);
    qmax = Math.max(qmax, 0.5 * rho * v * v);
    if (i % 5 === 0) series.push({ t, h, v, a: acc, mach: M, thrust: F, x });
    if (v < 0 && t > m.burn) break;
  }
  const apogee = h, tApogee = t;
  // Descent: drogue to main deploy, then main.
  const termV = (D: number, Cd: number, mass: number, hh: number) => Math.sqrt((2 * mass * 9.81) / (rhoAt(hh) * Cd * Math.PI * (D / 2) ** 2));
  const massDesc = a.massLiftoff - m.prop;
  const descentDrogue = termV(d.drogueChute, 1.5, massDesc, apogee / 2);
  const descentMain = termV(d.mainChute, 2.0, massDesc, 100);
  const tDrogue = Math.max(0, apogee - d.mainDeploy) / descentDrogue;
  const tMain = Math.min(apogee, d.mainDeploy) / descentMain;
  // descent samples for plots
  const steps = 40;
  for (let k = 1; k <= steps; k++) {
    const tt = (k / steps) * (tDrogue + tMain);
    const hh = tt < tDrogue ? apogee - tt * descentDrogue : Math.max(0, d.mainDeploy - (tt - tDrogue) * descentMain);
    const vv = tt < tDrogue ? -descentDrogue : -descentMain;
    series.push({ t: tApogee + tt, h: Math.min(hh, apogee), v: vv, a: 0, mach: Math.abs(vv) / sosAt(hh), thrust: 0, x: x + d.wind * (opts.windScale ?? 1) * tt });
  }
  const tLanding = tApogee + tDrogue + tMain;
  return {
    series,
    apogee,
    tApogee,
    vmax,
    machMax,
    amax,
    railExit,
    tBurnout: m.burn,
    descentDrogue,
    descentMain,
    tLanding,
    drift: x + d.wind * (opts.windScale ?? 1) * (tDrogue + tMain),
    qmax
  };
}

/** Seeded Monte Carlo landing dispersion. */
export function monteCarlo(d: Design, n = 160, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const a = analyze(d);
  const out: { x: number; y: number; apogee: number }[] = [];
  for (let i = 0; i < n; i++) {
    const ws = 1 + 0.25 * gauss();
    const dir = (12 + 18 * gauss()) * (Math.PI / 180);
    const r = simulate(d, a, { windScale: ws, thrustScale: 1 + 0.03 * gauss(), cdScale: 1 + 0.06 * gauss() });
    out.push({ x: Math.cos(dir) * r.drift, y: Math.sin(dir) * r.drift, apogee: r.apogee });
  }
  return out;
}

export type GateState = 'pass' | 'warn' | 'fail';
export interface Gate { id: string; label: string; value: string; rule: string; state: GateState }

export function gates(d: Design, a: Analysis, r: SimResult): Gate[] {
  const st = (ok: boolean, warn: boolean): GateState => (ok ? 'pass' : warn ? 'warn' : 'fail');
  const apErr = (r.apogee - d.targetApogee) / d.targetApogee;
  return [
    { id: 'stab', label: 'Static stability at rail exit', value: `${a.stability.toFixed(2)} cal`, rule: '1.5 – 3.0 cal', state: st(a.stability >= 1.5 && a.stability <= 3, a.stability >= 1 && a.stability <= 4) },
    { id: 'rail', label: 'Rail exit velocity', value: `${r.railExit.toFixed(1)} m/s`, rule: '≥ 30 m/s', state: st(r.railExit >= 30, r.railExit >= 22) },
    { id: 'twr', label: 'Thrust-to-weight', value: `${a.twr.toFixed(1)} : 1`, rule: '≥ 5 : 1', state: st(a.twr >= 5, a.twr >= 3.5) },
    { id: 'apogee', label: 'Apogee vs target', value: `${apErr >= 0 ? '+' : ''}${(apErr * 100).toFixed(1)} %`, rule: '±5 % of target', state: st(Math.abs(apErr) <= 0.05, Math.abs(apErr) <= 0.12) },
    { id: 'mach', label: 'Max Mach (transonic check)', value: `M ${r.machMax.toFixed(2)}`, rule: '< 0.8 subsonic model', state: st(r.machMax < 0.8, r.machMax < 1.2) },
    { id: 'main', label: 'Main descent rate', value: `${r.descentMain.toFixed(1)} m/s`, rule: '≤ 7.6 m/s (25 ft/s)', state: st(r.descentMain <= 7.6, r.descentMain <= 9) },
    { id: 'drift', label: 'Landing drift', value: `${(r.drift / 1000).toFixed(2)} km`, rule: '≤ 1.6 km', state: st(r.drift <= 1600, r.drift <= 2500) }
  ];
}
