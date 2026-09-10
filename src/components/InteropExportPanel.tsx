/**
 * RASAero interoperability export panel: .cdx1 outer mold line + aerodynamic
 * matrix .csv, generated live from the current vehicle.
 *
 * The .csv sweeps Mach 0-4 with power-off and power-on drag from the
 * transonic engine; CNa is the subsonic Barrowman total (documented
 * approximation — Mach degradation of fin lift is modeled in CP, not in
 * this column) at AoA 0, CP from the power-off curve.
 */
import React, { useState, useMemo } from 'react';
import { exportBlueprintSvg } from '../formats/blueprint';
import { renderBlueprintPng } from '../formats/blueprintPng';
import type { RocketVehicle } from '../core/types';
import { exportCdx1, exportAeroMatrix, type AeroMatrixRow } from '../formats/rasaero';
import { computeAerodynamicCurves } from '../aero/transonicAero';
import { computeRocketStability } from '../aero/barrowman';

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
  const slug = useMemo(
    () => vehicle.name.toLowerCase().replace(/\s+/g, '-') || 'vehicle',
    [vehicle.name],
  );

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


  return (
    <div className="flex items-center gap-2">
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
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </div>
  );
};
