import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['docs/internal/execution-runs/L0-benchmark-harness/cohort.probe.ts'], testTimeout: 300000, maxWorkers: 2, minWorkers: 1 } });
