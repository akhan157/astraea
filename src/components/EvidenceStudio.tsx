/**
 * Evidence + Recovery Studio — post-flight evidence ingestion, drag
 * calibration, sim-vs-flight overlay, and recovery-packing/charge sizing.
 *
 * Four self-contained cards, following the FlightSimulationTab surface
 * conventions (zinc panels, mono readouts, accent badges, fail-open with an
 * inline error alert):
 *
 *   1. Altimetry — paste a flight-log CSV, parse with `parseAltimeterCsv`,
 *      resample onto a uniform grid, and report sample count + apogee.
 *   2. Calibration — editable coast-phase points (v, rho, m, A, a) fit by
 *      `calibrateCd` into an effective Cd + RMSE.
 *   3. Overlay — sim-vs-flight Inspect/Compare panes over the committed
 *      lastSimRun plus an ingested flight-log archive (audit F4).
 *   4. Recovery — bay sizing (volume, packed density, pack advisory badge)
 *      and shear-pin/charge sizing (target pressure, BP mass in grams).
 *
 * The bulkhead diameter for the charge sizing comes from the bay inner
 * diameter — the bay diameter is the natural top-level input for both the
 * packing and the charge cards, and it is the only accessible diameter in
 * this scoped panel.
 */

import React, { useMemo, useState } from 'react';
import { SimFlightOverlay } from './SimFlightOverlay';
import { Activity, Variable, Package, ClipboardPaste } from 'lucide-react';
import { parseAltimeterCsv, resample, AltitudeSample } from '../evidence/altimetry';
import { calibrateCd, CoastPoint, CalibrationResult } from '../evidence/calibration';
import { useRocketStore } from '../store/rocketStore';
import {
  bayVolume,
  packedDensity,
  packAdvisory,
  PackAdvisory,
  clearanceCheck,
  deriveBays,
  DerivedBay,
  DerivedDim,
  DerivedProvenance,
  PackItem,
} from '../recovery/packing';
import { PIN_2_56, PIN_4_40, targetPressure, bpMass } from '../recovery/charges';

/** Wrap decimal text into a positive number; invalid/empty text is null. */
function toNumber(text: string): number | null {
  if (text.trim() === '') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function fmt(value: number | null, digits: number, fallback = '—'): string {
  return value === null || !Number.isFinite(value) ? fallback : value.toFixed(digits);
}

/** One editable coast-phase sample row (text-backed for inline editing). */
interface CoastRow {
  velocityMs: string;
  density: string;
  massKg: string;
  refAreaM2: string;
  accelMs2: string;
}

const CALIBRATION_PRESET: CoastRow[] = [
  { velocityMs: '38.4', density: '1.225', massKg: '1.42', refAreaM2: '0.00456', accelMs2: '41.7' },
  { velocityMs: '30.2', density: '1.225', massKg: '1.42', refAreaM2: '0.00456', accelMs2: '25.8' },
  { velocityMs: '22.1', density: '1.225', massKg: '1.42', refAreaM2: '0.00456', accelMs2: '13.9' },
];

const CALIBRATION_DEFAULT_ROW = '22.0';

function rowToCoastPoint(row: CoastRow): CoastPoint | null {
  const velocityMs = toNumber(row.velocityMs);
  const density = toNumber(row.density);
  const massKg = toNumber(row.massKg);
  const refAreaM2 = toNumber(row.refAreaM2);
  const accelMs2 = toNumber(row.accelMs2);
  if (velocityMs === null || density === null || massKg === null || refAreaM2 === null || accelMs2 === null) {
    return null;
  }
  return { velocityMs, density, massKg, refAreaM2, accelMs2 };
}

const ADVISORY_META: Record<
  PackAdvisory,
  { label: string; badge: string; hint: string }
> = {
  loose: {
    label: 'LOOSE',
    badge: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    hint: 'under-packed — chute sloshes in bay',
  },
  ok: {
    label: 'OK',
    badge: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    hint: 'recommended 0.25–0.35 g/cm³ band',
  },
  tight: {
    label: 'TIGHT',
    badge: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    hint: 'over-packed but stowable',
  },
  jammed: {
    label: 'JAMMED',
    badge: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    hint: 'at/above physical packing limit',
  },
};

/** Label + input + mono readout triple used across the cards. */
interface KvRowProps {
  label: string;
  value: string;
  unit?: string;
  className?: string;
}

function KvRow({ label, value, unit, className }: KvRowProps): React.JSX.Element {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-zinc-500 font-semibold uppercase">{label}</span>
      <span className={`font-mono ${className ?? 'text-zinc-100'}`} data-value={value}>
        {value}
        {unit ? <span className="text-zinc-500"> {unit}</span> : null}
      </span>
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: string;
  onChange: (text: string) => void;
  step?: string;
  min?: string;
  suffix?: string;
  suffixClass?: string;
}

function NumberField({ label, value, onChange, step = '0.01', min = '0', suffix, suffixClass = 'text-zinc-400' }: NumberFieldProps): React.JSX.Element {
  return (
    <div className="flex items-center gap-1.5 min-w-24 min-h-9">
      <label className="text-[9px] font-semibold text-zinc-500 uppercase w-16 shrink-0 leading-tight">
        {label}
      </label>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        step={step}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-16 bg-zinc-900/80 text-zinc-100 px-1.5 py-1 rounded-md border border-zinc-700 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300 text-[10px] font-mono"
      />
      {suffix ? <span className={`text-[9px] font-mono ${suffixClass} shrink-0`}>{suffix}</span> : null}
    </div>
  );
}

function Card({ title, kicker, icon, children }: {
  title: string;
  kicker: string;
  icon: React.JSX.Element;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="p-5 bg-zinc-950/80 rounded-2xl border border-zinc-800/80 space-y-3">
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
          {icon}
        </div>
        <div>
          <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">{title}</h3>
          <p className="text-[10px] text-zinc-500">{kicker}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Card 1 — paste CSV, parse, resample; sample count + apogee. */
function AltimetryCard(): React.JSX.Element {
  const [csvText, setCsvText] = useState<string>('');
  const [csvTextDirty, setCsvTextDirty] = useState<boolean>(false);
  const [parsed, setParsed] = useState<AltitudeSample[] | null>(null);
  const [dtText, setDtText] = useState<string>('0.5');
  const [resampled, setResampled] = useState<AltitudeSample[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const csvDirty = csvTextDirty && parsed !== null;

  const handleParse = () => {
    setCsvTextDirty(false);
    try {
      const samples = parseAltimeterCsv(csvText);
      setParsed(samples);
      setError(null);
      setResampled(null);
    } catch (err) {
      setParsed(null);
      setResampled(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResample = () => {
    const dt = toNumber(dtText);
    if (parsed === null || parsed.length === 0) return;
    if (dt === null || dt <= 0) {
      setError('Resample step dt must be a positive number of seconds.');
      setResampled(null);
      return;
    }
    try {
      setResampled(resample(parsed, dt));
      setError(null);
    } catch (err) {
      setResampled(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const apogeeM = () => {
    if (resampled === null || resampled.length === 0) return null;
    let maxSample = resampled[0];
    for (const sample of resampled) {
      if (sample.altitudeM > maxSample.altitudeM) maxSample = sample;
    }
    return maxSample.altitudeM;
  };

  const apogeeS = () => {
    if (resampled === null || resampled.length === 0) return null;
    let maxSample = resampled[0];
    for (const sample of resampled) {
      if (sample.altitudeM > maxSample.altitudeM) maxSample = sample;
    }
    return maxSample.timeS;
  };

  const heading = resampled === null
    ? 'Past flight-log CSV columns: time, t, timestamp, time_s, "time (s)" for time; alt, altitude, agl, altitude_m, "altitude (m)" for height.'
    : '';

  return (
    <Card
      title="Altimetry"
      kicker="Paste flight-log CSV · parse · resample onto a uniform time grid"
      icon={<Activity className="w-4 h-4" />}
    >
      <textarea
        value={csvText}
        onChange={(e) => {
          setCsvText(e.target.value);
          setCsvTextDirty(true);
        }}
        aria-label="Altimeter CSV data"
        placeholder={'time_s,altitude_m\n0.0,12.0\n0.5,24.5\n1.0,37.5\n…'}
        spellCheck={false}
        className="w-full min-h-28 h-28 bg-zinc-900/80 text-zinc-100 px-2.5 py-2 rounded-lg border border-zinc-700 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 text-[10px] font-mono resize-y"
      />
      <p className="text-[9px] text-zinc-600 leading-snug">{heading}</p>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleParse}
          className="min-h-8 px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/25 text-[10px] font-bold uppercase tracking-wider font-mono inline-flex items-center gap-1 cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <ClipboardPaste className="w-3 h-3" />
          Parse
        </button>
        <span className="text-zinc-600">|</span>
        <label className="text-[10px] text-zinc-500 font-semibold" htmlFor="alt-dt">
          Resample dt
          <input
            id="alt-dt"
            type="number"
            inputMode="decimal"
            value={dtText}
            step="0.1"
            min="0.01"
            aria-label="Resample time step seconds"
            onChange={(e) => setDtText(e.target.value)}
            className="w-16 ml-1.5 bg-zinc-900/80 text-zinc-100 px-1.5 py-1 rounded-md border border-zinc-700 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300 text-[10px] font-mono"
          />
          <span className="text-zinc-500"> s</span>
        </label>
        <button
          onClick={handleResample}
          disabled={parsed === null}
          className="min-h-8 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 text-[10px] font-bold uppercase tracking-wider font-mono cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          Resample
        </button>
      </div>

      {error !== null && (
        <div
          className="p-2.5 bg-rose-950/60 rounded-xl border border-rose-500/40 text-rose-300 text-[10px] font-mono"
          role="alert"
        >
          {error}
        </div>
      )}

      <div role="status" aria-live="polite" className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-2.5 bg-zinc-900/90 rounded-lg border border-zinc-800/80">
          <KvRow label="Samples parsed" value={parsed === null ? '—' : String(parsed.length)} className={parsed ? 'text-emerald-400' : 'text-zinc-600'} />
        </div>
        <div className="p-2.5 bg-zinc-900/90 rounded-lg border border-zinc-800/80">
          <KvRow label="Samples @ dt" value={resampled === null ? '—' : String(resampled.length)} className={resampled ? 'text-emerald-400' : 'text-zinc-600'} />
        </div>
        <div className="p-2.5 bg-zinc-900/90 rounded-lg border border-zinc-800/80">
          <KvRow label="Apogee altitude" value={apogeeM() === null ? '—' : `${apogeeM()!.toFixed(1)} m`} className="text-cyan-400" />
          <KvRow label="Apogee at" value={apogeeS() === null ? '—' : `${apogeeS()!.toFixed(1)} s`} className="text-zinc-400" />
        </div>
      </div>

      {csvDirty && (
        <p className="text-[9px] text-amber-400/90 font-mono">
          ▲ CSV edited since Parse — results reflect the last parsed text.
        </p>
      )}
    </Card>
  );
}

/** Card 2 — editable coast points fit to an effective Cd. */
function CalibrationCard(): React.JSX.Element {
  const [rows, setRows] = useState<CoastRow[]>(CALIBRATION_PRESET.map((r) => ({ ...r })));
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CalibrationResult | null>(null);

  const setRow = (index: number, patch: Partial<CoastRow>) => {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleCalibrate = () => {
    const points: CoastPoint[] = [];
    for (const row of rows) {
      const point = rowToCoastPoint(row);
      if (point === null) {
        setError('Every coast point needs finite positive values for v, rho, m, A, and a.');
        setResult(null);
        return;
      }
      points.push(point);
    }
    try {
      setResult(calibrateCd(points));
      setError(null);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card
      title="Calibration"
      kicker="Coast-phase drag fit — Cd = Σ(q·A·Cd̂·v) / Σ(q·A)² via ordinary least squares"
      icon={<Variable className="w-4 h-4" />}
    >
      <div className="overflow-x-auto">
        <div className="grid grid-cols-[minmax(44px,1fr)_minmax(72px,1fr)_minmax(78px,1fr)_minmax(78px,1fr)_minmax(86px,1fr)_minmax(96px,1fr)_40px] gap-1.5 items-center">
          <span className="text-[9px] font-semibold text-zinc-600 uppercase">#</span>
          <span className="text-[9px] font-semibold text-zinc-600 uppercase">v (m/s)</span>
          <span className="text-[9px] font-semibold text-zinc-600 uppercase">ρ (kg/m³)</span>
          <span className="text-[9px] font-semibold text-zinc-600 uppercase">m (kg)</span>
          <span className="text-[9px] font-semibold text-zinc-600 uppercase">A (m²)</span>
          <span className="text-[9px] font-semibold text-zinc-600 uppercase">a (m/s²)</span>
          <span className="w-10" />
          {rows.map((row, index) => (
            <React.Fragment key={index}>
              <span className="text-[10px] font-mono text-zinc-500">{index + 1}</span>
              <NumberField label={`Row ${index + 1} velocity m s`} value={row.velocityMs} onChange={(v) => setRow(index, { velocityMs: v })} step="0.1" suffix="m/s" />
              <NumberField label={`Row ${index + 1} density kg m3`} value={row.density} onChange={(v) => setRow(index, { density: v })} step="0.001" suffix="kg/m³" />
              <NumberField label={`Row ${index + 1} mass kg`} value={row.massKg} onChange={(v) => setRow(index, { massKg: v })} step="0.01" suffix="kg" />
              <NumberField label={`Row ${index + 1} area m2`} value={row.refAreaM2} onChange={(v) => setRow(index, { refAreaM2: v })} step="0.0001" suffix="m²" />
              <NumberField label={`Row ${index + 1} accel m s2`} value={row.accelMs2} onChange={(v) => setRow(index, { accelMs2: v })} step="0.1" suffix="m/s²" />
              <button
                onClick={() => setRows(rows.filter((_, i) => i !== index))}
                aria-label={`Remove coast point row ${index + 1}`}
                title="Remove row"
                className="min-h-7 min-w-7 rounded-md border border-zinc-700 text-zinc-500 hover:text-rose-300 hover:border-rose-500/40 text-[11px] font-mono cursor-pointer transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-rose-300"
              >
                ✕
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setRows(rows.concat([{ velocityMs: CALIBRATION_DEFAULT_ROW, density: '1.225', massKg: '1.42', refAreaM2: '0.00456', accelMs2: '9.81' }]))}
          className="min-h-8 px-3 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700 text-[10px] font-bold uppercase tracking-wider font-mono cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          + Add row
        </button>
        <button
          onClick={handleCalibrate}
          className="min-h-8 px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-zinc-950 font-bold text-[10px] font-mono uppercase rounded-xl shadow transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
        >
          Calibrate Cd
        </button>
        <p className="text-[9px] text-zinc-600">
          Points below {5} m/s are rejected by the fitter; at least 3 usable points required.
        </p>
      </div>

      {error !== null && (
        <div
          className="p-2.5 bg-rose-950/60 rounded-xl border border-rose-500/40 text-rose-300 text-[10px] font-mono"
          role="alert"
        >
          {error}
        </div>
      )}

      {result !== null && (
        <div role="status" aria-live="polite" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-2.5 bg-zinc-900/90 rounded-lg border border-zinc-800/80">
            <KvRow label="Cd calibrated" value={fmt(result.cdCalibrated, 4)} className="text-cyan-400" />
            <p className="text-[9px] text-zinc-600">effective drag coefficient over usable points</p>
          </div>
          <div className="p-2.5 bg-zinc-900/90 rounded-lg border border-zinc-800/80">
            <KvRow label="Fit RMSE" value={`${fmt(result.rmse, 3)} N`} className="text-emerald-400" />
            <p className="text-[9px] text-zinc-600">RMS drag-force residual over usable points</p>
          </div>
        </div>
      )}
    </Card>
  );
}

/** Provenance badge for one derived dimension: entered, assumed, or missing. */
const PROVENANCE_META: Record<DerivedProvenance, { label: string; className: string }> = {
  entered: { label: 'ENTERED', className: 'text-zinc-300 border-zinc-600/50 bg-zinc-800/50' },
  assumed: { label: 'ASSUMED', className: 'text-amber-300 border-amber-500/30 bg-amber-500/10' },
  missing: { label: 'MISSING', className: 'text-rose-300 border-rose-500/30 bg-rose-500/10' },
};

function ProvTag({ provenance }: { provenance: DerivedProvenance }): React.JSX.Element {
  const meta = PROVENANCE_META[provenance];
  return (
    <span className={`px-1.5 py-px rounded border text-[9px] font-mono font-bold ${meta.className}`}>
      {meta.label}
    </span>
  );
}

/** Numerical-list row: preformatted dimension text plus its provenance tag. */
function DimRow({ label, text, provenance }: { label: string; text: string; provenance: DerivedProvenance }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-zinc-500 font-semibold uppercase">{label}</span>
      <span className="inline-flex items-center gap-1.5 font-mono text-zinc-100" data-value={text}>
        {text}
        <ProvTag provenance={provenance} />
      </span>
    </div>
  );
}

/** Card 3 — derived-bay packing strip + shear-pin/BP charge sizing (C9). */
function RecoveryCard(): React.JSX.Element {
  const vehicle = useRocketStore((s) => s.vehicle);
  const derived = useMemo(() => deriveBays(vehicle), [vehicle]);
  const [baySel, setBaySel] = useState<string>(() => derived.bays[0]?.tubeId ?? 'manual');
  const [bayLengthText, setBayLengthText] = useState<string>('0.900');
  const [bayDiameterText, setBayDiameterText] = useState<string>('0.100');
  const [chuteMassText, setChuteMassText] = useState<string>('320');
  const [pinPreset, setPinPreset] = useState<'2-56' | '4-40'>('4-40');
  const [pinCountText, setPinCountText] = useState<string>('4');

  const selectedBay: DerivedBay | null = baySel === 'manual'
    ? null
    : (derived.bays.find((b) => b.tubeId === baySel) ?? derived.bays[0] ?? null);
  const effectiveSel = selectedBay ? selectedBay.tubeId : 'manual';

  const manualLengthM = toNumber(bayLengthText);
  const manualBoreM = toNumber(bayDiameterText);
  const manualChuteG = toNumber(chuteMassText);
  const pinCount = toNumber(pinCountText);

  const bayLength: DerivedDim = selectedBay
    ? selectedBay.lengthM
    : manualLengthM !== null && manualLengthM > 0
      ? { value: manualLengthM, provenance: 'entered' }
      : { value: null, provenance: 'missing' };
  const bore: DerivedDim = selectedBay
    ? selectedBay.innerDiameterM
    : manualBoreM !== null && manualBoreM > 0
      ? { value: manualBoreM, provenance: 'entered' }
      : { value: null, provenance: 'missing' };
  const items = selectedBay ? selectedBay.items : [];

  let chuteMass: DerivedDim = { value: null, provenance: 'missing' };
  if (selectedBay === null) {
    if (manualChuteG !== null && manualChuteG > 0) chuteMass = { value: manualChuteG, provenance: 'entered' };
  } else {
    let sum = 0;
    let complete = false;
    for (const item of selectedBay.items) {
      if (item.kind !== 'chute') continue;
      complete = true;
      if (item.massG === null || item.massG.value === null) {
        complete = false;
        break;
      }
      sum += item.massG.value;
    }
    if (complete) chuteMass = { value: sum, provenance: 'entered' };
  }

  // Engine binding only: volume, density, advisory, and clearance all come
  // from src/recovery/packing.ts — never recomputed here.
  const bayLenV = bayLength.value !== null && bayLength.value > 0 ? bayLength.value : null;
  const boreV = bore.value !== null && bore.value > 0 ? bore.value : null;
  const volumeM3 = bayLenV !== null && boreV !== null ? bayVolume(bayLenV, boreV) : null;
  const densityGcm3 = chuteMass.value !== null && chuteMass.value > 0 && volumeM3 !== null
    ? packedDensity(chuteMass.value, volumeM3)
    : null;
  const advisory = densityGcm3 !== null ? packAdvisory(densityGcm3) : null;
  const stack: PackItem[] = [];
  for (const item of items) {
    if (item.lengthM.value !== null && item.lengthM.value > 0) {
      stack.push({ name: item.name, length: item.lengthM.value });
    }
  }
  const excludedCount = items.length - stack.length;
  const clearance = bayLenV !== null ? clearanceCheck(bayLenV, stack) : null;

  const pinForceN = pinPreset === '2-56' ? PIN_2_56.shearForceN : PIN_4_40.shearForceN;
  const targetPressurePa = pinCount !== null && pinCount > 0 && boreV !== null
    ? targetPressure(pinCount, pinForceN, boreV)
    : null;
  const bpMassG = targetPressurePa !== null && volumeM3 !== null
    ? bpMass(targetPressurePa, volumeM3)
    : null;

  const advisoryMeta = advisory !== null ? ADVISORY_META[advisory] : null;

  // Strip geometry: axial length to scale; bore exaggerated fit-to-height.
  const showStrip = bayLenV !== null && boreV !== null;
  const borePx = showStrip ? Math.max(6, Math.min(56, (boreV! / bayLenV!) * 350)) : 0;
  const stripBlocks: Array<{ key: string; kind: string; name: string; x: number; w: number; over: number; h: number; dashed: boolean }> = [];
  if (showStrip) {
    let cursor = 0;
    for (const item of items) {
      const len = item.lengthM.value;
      if (len === null || len <= 0) continue;
      const dia = item.diameterM.value;
      const h = dia !== null && dia > 0 && boreV! > 0 ? Math.max(4, Math.min(borePx, (dia / boreV!) * borePx)) : borePx * 0.5;
      const x = 40 + (cursor / bayLenV!) * 350;
      const endX = 40 + ((cursor + len) / bayLenV!) * 350;
      stripBlocks.push({
        key: item.id,
        kind: item.kind,
        name: item.name,
        x,
        w: endX - x,
        over: Math.max(0, endX - 390),
        h,
        dashed: dia === null,
      });
      cursor += len;
    }
  }
  const stripLabel = selectedBay !== null && bayLenV !== null
    ? `Bay strip: ${selectedBay.tubeName}, length ${(bayLenV * 1000).toFixed(1)} mm, ${stack.length} placed, ${clearance !== null && clearance.fits ? 'fits' : 'overruns'}`
    : 'Bay strip: manual entry';

  return (
    <Card
      title="Recovery"
      kicker="Derived-bay packing strip + shear-pin / black-powder charge sizing"
      icon={<Package className="w-4 h-4" />}
    >
      {derived.bays.length > 0 && (
        <div className="flex items-center gap-1.5">
          <label className="text-[9px] font-semibold text-zinc-500 uppercase w-20 leading-tight" htmlFor="recovery-bay-select">
            Bay
          </label>
          <select
            id="recovery-bay-select"
            value={effectiveSel}
            aria-label="Recovery bay"
            onChange={(e) => setBaySel(e.target.value)}
            className="min-w-20 bg-zinc-900/80 text-zinc-100 px-1.5 py-1 rounded-md border border-zinc-700 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300 text-[10px] font-mono cursor-pointer"
          >
            {derived.bays.map((b) => (
              <option key={b.tubeId} value={b.tubeId}>{b.tubeName} (derived)</option>
            ))}
            <option value="manual">Manual entry</option>
          </select>
        </div>
      )}
      {selectedBay?.ambiguityNote && (
        <p role="status" className="text-[10px] font-mono text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
          {selectedBay.ambiguityNote}
        </p>
      )}
      {derived.unplacedChutes.length > 0 && (
        <p role="status" className="text-[10px] font-mono text-zinc-400">
          Unplaced: {derived.unplacedChutes.join(', ')} — outside every tube span, excluded from every bay.
        </p>
      )}
      {showStrip && (
        <div className="h-44 w-full bg-zinc-900/60 rounded-lg p-2 relative flex items-center justify-center">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 400 170" role="img" aria-label={stripLabel}>
            <rect x="40" y={70 - borePx / 2} width="350" height={borePx} fill="none" stroke="#52525b" strokeWidth="1.5" />
            <line x1="390" y1="30" x2="390" y2="110" stroke="#71717a" strokeDasharray="3" />
            {stripBlocks.map((b) => (
              <g key={b.key}>
                <rect
                  x={b.x}
                  y={70 - b.h / 2}
                  width={Math.max(0, b.w - b.over)}
                  height={b.h}
                  fill={b.kind === 'chute' ? '#8b5cf6' : '#3f3f46'}
                  fillOpacity={b.kind === 'chute' ? 0.7 : 0.9}
                  stroke={b.kind === 'chute' ? '#c4b5fd' : '#a1a1aa'}
                  strokeDasharray={b.dashed ? '3' : undefined}
                />
                {b.over > 0 && (
                  <rect x={390} y={70 - b.h / 2} width={b.over} height={b.h} fill="#fb7185" fillOpacity="0.8" />
                )}
              </g>
            ))}
            <text x="215" y="150" fill="#71717a" fontSize="9" fontFamily="monospace" textAnchor="middle">
              {(bayLenV! * 1000).toFixed(1)} mm
            </text>
            <text x="40" y="22" fill="#71717a" fontSize="9" fontFamily="monospace">
              ⌀{(boreV! * 1000).toFixed(1)} mm
            </text>
          </svg>
        </div>
      )}
      <p className="text-[9px] text-zinc-600 leading-snug">
        Length to scale · diameter exaggerated · bay bounds are the full tube interval (bulkhead stations unknown in v1).
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bay packing */}
        <div className="space-y-2.5 p-3 bg-zinc-900/80 rounded-xl border border-zinc-800/80">
          <div className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">Bay packing</div>
          {selectedBay === null && (
            <>
              <NumberField label="Bay length m" value={bayLengthText} onChange={setBayLengthText} step="0.01" min="0.01" suffix="m" />
              <NumberField label="Bay inner diameter m" value={bayDiameterText} onChange={setBayDiameterText} step="0.01" min="0.01" suffix="m" />
              <NumberField label="Chute mass g" value={chuteMassText} onChange={setChuteMassText} step="1" min="0.1" suffix="g" />
            </>
          )}
          {selectedBay !== null && (
            <div className="space-y-1">
              <DimRow label="Bay length" text={bayLength.value === null ? '—' : `${(bayLength.value * 1000).toFixed(1)} mm`} provenance={bayLength.provenance} />
              <DimRow label="Bay bore" text={bore.value === null ? '—' : `⌀${(bore.value * 1000).toFixed(1)} mm`} provenance={bore.provenance} />
              {items.map((item) => (
                <div key={item.id} className="border-t border-zinc-800/70 pt-1 space-y-1">
                  <div className="text-[10px] font-mono text-zinc-300">{item.name} · {item.kind}</div>
                  <DimRow
                    label="Axial length"
                    text={item.lengthM.value === null ? '—' : `${(item.lengthM.value * 1000).toFixed(1)} mm`}
                    provenance={item.lengthM.provenance}
                  />
                  <DimRow
                    label="Diameter"
                    text={item.diameterM.value === null ? '—' : `⌀${(item.diameterM.value * 1000).toFixed(1)} mm`}
                    provenance={item.diameterM.provenance}
                  />
                  {item.massG !== null && (
                    <DimRow
                      label="Mass"
                      text={item.massG.value === null ? '—' : `${item.massG.value.toFixed(1)} g`}
                      provenance={item.massG.provenance}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="border-t border-zinc-800/70 pt-2">
            <KvRow label="Bay volume" value={fmt(volumeM3, 4)} unit="m³" className="text-cyan-400" />
            <KvRow label="Packed density" value={fmt(densityGcm3, 3)} unit="g/cm³" className="text-zinc-100" />
            <KvRow
              label="Clearance"
              value={clearance === null ? '—' : clearance.fits
                ? `FITS · ${(clearance.remaining * 1000).toFixed(0)} mm spare`
                : `OVERRUN · ${(-clearance.remaining * 1000).toFixed(0)} mm past aft`}
              className={clearance === null ? 'text-zinc-600' : clearance.fits ? 'text-emerald-400' : 'text-rose-400'}
            />
            {excludedCount > 0 && (
              <p role="status" className="text-[9px] text-zinc-500 font-mono">
                {excludedCount} item{excludedCount === 1 ? '' : 's'} excluded from clearance — packed length missing.
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-zinc-500 font-semibold uppercase">Advisory</span>
              <span
                className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold ${advisoryMeta ? advisoryMeta.badge : 'text-zinc-600 border-zinc-700/40 bg-zinc-800/40'}`}
              >
                {advisoryMeta ? advisoryMeta.label : '—'}
              </span>
              <span className="text-[9px] text-zinc-500">{advisoryMeta ? advisoryMeta.hint : 'enter bay + chute values'}</span>
            </div>
            <p className="text-[9px] text-zinc-600 leading-snug">
              Fit + density describe packing geometry only — not deployment reliability.
            </p>
          </div>
        </div>

        {/* Separation charge */}
        <div className="space-y-2.5 p-3 bg-zinc-900/80 rounded-xl border border-zinc-800/80">
          <div className="text-[10px] font-bold text-zinc-300 uppercase tracking-wider">Separation charge</div>
          {selectedBay === null && (
            <p className="text-[9px] text-zinc-600 font-mono">Bulkhead ⌀ = manual bay ⌀.</p>
          )}
          {selectedBay !== null && (
            <DimRow label="Bulkhead bore" text={bore.value === null ? '—' : `⌀${(bore.value * 1000).toFixed(1)} mm`} provenance={bore.provenance} />
          )}
          <div className="flex items-center gap-1.5">
            <label className="text-[9px] font-semibold text-zinc-500 uppercase w-20 leading-tight" htmlFor="shear-pin-preset">
              Shear pin
            </label>
            <select
              id="shear-pin-preset"
              value={pinPreset}
              aria-label="Shear pin preset"
              onChange={(e) => setPinPreset(e.target.value === '2-56' ? '2-56' : '4-40')}
              className="min-w-20 bg-zinc-900/80 text-zinc-100 px-1.5 py-1 rounded-md border border-zinc-700 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300 text-[10px] font-mono cursor-pointer"
            >
              <option value="2-56">2-56 (~{PIN_2_56.shearForceN} N)</option>
              <option value="4-40">4-40 (~{PIN_4_40.shearForceN} N)</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold text-zinc-500 uppercase w-20 leading-tight">Pin count</span>
            <input
              type="number"
              inputMode="numeric"
              value={pinCountText}
              min="1"
              step="1"
              aria-label="Shear pin count"
              onChange={(e) => setPinCountText(e.target.value)}
              className="min-w-16 bg-zinc-900/80 text-zinc-100 px-1.5 py-1 rounded-md border border-zinc-700 focus-visible:border-cyan-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300 text-[10px] font-mono"
            />
            <span className="text-[9px] text-zinc-500 font-mono">pins · bulkhead ⌀ = bay ⌀</span>
          </div>
          <div className="border-t border-zinc-800/70 pt-2">
            <KvRow label="Target pressure" value={fmt(targetPressurePa !== null ? targetPressurePa / 1000 : null, 1)} unit="kPa" className="text-cyan-400" />
            <KvRow label="BP mass" value={fmt(bpMassG, 2)} unit="g" className="text-cyan-400" />
            <p className="text-[9px] text-zinc-600">
              2× shear safety · ideal-gas +{Math.round((1.20 - 1) * 100)}% charge margin · R 287 J/kg·K · 2000 K
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Self-contained Evidence + Recovery Studio panel. */
export function EvidenceStudio(): React.JSX.Element {
  return (
    <div className="p-6 space-y-6 text-xs text-zinc-200">
      <header>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
          Evidence + Recovery Studio
        </h2>
        <p className="text-xs text-zinc-400">
          Flight-log analysis, drag calibration, sim-vs-flight overlay, and recovery packing/charge sizing
        </p>
      </header>

      <AltimetryCard />
      <CalibrationCard />
      <SimFlightOverlay />
      <RecoveryCard />
    </div>
  );
}