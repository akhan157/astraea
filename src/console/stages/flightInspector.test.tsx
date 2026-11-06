// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FlightInspector } from './Flight';
import { resetConsoleState } from '../testFixtures';
import { useSessionStore } from '../../state/session';

beforeEach(() => {
  resetConsoleState();
  useSessionStore.getState().setStage('flight');
});

afterEach(cleanup);

describe('Flight inspector launch settings', () => {
  it('is a read-only summary with an Edit in Mission action', () => {
    render(<FlightInspector />);
    const summary = document.querySelector('[data-launch-summary]');
    const editable = summary ?? screen.getByText('Effective guide travel').closest('div.group')?.parentElement;
    expect(editable?.querySelectorAll('input, select, textarea').length ?? 0).toBe(0);
    expect(summary).not.toBeNull();
    expect(screen.getByText('Effective guide travel')).toBeTruthy();
    expect(screen.getByText('Main deploy altitude')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edit in Mission' }));
    expect(useSessionStore.getState().stage).toBe('mission');
  });
});
