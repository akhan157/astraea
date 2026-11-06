/**
 * Recovery card: derived-bay packing strip and shear-pin / black-powder charge
 * sizing. It belongs to the Recovery stage; the flight-evidence studio no
 * longer mounts it.
 *
 * The bulkhead diameter for the charge sizing comes from the bay inner
 * diameter — the bay diameter is the natural top-level input for both the
 * packing and the charge sections.
 */
import React, { useMemo, useState } from 'react';
import { Package } from 'lucide-react';
import { useProjectStore } from '../../state/project';
import { C } from '../kit/theme';
import { Select } from '../kit/Controls';
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
} from '../../recovery/packing';
import { PIN_2_56, PIN_4_40, targetPressure, bpMass } from '../../recovery/charges';
import { Card, FIELD_STYLE, KvRow, Note, PlainNumberField, Well, fmt, toNumber, toneColor, type Tone } from './studioKit';

const ADVISORY_META: Record<PackAdvisory, { label: string; tone: Tone; hint: string }> = {
  loose: { label: 'LOOSE', tone: 'warn', hint: 'under-packed — chute sloshes in bay' },
  ok: { label: 'OK', tone: 'ok', hint: 'recommended 0.25–0.35 g/cm³ band' },
  tight: { label: 'TIGHT', tone: 'warn', hint: 'over-packed but stowable' },
  jammed: { label: 'JAMMED', tone: 'bad', hint: 'at/above physical packing limit' },
};

/** Provenance badge for one derived dimension: entered, assumed, or missing. */
const PROVENANCE_META: Record<DerivedProvenance, { label: string; tone: Tone }> = {
  entered: { label: 'ENTERED', tone: 'muted' },
  assumed: { label: 'ASSUMED', tone: 'warn' },
  missing: { label: 'MISSING', tone: 'bad' },
};

function Pill({ tone, children }: { tone: Tone; children: React.ReactNode }): React.JSX.Element {
  const color = toneColor(tone);
  return (
    <span className="rounded px-1.5 py-px text-[9.5px] font-semibold" style={{ color, border: `1px solid ${color}55`, background: `${color}14` }}>
      {children}
    </span>
  );
}

function ProvTag({ provenance }: { provenance: DerivedProvenance }): React.JSX.Element {
  const meta = PROVENANCE_META[provenance];
  return <Pill tone={meta.tone}>{meta.label}</Pill>;
}

/** Numerical-list row: preformatted dimension text plus its provenance tag. */
function DimRow({ label, text, provenance }: { label: string; text: string; provenance: DerivedProvenance }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-2 text-[12px]">
      <span className="text-[10.5px] tracking-wide uppercase" style={{ color: C.dim }}>{label}</span>
      <span className="inline-flex items-center gap-1.5 font-geist-mono tnum" data-value={text}>
        {text}
        <ProvTag provenance={provenance} />
      </span>
    </div>
  );
}

/** Derived-bay packing strip + shear-pin/BP charge sizing (C9). */
export function RecoveryCard(): React.JSX.Element {
  const vehicle = useProjectStore((s) => s.project.vehicle);
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
      icon={<Package className="h-4 w-4" />}
    >
      {derived.bays.length > 0 && (
        <div className="flex items-center gap-1.5">
          <label className="w-20 text-[9.5px] leading-tight font-medium uppercase" style={{ color: C.dim }} htmlFor="recovery-bay-select">
            Bay
          </label>
          <Select
            id="recovery-bay-select"
            value={effectiveSel}
            ariaLabel="Recovery bay"
            onChange={setBaySel}
            className="min-w-20 font-geist-mono text-[11px]"
            style={FIELD_STYLE}
          >
            {derived.bays.map((b) => (
              <option key={b.tubeId} value={b.tubeId}>{b.tubeName} (derived)</option>
            ))}
            <option value="manual">Manual entry</option>
          </Select>
        </div>
      )}
      {selectedBay?.ambiguityNote && (
        <p role="status" className="rounded-md px-2.5 py-1.5 text-[11px]" style={{ color: C.warn, border: `1px solid ${C.warn}55`, background: `${C.warn}0d` }}>
          {selectedBay.ambiguityNote}
        </p>
      )}
      {derived.unplacedChutes.length > 0 && (
        <p role="status" className="text-[11px]" style={{ color: C.muted }}>
          Unplaced: {derived.unplacedChutes.join(', ')} — outside every tube span, excluded from every bay.
        </p>
      )}
      {showStrip && (
        <div className="relative flex h-44 w-full items-center justify-center rounded-md p-2" style={{ background: C.sunken }}>
          <svg className="h-full w-full overflow-visible" viewBox="0 0 400 170" role="img" aria-label={stripLabel}>
            <rect x="40" y={70 - borePx / 2} width="350" height={borePx} fill="none" stroke={C.dim} strokeWidth="1.5" />
            <line x1="390" y1="30" x2="390" y2="110" stroke={C.muted} strokeDasharray="3" />
            {stripBlocks.map((b) => (
              <g key={b.key}>
                <rect
                  x={b.x}
                  y={70 - b.h / 2}
                  width={Math.max(0, b.w - b.over)}
                  height={b.h}
                  fill={b.kind === 'chute' ? C.s3 : C.faint}
                  fillOpacity={b.kind === 'chute' ? 0.7 : 0.9}
                  stroke={b.kind === 'chute' ? C.s3 : C.muted}
                  strokeDasharray={b.dashed ? '3' : undefined}
                />
                {b.over > 0 && (
                  <rect x={390} y={70 - b.h / 2} width={b.over} height={b.h} fill={C.bad} fillOpacity="0.8" />
                )}
              </g>
            ))}
            <text x="215" y="150" fill={C.muted} fontSize="9" fontFamily="monospace" textAnchor="middle">
              {(bayLenV! * 1000).toFixed(1)} mm
            </text>
            <text x="40" y="22" fill={C.muted} fontSize="9" fontFamily="monospace">
              ⌀{(boreV! * 1000).toFixed(1)} mm
            </text>
          </svg>
        </div>
      )}
      <Note>Length to scale · diameter exaggerated · bay bounds are the full tube interval (bulkhead stations unknown in v1).</Note>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Bay packing */}
        <Well className="space-y-2.5 p-3">
          <div className="text-[10.5px] font-medium tracking-[0.12em] uppercase" style={{ color: C.dim }}>Bay packing</div>
          {selectedBay === null && (
            <>
              <PlainNumberField label="Bay length m" value={bayLengthText} onChange={setBayLengthText} step="0.01" min="0.01" suffix="m" />
              <PlainNumberField label="Bay inner diameter m" value={bayDiameterText} onChange={setBayDiameterText} step="0.01" min="0.01" suffix="m" />
              <PlainNumberField label="Chute mass g" value={chuteMassText} onChange={setChuteMassText} step="1" min="0.1" suffix="g" />
            </>
          )}
          {selectedBay !== null && (
            <div className="space-y-1">
              <DimRow label="Bay length" text={bayLength.value === null ? '—' : `${(bayLength.value * 1000).toFixed(1)} mm`} provenance={bayLength.provenance} />
              <DimRow label="Bay bore" text={bore.value === null ? '—' : `⌀${(bore.value * 1000).toFixed(1)} mm`} provenance={bore.provenance} />
              {items.map((item) => (
                <div key={item.id} className="space-y-1 pt-1" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div className="font-geist-mono text-[11px]" style={{ color: C.muted }}>{item.name} · {item.kind}</div>
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
          <div className="space-y-1 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
            <KvRow label="Bay volume" value={fmt(volumeM3, 4)} unit="m³" />
            <KvRow label="Packed density" value={fmt(densityGcm3, 3)} unit="g/cm³" />
            <KvRow
              label="Clearance"
              value={clearance === null ? '—' : clearance.fits
                ? `FITS · ${(clearance.remaining * 1000).toFixed(0)} mm spare`
                : `OVERRUN · ${(-clearance.remaining * 1000).toFixed(0)} mm past aft`}
              tone={clearance === null ? 'dim' : clearance.fits ? 'ok' : 'bad'}
            />
            {excludedCount > 0 && (
              <p role="status" className="text-[10.5px]" style={{ color: C.muted }}>
                {excludedCount} item{excludedCount === 1 ? '' : 's'} excluded from clearance — packed length missing.
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[10.5px] tracking-wide uppercase" style={{ color: C.dim }}>Advisory</span>
              {advisoryMeta ? <Pill tone={advisoryMeta.tone}>{advisoryMeta.label}</Pill> : <Pill tone="dim">—</Pill>}
              <span className="text-[10.5px]" style={{ color: C.muted }}>{advisoryMeta ? advisoryMeta.hint : 'enter bay + chute values'}</span>
            </div>
            <Note>Fit + density describe packing geometry only — not deployment reliability.</Note>
          </div>
        </Well>

        {/* Separation charge */}
        <Well className="space-y-2.5 p-3">
          <div className="text-[10.5px] font-medium tracking-[0.12em] uppercase" style={{ color: C.dim }}>Separation charge</div>
          {selectedBay === null && <Note>Bulkhead ⌀ = manual bay ⌀.</Note>}
          {selectedBay !== null && (
            <DimRow label="Bulkhead bore" text={bore.value === null ? '—' : `⌀${(bore.value * 1000).toFixed(1)} mm`} provenance={bore.provenance} />
          )}
          <div className="flex items-center gap-1.5">
            <label className="w-20 text-[9.5px] leading-tight font-medium uppercase" style={{ color: C.dim }} htmlFor="shear-pin-preset">
              Shear pin
            </label>
            <Select
              id="shear-pin-preset"
              value={pinPreset}
              ariaLabel="Shear pin preset"
              onChange={(value) => setPinPreset(value === '2-56' ? '2-56' : '4-40')}
              className="min-w-20 font-geist-mono text-[11px]"
              style={FIELD_STYLE}
            >
              <option value="2-56">2-56 (~{PIN_2_56.shearForceN} N)</option>
              <option value="4-40">4-40 (~{PIN_4_40.shearForceN} N)</option>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-20 text-[9.5px] leading-tight font-medium uppercase" style={{ color: C.dim }}>Pin count</span>
            <input
              type="number"
              inputMode="numeric"
              value={pinCountText}
              min="1"
              step="1"
              aria-label="Shear pin count"
              onChange={(e) => setPinCountText(e.target.value)}
              className="min-w-16 rounded px-1.5 py-1 font-geist-mono text-[11px] outline-none focus-visible:ring-1"
              style={FIELD_STYLE}
            />
            <span className="text-[10.5px]" style={{ color: C.muted }}>pins · bulkhead ⌀ = bay ⌀</span>
          </div>
          <div className="space-y-1 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
            <KvRow label="Target pressure" value={fmt(targetPressurePa !== null ? targetPressurePa / 1000 : null, 1)} unit="kPa" />
            <KvRow label="BP mass" value={fmt(bpMassG, 2)} unit="g" />
            <Note>2× shear safety · ideal-gas +{Math.round((1.20 - 1) * 100)}% charge margin · R 287 J/kg·K · 2000 K</Note>
          </div>
        </Well>
      </div>
    </Card>
  );
}
