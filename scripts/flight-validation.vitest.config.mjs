import { defineConfig } from 'vitest/config';

// Pre-registered flight validation runs (docs/flight-validation/). Research
// targets may fail and take minutes; keep them out of the application suite.
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/validation/miniDx3/miniDx3-validation.ts',
      'src/validation/round2/round2-validation.ts',
    ],
  },
});
