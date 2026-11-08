import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const api = `http://localhost:${process.env.PORT || 3001}`;

export default defineConfig({
  root,
  base: './',
  envDir: fileURLToPath(new URL('..', import.meta.url)),
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0 },
  server: {
    port: 5173,
    // يسمح بفتح خادم التطوير عبر نفق (cloudflared) أثناء التجربة داخل Discord
    allowedHosts: true,
    proxy: {
      '/api': api,
      '/ws': { target: api.replace('http', 'ws'), ws: true },
    },
  },
});
