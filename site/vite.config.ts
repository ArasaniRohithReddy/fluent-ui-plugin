import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Build the static site into ../docs (the GitHub Pages root).
// base: './' keeps asset paths relative so it works both locally and under
// https://<user>.github.io/<repo>/ without a hard-coded base path.
//
// emptyOutDir must stay false: ../docs also holds hand-written files that are
// not build output (.nojekyll, architecture.md, COVERAGE.md, presentation.md),
// and Vite would delete them. The cost is that ../docs/assets accumulates a new
// content-hashed bundle on every build while the old ones are never removed —
// orphaned, still committed, and shipped forever. ../docs/assets is entirely
// generated, so clean just that one directory instead.
function cleanAssetsDir(): Plugin {
  return {
    name: 'fluent-clean-assets-dir',
    apply: 'build',
    buildStart() {
      rmSync(fileURLToPath(new URL('../docs/assets', import.meta.url)), {
        recursive: true,
        force: true,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), cleanAssetsDir()],
  base: './',
  build: {
    outDir: '../docs',
    emptyOutDir: false,
    assetsDir: 'assets',
  },
});
