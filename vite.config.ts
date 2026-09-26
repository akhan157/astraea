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
    // The benchmark-emitter suite shells out to git and re-runs vitest, so its
    // cases can exceed the 5s default when the full suite runs in parallel.
    // 20s removes that flake without hiding a genuine hang.
    testTimeout: 20000
  }
});
