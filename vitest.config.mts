import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const shared = {
  exclude: ['**/node_modules/**', '.next/**', '.next-e2e/**', 'e2e/**'],
  clearMocks: true,
};

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          ...shared,
          name: 'unit',
          environment: 'node',
          include: ['**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          ...shared,
          name: 'ui',
          environment: 'happy-dom',
          include: ['**/*.test.tsx'],
          setupFiles: ['./test/dom-setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['lib/domain/**/*.{ts,tsx}'],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
        'lib/domain/nutrition/**': { 100: true },
        'lib/domain/foods/**': { 100: true },
      },
    },
  },
});
