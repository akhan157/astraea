import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['docs/internal/execution-runs/K4-expected-error-line/screens-projects.probe.ts'],maxWorkers:2}});
