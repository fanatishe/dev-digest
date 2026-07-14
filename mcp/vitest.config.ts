import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Contracts are borrowed as TYPES only (see tsconfig paths). The alias
      // exists so a stray value import fails loudly here, not at runtime.
      '@devdigest/shared': path.resolve(__dirname, '../server/src/vendor/shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
