/**
 * Live tuning readout under the static margin on the Airframe view: an
 * uncommitted flight preview, thrust-to-weight and fin flutter, each against
 * the committed run where one exists.
 */
import type { ReactNode } from 'react';
import { useWS } from '../store';
import { FLUTTER_GATE, LANDING_SPEED_GATE, RAIL_EXIT_GATE } from '../data/adapter';
import { useFlightPreview, useLiveFinFlutter, useThrustToWeight } from '../livePreview';
import { C } from '../kit/theme';
import { useProjectStore } from '../../state/project';
import { isCandidateFlightModel, resolveFlightModel } from '../../application/flightModel';
import { DeltaChip, ValueUnit } from '../kit/Value';
import type { Kind } from '../kit/units';
import { DragCalibrationChip } from '../evidence/CalibrationChip';

/** Common hobby-rocketry minimum for a stable departure (average thrust : liftoff weight). */
const MIN_THRUST_TO_WEIGHT = 5;

function Row({ label, value, kind, was, warn, digits, title }: { label: string; value: number | null; kind: Kind; was?: number; warn?: boolean; digits?: number; title?: string }): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-2" title={title}>
      <span style={{ color: warn ? C.warn : C.muted }}>{label}</span>
      <span className="flex items-baseline gap-1.5">
        {value !== null && was !== undefined && <DeltaChip now={value} was={was} kind={kind} digits={digits} />}
        {value === null ? <span style={{ color: C.dim }}>—</span> : <ValueUnit value={value} kind={kind} digits={digits} size="sm" />}
      </span>
    </div>
  );
}

export function LivePreview() {
  const committed = useWS((s) => s.committed);
  const calibration = useWS((s) => s.design.dragCalibration);
  const preview = useFlightPreview();
  const tw = useThrustToWeight();
  const flutter = useLiveFinFlutter();
  const candidateSelected = useProjectStore((state) => isCandidateFlightModel(resolveFlightModel(state.project.flightModel)));
  const run = candidateSelected ? undefined : committed?.run?.summary;
  const candidate = committed?.candidate;
  const r = preview.result;
  const updating = preview.status === 'waiting' || preview.status === 'running' || (r !== null && !preview.current);
  const flutterRatio = flutter && r && r.maxVelocity > 0 ? flutter.flutterSpeed / r.maxVelocity : null;

  return (
    <div className="mt-3 space-y-1 pt-2.5" style={{ borderTop: `1px solid ${C.line}` }} aria-label="Live flight preview" data-preview-status={preview.status}>
      <div className="flex items-baseline justify-between">
        <span style={{ color: C.muted }}>Flight preview <span style={{ color: C.dim }}>· not committed</span></span>
        <span className="text-[10px]" style={{ color: preview.status === 'error' ? C.bad : C.dim }} role="status">
          {preview.status === 'error' ? 'failed' : updating ? 'updating…' : preview.status === 'ready' ? 'live' : ''}
        </span>
      </div>
      {calibration && <div><DragCalibrationChip calibration={calibration} compact /></div>}
      {candidate && <div className="text-[10.5px]" style={{ color: C.warn }}>Preview is refused for the selected candidate model; the committed candidate result is in Flight.</div>}
      {(preview.status === 'invalid' || preview.status === 'unavailable' || preview.status === 'error') && (
        <div className="text-[10.5px]" style={{ color: preview.status === 'error' ? C.bad : C.dim }}>{preview.message}</div>
      )}
      <div style={{ opacity: updating && r ? 0.6 : 1 }}>
        <Row label="Apogee" value={r?.apogeeAltitude ?? null} kind="dist" was={run?.apogee.value} />
        <Row label="Max Mach" value={r?.maxMach ?? null} kind="mach" was={run?.maxMach.value} digits={2} />
        <Row label="Rail exit" value={r?.railExitVelocity ?? null} kind="speed" was={run?.railExitSpeed.value}
          warn={r !== null && r.railExitVelocity < RAIL_EXIT_GATE} title={`Engine gate: at least ${RAIL_EXIT_GATE} m/s off the rail`} />
        <Row label="Descent" value={r && r.touchdownNominal ? r.landingVelocity : null} kind="speed" was={run?.landingNominal ? run.landingSpeed.value : undefined}
          warn={r !== null && r.touchdownNominal && r.landingVelocity > LANDING_SPEED_GATE} title={`Tripoli Level 1 certification limit: at most ${LANDING_SPEED_GATE} m/s (35 ft/s) at touchdown`} />
        <Row label="Drift" value={r?.landingDistance ?? null} kind="dist" was={run?.drift.value} />
      </div>
      <Row label="Thrust : weight" value={tw?.average ?? null} kind="ratio" digits={1} warn={tw !== null && tw.average < MIN_THRUST_TO_WEIGHT}
        title={`Average thrust over liftoff weight (${tw ? tw.liftoffMassKg.toFixed(2) : '—'} kg with the loaded motor). ${MIN_THRUST_TO_WEIGHT}:1 is the common minimum.`} />
      {flutter && (
        <Row label="Flutter margin" value={flutterRatio} kind="ratio" digits={2} warn={flutterRatio !== null && flutterRatio < FLUTTER_GATE}
          title={`Sea-level flutter speed of ${flutter.finName} (${flutter.flutterSpeed.toFixed(0)} m/s) over the preview's peak speed; conservative because flutter speed rises with altitude. Gate: ${FLUTTER_GATE}×.`} />
      )}
    </div>
  );
}
