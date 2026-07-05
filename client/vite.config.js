import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base './' lets the built app be served from ANY path (e.g. /rummy or
// irishrummy.com) without rebuilding.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    // Keep deploy builds low-resource; the app is small and served over HTTPS/CDN.
    minify: false,
    reportCompressedSize: false,
  },
  server: {
    proxy: {
      '/socket.io': { target: 'http://localhost:3050', ws: true },
    },
  },
});
