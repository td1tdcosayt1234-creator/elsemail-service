import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'web'),
  base: '/app/',
  build: {
    outDir: path.resolve(__dirname, 'public/app'),
    emptyOutDir: true,
  },
});
