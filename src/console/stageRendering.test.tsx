/**
 * Every stage renders against a preset vehicle without throwing.
 *
 * The 3-D viewport is stubbed (jsdom has no WebGL); the native bridge is
 * stubbed so live stability and the run layer answer. Rendering exercises the
 * whole component tree of each stage, including the inspectors.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }: { children?: React.ReactNode }) => <div data-testid="canvas">{children}</div>,
  useThree: () => ({ camera: { position: { set: () => undefined } }, size: { width: 1, height: 1 }, controls: null }),
  useFrame: () => undefined,
}));

vi.mock('@react-three/drei', () => ({
  OrbitControls: () => null,
  Grid: () => null,
  GizmoHelper: () => null,
  GizmoViewcube: () => null,
}));

import Workstation from './Workstation';
import { consoleJobStub, resetConsoleState } from './testFixtures';
import { stubEngine } from './testFixtures';
import { useSessionStore, type ConsoleStage } from '../state/session';
import { STAGES } from './store';

const STAGE_LABEL: Record<ConsoleStage, string> = {
  mission: 'Mission',
  airframe: 'Airframe',
  motor: 'Motor',
  aero: 'Aero',
  flight: 'Flight',
  recovery: 'Recovery',
  verify: 'Verify',
  build: 'Build',
};

describe('Console stages render', () => {
  let teardown: () => void;

  beforeEach(() => {
    localStorage.setItem('astraea.workstation.toured', '1');
    const stub = stubEngine();
    teardown = stub.teardown;
    resetConsoleState();
    consoleJobStub();
  });

  afterEach(() => {
    teardown();
    cleanup();
  });

  it('renders every Console pipeline stage', () => {
    for (const stage of STAGES.map((s) => s.id)) {
      useSessionStore.getState().setConsole({ stage });
      const { container } = render(<Workstation />);
      expect(container.firstElementChild).not.toBeNull();
      // The rail, the parts tree and the status bar are always present.
      expect(screen.getByRole('navigation', { name: 'Pipeline stages' })).toBeTruthy();
      expect(container.textContent ?? '').toContain(STAGE_LABEL[stage]);
      // Every stage carries the beta label with its accuracy statement and a way to read more.
      const notice = container.querySelector('[data-beta-notice]');
      expect(notice?.textContent).toMatch(/^Beta\b/);
      expect(notice?.textContent).toContain('6–10%');
      expect(notice?.textContent).toMatch(/not flight approval/i);
      expect(notice?.querySelector('a')?.getAttribute('href')).toMatch(/docs\/accuracy\.md$/);
      cleanup();
    }
  });
});
