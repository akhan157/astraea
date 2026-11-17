import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['docs/internal/execution-runs/K4-expected-error-line/cohort.probe.ts'], testTimeout: 600000, maxWorkers: 2, minWorkers: 1 } });
