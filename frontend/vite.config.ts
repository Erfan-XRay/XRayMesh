import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'path';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'));

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile(),
    {
      // The self-updater verifies this marker so a stale mirror cannot install a mismatched UI.
      name: 'xraymesh-version-marker',
      transformIndexHtml: (html) => html.replace('%XRAYMESH_VERSION%', version),
    },
  ],
  build: {
    target: 'esnext',
    outDir: path.resolve(__dirname, '../web/static'),
    emptyOutDir: false,
  },
});
