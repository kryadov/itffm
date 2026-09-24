import * as THREE from 'three'

let cached: THREE.DataTexture | null = null

/**
 * A soft round puff for smoke and steam sprites: white, its alpha falling
 * off from the centre to nothing at the rim. Without it a `THREE.Sprite` is a
 * flat square — the chimney's smoke, the campfire's and the steam off a pot
 * all read as grey tiles. Built from bytes, not a canvas, so it needs no DOM
 * (the tests run in node). Shared: one texture for every puff in the wood.
 */
export function puffTexture(): THREE.DataTexture {
  if (cached) return cached
  const n = 32
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n * 2 - 1
      const dy = (y + 0.5) / n * 2 - 1
      const r = Math.min(1, Math.hypot(dx, dy))
      const a = Math.pow(1 - r, 1.6)
      const i = (y * n + x) * 4
      data[i] = 255
      data[i + 1] = 255
      data[i + 2] = 255
      data[i + 3] = Math.round(a * 255)
    }
  }
  cached = new THREE.DataTexture(data, n, n)
  cached.magFilter = THREE.LinearFilter
  cached.minFilter = THREE.LinearFilter
  cached.needsUpdate = true
  return cached
}
