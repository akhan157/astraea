import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pkg from './package.json';
import viteConfig from './vite.config';

const config = viteConfig as unknown as { plugins?: Array<{ name?: string; transformIndexHtml?: unknown }> };

describe('landing page version', () => {
  it('injects the package.json version at build time', () => {
    const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
    expect(html).toContain('%APP_VERSION%');
    const plugins = config.plugins ?? [];
    const plugin = plugins.find((entry) => entry?.name === 'astraea-app-version');
    expect(plugin).toBeTruthy();
    const transform = plugin?.transformIndexHtml as { handler?: (source: string) => string } | undefined;
    expect(typeof transform?.handler).toBe('function');
    const out = transform!.handler!(html);
    expect(out).toContain(`Beta ${pkg.version}`);
    expect(out).not.toContain('%APP_VERSION%');
    expect(out).not.toMatch(/Beta 0\.9\b/);
  });
});
