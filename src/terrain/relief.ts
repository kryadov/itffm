import { fbm2 } from '../util/noise'
import type { Biome } from '../species/schema'
import type { ElevationProvider } from './provider'

/** Ridge spacing along a dune field's dominant direction, metres. */
const DUNE_WAVELENGTH = 16
/** Ridge height, metres — enough to read as relief without swallowing a
 *  person standing in the trough. */
const DUNE_AMPLITUDE = 1.4
/** Scale of a wetland's hummock-and-hollow texture, metres — much finer than
 *  a dune ridge, since a mochazhina is a metre or two across, not a dune. */
const WETLAND_SCALE = 4
const WETLAND_AMPLITUDE = 0.3

/**
 * Adds the relief `world/ground.ts` colours but the ground mesh itself was
 * missing: dune ridges as a folded sine wave with the ground's own noise
 * blended in for irregularity, and a wetland's hummocks and shallow pools as
 * one octave of fbm. Both are pure functions of position, biome and seed —
 * a wetland patch is always the same shape no matter which way the plot
 * happens to be drawn, the same determinism rule as everything else in
 * `src/` (see CLAUDE.md).
 *
 * Deliberately its own decorator layered on top of a finished ground —
 * gridded, already carrying `withPits`/`withDetail` — rather than folded
 * into `terrain/procedural.ts`: biome is an OSM-polygon lookup with no idea
 * about elevation, and `game/loadForest.ts` is the one place that already
 * has both a ground and a biome map to hand it.
 */
export function withBiomeRelief(
  base: ElevationProvider,
  biomeAt: (x: number, z: number) => Biome,
  seed: number,
): ElevationProvider {
  return {
    heightAt(x: number, z: number): number {
      const h = base.heightAt(x, z)
      switch (biomeAt(x, z)) {
        case 'dunes-coast': {
          const ridge = Math.sin((x * 0.7 + z) / DUNE_WAVELENGTH + seed)
          const drift = fbm2(x / (DUNE_WAVELENGTH * 2), z / (DUNE_WAVELENGTH * 2), seed, 2)
          return h + (ridge * 0.7 + drift * 0.3) * DUNE_AMPLITUDE
        }
        case 'wetland': {
          const texture = fbm2(x / WETLAND_SCALE, z / WETLAND_SCALE, seed + 500, 2)
          return h + texture * WETLAND_AMPLITUDE
        }
        default:
          return h
      }
    },
  }
}
