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
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
          typeof warning.id === 'string' &&
          warning.id.includes('node_modules')
        ) {
          return;
        }
        warn(warning);
      },
    },
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
