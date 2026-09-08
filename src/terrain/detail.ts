import { fbm2 } from '../util/noise'
import type { ElevationProvider } from './provider'

/** Size of the added relief, metres — tussocks and hollows, not hills. */
const DEFAULT_AMPLITUDE = 0.55
/** Its horizontal scale, metres. */
const SCALE = 6

/**
 * Adds fine relief on top of a coarse elevation source.
 *
 * Terrain tiles are five to ten metres per pixel: plenty for a car, useless for
 * someone walking at 1.4 m/s who lives among the hollows that hold the damp.
 * Moisture is read from the concavity of the ground (see ecology/sites.ts), so
 * without this layer a real DEM would hand a whole wood one flat moisture value
 * and the ecology would have nothing to say.
 *
 * The broad shape stays real; only the last half-metre is invented.
 */
export function withDetail(
  base: ElevationProvider,
  seed: number,
  amplitude = DEFAULT_AMPLITUDE,
): ElevationProvider {
  return {
    heightAt(x: number, z: number): number {
      return base.heightAt(x, z) + fbm2(x / SCALE, z / SCALE, seed, 3) * amplitude
    },
  }
}
