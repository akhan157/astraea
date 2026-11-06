import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appVersion: string = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version;

/** Replace the landing page's version placeholder from package.json at build time. */
const appVersionHtml = {
  name: 'astraea-app-version',
  transformIndexHtml: {
    order: 'pre' as const,
    handler(html: string): string {
      return html.replaceAll('%APP_VERSION%', appVersion);
    },
  },
};

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  // Relative asset paths so the same build works from the dev server root and
  // from a hosted subpath (GitHub Pages serves this repo at /astraea/).
  base: './',
  plugins: [
    appVersionHtml,
    react(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  build: {
    // The three.js chunk (~940 kB) is the 3D viewport the default Airframe
    // stage renders on load, so it cannot be deferred; everything else is
    // under 500 kB.
    chunkSizeWarningLimit: 1000,
    rolldownOptions: {
      // Two pages: the product landing page at / and the workstation at /app/.
      input: {
        landing: path.resolve(__dirname, 'index.html'),
        app: path.resolve(__dirname, 'app/index.html'),
      },
      output: {
        // Long-lived vendor chunks: an app update re-downloads only the app
        // chunk, and the three.js stack loads in parallel with React.
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/](three|three-stdlib|@react-three|troika-[^\\/]+|camera-controls|maath|meshline)[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'vendor', test: /node_modules[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    watch: {
      // Vite must not watch Rust build artifacts: when cargo relinks
      // src-tauri/target while a watch is active, chokidar raises an
      // unhandled EBUSY and takes the whole dev server down (observed
      // repeatedly during native acceptance testing on Windows).
      ignored: ['**/src-tauri/target/**']
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
