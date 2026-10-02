import { MOTORS, analyze, simulate, type Design } from '../../shared/model';

function bisect(f: (x: number) => number, lo: number, hi: number, target: number, iters = 22) {
  let flo = f(lo) - target;
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid) - target;
    if (Math.sign(fm) === Math.sign(flo)) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface Suggestion { id: string; tone: 'fix' | 'tip'; title: string; body: string; patch?: Partial<Design>; action?: string }

/** Rule-based copilot: deterministic proposals computed against the preview model. */
export function suggest(d: Design): Suggestion[] {
  const a = analyze(d);
  const r = simulate(d, a);
  const out: Suggestion[] = [];

  if (a.stability > 3 || a.stability < 1.5) {
    const target = 2.2;
    const span = bisect((s) => analyze({ ...d, finSpan: s }).stability, 0.04, 0.25, target);
    out.push({
      id: 'stab', tone: 'fix',
      title: a.stability > 3 ? `Overstable at ${a.stability.toFixed(2)} cal` : `Understable at ${a.stability.toFixed(2)} cal`,
      body: a.stability > 3
        ? `An overstable rocket weathercocks into the wind and loses altitude. Trimming fin span to ${Math.round(span * 1000)} mm brings the margin to ${target} cal.`
        : `Below 1.5 cal the rocket may not recover from a gust off the rail. Growing fin span to ${Math.round(span * 1000)} mm brings the margin to ${target} cal.`,
      patch: { finSpan: +span.toFixed(3) }, action: `Set span to ${Math.round(span * 1000)} mm`
    });
  }

  const err = (r.apogee - d.targetApogee) / d.targetApogee;
  if (Math.abs(err) > 0.05) {
    const options = MOTORS.map((m) => ({ m, ap: simulate({ ...d, motorId: m.id }).apogee })).sort((x, y) => Math.abs(x.ap - d.targetApogee) - Math.abs(y.ap - d.targetApogee));
    const best = options[0];
    if (best.m.id !== d.motorId && Math.abs(best.ap - d.targetApogee) < Math.abs(r.apogee - d.targetApogee)) {
      out.push({ id: 'motor', tone: 'fix', title: `${err > 0 ? 'Overshooting' : 'Undershooting'} target by ${Math.abs(err * 100).toFixed(0)} %`, body: `The ${best.m.maker} ${best.m.name} is predicted to reach ${Math.round(best.ap * 3.28084).toLocaleString()} ft, the closest match in the catalog.`, patch: { motorId: best.m.id }, action: `Switch to ${best.m.name}` });
    } else if (err > 0) {
      const ballast = bisect((p) => simulate({ ...d, payload: p }).apogee, d.payload, d.payload + 6, d.targetApogee);
      if (ballast - d.payload > 1.5) out.push({ id: 'ballast', tone: 'tip', title: `${Math.round(err * 100)} % above target`, body: 'No catalog motor gets closer, and ballast would need more than 1.5 kg. An airbrake or a reduced-impulse reload is the cleaner fix.' });
      else out.push({ id: 'ballast', tone: 'fix', title: `${Math.round(err * 100)} % above target`, body: `Adding ${(ballast - d.payload).toFixed(2)} kg of nose ballast pulls apogee onto the target and moves CG forward.`, patch: { payload: +ballast.toFixed(2) }, action: `Add ${(ballast - d.payload).toFixed(2)} kg ballast` });
    }
  }

  if (r.descentMain > 7.6) {
    const D = bisect((x) => -simulate({ ...d, mainChute: x }).descentMain, 0.8, 4, -7.0);
    out.push({ id: 'chute', tone: 'fix', title: `Landing at ${r.descentMain.toFixed(1)} m/s`, body: `Competition rules cap descent at 7.6 m/s. A ${D.toFixed(2)} m main slows touchdown to 7.0 m/s.`, patch: { mainChute: +D.toFixed(2) }, action: `Use ${D.toFixed(2)} m main` });
  }

  if (r.railExit < 30) {
    out.push({ id: 'rail', tone: 'fix', title: `Slow off the rail (${r.railExit.toFixed(1)} m/s)`, body: 'A longer rail gives the fins more speed before they have to steer. 30 m/s is the usual minimum.', patch: { railLength: Math.min(8, +(d.railLength + 1.5).toFixed(1)) }, action: `Use a ${Math.min(8, d.railLength + 1.5).toFixed(1)} m rail` });
  }

  if (r.machMax > 0.8) {
    out.push({ id: 'mach', tone: 'tip', title: `Goes transonic (Mach ${r.machMax.toFixed(2)})`, body: 'Drag rises sharply near Mach 1 and simple fin models lose accuracy. Run the transonic aero solver before trusting apogee within 5 %.' });
  }

  if (!out.length) out.push({ id: 'ok', tone: 'tip', title: 'Everything checks out', body: 'All seven verification gates pass on the preview model. Run Monte Carlo before you commit to a build.' });
  return out;
}
