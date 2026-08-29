/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// На GitHub Actions переменная GITHUB_REPOSITORY = "owner/repo" —
// из неё вычисляется base вида "/<имя-репозитория>/" для GitHub Pages.
// Локально base относительный.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];

export default defineConfig({
  plugins: [react()],
  base: repo ? `/${repo}/` : './',
  server: {
    watch: { ignored: ['**/.playwright-mcp/**'] },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
