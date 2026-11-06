import { defineConfig } from 'vitest/config';

// Research targets may fail; keep them separate from application unit tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/validation/arcas/arcas-benchmark.ts', 'src/validation/missile2005/missile2005-benchmark.ts'],
  },
});
