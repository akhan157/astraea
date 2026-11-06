import { describe, expect, it } from 'vitest';
import { isMacPlatform, shortcutLabel, type ShortcutId } from './platform';

const IDS: ShortcutId[] = ['run', 'search', 'undo', 'redo'];

describe('shortcutLabel', () => {
  it('names Ctrl shortcuts on Windows and Linux, never Mac glyphs', () => {
    for (const platform of ['Win32', 'Windows', 'Linux x86_64', 'Linux']) {
      expect(shortcutLabel('run', platform)).toBe('Ctrl+Enter');
      expect(shortcutLabel('search', platform)).toBe('Ctrl+K');
      expect(shortcutLabel('undo', platform)).toBe('Ctrl+Z');
      expect(shortcutLabel('redo', platform)).toBe('Ctrl+Shift+Z');
      for (const id of IDS) expect(shortcutLabel(id, platform)).not.toMatch(/[⌘⇧↵]/);
    }
  });

  it('keeps the Mac glyphs on macOS', () => {
    for (const platform of ['MacIntel', 'macOS', 'Macintosh']) {
      expect(isMacPlatform(platform)).toBe(true);
      expect(shortcutLabel('run', platform)).toBe('⌘↵');
      expect(shortcutLabel('search', platform)).toBe('⌘K');
      expect(shortcutLabel('undo', platform)).toBe('⌘Z');
      expect(shortcutLabel('redo', platform)).toBe('⇧⌘Z');
    }
  });

  it('reads the running platform when none is given', () => {
    const label = shortcutLabel('run');
    expect(label).toBe(isMacPlatform(navigator.platform) ? '⌘↵' : 'Ctrl+Enter');
  });
});
