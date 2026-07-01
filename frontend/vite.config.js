import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies API + WebSocket to the Go-style Node backend on :8080,
// so the frontend runs on :5180 with no CORS and the same-origin /api & /ws paths.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'http://localhost:8080', ws: true },
    },
  },
});
