/**
 * Bracketed bisection over an engine-evaluated function.
 *
 * `f(x)` returns the engine output minus its target. The search refuses to
 * guess: if `f(lo)` and `f(hi)` do not bracket a root, it reports
 * `not-bracketed` with both end values instead of extrapolating.
 */
export interface BisectOptions {
  lo: number;
  hi: number;
  /** Stop when |f(x)| ≤ this. */
  fTolerance: number;
  /** Stop when the interval is narrower than this. */
  xTolerance: number;
  maxIterations: number;
}

export type BisectResult =
  | { kind: 'found'; x: number; fx: number; calls: number }
  | { kind: 'not-bracketed'; fLo: number; fHi: number; calls: number }
  | { kind: 'not-converged'; x: number; fx: number; calls: number };

export async function bisect(f: (x: number) => Promise<number>, o: BisectOptions): Promise<BisectResult> {
  let lo = o.lo;
  let hi = o.hi;
  let calls = 0;
  const evalAt = async (x: number): Promise<number> => {
    calls += 1;
    const v = await f(x);
    if (!Number.isFinite(v)) throw new Error(`engine returned a non-finite value at ${x}`);
    return v;
  };

  let fLo = await evalAt(lo);
  if (Math.abs(fLo) <= o.fTolerance) return { kind: 'found', x: lo, fx: fLo, calls };
  const fHi = await evalAt(hi);
  if (Math.abs(fHi) <= o.fTolerance) return { kind: 'found', x: hi, fx: fHi, calls };
  if (Math.sign(fLo) === Math.sign(fHi)) return { kind: 'not-bracketed', fLo, fHi, calls };

  let mid = (lo + hi) / 2;
  let fMid = fLo;
  for (let i = 0; i < o.maxIterations; i++) {
    mid = (lo + hi) / 2;
    fMid = await evalAt(mid);
    if (Math.abs(fMid) <= o.fTolerance || hi - lo < o.xTolerance) {
      return { kind: 'found', x: mid, fx: fMid, calls };
    }
    if (Math.sign(fMid) === Math.sign(fLo)) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return { kind: 'not-converged', x: mid, fx: fMid, calls };
}
