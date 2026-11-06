import { useEffect, useState } from 'react';
import { getEngineIdentity, type EngineIdentity } from '../../engine';
import type { JSX } from 'react';
import { describeDragCalibration, type DragCalibration } from '../../application/dragCalibration';
import { calibrationEngineStatus } from '../../application/calibrationApplicability';
import { C } from '../kit/theme';
import { ConfidenceGlyph } from '../kit/Value';

/** The production pool is immutable; guard completion after unmount/replacement. */
export function useCurrentEngineIdentity(): EngineIdentity | undefined {
  const [identity, setIdentity] = useState<EngineIdentity>();
  useEffect(() => {
    let active = true;
    void getEngineIdentity().then((value) => { if (active) setIdentity(value); }, () => { if (active) setIdentity(undefined); });
    return () => { active = false; };
  }, []);
  return identity;
}

/**
 * Marks a result that was computed with the project's drag calibration. It
 * says the numbers were fitted to one flight of this rocket; it never says the
 * model was validated.
 */
export function DragCalibrationChip({ calibration, compact }: { calibration: DragCalibration; compact?: boolean }): JSX.Element {
  const current = useCurrentEngineIdentity();
  const comparison = calibrationEngineStatus(calibration, current);
  const engineNote = comparison === 'different' ? 'Current engine differs from the recorded fit engine; this run is refused rather than attributed to a different engine.'
    : comparison === 'same' ? 'Current WASM matches the recorded fit engine.'
      : comparison === 'legacy' ? 'Legacy fit; no engine identity was recorded.' : 'Fit/current engine match is unknown; missing hashes never establish a match.';
  const detail = `${describeDragCalibration(calibration)}. Adjustment applied from one flight; not a validation of the model. Fit-time eligibility does not establish applicability after inputs change or outside the fitted regime. ${engineNote}`;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px]"
      style={{ color: C.fg, border: `1px solid ${C.lineStrong}` }}
      title={detail}
      data-calibration-engine-match={comparison}
      data-drag-calibration={calibration.scale.toFixed(3)}
    >
      <ConfidenceGlyph c="calibrated" size={7} />
      {compact ? 'Calibrated' : 'Drag calibrated'}
      {comparison === 'different' && <span>Engine changed</span>}
      {comparison === 'unknown' && <span>Engine unknown</span>}
      <span className="font-geist-mono tnum" style={{ color: C.muted }}>×{calibration.scale.toFixed(3)}</span>
    </span>
  );
}
