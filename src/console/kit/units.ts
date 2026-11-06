import type { Units } from '../../state/session';

/** Display kinds. Wire values are SI; `len` is a part dimension (mm / in), `dist` is altitude or range (m / ft). */
export type Kind = 'len' | 'dist' | 'speed' | 'mass' | 'force' | 'press' | 'energy' | 'time' | 'angle' | 'mach' | 'cal' | 'ratio' | 'g' | 'accel' | 'cna' | 'modulus' | 'raw';

const KIND_OF_UNIT: Record<string, Kind> = { m: 'dist', 'm/s': 'speed', kg: 'mass', N: 'force', Pa: 'press', J: 'energy', s: 'time', deg: 'angle', '1': 'mach', cal: 'cal', '×': 'ratio', g: 'g', 'm/s²': 'accel', '1/rad': 'cna' };
export const kindOf = (unit: string): Kind => KIND_OF_UNIT[unit] ?? 'raw';

export interface Shown { text: string; unit: string; value: number }

export function show(si: number, kind: Kind, units: Units, digits?: number): Shown {
  const imp = units === 'imperial';
  const f = (v: number, d: number, u: string): Shown => ({ text: Number.isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—', unit: u, value: v });
  switch (kind) {
    case 'len': return imp ? f(si * 39.3701, digits ?? 2, 'in') : f(si * 1000, digits ?? (si < 0.01 ? 1 : 0), 'mm');
    case 'dist': return imp ? f(si * 3.28084, digits ?? 0, 'ft') : f(si, digits ?? 0, 'm');
    case 'speed': return imp ? f(si * 3.28084, digits ?? 0, 'ft/s') : f(si, digits ?? 1, 'm/s');
    case 'mass': return imp ? f(si * 2.20462, digits ?? 2, 'lb') : f(si, digits ?? (si < 1 ? 3 : 2), 'kg');
    case 'force': return imp ? f(si * 0.224809, digits ?? 0, 'lbf') : f(si, digits ?? 0, 'N');
    case 'press': return imp ? f(si * 0.000145038, digits ?? 2, 'psi') : f(si / 1000, digits ?? 1, 'kPa');
    case 'energy': return imp ? f(si * 0.737562, digits ?? 0, 'ft·lbf') : f(si, digits ?? 0, 'J');
    case 'time': return f(si, digits ?? 1, 's');
    case 'angle': return f(si, digits ?? 1, '°');
    case 'mach': return f(si, digits ?? 2, 'M');
    case 'cal': return f(si, digits ?? 2, 'cal');
    case 'ratio': return f(si, digits ?? 2, '×');
    case 'g': return f(si, digits ?? 1, 'g');
    case 'accel': return f(si, digits ?? 0, 'm/s²');
    case 'cna': return f(si, digits ?? 2, '/rad');
    case 'modulus': return f(si / 1e9, digits ?? 1, 'GPa');
    default: return f(si, digits ?? 2, '');
  }
}

/** Inverse of show() for typed input in the current display unit. */
export function toSI(display: number, kind: Kind, units: Units): number {
  const imp = units === 'imperial';
  switch (kind) {
    case 'len': return imp ? display / 39.3701 : display / 1000;
    case 'dist': return imp ? display / 3.28084 : display;
    case 'speed': return imp ? display / 3.28084 : display;
    case 'mass': return imp ? display / 2.20462 : display;
    case 'modulus': return display * 1e9;
    default: return display;
  }
}

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
