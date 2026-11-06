import { defineConfig } from 'vitest/config';

// Fixture generator, not a test: `npm run fixtures:telemetry`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/generate-telemetry-fixture.mjs'],
  },
});
