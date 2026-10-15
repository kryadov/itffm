import { defineConfig } from 'vitest/config'
import pkg from './package.json'

export default defineConfig({
  // Pages serves the project under /<repo>/, so the base must be relative.
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('node_modules/three/') ? 'three' : undefined) },
    },
  },
  // The mine and world-stream geometry tests run near 5 s on a busy machine.
  test: { globals: true, environment: 'node', testTimeout: 30000 },
})
