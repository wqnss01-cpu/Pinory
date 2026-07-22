import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@pinory/shared': path.join(root, 'packages/shared/src/index.ts'),
      '@pinory/config': path.join(root, 'packages/config/src/index.ts'),
    },
  },
  server: { port: 5173 },
  build: { target: 'es2022', sourcemap: mode !== 'production', cssCodeSplit: true, rollupOptions: { output: { manualChunks(id) { if (id.includes('maplibre-gl')) return 'map-engine'; if (id.includes('qrcode')) return 'qr-export'; if (id.includes('motion')) return 'motion'; if (id.includes('@tanstack')) return 'data-query'; if (id.includes('react')) return 'react-runtime'; return undefined; } } } },
}));
