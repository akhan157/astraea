// @vitest-environment jsdom
/**
 * Plan #9: the selected parachute's Role control and the one plain line saying
 * when it opens. The wording comes from the engine's own selection rule
 * (`sim/parachuteRoles.ts`), so a chute's role here is the role it flies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import type { ParachuteComponent, RocketComponent } from '../../core/types';
import { PRESET_NASA_STUDENT_LAUNCH } from '../../state/presets';
import { ParachuteRole, deploymentStatement } from './ParachuteRole';
import { PartInspector } from './Inspector';
import { useProjectStore } from '../../state/project';
import { useSessionStore } from '../../state/session';
import { installTestEngine } from '../testFixtures';

const chute = (id: string, deployRole?: ParachuteComponent['deployRole']): ParachuteComponent => ({
  id, name: id === 'd' ? 'Drogue chute' : id === 'm' ? 'Main chute' : `Chute ${id}`, type: 'parachute',
  diameter: 0.6, cd: 1, mass: 0.1, axialOffset: 0.1, materialId: 'cardboard',
  ...(deployRole === undefined ? {} : { deployRole }),
});
const TUBE: RocketComponent = { id: 'tube', name: 'Tube', type: 'bodytube', length: 1, outerDiameter: 0.1, innerDiameter: 0.097, materialId: 'cardboard' };

describe('deployment statement', () => {
  it('answers when the chute opens, in the user’s units', () => {
    const d = chute('d');
    const m = chute('m');
    const parts = [TUBE, d, m];
    expect(deploymentStatement(d, parts, 213, 'metric')).toMatchObject({ tone: 'ok', answer: 'Opens at apogee.' });
    expect(deploymentStatement(d, parts, 213, 'metric').detail).toContain('Main chute takes over as the main at 213 m on the way down.');
    expect(deploymentStatement(m, parts, 213, 'metric').answer).toBe('Opens at 213 m on the way down.');
    expect(deploymentStatement(m, parts, 213, 'imperial').answer).toBe('Opens at 699 ft on the way down.');
    // Automatic says it was picked by position, and how to pin it.
    expect(deploymentStatement(m, parts, 213, 'metric').detail).toContain('Automatic: the first parachute');
    expect(deploymentStatement({ ...m, deployRole: 'main' }, [TUBE, d, { ...m, deployRole: 'main' }], 213, 'metric').detail).not.toContain('Automatic: the first parachute');
  });

  it('says what happens around a lone chute and an unused one', () => {
    const only = chute('x');
    expect(deploymentStatement(only, [TUBE, only], 213, 'metric').detail).toMatch(/only parachute, so it is both drogue and main/);
    const mainOnly = chute('x', 'main');
    expect(deploymentStatement(mainOnly, [TUBE, mainOnly], 213, 'metric').detail).toMatch(/No parachute opens at apogee/);
    const drogueOnly = chute('x', 'drogue');
    expect(deploymentStatement(drogueOnly, [TUBE, drogueOnly], 213, 'metric').detail).toMatch(/stays the only canopy down to the ground/);
    const spare = chute('s');
    const unused = deploymentStatement(spare, [TUBE, chute('d'), chute('m'), spare], 213, 'metric');
    expect(unused).toMatchObject({ tone: 'warn', answer: 'Not opened in flights.' });
    expect(unused.detail).toContain('Drogue chute is the drogue and Main chute is the main');
  });

  it('shows a role clash the engine would refuse, before any run', () => {
    const a = chute('d', 'main');
    const b = chute('m', 'main');
    expect(deploymentStatement(a, [TUBE, a, b], 213, 'metric')).toMatchObject({ tone: 'warn', answer: 'Runs are blocked: Main chute is also set as the main.' });
  });
});

describe('ParachuteRole', () => {
  afterEach(cleanup);

  it('renders the control, the answer line and the idealization note, and reports role changes', () => {
    const onRoleChange = vi.fn();
    const d = chute('d');
    render(<ParachuteRole chute={d} components={[TUBE, d, chute('m')]} mainDeployAltitudeM={213} units="metric" onRoleChange={onRoleChange} />);
    const select = screen.getByLabelText('Parachute role') as HTMLSelectElement;
    expect(select.value).toBe('auto');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Automatic (by position)', 'Drogue', 'Main']);
    expect(screen.getByRole('status').textContent).toBe('Opens at apogee.');
    expect(screen.getByText(/ejection delay and the canopy.s inflation are not modeled/)).toBeTruthy();
    fireEvent.change(select, { target: { value: 'main' } });
    expect(onRoleChange).toHaveBeenLastCalledWith('main');
    fireEvent.change(select, { target: { value: 'auto' } });
    // Automatic removes the field rather than storing a value.
    expect(onRoleChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe('the inspector mounts it for a selected parachute', () => {
  let teardown: () => void = () => undefined;
  beforeEach(() => {
    useProjectStore.getState().loadPreset('nasaStudent');
    teardown = installTestEngine(async () => ({})).teardown;
  });
  afterEach(() => { teardown(); cleanup(); });

  it('stages a role change as an airframe edit, and the line follows it', () => {
    useSessionStore.getState().setSelectedId('nsl-drogue');
    render(<Tooltip.Provider delayDuration={250}><PartInspector /></Tooltip.Provider>);
    expect(screen.getByText('Opens at apogee.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Parachute role'), { target: { value: 'main' } });
    expect(useProjectStore.getState().drafts.airframe.components['nsl-drogue']).toMatchObject({ deployRole: 'main' });
    // Now the main, so the preset's other chute takes the drogue slot; the
    // main-deploy altitude is the preset's 213 m.
    expect(screen.getByText('Opens at 213 m on the way down.')).toBeTruthy();
    expect(PRESET_NASA_STUDENT_LAUNCH.components.some((c) => c.type === 'parachute' && 'deployRole' in c)).toBe(false);
  });
});
