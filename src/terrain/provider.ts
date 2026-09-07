/**
 * Where the ground's height comes from. Procedural for now, a real DEM later.
 *
 * Everything that stands on the ground — the player, the trees, the mushrooms —
 * knows only this interface. Keep it to what a procedural surface can answer,
 * so swapping in real elevation data changes nothing but the implementation.
 */
export interface ElevationProvider {
  /** Height in metres at local ground coordinates (x east, z south). */
  heightAt(x: number, z: number): number
}
