import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'popup.html'),
        background: resolve(import.meta.dirname, 'src/background.ts'),
        content: resolve(import.meta.dirname, 'src/content.ts'),
        'page-bridge': resolve(import.meta.dirname, 'src/page-bridge.ts'),
      },
      output: { entryFileNames: '[name].js', chunkFileNames: '[name].js' },
    },
  },
});
