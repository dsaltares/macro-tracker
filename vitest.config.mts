import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['**/*.test.ts'],
          exclude: ['**/node_modules/**', '.next/**', 'e2e/**'],
          clearMocks: true,
        },
      },
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'happy-dom',
          include: ['**/*.test.tsx'],
          exclude: ['**/node_modules/**', '.next/**', 'e2e/**'],
          setupFiles: ['./test/dom-setup.ts'],
          clearMocks: true,
        },
      },
    ],
  },
});
