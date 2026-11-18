// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MotorStage, fitOf } from '../Motor';
import { BatesPanel } from './BatesPanel';
import { CERTIFIED_MOTORS } from '../../../propulsion/motorDatabase';
import { useProjectStore } from '../../../state/project';
import type { MountAssessment } from '../../../application/caseResolver';

vi.mock('../../../io/backend', () => ({ isNetworkOnline: () => true }));
vi.mock('../../../io/net', () => ({
  // The panel searches by free text now (designation, common name or manufacturer).
  searchThrustCurveText: async () => ({ results: [{ id: 'a8', designation: 'A8', manufacturer: 'Estes', totalImpulseNs: 2, diameterMm: 18 }], attempts: [{ field: 'designation', value: 'A8', matches: 1, shown: 1 }], failures: [], manufacturer: null }),
  downloadThrustCurveFile: async () => 'A8 18 70 0 0.003 0.014 Estes\n0 0\n0.1 10\n0.4 0\n',
}));

beforeEach(() => useProjectStore.getState().newProject());
afterEach(cleanup);

describe('motor polish', () => {
  it('shows the imported search result in the card and its full chart', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 350 });
    const { container } = render(<MotorStage />);
    fireEvent.change(screen.getByPlaceholderText(/designation/i), { target: { value: 'A8' } });
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Import A8' }));
    await waitFor(() => expect(screen.getByText('In use.')).toBeTruthy());
    const chart = screen.getByRole('slider', { name: 'Flight time' });
    expect(chart.getAttribute('aria-valuemax')).toBe('0.4');
    expect(chart.closest('.min-w-0')).toBeTruthy();
    const path = chart.querySelector('path')!;
    expect(path.getAttribute('d')).toMatch(/L336\.0 /);
    expect(within(chart.parentElement!.parentElement!).getByText('A8')).toBeTruthy();
    expect(container.textContent).toContain('0.014');
    expect(container.textContent).toMatch(/N·s rated/);
  });

  it('formats mount dimensions in the chosen units', () => {
    const mounts = { ambiguous: false, solidMount: false, boreM: 0.145, mounts: [{ name: 'mount', length: 1 }] } as MountAssessment;
    expect(fitOf(CERTIFIED_MOTORS.aerotech_k550w, mounts, 'imperial').title).toContain('⌀2.13 in in a ⌀5.71 in bore');
  });

  it('explains excessive BATES samples without allocating them', () => {
    render(<BatesPanel chamber={{ kind: 'loading' }} />);
    fireEvent.change(screen.getByLabelText('Grain outer diameter (mm)'), { target: { value: '1e9' } });
    expect(screen.getByRole('alert').textContent).toContain('Too many grain samples');
  });
});
