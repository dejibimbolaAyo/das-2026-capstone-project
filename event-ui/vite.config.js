import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser asks Vite for /api/..., and Vite forwards it to the Node server.
// One address for the browser, so no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
});
