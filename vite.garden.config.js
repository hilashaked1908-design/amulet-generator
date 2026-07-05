import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'questionnaire/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'questionnaire/garden-app.jsx'),
      output: {
        entryFileNames: 'garden-r3f.js',
        format: 'es',
      },
    },
  },
});
