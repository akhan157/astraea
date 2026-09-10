/**
 * MonteCarloSession surface suite (jsdom).
 *
 * The session's orchestration boundary — chunk dispatch, live progress,
 * cancel-to-partial, FRESH/STALE keying, run-state digest — is tested here
 * with the chunk ENGINE mocked (runMonteCarloChunk): 500–1000 real 6-DOF
* runs would make the suite unusably slow, and chunk-vs-full determinism is
 * already an engine-level contract in the monteCarlo engine suite (Q12). The
 * accumulation/finalize/stats chain stays REAL so the UI is exercised
 * against the genuine reduction path.
 *
 * jsdom has no Worker, so every test exercises the main-thread chunked
 * fallback — the identical chunk protocol the worker path drives, minus the
 * postMessage hop. Landings are generated per ABSOLUTE run index so any
 * chunk partition reproduces the same ensemble (partition-invariance).
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as MonteCarloModule from '../sim/monteCarlo';
import { MonteCarloSession } from './MonteCarloSession';
import { useRocketStore } from '../store/rocketStore';
import { PRESET_ESTES_ALPHA } from '../store/rocketStore';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';

const { mockChunk } = vi.hoisted(() => ({ mockChunk: vi.fn() }));

vi.mock('../sim/monteCarlo', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof MonteCarloModule;
  return {
    ...actual,
    runMonteCarloChunk: mockChunk,
  };
});

/** Default engine mock: landings per absolute run index, zero failures. */
const defaultMock = (_base: unknown, _pert: unknown, nRuns: number, seed: number, chunkIndex: number, chunkSize: number) => {
  const runStart = chunkIndex * chunkSize;
  const runEnd = Math.min(runStart + chunkSize, nRuns);
  const landings = [];
  for (let i = runStart; i < runEnd; i++) {
    landings.push({ x: seed + i * 0.5, y: (i % 3) - 1 });
  }
  return { runStart, runEnd, landings, failedRuns: 0, firstFailureMessage: null };
};

const renderSession = (chunkSize?: number) => {
  const store = useRocketStore.getState();
  store.resetStore();
  return render(
    <MonteCarloSession
      vehicle={PRESET_ESTES_ALPHA}
      motor={CERTIFIED_MOTORS.estes_c6}
      perturbations={{ windAzimuthDegSigma: 0, railAngleDegSigma: 0, impulsePctSigma: 0 }}
      seed={20260909}
      wind={{ speedMs: 0, directionFromDeg: 0 }}
      staleKey="snapshot-key"
      chunkSize={chunkSize}
    />,
  );
};

const runButton = () => screen.getByRole('button', { name: /run competition ensemble/i }) as HTMLButtonElement;
const cancelButton = () => screen.getByRole('button', { name: /cancel competition ensemble/i }) as HTMLButtonElement;
const runsInput = () => screen.getByLabelText('Competition run count') as HTMLInputElement;
const progressbar = () => screen.getByRole('progressbar');

describe('MonteCarloSession', () => {
  beforeEach(() => {
    mockChunk.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the competition controls with the 500-run floor', () => {
    renderSession();
    expect(runsInput().value).toBe('500');
    expect(screen.getByText(/500–1000 runs/)).toBeTruthy();
    expect(runButton()).toBeTruthy();
    expect(cancelButton().disabled).toBe(true);

    // Below-floor and fractional input clamp to 500.
    fireEvent.change(runsInput(), { target: { value: '42' } });
    expect(runsInput().value).toBe('500');
  });

  it('runs a full ensemble through the fallback path and shows fresh stats + scatter', async () => {
    mockChunk.mockImplementation(defaultMock);
    renderSession(500); // single chunk => completes synchronously
    fireEvent.click(runButton());

    expect(screen.getByText('500 succeeded · 0 failed')).toBeTruthy();
    expect(screen.getByText('FRESH — matches current inputs')).toBeTruthy();
    // Real reduction over the merged landings: x_i = seed + i·0.5 with 500
    // runs ⇒ mean.x = seed + 124.75; y cycles (i%3)-1 ⇒ mean.y = 0.
    expect((screen.getByLabelText('Ensemble mean landing (m)').textContent ?? '').replace(/\s+/g, ' ')).toMatch(
      /E 20261033\.8 · N -?0\.0 m/,
    );
    const scatter = screen.getByRole('img', { name: /landing scatter/i });
    expect(scatter.getAttribute('aria-label')).toContain('500 runs');
    // Run-state digest clears when the ensemble settles.
    expect(useRocketStore.getState().activeRun).toBeNull();
  }, 30000);

  it('shows live per-chunk progress and reports the run-state digest', async () => {
    mockChunk.mockImplementation(defaultMock);
    renderSession(25); // 20 chunks of 25 runs each
    fireEvent.click(runButton());

    // The first chunk lands synchronously inside the click handler; the next
    // chunk waits on a macrotask, so right after the click the UI shows
    // EXACTLY 25/500 with the rail digest live — no waitFor, no race.
    expect(progressbar().getAttribute('aria-valuemin')).toBe('0');
    expect(progressbar().getAttribute('aria-valuemax')).toBe('500');
    expect(progressbar().getAttribute('aria-valuenow')).toBe('25');
    expect(progressbar().getAttribute('aria-valuetext')).toBe('25 of 500 runs completed');
    expect(screen.getByText('25 / 500 runs · 0 failed')).toBeTruthy();
    expect(useRocketStore.getState().activeRun?.kind).toBe('montecarlo');
    expect(useRocketStore.getState().activeRun?.label).toBe('Monte Carlo');
    expect(useRocketStore.getState().activeRun?.progress).toBeCloseTo(25 / 500, 5);

    // Ensemble settles and clears the digest.
    await waitFor(() => expect(screen.getByText('500 succeeded · 0 failed')).toBeTruthy(), { timeout: 30000 });
    expect(useRocketStore.getState().activeRun).toBeNull();
  }, 40000);

  it('cancel labels the reduced partial ensemble PARTIAL and stops the stream', async () => {
    mockChunk.mockImplementation(defaultMock);
    renderSession(25);
    fireEvent.click(runButton());

    // Cancel synchronously after the first chunk: the partial label reads
    // exactly 25/500, before any subsequent chunk's macrotask can run.
    expect(progressbar().getAttribute('aria-valuenow')).toBe('25');
    fireEvent.click(cancelButton());

    expect(screen.getByText('PARTIAL — 25/500 runs before cancel; reduced from completed chunks only')).toBeTruthy();
    expect(cancelButton().disabled).toBe(true);
    expect(useRocketStore.getState().activeRun).toBeNull();
    // Partial results are never labeled FRESH (spec §6: partial ≠ final).
    expect(screen.queryByText(/FRESH — matches current inputs/)).toBeNull();
    expect(screen.queryByText(/STALE — inputs changed since run/)).toBeNull();
  }, 30000);

  it('STALE-marks a completed ensemble when the run count changes', async () => {
    mockChunk.mockImplementation(defaultMock);
    renderSession(500);
    fireEvent.click(runButton());
    expect(screen.getByText('FRESH — matches current inputs')).toBeTruthy();

    fireEvent.change(runsInput(), { target: { value: '600' } });
    expect(runsInput().value).toBe('600');
    expect(screen.getByText('STALE — inputs changed since run')).toBeTruthy();

    // Rerun at the new count refreshes the badge.
    fireEvent.click(runButton());
    await waitFor(() => expect(screen.getByText('600 succeeded · 0 failed')).toBeTruthy(), { timeout: 30000 });
    expect(screen.getByText('FRESH — matches current inputs')).toBeTruthy();
  }, 40000);

  it('reproduces the identical ensemble regardless of chunk partition (determinism at the session boundary)', async () => {
    mockChunk.mockImplementation(defaultMock);
    const first = renderSession(3); // 167 chunks, ~500 runs
    fireEvent.click(screen.getByRole('button', { name: /run competition ensemble/i }));
    await waitFor(() => expect(screen.getByText('500 succeeded · 0 failed')).toBeTruthy(), { timeout: 40000 });
    const fineScatter = screen.getByRole('img', { name: /landing scatter/i });
    const fineMean = screen.getByLabelText('Ensemble mean landing (m)').textContent;
    first.unmount();

    renderSession(500); // single chunk
    fireEvent.click(screen.getByRole('button', { name: /run competition ensemble/i }));
    expect(screen.getByRole('img', { name: /landing scatter/i }).getAttribute('aria-label')).toBe(
      fineScatter.getAttribute('aria-label'),
    );
    expect(screen.getByLabelText('Ensemble mean landing (m)').textContent).toBe(fineMean);
  }, 60000);

  it('surfaces an all-failed ensemble as an alert (never a silently empty cloud)', async () => {
    mockChunk.mockImplementation((_base, _pert, nRuns, _seed, chunkIndex, chunkSize) => {
      const runStart = chunkIndex * chunkSize;
      const runEnd = Math.min(runStart + chunkSize, nRuns);
      return {
        runStart,
        runEnd,
        landings: [],
        failedRuns: runEnd - runStart,
        firstFailureMessage: 'railLength must be positive (got 0)',
      };
    });
    renderSession(500);
    fireEvent.click(runButton());

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Competition ensemble failed');
    expect(alert.textContent).toContain('all 500 runs failed');
    expect(screen.queryByRole('img', { name: /landing scatter/i })).toBeNull();
  }, 30000);

  it('unmount mid-run cancels the stream and clears the run-state digest', () => {
    mockChunk.mockImplementation(defaultMock);
    const view = renderSession(25);
    fireEvent.click(runButton());
    expect(progressbar().getAttribute('aria-valuenow')).toBe('25');

    view.unmount();
    expect(useRocketStore.getState().activeRun).toBeNull();
  }, 30000);
});