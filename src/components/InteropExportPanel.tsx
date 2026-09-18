/**
 * Interoperability export panel: .cdx1 outer mold line + aerodynamic
 * matrix .csv, blueprint .svg/.png, plus adapter-matrix row-6 triggers for
 * RockSim (.rkt), RASP motor (.eng), waiver containment (.kml), STEP
 * (.step), and binary STL (.stl).
 *
 * The .csv sweeps Mach 0-4 with power-off and power-on drag from the
 * transonic engine; CNa is the subsonic Barrowman total (documented
 * approximation — Mach degradation of fin lift is modeled in CP, not in
 * this column) at AoA 0, CP from the power-off curve.
 *
 * Every row-6 trigger opens an omission preview first: the target format's
 * subset limits (RKT refusals incl. elliptical fin sets, STEP/STL OML-only
 * skips, ENG nameplate drops, KML local-frame caveats) are listed before
 * any download, and refused inputs offer no download.
 *
 * B-lane port note (frontend commit 26b71b7): the KML trigger serializes
 * the explicitly chosen committed run from the S2 run store (pattern 9 —
 * exports freeze the run snapshot at click time; live views re-evaluate
 * with the store's freshness marker). Payloads arrive via the S4 job
 * service; until then the preview honestly refuses with no bytes emitted.
 */
import React, { useState, useMemo } from 'react';
import { exportBlueprintSvg } from '../formats/blueprint';
import { renderBlueprintPng } from '../formats/blueprintPng';
import type { RocketVehicle } from '../core/types';
import { exportCdx1, exportAeroMatrix, type AeroMatrixRow } from '../formats/rasaero';
import { computeAerodynamicCurves } from '../aero/transonicAero';
import { computeRocketStability } from '../aero/barrowman';
import { exportRkt } from '../formats/rktExport';
import { exportToEng } from '../formats/engParser';
import { exportKml } from '../sim/waiverContainment';
import { tessellateVehicle, exportStep } from '../formats/stepExport';
import { exportStlBinary } from '../formats/stlExport';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { useRocketStore } from '../store/rocketStore';
import { useRunStore } from '../store/runStore';
import {
  describeRktPreview,
  describeEngPreview,
  describeKmlPreview,
  describeStepPreview,
  describeStlPreview,
  buildKmlInputs,
  slugify,
  type ExportTriggerKind,
  type KmlRunSnapshot,
  type OmissionPreview,
} from '../formats/exportPreview';

function downloadBlob(filename: string, blob: Blob): void {
  // Chrome (incl. headless) only starts a download from a programmatic anchor
  // click when the anchor is in the document tree — a detached <a>.click()
  // runs the handler but silently initiates nothing. The blob URL must also
  // stay valid past the click while the browser asynchronously fetches the
  // bytes, so revocation is deferred instead of racing the download.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  const container = document.body ?? document.documentElement;
  if (!container) throw new Error('No document container for the download anchor.');
  container.appendChild(a);
  a.click();
  container.removeChild(a);
  const revoke = URL.revokeObjectURL;
  setTimeout(() => revoke(url), 30_000);
}

function download(filename: string, text: string, mime: string): void {
  downloadBlob(filename, new Blob([text], { type: mime }));
}

export function buildAeroMatrixRows(vehicle: RocketVehicle): AeroMatrixRow[] {
  const off = computeAerodynamicCurves(vehicle, false);
  const on = computeAerodynamicCurves(vehicle, true);
  const { totalCNa } = computeRocketStability(vehicle);
  return off.machPoints.map((mach, i) => ({
    mach,
    aoaDeg: 0,
    cdPowerOff: off.dragCurves[i].totalCd,
    cdPowerOn: on.dragCurves[i].totalCd,
    cna: totalCNa,
    cpX: off.dragCurves[i].cp,
  }));
}

export const InteropExportPanel: React.FC<{ vehicle: RocketVehicle }> = ({ vehicle }) => {
  const [error, setError] = useState<string | null>(null);
  const [staged, setStaged] = useState<{ kind: ExportTriggerKind; preview: OmissionPreview } | null>(null);
  const slug = useMemo(() => slugify(vehicle.name), [vehicle.name]);

  // Shared flight motor + last committed run (same single sources the
  // studios drive): selectedMotorId catalog with Estes C6 fallback, S2 run
  // store lastSimRun projection for the KML track.
  const selectedMotorId = useRocketStore((s) => s.selectedMotorId);
  const customMotors = useRocketStore((s) => s.customMotors);
  const activeMotor = useMemo(
    () => ({ ...CERTIFIED_MOTORS, ...customMotors }[selectedMotorId] ?? CERTIFIED_MOTORS.estes_c6),
    [customMotors, selectedMotorId],
  );
  // The S2 projection carries the explicitly chosen committed run's identity
  // (runKey) with an EMPTY telemetry payload until the S4 job service
  // publishes it — the describe path refuses nothing-to-serialize runs.
  const runRecords = useRunStore((s) => s.records);
  const chosenRunId = useRunStore((s) => s.chosenRunId);
  const kmlRun = useMemo<KmlRunSnapshot | null>(() => {
    const view = useRunStore.getState().lastSimRun();
    if (!view) return null;
    const chosen = runRecords.find((r) => r.runId === chosenRunId);
    if (!chosen) return null;
    return { runKey: view.runKey, freshness: chosen.freshness, telemetry: view.telemetry };
  }, [runRecords, chosenRunId]);

  const openPreview = (kind: ExportTriggerKind) => {
    setError(null);
    switch (kind) {
      case 'rkt':
        setStaged({ kind, preview: describeRktPreview(vehicle) });
        break;
      case 'eng':
        setStaged({ kind, preview: describeEngPreview(activeMotor) });
        break;
      case 'kml':
        setStaged({ kind, preview: describeKmlPreview(kmlRun, slug) });
        break;
      case 'step':
        setStaged({ kind, preview: describeStepPreview(vehicle) });
        break;
      case 'stl':
        setStaged({ kind, preview: describeStlPreview(vehicle) });
        break;
    }
  };

  const handleConfirm = () => {
    if (!staged) return; // no preview open — nothing to confirm
    if (!staged.preview.canExport) {
      setError('Export unavailable: resolve the refusals listed in the preview.');
      return;
    }
    try {
      setError(null);
      switch (staged.kind) {
        case 'rkt':
          download(staged.preview.filename, exportRkt(vehicle), 'application/xml');
          break;
        case 'eng':
          download(staged.preview.filename, exportToEng(activeMotor), 'text/plain');
          break;
        case 'kml': {
          if (!kmlRun) throw new Error('Committed run missing.');
          const { landings, apogeeTrack } = buildKmlInputs(kmlRun);
          download(staged.preview.filename, exportKml(landings, apogeeTrack), 'application/vnd.google-earth.kml+xml');
          break;
        }
        case 'step':
          download(staged.preview.filename, exportStep(tessellateVehicle(vehicle).solids), 'application/step');
          break;
        case 'stl':
          downloadBlob(
            staged.preview.filename,
            new Blob([exportStlBinary(tessellateVehicle(vehicle).solids)], { type: 'model/stl' }),
          );
          break;
      }
      setStaged(null);
    } catch (err) {
      setError(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleCdx1 = () => {
    try {
      setError(null);
      download(`${slug}.cdx1`, exportCdx1(vehicle.components), 'text/plain');
    } catch (err) {
      setError(`CDX1 export failed: ${(err as Error).message}`);
    }
  };

  const handleCsv = () => {
    try {
      setError(null);
      download(`${slug}-aero-matrix.csv`, exportAeroMatrix(buildAeroMatrixRows(vehicle)), 'text/csv');
    } catch (err) {
      setError(`Aero matrix export failed: ${(err as Error).message}`);
    }
  };

  const handleBlueprint = () => {
    try {
      setError(null);
      download(`${slug}-blueprint.svg`, exportBlueprintSvg(vehicle), 'image/svg+xml');
    } catch (err) {
      setError(`Blueprint export failed: ${(err as Error).message}`);
    }
  };

  const handlePng = async () => {
    try {
      setError(null);
      // Print variant (Q11): rasterize the light theme, which is tuned for
      // paper — dark backgrounds would dominate an ink budget.
      const blob = await renderBlueprintPng(exportBlueprintSvg(vehicle, { theme: 'light' }));
      downloadBlob(`${slug}-blueprint.png`, blob);
    } catch (err) {
      setError(`PNG export failed: ${(err as Error).message}`);
    }
  };


  const triggerClass =
    'px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg border border-zinc-700 transition';

  return (
    <div className="relative flex items-center gap-2">
      <button
        onClick={handleCdx1}
        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg border border-zinc-700 transition"
        title="Export RASAero II outer mold line (.cdx1)"
      >
        .cdx1
      </button>
      <button
        onClick={handleCsv}
        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg border border-zinc-700 transition"
        title="Export aerodynamic matrix (.csv)"
      >
        Aero .csv
      </button>
      <button
        onClick={handleBlueprint}
        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg border border-zinc-700 transition"
        title="Export dimensioned blueprint (.svg)"
      >
        Blueprint
      </button>
      <button
        onClick={handlePng}
        className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg border border-zinc-700 transition"
        title="Export print-ready blueprint (.png)"
      >
        PNG
      </button>
      <button onClick={() => openPreview('rkt')} className={triggerClass} title="Preview RockSim subset omissions (.rkt)">
        .rkt
      </button>
      <button onClick={() => openPreview('eng')} className={triggerClass} title="Preview RASP motor omissions (.eng)">
        .eng
      </button>
      <button onClick={() => openPreview('kml')} className={triggerClass} title="Preview waiver containment omissions (.kml)">
        .kml
      </button>
      <button onClick={() => openPreview('step')} className={triggerClass} title="Preview STEP outer-mold-line omissions (.step)">
        .step
      </button>
      <button onClick={() => openPreview('stl')} className={triggerClass} title="Preview binary STL omissions (.stl)">
        .stl
      </button>
      {error && <span className="text-[11px] text-red-400">{error}</span>}
      {staged && (
        <div
          role="dialog"
          aria-label={`${staged.preview.title} export preview`}
          className="absolute right-0 top-full mt-2 z-50 w-80 rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-xl text-left"
        >
          <div className="text-xs font-semibold text-zinc-100">{staged.preview.title} preview</div>
          <div className="mt-0.5 text-[10px] font-mono text-zinc-400">{staged.preview.filename}</div>
          {staged.preview.refused.length > 0 && (
            <ul className="mt-2 space-y-1">
              {staged.preview.refused.map((note) => (
                <li key={note} className="text-[11px] text-red-400">
                  Refused: {note}
                </li>
              ))}
            </ul>
          )}
          {staged.preview.omissions.length > 0 && (
            <ul className="mt-2 space-y-1">
              {staged.preview.omissions.map((note) => (
                <li key={note} className="text-[11px] text-zinc-300">
                  Omit: {note}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={handleConfirm}
              disabled={!staged.preview.canExport}
              className="px-2.5 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 disabled:opacity-30 text-cyan-300 text-xs font-medium rounded-lg border border-cyan-500/40 transition"
              title={`Confirm ${staged.kind} download`}
            >
              Download
            </button>
            <button
              onClick={() => setStaged(null)}
              className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg border border-zinc-700 transition"
              title="Cancel export"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};