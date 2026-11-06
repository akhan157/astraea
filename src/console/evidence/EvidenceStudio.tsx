/**
 * Flight evidence: bring a real flight log into the project, compare it with
 * the prediction, and calibrate the drag of this rocket to it.
 *
 *   1. Altimetry — import a flight-log CSV (time, altitude, optional
 *      velocity), resample it, and keep its provenance.
 *   2. Drag calibration — derive the coast from that log, fit the airframe
 *      drag against the model's own coast, and apply the scale to the project.
 *   3. Overlay — sim-vs-flight Inspect/Compare panes over the committed run.
 *   4. Share — package the log, project, motor and flight details as one .zip
 *      so the flight can be used to validate Astraea.
 *   5. Ledger — the raw bytes, checksum and review state of what was imported.
 *
 * Recovery bay and charge sizing live in the Recovery stage.
 */
import type { JSX } from 'react';
import { C } from '../kit/theme';
import { SimFlightOverlay } from './SimFlightOverlay';
import { useProjectStore } from '../../state/project';
import { AltimetryCard } from './AltimetryCard';
import { useLoadedLog } from './loadedLog';
import { CalibrationCard } from './CalibrationCard';
import { ProjectLedger } from './ProjectLedger';
import { ShareFlightCard } from './ShareFlightCard';

export function EvidenceStudio(): JSX.Element {
  // The calibration card works from the last log the altimetry card imported.
  const log = useLoadedLog()?.log ?? null;
  // A replaced project starts with a fresh card, not the old project's text.
  const epoch = useProjectStore((s) => s.projectEpoch);
  return (
    <div className="space-y-4 text-[12px]">
      <header>
        <h2 className="text-[13.5px] font-medium">Flight evidence</h2>
        <p className="text-[12px]" style={{ color: C.muted }}>
          Import a flight log, compare it with the prediction, and calibrate this rocket’s drag to your own flight.
        </p>
      </header>
      <AltimetryCard key={epoch} />
      <CalibrationCard log={log} />
      <SimFlightOverlay />
      <ShareFlightCard />
      <ProjectLedger />
    </div>
  );
}
