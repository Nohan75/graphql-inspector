import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only the project's own tests: .claude/worktrees holds other checkouts
    include: ['src/**/*.test.ts'],
  },
});
