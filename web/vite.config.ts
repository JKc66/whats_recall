import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  base: '/whats/',
  plugins: [
    solid({
      exclude: ['**/sileo-bridge.ts', '**/node_modules/**'],
    }),
  ],
  build: {
    outDir: '../public',
    emptyOutDir: true,
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
