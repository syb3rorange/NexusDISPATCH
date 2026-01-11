
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // This ensures process.env.API_KEY works in the browser
    'process.env': {
      API_KEY: JSON.stringify(process.env.API_KEY)
    },
    // Gun.js and other older libraries often require 'global'
    'global': 'window',
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
