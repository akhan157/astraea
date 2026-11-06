/**
 * The chrome names the shortcut the user's platform actually has: no Mac
 * glyphs on Windows/Linux (the jsdom platform is not macOS), Mac glyphs on macOS.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import { useProjectStore } from '../state/project';
import { stubEngine } from './testFixtures';
import { TopBar } from './shell/Shell';

describe('shortcut labels in the chrome', () => {
  let teardown: () => void;
  beforeEach(() => {
    localStorage.setItem('astraea.workstation.toured', '1');
    teardown = stubEngine().teardown;
    useProjectStore.getState().loadPreset('nasaStudent');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    teardown();
  });

  const chrome = (): string => {
    const { container } = render(<Tooltip.Provider><TopBar onPalette={() => undefined} /></Tooltip.Provider>);
    return [container.textContent, ...[...container.querySelectorAll('[title]')].map((el) => el.getAttribute('title'))].join(' | ');
  };

  it('shows Ctrl labels off macOS', () => {
    vi.stubGlobal('navigator', { platform: 'Win32', userAgent: 'Windows' });
    const text = chrome();
    expect(text).toContain('Ctrl+K');
    expect(text).toContain('Ctrl+Enter');
    expect(text).toContain('Ctrl+Z');
    expect(text).toContain('Ctrl+Shift+Z');
    expect(text).not.toMatch(/[⌘⇧↵]/);
  });

  it('shows only "Search" below 2xl and keeps the typed-command hint for 2xl', () => {
    vi.stubGlobal('navigator', { platform: 'Linux', userAgent: 'Linux' });
    const { container } = render(<Tooltip.Provider><TopBar onPalette={() => undefined} /></Tooltip.Provider>);
    const palette = container.querySelector('[aria-label^="Command palette"]');
    expect(palette).toBeTruthy();
    const spans = [...palette!.querySelectorAll('span')];
    const short = spans.find((span) => span.className.includes('xl:inline') && span.textContent?.startsWith('Search'));
    const tail = spans.find((span) => span.textContent === ', or type span 200');
    expect(short?.className).toContain('truncate');
    expect(tail?.className).toContain('2xl:inline');
    // The accessible name and title keep the full description at every width.
    expect(palette?.getAttribute('aria-label')).toContain('Command palette');
    expect(palette?.getAttribute('title')).toBe('Search, or type a value  Ctrl+K');
  });

  it('keeps the Mac glyphs on macOS', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Macintosh' });
    const text = chrome();
    expect(text).toContain('⌘K');
    expect(text).toContain('⌘↵');
    expect(text).toContain('⇧⌘Z');
  });
});
