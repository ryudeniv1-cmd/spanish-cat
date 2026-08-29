/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
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

// version.json рядом с бандлом: по нему приложение на старте понимает,
// что открыт закешированный index.html от прошлой сборки (см. src/version.ts).
function buildVersionFile(): Plugin {
  return {
    name: 'build-version-file',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: buildId }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), buildVersionFile()],
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
