import { hashString } from './rng'

/** Gradient noise on an integer lattice: each node's hash becomes an angle. */
function gradient(ix: number, iz: number, seed: number): [number, number] {
  let h = (ix * 374761393 + iz * 668265263 + seed * 2654435761) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  const a = ((h ^ (h >>> 16)) >>> 0) * ((Math.PI * 2) / 4294967296)
  return [Math.cos(a), Math.sin(a)]
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

function perlin2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x)
  const z0 = Math.floor(z)
  const fx = x - x0
  const fz = z - z0
  const u = fade(fx)
  const v = fade(fz)

  const dot = (ix: number, iz: number, dx: number, dz: number) => {
    const [gx, gz] = gradient(ix, iz, seed)
    return gx * dx + gz * dz
  }

  const n00 = dot(x0, z0, fx, fz)
  const n10 = dot(x0 + 1, z0, fx - 1, fz)
  const n01 = dot(x0, z0 + 1, fx, fz - 1)
  const n11 = dot(x0 + 1, z0 + 1, fx - 1, fz - 1)

  const a = n00 + u * (n10 - n00)
  const b = n01 + u * (n11 - n01)
  return a + v * (b - a)
}

/**
 * Fractal noise: several octaves of Perlin, normalised to [-1, 1].
 *
 * The large octaves shape the hill, the small ones cut the hollows where water
 * gathers and mushrooms grow — so the fine detail is ecology, not decoration.
 */
export function fbm2(x: number, z: number, seed: number, octaves = 4): number {
  let sum = 0
  let amp = 1
  let freq = 1
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += perlin2(x * freq, z * freq, seed + o * 101) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  const v = sum / norm
  return Math.max(-1, Math.min(1, v))
}

/** The same noise keyed by a string — handy for a "seed of the place". */
export function fbmFromKey(x: number, z: number, key: string, octaves = 4): number {
  return fbm2(x, z, hashString(key) % 100000, octaves)
}
