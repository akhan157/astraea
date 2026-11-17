import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['crates/astraea-engine/tests/e1_trial_limit.probe.ts'], testTimeout: 900000 } });
