import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  // Garante que apenas variáveis explicitamente seguras com VITE_ (nenhuma chave técnica) entrem no cliente
  envPrefix: 'VITE_PUBLIC_',
  build: {
    target: 'es2020',
    sourcemap: false,
    outDir: 'dist',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: false,
  },
});
