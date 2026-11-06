import { defineConfig } from 'vitest/config';

// Explicit smoke command; ordinary tests do not require a compiled Rust example.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/arcas-runtime-smoke.mjs'],
  },
});
