// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { CERTIFIED_MOTORS } from '../../../propulsion/motorDatabase';
import { useProjectStore } from '../../../state/project';
import { CurveEditorPanel } from './CurveEditorPanel';

const C6 = CERTIFIED_MOTORS.estes_c6;

function derivedImpulse(): number {
  const text = within(screen.getByLabelText('Derived motor')).getByText(/N·s/).textContent ?? '';
  return parseFloat(text);
}

describe('thrust-curve editor', () => {
  beforeEach(() => useProjectStore.getState().newProject());
  afterEach(cleanup);

  it('starts from the selected motor and recomputes impulse from the edited curve', () => {
    render(<CurveEditorPanel base={C6} />);
    const before = derivedImpulse();
    expect(before).toBeCloseTo(C6.totalImpulse, 0);
    const thrust = screen.getByLabelText('Point 3 thrust') as HTMLInputElement;
    fireEvent.change(thrust, { target: { value: String(Number(thrust.value) + 5) } });
    fireEvent.blur(thrust);
    expect(derivedImpulse()).toBeGreaterThan(before);
  });

  it('reports curve violations instead of deriving a motor', () => {
    render(<CurveEditorPanel base={C6} />);
    const last = C6.thrustCurve.length - 1;
    const thrust = screen.getByLabelText(`Point ${last} thrust`);
    fireEvent.change(thrust, { target: { value: '2' } });
    fireEvent.blur(thrust);
    expect(within(screen.getByLabelText('Curve issues')).getByText(/last point thrust must be exactly 0/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save as new motor' }).hasAttribute('disabled')).toBe(true);
  });

  it('undoes and redoes point edits', () => {
    render(<CurveEditorPanel base={C6} />);
    const count = () => screen.getAllByLabelText(/^Point \d+ time$/).length;
    fireEvent.click(screen.getByRole('button', { name: /Add point/ }));
    expect(count()).toBe(C6.thrustCurve.length + 1);
    fireEvent.click(screen.getByRole('button', { name: /Undo/ }));
    expect(count()).toBe(C6.thrustCurve.length);
    fireEvent.click(screen.getByRole('button', { name: /Redo/ }));
    expect(count()).toBe(C6.thrustCurve.length + 1);
  });

  it('saves a derived motor, binds it, and leaves the certified record untouched', () => {
    render(<CurveEditorPanel base={C6} />);
    const thrust = screen.getByLabelText('Point 3 thrust') as HTMLInputElement;
    fireEvent.change(thrust, { target: { value: String(Number(thrust.value) + 5) } });
    fireEvent.blur(thrust);
    fireEvent.change(screen.getByLabelText('Edited motor name'), { target: { value: 'C6 hot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save as new motor' }));

    const store = useProjectStore.getState();
    const key = store.project.workspace.motorId;
    const record = store.motorRecords().find((r) => r.id === key) ?? store.motors[key];
    expect(record?.provenance).toMatchObject({ source: 'derived', note: 'edited from Estes C6' });
    expect(record?.motor.designation).toBe('C6 hot');
    expect(record?.motor.totalImpulse).toBeGreaterThan(C6.totalImpulse);
    expect(CERTIFIED_MOTORS.estes_c6.thrustCurve[3].thrust).toBe(C6.thrustCurve[3].thrust);
    expect(screen.getByRole('status').textContent).toMatch(/Saved C6 hot/);
  });
});
