/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // e2e/ holds Playwright specs, which match Vitest's default `**/*.spec.ts`
    // glob. Without this they would be collected into jsdom and fail on import.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
