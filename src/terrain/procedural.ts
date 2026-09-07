import { fbm2 } from '../util/noise'
import type { ElevationProvider } from './provider'

/** Broad shape: hills roughly this size, in metres. */
const HILL_SCALE = 90
/** Fine shape: the tussocks and hollows a forager actually walks through. */
const DETAIL_SCALE = 7

/**
 * Procedural terrain: gentle hills plus fine relief.
 *
 * The fine relief is not decoration. A point's moisture is read from the
 * concavity of the surface, and moisture decides what grows there — without
 * the small octave the whole wood would be ecologically uniform.
 */
export function proceduralTerrain(seed: number, amplitude = 12): ElevationProvider {
  return {
    heightAt(x: number, z: number): number {
      const hills = fbm2(x / HILL_SCALE, z / HILL_SCALE, seed, 4)
      const detail = fbm2(x / DETAIL_SCALE, z / DETAIL_SCALE, seed + 7919, 3)
      return Math.max(
        -amplitude,
        Math.min(amplitude, hills * amplitude * 0.85 + detail * amplitude * 0.06),
      )
    },
  }
}
