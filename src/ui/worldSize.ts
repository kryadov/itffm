export interface WorldSizeOption {
  id: string
  /** Half the plot's side, metres — what game/scene.ts and loadForest.ts want. */
  halfSize: number
  ru: string
  en: string
}

/**
 * A handful of fixed choices rather than a free-form number: half-size feeds
 * the OSM query radius, the ground mesh resolution and the mushroom count all
 * at once (see game/scene.ts, game/loadForest.ts), and letting a player type
 * an arbitrary metre count invites a plot that stalls the OSM fetch or the
 * GPU with no warning of which. The label names the side of the square, not
 * the half-size these numbers actually are — that is what a player standing
 * in the wood can feel.
 */
export const WORLD_SIZES: WorldSizeOption[] = [
  { id: 'small', halfSize: 60, ru: 'Малый (120 м)', en: 'Small (120 m)' },
  { id: 'medium', halfSize: 90, ru: 'Средний (180 м)', en: 'Medium (180 m)' },
  { id: 'large', halfSize: 150, ru: 'Большой (300 м)', en: 'Large (300 m)' },
]

export const DEFAULT_WORLD_SIZE = WORLD_SIZES[1]
