import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    // Heavy deterministic suites: VV-002 performs ~2.4M RK4 steps (~3 s on its
    // own) and the emitter's fixture-driven fail-closed suite re-hashes whole
    // fixture trees per case. Under 43-file parallel collection these exceed
    // the 5 s default on a 6-core host, so give them headroom; fail-closed
    // semantics are unaffected (a real failure still fails).
    testTimeout: 30000
  }
});