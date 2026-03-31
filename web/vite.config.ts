import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/whats/',
  plugins: [
    // Tailwind v4 recommended: Place it before framework plugins
    tailwindcss(), 
    solid(),
  ],
  build: {
    // Vite 8 uses 'rolldownOptions' instead of 'rollupOptions' for advanced config,
    // but standard options like these are 100% compatible.
    outDir: '../public',
    emptyOutDir: true,
    target: 'esnext', // Recommended for Vite 8 + Solid for best performance
  },
  server: {
    proxy: {
      '/whats/api': {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/whats/, ''),
      },
      '/whats/ws': {
        target: 'ws://localhost:3001',
        ws: true,
        rewrite: (path) => path.replace(/^\/whats/, ''),
      },
    },
  },
});
