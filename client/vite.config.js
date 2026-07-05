import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// base './' lets the built app be served from ANY path (e.g. /rummy or
// irishrummy.com) without rebuilding.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/socket.io': { target: 'http://localhost:3050', ws: true },
    },
  },
});
