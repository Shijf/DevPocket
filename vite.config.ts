import { build, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'extension-content-scripts',
    async closeBundle() {
      for (const entry of ['mock-main', 'mock-bridge']) await build({ configFile: false, publicDir: false, logLevel: 'warn',
        build: { outDir: 'dist', emptyOutDir: false, lib: { entry: resolve(import.meta.dirname, `src/${entry}.ts`), name: entry.replace('-', '_'), formats: ['iife'], fileName: () => `${entry}.js` } } });
    },
    apply: 'build',
  }],
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        popup: resolve(import.meta.dirname, 'popup.html'),
        background: resolve(import.meta.dirname, 'src/background.ts'),
      },
      output: { entryFileNames: (chunk) => chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js' },
    },
  },
});
