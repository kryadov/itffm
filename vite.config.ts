import { defineConfig } from 'vitest/config'
import pkg from './package.json'

export default defineConfig({
  // Pages serves the project under /<repo>/, so the base must be relative.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
  },
  test: { globals: true, environment: 'node' },
})
