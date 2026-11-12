import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build works on GitHub Pages under /<repo>/
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [react()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { fs: { allow: ['..'] } },
});
