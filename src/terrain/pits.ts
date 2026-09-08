import { mulberry32, hashString } from '../util/rng'
import type { ElevationProvider } from './provider'

/** Grid a candidate pit is drawn from, metres — coarser than withDetail's
 *  smooth relief: these are discrete features, not a texture. */
const CELL = 14
/** Share of cells that get a pit at all — rare, or the wood turns to craters. */
const CHANCE = 0.14
const MIN_RADIUS = 1.3
const MAX_RADIUS = 2.6
const MIN_DEPTH = 0.35
const MAX_DEPTH = 1.0

interface Pit {
  x: number
  z: number
  radius: number
  depth: number
}

/** The one pit a cell may hold, or none — pure function of the cell and the
 *  seed, so neighbouring cells never need to agree on anything out of band. */
function pitInCell(gx: number, gz: number, seed: number): Pit | null {
  const rng = mulberry32(hashString(`pit:${gx}:${gz}:${seed}`))
  if (rng() >= CHANCE) return null
  const radius = MIN_RADIUS + rng() * (MAX_RADIUS - MIN_RADIUS)
  return {
    x: (gx + 0.5) * CELL + (rng() - 0.5) * CELL * 0.6,
    z: (gz + 0.5) * CELL + (rng() - 0.5) * CELL * 0.6,
    radius,
    depth: MIN_DEPTH + rng() * (MAX_DEPTH - MIN_DEPTH),
  }
}

/**
 * Adds sparse, discrete hollows on top of a terrain source — an old fox den,
 * a wash-out, a shell crater healed over by moss. Unlike `withDetail`'s smooth
 * fbm relief, these have a hard edge: a real pit is a place, not a texture.
 *
 * The point is not the shape alone: `moistureAt` (ecology/sites.ts) already
 * reads concavity, and a pit deep enough here reads as a small wet pocket of
 * its own, exactly the way a real hollow gathers water and grows differently
 * from the ground around it. `slopeFactor` (game/player.ts) already slows a
 * steep climb, so the rim it makes is not free of consequence either.
 */
export function withPits(base: ElevationProvider, seed: number): ElevationProvider {
  return {
    heightAt(x: number, z: number): number {
      const gx = Math.floor(x / CELL)
      const gz = Math.floor(z / CELL)
      let drop = 0
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const pit = pitInCell(gx + dx, gz + dz, seed)
          if (!pit) continue
          const d = Math.hypot(x - pit.x, z - pit.z)
          if (d >= pit.radius) continue
          const t = 1 - d / pit.radius
          drop = Math.max(drop, pit.depth * t * t)
        }
      }
      return base.heightAt(x, z) - drop
    },
  }
}
