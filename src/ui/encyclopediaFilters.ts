import type { Species, Biome, Edibility, HymeniumType } from '../species/schema'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

/** Meteorological, not astronomical — matches how `ecology.season` months are
 *  already written in the species data. */
export const SEASON_MONTHS: Record<Season, number[]> = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
}

export interface EncyclopediaFilters {
  biome?: Biome
  edibility?: Edibility
  hymenium?: HymeniumType
  season?: Season
}

/** Every filter left unset passes by default — an empty filter set matches
 *  everything, the way "no filter" should. */
export function matchesFilters(species: Species, filters: EncyclopediaFilters): boolean {
  if (filters.biome && !species.ecology.biomes.includes(filters.biome)) return false
  if (filters.edibility && species.edibility !== filters.edibility) return false
  if (filters.hymenium && species.morphology.hymenium.type !== filters.hymenium) return false
  if (filters.season && !SEASON_MONTHS[filters.season].some((m) => species.ecology.season.includes(m))) {
    return false
  }
  return true
}
