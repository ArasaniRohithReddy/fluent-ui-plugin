import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build the static site into ../docs (the GitHub Pages root).
// base: './' keeps asset paths relative so it works both locally and under
// https://<user>.github.io/<repo>/ without a hard-coded base path.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../docs',
    emptyOutDir: false,
    assetsDir: 'assets',
  },
});
