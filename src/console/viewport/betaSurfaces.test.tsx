// @vitest-environment jsdom
/**
 * Surfaces the beta layout fix must keep alive: the 2D drawing, the 3D view
 * probe, and the parts tree's mass total and per-row masses. Beta publishes no
 * component breakdown, so all of these previously fell back to "no parts" /
 * 0 kg. The real engine is installed for the 2D/3D checks; the parts tree uses
 * a deterministic rollup so the numbers are exact.
 */
import { readFileSync } from 'node:fs';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PRESET_NASA_STUDENT_LAUNCH } from '../../state/presets';
import { AERO_MODEL_VERSION, type AeroModelSelection } from '../../application/aeroModel';
import { useProjectStore } from '../../state/project';
import { useSelectionFilter } from '../../state/selection';
import { useSessionStore } from '../../state/session';
import { installTestEngine, stabilityAnalysis } from '../testFixtures';
import { Drawing2D } from './Drawing2D';
import { Viewport } from './Viewport';
import { PartsTree } from '../shell/PartsTree';
import { layoutFromGeometry } from './Vehicle3D';
import { instantiateEngine, type EngineInstance } from '../../engine/core';

const BETA: AeroModelSelection = {
  modelId: 'aero-buildup',
  modelVersion: AERO_MODEL_VERSION,
  terms: { transonic: 'legacy' },
};

let engine: EngineInstance;
let teardown: (() => void) | null = null;

beforeAll(async () => {
  engine = await instantiateEngine(readFileSync('src/engine/astraea_engine.wasm'));
});

afterEach(() => {
  cleanup();
  teardown?.();
  teardown = null;
});

const shell = (): HTMLElement | null => document.querySelector('[data-layout-state]');

describe('2D drawing under the beta model', () => {
  it('draws the full length and every hull part', async () => {
    teardown = installTestEngine((async (cmd: string, args?: Record<string, unknown>) => engine.call(cmd, args)) as never).teardown;
    const { container } = render(
      <Drawing2D vehicle={PRESET_NASA_STUDENT_LAUNCH} aeroModel={BETA} selectedId={null} onPick={() => undefined} />,
    );
    // 2.97 m in the default metric display; the base defect drew 1,000 mm.
    await screen.findByText('L 2,970 mm');
    // Three body tubes and the nose outline exist as direct SVG children.
    expect(container.querySelectorAll('svg > rect').length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll('svg > path[stroke-width]').length).toBeGreaterThanOrEqual(1);
  });
});

describe('3D viewport under the beta model', () => {
  it('reports the full layout and the beta model markers', async () => {
    teardown = installTestEngine((async (cmd: string, args?: Record<string, unknown>) => engine.call(cmd, args)) as never).teardown;
    render(<Viewport vehicle={PRESET_NASA_STUDENT_LAUNCH} aeroModel={BETA} markers />);
    await waitFor(() => expect(shell()?.getAttribute('data-layout-parts')).toBe('7'));
    expect(Number(shell()?.getAttribute('data-layout-length'))).toBeCloseTo(2.97, 9);
    expect(shell()?.getAttribute('data-layout-state')).toBe('ready');
    expect(shell()?.getAttribute('data-markers')).toBe('present');
    expect(Number(shell()?.getAttribute('data-marker-cg'))).toBeCloseTo(1.7972237541913614, 9);
    expect(Number(shell()?.getAttribute('data-marker-cp'))).toBeCloseTo(2.4181789584971094, 9);
    expect(Number(shell()?.getAttribute('data-marker-cp'))).not.toBeCloseTo(2.409174961652899, 6);
  });
});

describe('parts tree mass under the beta model', () => {
  it('keeps the total and every row mass from the geometry rollup', async () => {
    useProjectStore.getState().loadPreset('nasaStudent');
    // A distinct vehicle id keeps this test off the real-engine cache entry.
    const vehicle = { ...useProjectStore.getState().project.vehicle, id: 'parts-tree-beta' };
    useProjectStore.setState({ project: { ...useProjectStore.getState().project, vehicle, aeroModel: BETA } });
    useSelectionFilter.getState().setFilter('all');
    useSessionStore.getState().setSelectedId(vehicle.components[0].id);

    const components = vehicle.components.map((c, i) => ({
      id: c.id,
      mass: 1,
      localCG: 0.5,
      globalCG: 0.5 + i * 0.1,
      axialStart: i,
      axialEnd: i + 1,
      length: 1,
    }));
    teardown = installTestEngine(async (cmd) => {
      if (cmd === 'stability') {
        return stabilityAnalysis({
          contributions: [],
          breakdownUnavailable: true,
          totalLength: components.length,
          referenceDiameter: 0.152,
          cg: 1,
          cp: 1.5,
        });
      }
      if (cmd === 'aggregate_mass') {
        return { totalMass: components.length, cg: 1, totalLength: components.length, maxDiameter: 0.152, referenceDiameter: 0.152, components };
      }
      return {};
    }).teardown;

    render(<PartsTree />);
    // 7 parts x 1 kg; the base defect summed an empty layout to 0.00 kg.
    await screen.findByText(/7\.00 kg/);
    const rows = [...document.querySelectorAll('[data-component-id]')] as HTMLElement[];
    expect(rows).toHaveLength(vehicle.components.length);
    for (const row of rows) {
      expect(row.querySelector('span.w-12')?.textContent).toBe('1.00');
    }
    // The same rollup feeds the 3D/2D layout helper.
    expect(layoutFromGeometry({ totalMass: components.length, cg: 1, totalLength: components.length, maxDiameter: 0.152, referenceDiameter: 0.152, components }).parts['nsl-bt2'].mass).toBe(1);
  });
});
