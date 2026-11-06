/**
 * The Console palette exists twice: as `C` (inline styles) and as `--color-con-*`
 * Tailwind tokens (class styling). They must stay the same colors.
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { C } from './theme';

const css = new TextDecoder().decode(readFileSync(fileURLToPath(new URL('../../index.css', import.meta.url))));

const TOKENS = {
  fg: C.fg,
  muted: C.muted,
  dim: C.dim,
  panel: C.panel,
  sunken: C.sunken,
  line: C.line,
  accent: C.accent,
  ok: C.ok,
  warn: C.warn,
  bad: C.bad,
} as const;

const normalize = (value: string): string => value.replace(/\s+/g, '').toLowerCase();

describe('console palette tokens', () => {
  it.each(Object.entries(TOKENS))('--color-con-%s matches the kit theme', (name, expected) => {
    const match = css.match(new RegExp(`--color-con-${name}:\\s*([^;]+);`));
    expect(match, `--color-con-${name} is declared in index.css`).not.toBeNull();
    expect(normalize(match![1])).toBe(normalize(expected));
  });
});
