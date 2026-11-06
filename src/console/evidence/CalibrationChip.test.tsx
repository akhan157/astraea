// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { getEngineIdentity } from '../../engine';
import { DragCalibrationChip } from './CalibrationChip';
import { buildDragCalibration, type DragCalibration } from '../../application/dragCalibration';
import { LEGACY_FLIGHT_MODEL } from '../../application/flightModel';
import { fitDragScale } from '../../evidence/dragFit';
import type { EngineIdentity } from '../../engine/identity';

vi.mock('../../engine', async (original) => ({ ...await original<typeof import('../../engine')>(), getEngineIdentity: vi.fn() }));

function calibration(engineIdentity?: EngineIdentity): DragCalibration {
  const samples = Array.from({ length: 351 }, (_, i) => ({ timeS: i / 50, altitudeM: 100 + 80 * i / 50 - 6 * (i / 50) ** 2, velocityMs: 80 - 12 * i / 50 }));
  const fit = fitDragScale({ log: samples, coastMassKg: 1, refAreaM2: .01, launchElevationM: 100,
    modelTelemetry: samples.filter((_, i) => i % 2 === 0).map((p) => ({ time: p.timeS, altitude: p.altitudeM, velocity: { z: p.velocityMs } })),
  });
  const side = { burnout: { earliestS: -1.1, latestS: -1, source: 'Controlled burnout' },
    recovery: { kind: 'absent-through' as const, throughS: 8, source: 'Controlled no recovery' },
    verticalMotion: { status: 'supported' as const, source: 'Controlled vertical' },
    constantMass: { status: 'supported' as const, source: 'Controlled mass' } };
  return buildDragCalibration(fit, { sourceFileName: 'controlled.csv', sha256Hex: 'unavailable', rowCount: samples.length,
    dialect: 'generic-csv', skippedLineCount: 0, timeUnitAssumption: 's', altitudeUnitAssumption: 'm' }, '2026-10-25T00:00:00Z', LEGACY_FLIGHT_MODEL, { log: side, model: side }, 'inputs', 'fnv1a32:01234567', engineIdentity);
}

const a: EngineIdentity = { kind: 'production-rust-wasm', sha256: 'a'.repeat(64) };
const b: EngineIdentity = { kind: 'production-rust-wasm', sha256: 'b'.repeat(64) };
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('recorded and current calibration engine display', () => {
  it('distinguishes changed current bytes while retaining the recorded identity', async () => {
    vi.mocked(getEngineIdentity).mockResolvedValue(b);
    const recorded = calibration(a);
    const { container } = render(<DragCalibrationChip calibration={recorded} />);
    await waitFor(() => expect(container.querySelector('[data-calibration-engine-match="different"]')).not.toBeNull());
    expect(container.textContent).toContain('Engine changed');
    expect(container.querySelector('[title]')?.getAttribute('title')).toContain(a.sha256);
    expect(recorded.fitProvenance?.engineIdentity).toEqual(a);
  });

  it('labels a legacy fit without recorded engine identity and recognizes equal recorded bytes', async () => {
    vi.mocked(getEngineIdentity).mockResolvedValue(a);
    const { container, rerender } = render(<DragCalibrationChip calibration={calibration()} />);
    await waitFor(() => expect(getEngineIdentity).toHaveBeenCalled());
    expect(container.querySelector('[data-calibration-engine-match="legacy"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Engine unknown');
    rerender(<DragCalibrationChip calibration={calibration({ kind: 'production-rust-wasm', sha256: null })} />);
    await waitFor(() => expect(container.querySelector('[data-calibration-engine-match="unknown"]')).not.toBeNull());
    expect(container.textContent).toContain('Engine unknown');
    rerender(<DragCalibrationChip calibration={calibration(a)} />);
    await waitFor(() => expect(container.querySelector('[data-calibration-engine-match="same"]')).not.toBeNull());
  });

  it('discards a pending identity completion after the component is replaced', async () => {
    let finishOld: (identity: EngineIdentity) => void = () => undefined;
    vi.mocked(getEngineIdentity).mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; })).mockResolvedValue(b);
    const old = render(<DragCalibrationChip calibration={calibration(a)} />);
    old.unmount();
    const current = render(<DragCalibrationChip calibration={calibration(b)} />);
    await waitFor(() => expect(current.container.querySelector('[data-calibration-engine-match="same"]')).not.toBeNull());
    await act(async () => { finishOld(a); });
    expect(current.container.querySelector('[data-calibration-engine-match="same"]')).not.toBeNull();
  });
});
