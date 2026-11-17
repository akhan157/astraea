import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['docs/internal/execution-runs/BL1-blind-predictions/*.probe.ts'],
    testTimeout: 7_200_000,
    maxWorkers: 2,
  },
});
