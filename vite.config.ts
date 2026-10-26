import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: 'public',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome140',
    rollupOptions: {
      // Three pages ship in one bundle: the desktop shell, the phone companion
      // page the main process serves over the local network, and the capture
      // preview window. Each is read out of `dist/`, so they build together.
      input: {
        main: resolve(__dirname, 'index.html'),
        companion: resolve(__dirname, 'companion.html'),
        // The capture preview is its own window, so it is its own page.
        capture: resolve(__dirname, 'capture.html'),
      },
    },
  },
});
