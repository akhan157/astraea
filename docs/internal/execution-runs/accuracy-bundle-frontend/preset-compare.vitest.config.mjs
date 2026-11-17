import { defineConfig } from 'vitest/config';

// Run from the repo root:
//   PROBE_OLD_WASM=<a.wasm> PROBE_NEW_WASM=<b.wasm> PROBE_OUT=<out.json> \
//     pnpm exec vitest run --config docs/internal/execution-runs/accuracy-bundle-frontend/preset-compare.vitest.config.mjs
export default defineConfig({
  test: {
    environment: 'node',
    include: ['docs/internal/execution-runs/accuracy-bundle-frontend/preset-compare.probe.ts'],
    testTimeout: 600000,
  },
});
