/**
 * MissionStatusRail surface suite (jsdom) — spec §1.4, plan §6.3.
 *
 * The rail is a store-backed composition of existing badges: validity
 * (aggregateVehicleMass fail-closed), stability margin, shared motor,
 * lastSimRun freshness (Q5), sounding digest, and active-run state. Every
 * unknown/not-evaluated/out-of-domain state must render as such, never as
 * zero or green. Store mutations after mount re-render asynchronously
 * (React 19 external-store), so post-mount assertions use waitFor.
 */
// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MissionStatusRail } from './MissionStatusRail';
import { useRocketStore, PRESET_ESTES_ALPHA } from '../store/rocketStore';
import { computeRocketStability } from '../aero/barrowman';
import type { RocketVehicle } from '../core/types';

const renderRail = () => render(<MissionStatusRail />);

const rail = () => screen.getByRole('region', { name: /mission status rail/i });

describe('MissionStatusRail', () => {
  beforeEach(() => {
    useRocketStore.getState().resetStore();
  });

  it('renders the default mission posture: valid, stable, motor set, sim unrun, weather unset, no run', () => {
    renderRail();
    expect(rail()).toBeTruthy();
    expect(screen.getByText(/Valid · \d+(?:\.\d+)? kg/)).toBeTruthy();
    // The Estes Alpha preset is over-stable at ~4.8 cal — the rail surfaces
    // the over-stable branch, never a green "stable" while the store says so.
    expect(screen.getByText(/Over-stable · /)).toBeTruthy();
    expect(screen.getByText('Motor Estes C6')).toBeTruthy();
    expect(screen.getByText('Sim not run')).toBeTruthy();
    expect(screen.getByText('Weather unset')).toBeTruthy();
    expect(screen.getByText('No run active')).toBeTruthy();
  });

  it('flags a malformed configuration INVALID (fail-closed — never "valid" by silence)', () => {
    // Empty component list: aggregateVehicleMass fails closed. Keep the
    // existing stability record — the rail's validity branch is mass-driven.
    useRocketStore.setState({
      vehicle: { id: 'broken', name: 'Broken', version: '1.0', author: 'Test', components: [] },
    });
    renderRail();
    expect(screen.getByText('Invalid configuration')).toBeTruthy();
  });

  it('mirrors the store stability margin, including the UNSTABLE branch', () => {
    // Nose + body tube only: CP sits near the nose, CG at the tube center →
    // margin far below 0.5 cal. Guard the fixture so a drift fails loudly
    // instead of silently flipping the label branch.
    const unstable: RocketVehicle = {
      ...PRESET_ESTES_ALPHA,
      id: 'unstable-craft',
      name: 'Unstable Craft',
      components: PRESET_ESTES_ALPHA.components.filter((c) => c.type === 'nosecone' || c.type === 'bodytube'),
    };
    const stability = computeRocketStability(unstable);
    expect(stability.staticMarginCalibers).toBeLessThan(0.5);
    useRocketStore.getState().setVehicle(unstable);
    renderRail();
    expect(screen.getByText(/Unstable · /)).toBeTruthy();
  });

  it('reads SIM freshness from lastSimRun and drifts STALE on vehicle or motor change', async () => {
    const store = useRocketStore.getState();
    const run = {
      vehicleId: PRESET_ESTES_ALPHA.id,
      motorId: 'estes_c6',
      apogeeAltitude: 123.4,
      terminated: true,
      validity: 'PASS' as const,
      recordedAt: Date.now(),
      telemetry: [],
      events: [],
      runKey: 'k',
    };
    store.setLastSimRun(run);
    renderRail();
    expect(screen.getByText('Sim fresh · apogee 123 m')).toBeTruthy();

    // Motor drift stale-marks the committed run (vehicle unchanged).
    store.selectMotor('aerotech_h128w');
    await waitFor(() => expect(screen.getByText('Sim stale')).toBeTruthy(), { timeout: 5000 });
  });

  it('badges weather age, offline state, and unknown state distinctly', async () => {
    const store = useRocketStore.getState();
    store.setSoundingSummary({ status: 'ok', layerCount: 8, fetchedAt: Date.now() - 30_000 });
    renderRail();
    expect(screen.getByText('Sounding <1 min ago')).toBeTruthy();

    store.setSoundingSummary({ status: 'ok', layerCount: 8, fetchedAt: Date.now() - 125 * 60_000 }); // 2h05m
    await waitFor(() => expect(screen.getByText('Sounding 2 h ago')).toBeTruthy(), { timeout: 5000 });

    store.setSoundingSummary({ status: 'error', layerCount: 0, fetchedAt: null });
    await waitFor(() => expect(screen.getByText('Weather offline')).toBeTruthy(), { timeout: 5000 });
  });

  it('composes the active run state, including live Monte Carlo progress', async () => {
    const store = useRocketStore.getState();
    store.setActiveRun({ kind: 'montecarlo', label: 'Monte Carlo', progress: 0.42 });
    renderRail();
    expect(screen.getByText('Monte Carlo 42%')).toBeTruthy();

    store.setActiveRun(null);
    await waitFor(() => expect(screen.getByText('No run active')).toBeTruthy(), { timeout: 5000 });
  });
});