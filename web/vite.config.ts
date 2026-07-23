import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', ws: true },
      '/oauth': { target: 'http://127.0.0.1:3000' },
      '/health': { target: 'http://127.0.0.1:3000' },
      '/ready': { target: 'http://127.0.0.1:3000' }
    }
  },
  build: {
    target: 'es2022',
    sourcemap: true
  }
});
