import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const config = {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/socket.io': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          ws: true
        },
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true
    }
  };

  // In development mode, ensure the host and base URL are set correctly
  if (command === 'serve') {
    config.server.host = true; // Allow access from network
    config.server.strictPort = true; // Don't try different ports if 5173 is in use
  }

  return config;
});