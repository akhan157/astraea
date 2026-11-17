import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['docs/internal/execution-runs/K3-improved-default/cohort-default.probe.ts'], testTimeout: 600000, maxWorkers: 2, minWorkers: 1 } });
