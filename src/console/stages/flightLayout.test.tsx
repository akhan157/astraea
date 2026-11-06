// @vitest-environment jsdom
/**
 * Lane flight-layout: at the desktop default size (1280×800) the Flight canvas
 * used to be 167 px tall with a 57 px free region, so the fitted rocket was
 * 44 px. The dock default now scales with the stage, and the chooser and
 * readiness rows share one row on short windows. Nothing is removed: the tests
 * below also pin the readiness text and the chooser disclosure in both forms.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { FlightStage, SHORT_WINDOW_QUERY, flightDockDefault } from './Flight';
import { WithDock, defaultDockHeight, storedDockHeight } from './common';
import { useProjectStore } from '../../state/project';
import { useAnalysisStore } from '../../state/analysis';
import { consoleJobStub, stubEngine } from '../testFixtures';

let teardown: () => void;
let restoreMatchMedia: (() => void) | null = null;
let restoreClientHeight: (() => void) | null = null;

/** jsdom has no layout: a fixed client height is the only way to exercise a measured default. */
function stubClientHeight(value: number): void {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => value });
  restoreClientHeight = () => {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, 'clientHeight', descriptor);
    else delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight;
  };
}

/** Keep jsdom on the tall-window layout unless a test asks for a short window. */
function stubMatchMedia(shortWindow: boolean): void {
  const existing = window.matchMedia;
  const stub = (query: string) => ({
    matches: shortWindow && query === SHORT_WINDOW_QUERY,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
  window.matchMedia = stub as unknown as typeof window.matchMedia;
  restoreMatchMedia = () => { window.matchMedia = existing; };
}

beforeEach(() => {
  localStorage.clear();
  teardown = stubEngine().teardown;
  useProjectStore.getState().loadPreset('nasaStudent');
  useAnalysisStore.getState().reset();
  consoleJobStub();
});
afterEach(() => {
  cleanup();
  teardown();
  restoreMatchMedia?.();
  restoreMatchMedia = null;
  restoreClientHeight?.();
  restoreClientHeight = null;
});

describe('flight dock default', () => {
  it('takes 38% of the stage, capped at 400 and floored by the dock content', () => {
    // Stage heights measured in the Gate 1 browser run (base pin 89376e4).
    expect(flightDockDefault(572.5)).toBe(276); // 1280×800: 38% would be 218; the Monte Carlo tab needs 276
    expect(flightDockDefault(606.8)).toBe(276); // 1280×800 after the one-row chrome
    expect(flightDockDefault(782.6)).toBe(297); // 1600×1000: the 38% share wins
    expect(flightDockDefault(4000)).toBe(400);
    expect(flightDockDefault(372.5)).toBe(207); // 800×600: the canvas keeps its 160 px minimum
    expect(flightDockDefault(0)).toBe(120);
  });

  it('leaves the fixed defaults of the other stages alone', () => {
    expect(defaultDockHeight(320, 900)).toBe(320);
    expect(defaultDockHeight(260, 0)).toBe(260);
    expect(defaultDockHeight(flightDockDefault, 572.5)).toBe(276);
  });

  it('reads a stored preference and ignores a missing or unusable one', () => {
    expect(storedDockHeight('flight')).toBeNull();
    localStorage.setItem('ws.dock.flight', '333');
    expect(storedDockHeight('flight')).toBe(333);
    localStorage.setItem('ws.dock.flight', '0');
    expect(storedDockHeight('flight')).toBeNull();
    localStorage.setItem('ws.dock.flight', 'not-a-number');
    expect(storedDockHeight('flight')).toBeNull();
  });

  it('a stored preference wins over the scaled default', () => {
    stubClientHeight(600);
    localStorage.setItem('ws.dock.aero', '250');
    render(<WithDock storageKey="aero" initial={(available) => available / 2} main={<div />} tabs={[{ id: 'one', label: 'One', body: null }]} />);
    expect(dockStyleHeight()).toBe('250px');
  });

  it('a scaled default uses the room the stage gives the dock', () => {
    stubClientHeight(600);
    render(<WithDock storageKey="scaled" initial={(available) => Math.round(available * 0.25)} main={<div />} tabs={[{ id: 'one', label: 'One', body: null }]} />);
    expect(dockStyleHeight()).toBe('150px');
  });
});

function dockStyleHeight(): string | undefined {
  const tablist = document.querySelector('[role="tablist"]');
  return (tablist?.parentElement as HTMLElement | null)?.style.height;
}

describe('Flight chrome on short windows', () => {
  it('puts the chooser and the readiness line in one row, with the same text', () => {
    stubMatchMedia(true);
    render(<FlightStage />);
    const row = document.querySelector('[data-flight-chrome="row"]');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByLabelText('Run readiness')).toBeTruthy();
    expect(row?.textContent).toContain('Whole-design readiness');
    expect(row?.textContent).toContain('Flight model: Legacy (supported)');
    // The disclosure is still a real control inside the row.
    expect(within(row as HTMLElement).getByText('Change…')).toBeTruthy();
    // Only the merged row carries the chooser: it is not rendered twice.
    expect(screen.getAllByText('Flight model: Legacy (supported)')).toHaveLength(1);
  });

  it('keeps two rows on a tall window', () => {
    stubMatchMedia(false);
    render(<FlightStage />);
    expect(document.querySelector('[data-flight-chrome="row"]')).toBeNull();
    expect(screen.getByLabelText('Run readiness')).toBeTruthy();
    expect(screen.getByText('Flight model: Legacy (supported)')).toBeTruthy();
  });
});
