import { defineConfig } from 'vitest/config';

// Fixture generator, not a test: `pnpm fixtures:freeform`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/generate-freeform-fixture.mjs'],
  },
});
