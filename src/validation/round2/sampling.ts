/** Seeded sampling and atmosphere helpers shared by the round-2 harness (same definitions as round 1). */
export const ISA_P0_HPA = 1013.25;
const ISA_RHO0 = 1.225;

export function pressureAltitude(hPa: number): number {
  return 44330.77 * (1 - (hPa / ISA_P0_HPA) ** 0.190263);
}

export function densityAltitude(hPa: number, tempC: number): number {
  const rho = (hPa * 100) / (287.05287 * (tempC + 273.15));
  return (288.15 / 0.0065) * (1 - (rho / ISA_RHO0) ** (1 / 4.2558797));
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
}
