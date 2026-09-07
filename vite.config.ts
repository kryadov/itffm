import { defineConfig } from 'vitest/config'
import pkg from './package.json'

export default defineConfig({
  // Pages отдаёт проект по пути /<repo>/, поэтому база относительная.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  test: { globals: true, environment: 'node' },
})
