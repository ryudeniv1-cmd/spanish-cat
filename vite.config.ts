/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// На GitHub Actions переменная GITHUB_REPOSITORY = "owner/repo" —
// из неё вычисляется base вида "/<имя-репозитория>/" для GitHub Pages.
// Локально base относительный.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];

// Отметка сборки: по ней сразу видно, какая версия реально открыта.
// Без неё «изменения не приехали» невозможно отличить от «открыт другой адрес».
const buildId = [
  new Date().toISOString().slice(0, 16).replace('T', ' '),
  (process.env.GITHUB_SHA ?? 'local').slice(0, 7),
].join(' · ');

export default defineConfig({
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  base: repo ? `/${repo}/` : './',
  server: {
    watch: { ignored: ['**/.playwright-mcp/**'] },
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});
