import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'server', include: ['src/server/**/__tests__/*.test.ts'], environment: 'node', env: { GEMINI_API_KEY: 'offline-test-key' }, testTimeout: 30000, hookTimeout: 120000, fileParallelism: false } },
      { test: { name: 'client', include: ['src/client/**/__tests__/*.test.tsx'], environment: 'jsdom', setupFiles: ['src/client/test-setup.ts'], testTimeout: 10000 } },
    ],
  },
});
