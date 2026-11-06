// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MissionStage } from './Mission';
import { useProjectStore } from '../../state/project';
import { consoleJobStub, installTestEngine, resetConsoleState, stabilityAnalysis } from '../testFixtures';

let teardown: (() => void) | null = null;

beforeEach(() => {
  resetConsoleState();
  consoleJobStub();
  useProjectStore.getState().loadPreset('nasaStudent');
  teardown = installTestEngine(async (cmd: string) => (cmd === 'stability' ? stabilityAnalysis() : {})).teardown;
});

afterEach(() => {
  cleanup();
  teardown?.();
  teardown = null;
});

describe('Mission site elevation when no launch site is declared', () => {
  it('shows the default as not set instead of a measured-looking 0 m', () => {
    render(<MissionStage />);
    const card = document.querySelector('[data-site-card]') ?? screen.getByText('Site', { exact: true }).closest('[class*="rounded-md"]');
    expect(card).not.toBeNull();
    expect(card?.textContent ?? '').toContain('Not set');
    expect(card?.textContent ?? '').toContain('sea level standard day assumed');
    expect(card?.textContent ?? '').not.toMatch(/\b0 m\b/);
    expect(screen.getByRole('button', { name: 'Set launch site' })).toBeTruthy();
  });
});
