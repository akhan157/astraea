import { defineConfig } from 'vitest/config';
export default defineConfig({test:{include:['crates/astraea-engine/tests/e1_extreme_wind.probe.ts'],testTimeout:900000}});
