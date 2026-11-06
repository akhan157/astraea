import { describe, expect, it } from 'vitest';
import { detectOs } from './main';

describe('landing download detection', () => {
  it.each([
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 'windows'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)', 'MacIntel', 'mac'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'Linux x86_64', 'linux'],
    ['', 'macOS', 'mac'],
  ] as const)('%s -> %s', (ua, platform, os) => {
    expect(detectOs(ua, platform)).toBe(os);
  });

  it('offers no desktop download label on phones and tablets', () => {
    expect(detectOs('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l')).toBeNull();
    expect(detectOs('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'iPhone')).toBeNull();
    expect(detectOs('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'MacIntel')).toBeNull();
  });
});
