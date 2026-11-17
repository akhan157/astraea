/**
 * Vehicle-level changes must reach the freshness diff (accuracy bundle).
 *
 * `diffDesigns` compares components field by field, so a new component field
 * (the nose tip radius) is already covered. The vehicle itself is not a list of
 * components: the site, the aero inputs and the flight opt-ins are compared
 * here, so the amber "changed since run" banner cannot read "current" while the
 * run key and the qualification badge say stale.
 */
import { describe, expect, it } from 'vitest';
import { PRESET_NASA_STUDENT_LAUNCH } from '../state/presets';
import { diffDesigns } from './diff';
import type { Design } from './design';

function design(patch: (vehicle: Design['vehicle']) => void = () => {}): Design {
  const vehicle = structuredClone(PRESET_NASA_STUDENT_LAUNCH);
  patch(vehicle);
  return {
    vehicle,
    motorId: 'aerotech_k550w',
    options: {
      railLength: 3.66, railElevationDeg: 85, railAzimuthDeg: 0, windSpeedSurface: 3,
      windAzimuthDeg: 0, finCantAngleDeg: 0, mainDeployAltitudeAGL: 213, launchAltitudeASL: 0,
    },
    calibrationFitInputKey: null,
    calibrationApplicability: { status: 'none' },
    mission: { name: 'm', site: 's', targetApogeeM: 1 },
  };
}

const fields = (a: Design, b: Design): string[] => diffDesigns(a, b).map((change) => change.field);

describe('vehicle-level freshness changes', () => {
  it('reports nothing for an unchanged design', () => {
    expect(diffDesigns(design(), design())).toEqual([]);
  });

  it('reports the site temperature and altitude', () => {
    const changes = diffDesigns(design(), design((v) => { v.launchSite = { altitudeM: 400, temperatureC: 30 }; }));
    expect(fields(design(), design((v) => { v.launchSite = { altitudeM: 400, temperatureC: 30 }; }))).toEqual(
      expect.arrayContaining(['altitudeM', 'temperatureC']),
    );
    expect(changes.every((c) => ['altitudeM', 'temperatureC'].includes(c.field))).toBe(true);
    expect(changes.every((c) => c.input === 'launch')).toBe(true);
  });

  it('reports the nozzle opt-in, the built-up drag opt-in and the aero inputs', () => {
    expect(fields(design(), design((v) => { v.nozzleExitDiameter = 0.05; }))).toContain('nozzleExitDiameter');
    expect(fields(design(), design((v) => { v.nozzleExitDiameter = 0.05; v.nozzleBackPressureThrust = true; })))
      .toEqual(expect.arrayContaining(['nozzleExitDiameter', 'nozzleBackPressureThrust']));
    expect(fields(design(), design((v) => { v.flightDragSource = 'calibrated'; }))).toContain('flightDragSource');
    expect(fields(design(), design((v) => { v.surfaceFinish = 'Smooth Paint'; }))).toContain('surfaceFinish');
    expect(fields(design(), design((v) => { v.forceTurbulentFlow = true; }))).toContain('forceTurbulentFlow');
  });

  it('reports the nose tip radius as a per-part change with its label', () => {
    const changes = diffDesigns(design(), design((v) => {
      const nose = v.components.find((c) => c.type === 'nosecone');
      if (nose) (nose as { tipRadius?: number }).tipRadius = 0.003;
    }));
    expect(changes).toHaveLength(1);
    expect(changes[0].field).toBe('tipRadius');
    expect(changes[0].label).toBe('Von Kármán Nosecone · Nose tip radius');
    expect(changes[0].input).toBe('geometry');
  });
});
