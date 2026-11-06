/**
 * Platform-correct keyboard shortcut labels. The key handlers accept Cmd or
 * Ctrl everywhere; this only decides which one the UI names, so Windows and
 * Linux never show Mac glyphs and macOS keeps them.
 */

export type ShortcutId = 'run' | 'search' | 'undo' | 'redo';

const MAC_LABELS: Record<ShortcutId, string> = {
  run: '⌘↵',
  search: '⌘K',
  undo: '⌘Z',
  redo: '⇧⌘Z',
};

const OTHER_LABELS: Record<ShortcutId, string> = {
  run: 'Ctrl+Enter',
  search: 'Ctrl+K',
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Shift+Z',
};

/** True for macOS (and iOS-family) platform strings. Pure, so it is testable per platform. */
export function isMacPlatform(platform: string): boolean {
  return /mac|iphone|ipad|ipod/i.test(platform);
}

/** The running platform string: client hints first, then the legacy field, then the user agent. */
function currentPlatform(): string {
  if (typeof navigator === 'undefined') return '';
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return nav.userAgentData?.platform || nav.platform || nav.userAgent || '';
}

/** The label for a shortcut on the given platform string (default: the running one). */
export function shortcutLabel(id: ShortcutId, platform: string = currentPlatform()): string {
  return (isMacPlatform(platform) ? MAC_LABELS : OTHER_LABELS)[id];
}
