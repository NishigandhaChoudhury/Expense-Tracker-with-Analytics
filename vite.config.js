import { defineConfig } from 'vite';
export default defineConfig({
  root: 'client',
  esbuild: { jsx: 'automatic' },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  build: { outDir: 'dist', emptyOutDir: true }
});
