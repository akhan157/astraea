import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `SINGLE=1 vite build` inlines everything into one HTML file so the
// prototypes can be shared as a single page without a server.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), ...(process.env.SINGLE ? [viteSingleFile()] : [])],
  build: { chunkSizeWarningLimit: 4000 }
});
