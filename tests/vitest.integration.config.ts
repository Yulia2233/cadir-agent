import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts', 'tests/deployment/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
