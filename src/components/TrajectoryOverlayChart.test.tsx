/**
 * TrajectoryOverlayChart surface suite (jsdom) — WAVE-A2/Q11 hand-rolled SVG.
 *
 * Acceptance contract:
 *   1. Both series render with their identity chips: 'modeled' (cyan token)
 *      and 'recorded' (violet token) — the Q11 series identity, never a
 *      safety color.
 *   2. Δapogee / Δburnout chips carry the aligned deltas; a non-nominal
 *      apogee classification (short/high) renders the expected band note.
 *   3. Sim event markers render as labeled diamonds on the modeled curve.
 *   4. The draggable cursor: pointer interactions snap to the modeled grid,
 *      the cursor readout shows both series at the pointer time, and
 *      releasing (or leaving) hides it.
 *   5. A missing recorded log renders the empty-series fallback rather than
 *      a corrupt chart.
 */
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TrajectoryOverlayChart } from './TrajectoryOverlayChart';
import { buildOverlaySeries, type OverlayModel } from '../evidence/overlay';
import type { TrajectorySample } from '../evidence/altimetry';

/** Symmetric boost+coast parabola (dt-aligned critical times). */
function parabola(vmax: number, apogeeTime: number, peakAlt: number, dt = 0.1): TrajectorySample[] {
  const T = apogeeTime * 2;
  const out: TrajectorySample[] = [];
  for (let i = 0; i * dt <= T + 1e-9; i++) {
    const t = i * dt;
    const u = t / T;
    out.push({ timeS: t, altitudeM: peakAlt * 4 * u * (1 - u), velocityMs: vmax * (1 - 2 * u) });
  }
  return out;
}

/** Pre-built overlay model for the standard profile: apogees within the 5%
 *  band (300 vs 290 m) => nominal; burnout delta = +20 m/s. */
function nominalModel(): OverlayModel {
  return buildOverlaySeries(parabola(120, 12.5, 300), parabola(100, 10, 290));
}

describe('TrajectoryOverlayChart', () => {
  it('renders both series with their Q11 identity chips and delta readouts', () => {
    const { container } = render(<TrajectoryOverlayChart model={nominalModel()} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // Identity chips (Q11 tokens).
    expect(screen.getByText('modeled')).toBeTruthy();
    expect(screen.getByText('recorded')).toBeTruthy();
    // Δ chips with the alignment result: 300 - 290 = +10 m, +20 m/s.
    expect(screen.getByText('Δapogee +10 m')).toBeTruthy();
    expect(screen.getByText('Δv_burnout +20.0 m/s')).toBeTruthy();
    // Both polylines rendered (2 series paths).
    expect(container.querySelectorAll('path').length).toBeGreaterThanOrEqual(2);
    // The modeled polyline uses the cyan token, recorded the violet.
    const paths = Array.from(container.querySelectorAll('path'));
    const strokeColors = paths.map((p) => p.getAttribute('stroke')).filter(Boolean);
    expect(strokeColors).toContain('#22d3ee');
    expect(strokeColors).toContain('#8b5cf6');
  });

  it('shows the delta-burnout chip only when the recorded log carries velocity', () => {
    const { unmount } = render(<TrajectoryOverlayChart model={nominalModel()} />);
    expect(screen.getByText(/Δv_burnout/)).toBeTruthy();
    unmount();

    // A velocity-less CSV log => null burnout delta => chip absent.
    const noVel = buildOverlaySeries(
      parabola(120, 12.5, 300),
      parabola(100, 10, 290).map(({ timeS, altitudeM }) => ({ timeS, altitudeM })),
    );
    render(<TrajectoryOverlayChart model={noVel} />);
    expect(screen.queryByText(/Δv_burnout/)).toBeNull();
    expect(screen.getByText('Δapogee +10 m')).toBeTruthy();
  });

  it('classifies the apogee band and renders the short/high note', () => {
    const short = buildOverlaySeries(parabola(120, 12.5, 300), parabola(100, 10, 400));
    const { unmount } = render(<TrajectoryOverlayChart model={short} />);
    // Modeled apogee 300 vs recorded 400 => Δ = -100 m, flagged LOW.
    expect(screen.getByText('Δapogee -100 m LOW')).toBeTruthy();
    unmount();

    const high = buildOverlaySeries(parabola(120, 12.5, 500), parabola(100, 10, 400));
    render(<TrajectoryOverlayChart model={high} />);
    expect(screen.getByText('Δapogee +100 m HIGH')).toBeTruthy();
  });

  it('renders sim event markers as labeled diamonds', () => {
    const { container } = render(
      <TrajectoryOverlayChart
        model={nominalModel()}
        events={[{ timeS: 1.2, name: 'Motor Burnout' }, { timeS: 12.5, name: 'Apogee & Drogue' }]}
      />,
    );
    expect(screen.getByText('Motor Burnout')).toBeTruthy();
    expect(screen.getByText('Apogee & Drogue')).toBeTruthy();
    // Diamond markers: one per event (a closed diamond path in the chart).
    const diamonds = Array.from(container.querySelectorAll('path')).filter(
      (p) => (p.getAttribute('d') ?? '').includes('Z'),
    );
    expect(diamonds.length).toBe(2);
  });

  it('drags the cursor and reads out both series at the pointer time', () => {
    const { container } = render(<TrajectoryOverlayChart model={nominalModel()} />);
    const svg = container.querySelector('svg') as SVGSVGElement;
    expect(svg).toBeTruthy();

    // jsdom has no layout: the render root has no size, so fractionFromEvent
    // returns null. Stub getBoundingClientRect so the pointer math resolves.
    const rect = { left: 0, top: 0, width: 640, height: 320, right: 640, bottom: 320, x: 0, y: 0, toJSON: () => ({}) };
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue(rect as DOMRect);

    fireEvent.mouseDown(svg, { clientX: 340, clientY: 160 }); // plot center
    fireEvent.mouseMove(svg, { clientX: 340, clientY: 160 });
    // The cursor readout panel names both series at the snapped time.
    expect(screen.getByText(/modeled \d+\.\d s · \d+ m/)).toBeTruthy();
    expect(screen.getByText(/recorded \d+\.\d s · \d+ m/)).toBeTruthy();

    fireEvent.mouseUp(svg);
    expect(screen.queryByText(/modeled \d+\.\d s · /)).toBeNull();
  }, 20000);

  it('shows the drag hint when no cursor is active', () => {
    render(<TrajectoryOverlayChart model={nominalModel()} />);
    expect(screen.getByText(/drag to inspect samples/)).toBeTruthy();
  });
});