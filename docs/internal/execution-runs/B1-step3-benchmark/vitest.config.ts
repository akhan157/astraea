import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['docs/internal/execution-runs/B1-step3-benchmark/*.probe.ts'], testTimeout: 3600000, maxWorkers: 2, minWorkers: 1 } });
