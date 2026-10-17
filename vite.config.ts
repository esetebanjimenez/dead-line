import { defineConfig } from 'vite';

// GitHub Pages serves from /dead-line/, so every asset path must be relative to this base.
export default defineConfig({
  base: '/dead-line/',
  build: { target: 'es2022', sourcemap: true },
  test: { include: ['tests/**/*.test.ts'] },
});
