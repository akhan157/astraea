import { useRef, type ReactNode } from 'react';
import type { RocketComponent } from '../../core/types';
import { STANDARD_MATERIALS, AIRFOIL_SECTION_NAMES } from '../../core/types';
import { useWS } from '../store';
import { useProjectStore } from '../../state/project';
import { useChanges, useStability, usePreviewDesign, useUnits } from '../hooks';
import { C } from '../kit/theme';
import { show, type Kind } from '../kit/units';
import { FieldRow, InspectorSection, NumberField, Segmented, SelectField, SliderField } from '../kit/Fields';
import { captureTubeAnchor, parentAxialBounds, tubeChildEnds, tubeLengthFloor, tubeLengthPatches, type TubeAnchor } from './partBounds';
import { ResultValue } from '../kit/Value';
import { PART_ICON } from './Shell';
import { FlutterInspector } from '../stages/Aero';
import { FreeformPointsEditor } from './FreeformPointsEditor';

type Spec = {
  field: string; label: string; kind: Kind; min?: number; max?: number; digits?: number;
  /** Number-field nudge step, display units (unchanged behaviour). */
  step?: number;
  /** Slider steps in display units; length defaults are 1 mm / 0.05 in. */
  sliderStepMetric?: number;
  sliderStepImperial?: number;
};
const LEN = (field: string, label: string, min = 0.0005, max = 10): Spec => ({ field, label, kind: 'len', min, max });
const FINE = { sliderStepMetric: 0.1, sliderStepImperial: 0.005 };

const SPECS: Record<RocketComponent['type'], { title: string; fields: Spec[] }[]> = {
  nosecone: [{ title: 'Profile', fields: [LEN('length', 'Length', 0.02, 3), LEN('baseDiameter', 'Base diameter', 0.01, 1), { ...LEN('wallThickness', 'Wall', 0.0003, 0.02), ...FINE }] }],
  bodytube: [{ title: 'Tube', fields: [LEN('length', 'Length', 0.02, 6), LEN('outerDiameter', 'Outer diameter', 0.01, 1), LEN('innerDiameter', 'Inner diameter', 0, 1)] }],
  transition: [{ title: 'Transition', fields: [LEN('length', 'Length', 0.01, 2), LEN('foreDiameter', 'Fore diameter', 0.01, 1), LEN('aftDiameter', 'Aft diameter', 0.01, 1), { ...LEN('wallThickness', 'Wall', 0.0003, 0.02), ...FINE }] }],
  trapezoidfinset: [
    { title: 'Planform', fields: [LEN('rootChord', 'Root chord', 0.01, 1.5), LEN('tipChord', 'Tip chord', 0.001, 1.5), LEN('span', 'Span', 0.01, 1), LEN('sweepLength', 'Leading-edge sweep', 0, 1.5)] },
    { title: 'Construction', fields: [{ ...LEN('thickness', 'Thickness', 0.0005, 0.03), ...FINE }, LEN('axialOffset', 'Position from tube front', 0, 6)] }
  ],
  ellipticalfinset: [
    { title: 'Planform', fields: [LEN('rootChord', 'Root chord', 0.01, 1.5), LEN('span', 'Span', 0.01, 1)] },
    { title: 'Construction', fields: [{ ...LEN('thickness', 'Thickness', 0.0005, 0.03), ...FINE }, LEN('axialOffset', 'Position from tube front', 0, 6)] }
  ],
  freeformfinset: [
    { title: 'Construction', fields: [{ ...LEN('thickness', 'Thickness', 0.0005, 0.03), ...FINE }, LEN('axialOffset', 'Position from tube front', 0, 6)] }
  ],
  masscomponent: [{ title: 'Load', fields: [{ field: 'mass', label: 'Mass', kind: 'mass', min: 0, max: 100, sliderStepMetric: 0.005, sliderStepImperial: 0.01 }, LEN('length', 'Length', 0.005, 3), LEN('axialOffset', 'Position from tube front', 0, 6)] }],
  parachute: [{ title: 'Canopy', fields: [LEN('diameter', 'Diameter', 0.1, 10), { field: 'cd', label: 'Drag coefficient', kind: 'raw', min: 0.3, max: 2.5, digits: 2, step: 0.05, sliderStepMetric: 0.01, sliderStepImperial: 0.01 }, { field: 'mass', label: 'Packed mass', kind: 'mass', min: 0, max: 20, sliderStepMetric: 0.005, sliderStepImperial: 0.01 }, LEN('axialOffset', 'Position from tube front', 0, 6)] }]
};

const TYPE_LABEL: Record<RocketComponent['type'], string> = { nosecone: 'Nose cone', bodytube: 'Body tube', transition: 'Transition', trapezoidfinset: 'Trapezoidal fin set', ellipticalfinset: 'Elliptical fin set', freeformfinset: 'Freeform fin set', masscomponent: 'Mass item', parachute: 'Parachute' };

export function PartInspector({ extra }: { extra?: ReactNode }) {
  const committed = useWS();
  const preview = usePreviewDesign();
  const draft = useProjectStore((state) => state.drafts.airframe);
  const pending = Object.keys(draft.components).length + draft.added.length + draft.removed.length;
  const s = {
    ...committed, design: preview,
    setComponent: (id: string, patch: Partial<RocketComponent>, _label: string): void => {
      useProjectStore.getState().stageComponents('airframe', id, patch);
    },
    clearComponentField: (id: string, field: string, _label: string): void => {
      useProjectStore.getState().stageComponents('airframe', id, { [field]: undefined } as Partial<RocketComponent>);
    },
  };
  const c = s.design.vehicle.components.find((x) => x.id === s.selectedId);
  const changes = useChanges();
  const stab = useStability();
  const units = useUnits();
  const lengthAnchor = useRef<TubeAnchor | null>(null);
  // Staged edits stay actionable even when the part selection is gone, so the
  // banner is part of the inspector's content and lives above the empty state.
  const stagedBanner = pending > 0 && (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-[11.5px]" style={{ borderBottom: `1px solid ${C.line}`, color: C.changed }}>
      <span role="status">{pending} part{pending === 1 ? '' : 's'} with staged edits · runs use committed inputs</span>
      <button className="rounded border px-2 py-1" onClick={() => useProjectStore.getState().applyStudio('airframe')}>Apply staged edits</button>
      <button className="rounded border px-2 py-1" onClick={() => useProjectStore.getState().revertStudio('airframe')}>Discard staged edits</button>
    </div>
  );
  if (!c) return (
    <div className="flex h-full flex-col overflow-auto thin-scroll" style={{ background: C.panel }}>
      {stagedBanner}
      <div className="p-4 text-[12.5px]" style={{ color: C.muted }}>Select a part in the tree or the 3D view.</div>
    </div>
  );
  const committedPart = s.committed?.design.vehicle.components.find((x) => x.id === c.id) as unknown as Record<string, unknown> | undefined;
  const rec = c as unknown as Record<string, unknown>;
  const componentIndex = s.design.vehicle.components.findIndex((x) => x.id === c.id);
  const axialBounds = parentAxialBounds(s.design.vehicle.components, componentIndex, c);
  const offsetViolation = axialBounds !== null && Number(rec.axialOffset) > axialBounds.offsetMax + 1e-9;
  const axialOverrun = axialBounds !== null && offsetViolation ? show(Number(rec.axialOffset) - axialBounds.offsetMax, 'len', units) : null;
  const diameterViolation = c.type === 'bodytube' && c.innerDiameter > 0 && c.innerDiameter >= c.outerDiameter;
  const tubeChildren = c.type === 'bodytube' ? tubeChildEnds(s.design.vehicle.components, componentIndex) : [];
  const tubeLengthMin = c.type === 'bodytube' ? tubeLengthFloor(s.design.vehicle.components, componentIndex) : 0;
  const tubeOverhang = c.type === 'bodytube' ? tubeChildren.filter((child) => child.end > c.length + 1e-9) : [];
  const fieldMin = (f: Spec): number | undefined => {
    if (c.type !== 'bodytube') return f.min;
    if (f.field === 'outerDiameter') return Math.max(f.min ?? 0.01, c.innerDiameter > 0 ? c.innerDiameter + 0.0005 : 0.01);
    if (f.field === 'length') return Math.max(f.min ?? 0.02, tubeLengthMin);
    return f.min;
  };
  const fieldMax = (f: Spec): number | undefined => {
    if (c.type === 'bodytube' && f.field === 'length') return Math.max(f.max ?? 6, tubeLengthMin);
    if (c.type === 'bodytube' && f.field === 'innerDiameter') return Math.min(f.max ?? 1, Math.max(0, c.outerDiameter - 0.0005));
    if (f.field === 'axialOffset' && axialBounds !== null) return Math.min(f.max ?? axialBounds.offsetMax, axialBounds.offsetMax);
    return f.max;
  };
  const sliderStepFor = (f: Spec): number => {
    const metric = f.sliderStepMetric ?? (f.kind === 'len' ? 1 : f.kind === 'mass' ? 0.005 : 0.01);
    const imperial = f.sliderStepImperial ?? (f.kind === 'len' ? 0.05 : f.kind === 'mass' ? 0.01 : 0.01);
    return units === 'metric' ? metric : imperial;
  };
  const warning = (text: string) => (
    <p role="status" data-invalid-geometry="true" className="mt-1 text-[11px]" style={{ color: C.changed }}>{text}</p>
  );
  const isChanged = (f: string) => changes.some((ch) => ch.partId === c.id && ch.field === f);
  /**
   * Every body-tube length edit (typed, scrub, nudge, slider) goes through
   * here: the length and every attached fin set are staged in one write, with
   * the fin offsets measured from the gesture-start anchor so steps cannot
   * drift.
   */
  const stageTubeLength = (
    next: number,
    anchor: TubeAnchor | null = lengthAnchor.current ?? captureTubeAnchor(s.design.vehicle.components, componentIndex),
  ): void => {
    if (anchor === null) return;
    useProjectStore.getState().stageComponentPatches(
      'airframe',
      tubeLengthPatches(s.design.vehicle.components, componentIndex, anchor, next),
    );
  };
  /** Gesture boundaries keep the length row's anchor stable for a whole drag. */
  const lengthGesture = {
    onGestureStart: (): void => {
      if (lengthAnchor.current === null) {
        lengthAnchor.current = captureTubeAnchor(s.design.vehicle.components, componentIndex);
      }
    },
    onGestureEnd: (): void => {
      lengthAnchor.current = null;
    },
  };
  const revert = (f: string) => {
    if (!committedPart) return;
    if (c.type === 'bodytube' && f === 'length') {
      const committedLength = committedPart.length;
      if (typeof committedLength === 'number') {
        // The length edit moved the fins, so reverting it restores both.
        stageTubeLength(committedLength, captureTubeAnchor(s.design.vehicle.components, componentIndex));
      }
      return;
    }
    s.setComponent(c.id, { [f]: committedPart[f] } as Partial<RocketComponent>, `Revert ${f}`);
  };
  const optionalNumber = (
    field: string,
    label: string,
    kind: Kind,
    seed: number,
    min: number,
    max: number,
    hint: string,
    extra?: { digits?: number; step?: number },
  ) => {
    const value = rec[field] === undefined ? undefined : Number(rec[field]);
    const sliderStep = kind === 'len' ? (units === 'metric' ? 0.1 : 0.005) : 0.0001;
    return (
      <FieldRow
        key={field}
        label={label}
        changed={isChanged(field)}
        onRevert={() => revert(field)}
        hint={hint}
        below={value === undefined ? undefined : (
          <SliderField
            value={value}
            kind={kind}
            min={min}
            max={max}
            step={sliderStep}
            digits={extra?.digits}
            ariaLabel={`${label} slider`}
            onChange={(v) => s.setComponent(c.id, { [field]: v } as Partial<RocketComponent>, `${c.name} · ${label}`)}
          />
        )}
      >
        {value === undefined
          ? <button
              aria-label={`Add ${label}`}
              onClick={() => s.setComponent(c.id, { [field]: seed } as Partial<RocketComponent>, `${c.name} · ${label}`)}
              className="rounded px-2 py-1 text-[11.5px] hover:bg-white/5"
              style={{ border: `1px solid ${C.line}`, color: C.muted }}
            >Add</button>
          : <span className="flex items-center gap-1">
              <NumberField
                value={value}
                kind={kind}
                min={min}
                max={max}
                digits={extra?.digits}
                step={extra?.step}
                onChange={(v) => s.setComponent(c.id, { [field]: v } as Partial<RocketComponent>, `${c.name} · ${label}`)}
              />
              <button
                aria-label={`Clear ${label}`}
                onClick={() => s.clearComponentField(c.id, field, `${c.name} · Clear ${label}`)}
                className="text-[11px]"
                style={{ color: C.dim }}
                title="None"
              >×</button>
            </span>}
      </FieldRow>
    );
  };
  const row = stab?.rows.find((r) => r.partId === c.id);
  const I = PART_ICON[c.type];

  return (
    <div className="flex h-full flex-col overflow-auto thin-scroll" style={{ background: C.panel }}>
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: `1px solid ${C.line}` }}>
        <span className="grid h-8 w-8 place-items-center rounded-md" style={{ background: 'rgba(110,231,247,0.08)' }}><I size={15} color={C.accent} /></span>
        <div className="min-w-0">
          <div className="text-[11px]" style={{ color: C.dim }}>{TYPE_LABEL[c.type]}</div>
          <div className="truncate text-[14px] font-medium">{c.name}</div>
        </div>
      </div>
      {stagedBanner}

      {(c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset' || c.type === 'freeformfinset') && (
        <InspectorSection title="Count">
          <FieldRow label="Fins" changed={isChanged('finCount')} onRevert={() => revert('finCount')}>
            <Segmented value={c.finCount} onChange={(v) => s.setComponent(c.id, { finCount: v } as Partial<RocketComponent>, `${c.name} · Fin count`)} options={[3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))} />
          </FieldRow>
        </InspectorSection>
      )}
      {c.type === 'freeformfinset' && (
        <InspectorSection title="Planform outline">
          <FreeformPointsEditor points={c.points} onChange={(points) => s.setComponent(c.id, { points } as Partial<RocketComponent>, `${c.name} · Outline`)} />
        </InspectorSection>
      )}
      {c.type === 'nosecone' && (
        <InspectorSection title="Shape">
          <FieldRow label="Profile" changed={isChanged('shape')} onRevert={() => revert('shape')}>
            <SelectField value={c.shape} width={140} onChange={(v) => s.setComponent(c.id, { shape: v } as Partial<RocketComponent>, `${c.name} · Profile`)} options={['ogive', 'vonkarman', 'conical', 'parabolic', 'elliptical'].map((v) => ({ value: v, label: v === 'vonkarman' ? 'Von Kármán' : v[0].toUpperCase() + v.slice(1) }))} />
          </FieldRow>
        </InspectorSection>
      )}

      {SPECS[c.type].map((sec) => (
        <InspectorSection key={sec.title} title={sec.title}>
          {sec.fields.map((f) => {
            const min = fieldMin(f) ?? 0;
            const max = fieldMax(f) ?? 1;
            const anchored = c.type === 'bodytube' && f.field === 'length';
            const stage = anchored
              ? stageTubeLength
              : (v: number) => s.setComponent(c.id, { [f.field]: v } as Partial<RocketComponent>, `${c.name} · ${f.label}`);
            return (
              <FieldRow
                key={f.field}
                label={f.label}
                changed={isChanged(f.field)}
                onRevert={() => revert(f.field)}
                below={<SliderField value={Number(rec[f.field] ?? 0)} kind={f.kind} min={min} max={max} step={sliderStepFor(f)} digits={f.digits} ariaLabel={`${f.label} slider`} onChange={stage} {...(anchored ? lengthGesture : {})} />}
              >
                <NumberField value={Number(rec[f.field] ?? 0)} kind={f.kind} min={min} max={max} digits={f.digits} step={f.step} onChange={stage} {...(anchored ? lengthGesture : {})} />
              </FieldRow>
            );
          })}
          {sec.fields.some((f) => f.field === 'axialOffset') && axialBounds && axialOverrun && warning(
            `The part extends ${axialOverrun.text} ${axialOverrun.unit} past the end of ${axialBounds.parent.name}. Move it forward or lengthen the tube.`,
          )}
          {sec.fields.some((f) => f.field === 'innerDiameter') && diameterViolation && warning('Inner diameter must be smaller than the outer diameter.')}
          {c.type === 'bodytube' && sec.fields.some((f) => f.field === 'length') && tubeOverhang.length > 0 && warning(
            `These parts extend past this tube's end: ${tubeOverhang.map((child) => child.component.name).join(', ')}. Increase the length.`,
          )}
        </InspectorSection>
      ))}

      {c.type === 'bodytube' && (
        <InspectorSection title="Motor mount">
          <FieldRow label="Holds the motor" changed={isChanged('isMotorMount')} onRevert={() => revert('isMotorMount')}>
            <Segmented size="sm" value={c.isMotorMount ? 'yes' : 'no'} onChange={(v) => s.setComponent(c.id, { isMotorMount: v === 'yes' } as Partial<RocketComponent>, `${c.name} · Motor mount`)} options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
          </FieldRow>
        </InspectorSection>
      )}

      {c.type === 'bodytube' && (
        <InspectorSection title="Launch hardware">
          {optionalNumber('railGuideDiameter', 'Rail guide diameter', 'len', 0.006, 0.0001, 0.1, 'Rail-guide button diameter; absent = no rail guide.')}
          {optionalNumber('railGuideHeight', 'Rail guide height', 'len', 0.004, 0.0001, 0.1, 'Rail-guide button height above the tube surface; absent = none.')}
          {optionalNumber('launchLugDiameter', 'Launch lug diameter', 'len', 0.008, 0.0001, 0.2, 'Launch-lug diameter; absent = no launch lug.')}
          {optionalNumber('launchShoeArea', 'Launch shoe area', 'raw', 0.0009, 0.000001, 0.1, 'Launch-shoe frontal area in square metres (m²); absent = no launch shoe.', { digits: 6, step: 0.0001 })}
        </InspectorSection>
      )}

      {c.type === 'trapezoidfinset' && (
        <InspectorSection title="Airfoil">
          <FieldRow label="Airfoil section" changed={isChanged('airfoilSection')} onRevert={() => revert('airfoilSection')} hint="Section used by the calibrated drag method; absent derives it from the cross-section (airfoil maps to Subsonic NACA).">
            <SelectField
              value={c.airfoilSection ?? ''}
              width={170}
              ariaLabel="Airfoil section"
              onChange={(v) => s.setComponent(c.id, { airfoilSection: v === '' ? undefined : v } as Partial<RocketComponent>, `${c.name} · Airfoil section`)}
              options={[
                { value: '', label: 'From cross-section' },
                ...AIRFOIL_SECTION_NAMES.map((name) => ({ value: name, label: name })),
              ]}
            />
          </FieldRow>
          {optionalNumber('leadingEdgeBevel', 'Leading-edge bevel', 'len', 0.001, 0, 0.05, 'Leading-edge bevel depth; absent = 0.')}
          {optionalNumber('trailingEdgeBevel', 'Trailing-edge bevel', 'len', 0.001, 0, 0.05, 'Trailing-edge bevel depth, applied above Mach 1; absent = 0.')}
          {optionalNumber('leadingEdgeRadius', 'Leading-edge radius', 'len', 0.001, 0, 0.05, 'Leading-edge rounding radius; absent = 0.')}
        </InspectorSection>
      )}

      <InspectorSection title="Material and mass">
        {c.type !== 'masscomponent' && c.type !== 'parachute' && (
          <FieldRow label="Material" changed={isChanged('materialId')} onRevert={() => revert('materialId')}>
            <SelectField value={c.materialId} width={150} onChange={(v) => s.setComponent(c.id, { materialId: v } as Partial<RocketComponent>, `${c.name} · Material`)} options={Object.values(STANDARD_MATERIALS).map((m) => ({ value: m.id, label: m.name }))} />
          </FieldRow>
        )}
        <FieldRow
          label="Weighed mass"
          changed={isChanged('massOverride')}
          onRevert={() => revert('massOverride')}
          hint="Enter a weighed mass to replace the computed one. Weighed masses count as measured."
          below={c.massOverride === undefined ? undefined : (
            <SliderField
              value={c.massOverride}
              kind="mass"
              min={0}
              max={200}
              step={units === 'metric' ? 0.005 : 0.01}
              ariaLabel="Weighed mass slider"
              onChange={(v) => s.setComponent(c.id, { massOverride: v } as Partial<RocketComponent>, `${c.name} · Weighed mass`)}
            />
          )}
        >
          {c.massOverride === undefined
            ? <button onClick={() => s.setComponent(c.id, { massOverride: row?.mass.value ?? 0.1 } as Partial<RocketComponent>, `${c.name} · Weighed mass`)} className="rounded px-2 py-1 text-[11.5px] hover:bg-white/5" style={{ border: `1px solid ${C.line}`, color: C.muted }}>Enter weighed</button>
            : <span className="flex items-center gap-1"><NumberField value={c.massOverride} kind="mass" min={0} max={200} onChange={(v) => s.setComponent(c.id, { massOverride: v } as Partial<RocketComponent>, `${c.name} · Weighed mass`)} /><button onClick={() => s.clearComponentField(c.id, 'massOverride', `${c.name} · Clear weighed mass`)} className="text-[11px]" style={{ color: C.dim }} title="Use computed mass">×</button></span>}
        </FieldRow>
        {row && (
          <div className="mt-2 grid grid-cols-2 gap-3 rounded-md p-2.5" style={{ background: C.sunken }}>
            <div><div className="text-[10.5px]" style={{ color: C.dim }}>Mass</div><ResultValue r={row.mass} label={`${c.name} mass`} /></div>
            <div><div className="text-[10.5px]" style={{ color: C.dim }}>CG from nose</div><ResultValue r={row.cg} kind="len" label={`${c.name} CG`} /></div>
            {row.cp && <div><div className="text-[10.5px]" style={{ color: C.dim }}>CP from nose</div><ResultValue r={row.cp} kind="len" label={`${c.name} CP`} /></div>}
            {row.cnAlpha.value > 0 && <div><div className="text-[10.5px]" style={{ color: C.dim }}>CNα share</div><span className="font-geist-mono text-[13px]">{row.contributionPct.toFixed(1)}%</span></div>}
          </div>
        )}
      </InspectorSection>

      {(c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset') && <FlutterInspector />}
      {c.type === 'freeformfinset' && (
        <InspectorSection title="Fin flutter">
          <div className="text-[11.5px] leading-relaxed" style={{ color: C.muted }}>Not computed. NACA TN-4197 flutter speed is defined for a trapezoidal planform and Astraea does not substitute an equivalent one for a freeform outline.</div>
        </InspectorSection>
      )}
      {extra}
    </div>
  );
}
