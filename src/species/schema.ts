import type { CapShape } from '../mushroom/profile'

export const CAP_SHAPES = ['hemispherical', 'convex', 'flat', 'depressed', 'funnel', 'conical', 'ovoid'] as const
export const EDIBILITY = ['edible', 'conditional', 'inedible', 'poisonous', 'deadly'] as const
export const HYMENIUM = ['gills', 'pores', 'teeth', 'smooth', 'maze'] as const
export const ATTACHMENT = ['free', 'adnate', 'adnexed', 'decurrent'] as const
export const SURFACE = ['smooth', 'warty', 'scaly', 'fibrous', 'viscid', 'velvety'] as const
export const RING = ['none', 'pendant', 'ascending', 'fugacious'] as const
export const STIPE_POSITION = ['central', 'lateral', 'absent'] as const
export const VOLVA = ['none', 'sheathing', 'bulbous-rings', 'marginate'] as const
export const BRUISING = ['none', 'blue', 'red', 'brown', 'black'] as const
export const LATEX = ['none', 'white', 'orange', 'red'] as const
export const SUBSTRATE = ['soil', 'litter', 'deadwood', 'livewood', 'dung', 'moss', 'sand', 'burnt'] as const
export const BIOMES = [
  'forest-broadleaved', 'forest-coniferous', 'forest-mixed', 'meadow-scrub',
  'dunes-coast', 'wetland', 'cave-adit', 'park-urban', 'alpine',
] as const
export const TREE_GENERA = [
  'betula', 'picea', 'pinus', 'quercus', 'populus', 'salix',
  'alnus', 'fagus', 'tilia', 'acer', 'carpinus', 'larix', 'abies',
] as const
export const GREGARIOUS = ['solitary', 'scattered', 'clustered', 'troops', 'rings'] as const
export const FREQUENCY = ['common', 'occasional', 'rare'] as const
/**
 * What kind of thing a species is (see
 * docs/superpowers/specs/2026-09-08-forest-finds-design.md). Each kind gets
 * its own morphology and its own generator (mushroom/build.ts, berry/build.ts,
 * herb/build.ts, nut/build.ts, find/build.ts) — this field is what the
 * `Species` union, the collectible dispatcher and the encyclopedia's kind
 * filter all key off.
 */
export const KINDS = ['mushroom', 'berry', 'herb', 'nut', 'find'] as const

export type Edibility = (typeof EDIBILITY)[number]
export type HymeniumType = (typeof HYMENIUM)[number]
export type Attachment = (typeof ATTACHMENT)[number]
export type Surface = (typeof SURFACE)[number]
export type RingType = (typeof RING)[number]
export type VolvaType = (typeof VOLVA)[number]
export type StipePosition = (typeof STIPE_POSITION)[number]
export type Substrate = (typeof SUBSTRATE)[number]
export type Biome = (typeof BIOMES)[number]
export type TreeGenus = (typeof TREE_GENERA)[number]
export type Gregarious = (typeof GREGARIOUS)[number]
export type Frequency = (typeof FREQUENCY)[number]
export type Kind = (typeof KINDS)[number]
export type Range = [number, number]

/** Everything the mesh generator needs to build a mushroom. */
export interface MushroomMorphology {
  cap: { shape: CapShape; ageShape: CapShape; diameter: Range; color: string; surface: Surface; surfaceColor: string }
  hymenium: { type: HymeniumType; attachment: Attachment; color: string }
  stipe: { height: Range; width: Range; color: string; position: StipePosition; ring: RingType; volva: VolvaType }
  flesh: { color: string; bruising: (typeof BRUISING)[number] }
  latex: (typeof LATEX)[number]
}

/** Everything the mesh generator needs to build a berry cluster. */
export interface BerryMorphology {
  /** Ripe berry colour. */
  color: string
  /** One berry's diameter, mm. */
  diameter: Range
  /** Berries in one cluster. */
  clusterSize: Range
  /** The small tuft of foliage under the cluster. */
  leafColor: string
  /** Height of the whole plant carrying the berries, mm — a knee-high shrub
   *  for bilberry, a low creeping mat for lingonberry, a single stem for
   *  cloudberry. The berries themselves are a few millimetres across and
   *  unaimable on their own at any real distance; this is what actually
   *  gives a player something to see and reach for. */
  bushHeight: Range
}

/** Everything the mesh generator needs to build one herb plant. */
export interface HerbMorphology {
  stemColor: string
  leafColor: string
  /** Whole plant height, mm. */
  height: Range
  /** One leaf's length, mm. */
  leafSize: Range
  /** Leaves on one plant. */
  leafCount: Range
}

/** Everything the mesh generator needs to build one nut or seed. */
export interface NutMorphology {
  bodyColor: string
  capColor: string
  /** Nut body diameter, mm. */
  size: Range
  /** Fraction of the body a cap/husk covers, 0..1 (an acorn's cap is small,
   *  a hazelnut's husk can wrap most of the shell). */
  capCoverage: Range
}

/**
 * Everything the mesh generator needs to build one non-food find. Unlike the
 * other kinds, a find has no taxonomic parts to name — one irregular blob
 * mesh, coloured and sized by species data, stands in for a nest, an antler,
 * a feather or a stone alike.
 */
export interface FindMorphology {
  color: string
  /** Rough overall size, mm. */
  size: Range
  /** A short material label for the trait card — "bone", "down", "quartz" —
   *  not a `oneOf` enum, because a find's material is descriptive text, not
   *  a taxonomic fact schema.ts can enumerate ahead of time. */
  material: string
}

/** Everything the world generator needs to decide where this species grows. */
export interface Ecology {
  mycorrhizal: TreeGenus[]
  substrate: Substrate
  biomes: Biome[]
  /** Months, 1..12. */
  season: number[]
  moisture: Range
  gregarious: Gregarious
  frequency: Frequency
}

export interface MediaRef {
  src: string
  license: string
  author: string
  source: string
}

interface SpeciesCommon {
  id: string
  /** Absent only for a non-food find (kind: 'find') — not every find is a
   *  GBIF taxon (a "nest" or "an interesting stone" isn't a species). */
  gbifKey?: number
  name: { la: string; ru: string; en: string }
  lookalikes: string[]
  ecology: Ecology
  media: MediaRef[]
  text: { ru: string; en: string }
}

/**
 * A species is one of these, discriminated by `kind` — narrowing on `kind`
 * narrows `morphology` to the matching type, which is what lets
 * `collectible/build.ts`'s dispatcher and each kind's own build.ts stay
 * simply typed instead of casting. `edibility` is required for everything
 * edible-or-not; a non-food find is the one kind that leaves it out
 * entirely — not "inedible", but a question that doesn't apply.
 */
export type Species =
  | (SpeciesCommon & { kind: 'mushroom'; morphology: MushroomMorphology; edibility: Edibility })
  | (SpeciesCommon & { kind: 'berry'; morphology: BerryMorphology; edibility: Edibility })
  | (SpeciesCommon & { kind: 'herb'; morphology: HerbMorphology; edibility: Edibility })
  | (SpeciesCommon & { kind: 'nut'; morphology: NutMorphology; edibility: Edibility })
  | (SpeciesCommon & { kind: 'find'; morphology: FindMorphology })

class SpeciesError extends Error {
  constructor(file: string, field: string, why: string) {
    super(`${file}: field ${field} — ${why}`)
  }
}

function path(prefix: string, field: string): string {
  return prefix ? `${prefix}.${field}` : field
}

function hasField(obj: unknown, field: string): boolean {
  return typeof obj === 'object' && obj !== null && (obj as Record<string, unknown>)[field] !== undefined
}

function get(obj: unknown, field: string, file: string, prefix: string): unknown {
  if (typeof obj !== 'object' || obj === null) {
    throw new SpeciesError(file, prefix || '(root)', 'expected an object')
  }
  const v = (obj as Record<string, unknown>)[field]
  if (v === undefined) throw new SpeciesError(file, path(prefix, field), 'missing')
  return v
}

function str(obj: unknown, field: string, file: string, prefix: string): string {
  const v = get(obj, field, file, prefix)
  if (typeof v !== 'string' || v.length === 0) {
    throw new SpeciesError(file, path(prefix, field), 'expected a non-empty string')
  }
  return v
}

function oneOf<T extends string>(obj: unknown, field: string, allowed: readonly T[], file: string, prefix: string): T {
  const v = str(obj, field, file, prefix)
  if (!(allowed as readonly string[]).includes(v)) {
    throw new SpeciesError(file, path(prefix, field), `"${v}" — allowed: ${allowed.join(', ')}`)
  }
  return v as T
}

function color(obj: unknown, field: string, file: string, prefix: string): string {
  const v = str(obj, field, file, prefix)
  if (!/^#[0-9a-fA-F]{6}$/.test(v)) {
    throw new SpeciesError(file, path(prefix, field), `"${v}" — expected hex #rrggbb`)
  }
  return v
}

function range(obj: unknown, field: string, file: string, prefix: string): Range {
  const v = get(obj, field, file, prefix)
  const full = path(prefix, field)
  if (!Array.isArray(v) || v.length !== 2 || v.some((n) => typeof n !== 'number')) {
    throw new SpeciesError(file, full, 'expected two numbers [min, max]')
  }
  if (v[0] > v[1]) throw new SpeciesError(file, full, `range is inverted: ${v[0]} > ${v[1]}`)
  return [v[0], v[1]]
}

function listOf<T extends string>(obj: unknown, field: string, allowed: readonly T[], file: string, prefix: string): T[] {
  const v = get(obj, field, file, prefix)
  const full = path(prefix, field)
  if (!Array.isArray(v)) throw new SpeciesError(file, full, 'expected a list')
  for (const item of v) {
    if (typeof item !== 'string' || !(allowed as readonly string[]).includes(item)) {
      throw new SpeciesError(file, full, `"${String(item)}" — allowed: ${allowed.join(', ')}`)
    }
  }
  return v as T[]
}

function parseMushroomMorphology(raw: unknown, file: string): MushroomMorphology {
  const mo = get(raw, 'morphology', file, '')
  const capObj = get(mo, 'cap', file, 'morphology')
  const hyObj = get(mo, 'hymenium', file, 'morphology')
  const stObj = get(mo, 'stipe', file, 'morphology')
  const flObj = get(mo, 'flesh', file, 'morphology')

  return {
    cap: {
      shape: oneOf(capObj, 'shape', CAP_SHAPES, file, 'morphology.cap'),
      ageShape: oneOf(capObj, 'ageShape', CAP_SHAPES, file, 'morphology.cap'),
      diameter: range(capObj, 'diameter', file, 'morphology.cap'),
      color: color(capObj, 'color', file, 'morphology.cap'),
      surface: oneOf(capObj, 'surface', SURFACE, file, 'morphology.cap'),
      surfaceColor: color(capObj, 'surfaceColor', file, 'morphology.cap'),
    },
    hymenium: {
      type: oneOf(hyObj, 'type', HYMENIUM, file, 'morphology.hymenium'),
      attachment: oneOf(hyObj, 'attachment', ATTACHMENT, file, 'morphology.hymenium'),
      color: color(hyObj, 'color', file, 'morphology.hymenium'),
    },
    stipe: {
      height: range(stObj, 'height', file, 'morphology.stipe'),
      width: range(stObj, 'width', file, 'morphology.stipe'),
      color: color(stObj, 'color', file, 'morphology.stipe'),
      position: oneOf(stObj, 'position', STIPE_POSITION, file, 'morphology.stipe'),
      ring: oneOf(stObj, 'ring', RING, file, 'morphology.stipe'),
      volva: oneOf(stObj, 'volva', VOLVA, file, 'morphology.stipe'),
    },
    flesh: {
      color: color(flObj, 'color', file, 'morphology.flesh'),
      bruising: oneOf(flObj, 'bruising', BRUISING, file, 'morphology.flesh'),
    },
    latex: oneOf(mo, 'latex', LATEX, file, 'morphology'),
  }
}

function parseBerryMorphology(raw: unknown, file: string): BerryMorphology {
  const mo = get(raw, 'morphology', file, '')
  return {
    color: color(mo, 'color', file, 'morphology'),
    diameter: range(mo, 'diameter', file, 'morphology'),
    clusterSize: range(mo, 'clusterSize', file, 'morphology'),
    leafColor: color(mo, 'leafColor', file, 'morphology'),
    bushHeight: range(mo, 'bushHeight', file, 'morphology'),
  }
}

function parseNutMorphology(raw: unknown, file: string): NutMorphology {
  const mo = get(raw, 'morphology', file, '')
  const capCoverage = range(mo, 'capCoverage', file, 'morphology')
  if (capCoverage[0] < 0 || capCoverage[1] > 1) {
    throw new SpeciesError(file, 'morphology.capCoverage', 'values outside 0..1')
  }
  return {
    bodyColor: color(mo, 'bodyColor', file, 'morphology'),
    capColor: color(mo, 'capColor', file, 'morphology'),
    size: range(mo, 'size', file, 'morphology'),
    capCoverage,
  }
}

function parseHerbMorphology(raw: unknown, file: string): HerbMorphology {
  const mo = get(raw, 'morphology', file, '')
  return {
    stemColor: color(mo, 'stemColor', file, 'morphology'),
    leafColor: color(mo, 'leafColor', file, 'morphology'),
    height: range(mo, 'height', file, 'morphology'),
    leafSize: range(mo, 'leafSize', file, 'morphology'),
    leafCount: range(mo, 'leafCount', file, 'morphology'),
  }
}

function parseFindMorphology(raw: unknown, file: string): FindMorphology {
  const mo = get(raw, 'morphology', file, '')
  return {
    color: color(mo, 'color', file, 'morphology'),
    size: range(mo, 'size', file, 'morphology'),
    material: str(mo, 'material', file, 'morphology'),
  }
}

/**
 * Parses and checks one species. Throws a SpeciesError naming the file and the
 * field: these errors are the guard rail on hand-curated data, so they have to
 * say exactly where the typo is.
 */
export function validateSpecies(raw: unknown, file: string): Species {
  const id = str(raw, 'id', file, '')
  if (!/^[a-z0-9-]+$/.test(id)) throw new SpeciesError(file, 'id', 'lowercase letters, digits and hyphens only')

  const nameObj = get(raw, 'name', file, '')
  const name = {
    la: str(nameObj, 'la', file, 'name'),
    ru: str(nameObj, 'ru', file, 'name'),
    en: str(nameObj, 'en', file, 'name'),
  }

  // Absent defaults to 'mushroom': the 31 species curated before this field
  // existed name no kind at all, and re-touching every one of them just to
  // spell out what they already are would be busywork, not data.
  const kind: Kind = hasField(raw, 'kind') ? oneOf(raw, 'kind', KINDS, file, '') : 'mushroom'

  // A find's gbifKey is optional — see FindMorphology's doc comment.
  let gbifKey: number | undefined
  if (hasField(raw, 'gbifKey')) {
    const gk = get(raw, 'gbifKey', file, '')
    if (typeof gk !== 'number' || !Number.isInteger(gk)) {
      throw new SpeciesError(file, 'gbifKey', 'expected an integer')
    }
    gbifKey = gk
  } else if (kind !== 'find') {
    throw new SpeciesError(file, 'gbifKey', 'missing')
  }

  // A find has no edibility — see the Species union's doc comment.
  const edibility: Edibility | undefined = kind === 'find' ? undefined : oneOf(raw, 'edibility', EDIBILITY, file, '')

  const ec = get(raw, 'ecology', file, '')
  const season = get(ec, 'season', file, 'ecology')
  if (!Array.isArray(season) || season.length === 0 || season.some((m) => typeof m !== 'number' || m < 1 || m > 12)) {
    throw new SpeciesError(file, 'ecology.season', 'expected a non-empty list of months 1..12')
  }
  const moisture = range(ec, 'moisture', file, 'ecology')
  if (moisture[0] < 0 || moisture[1] > 1) throw new SpeciesError(file, 'ecology.moisture', 'values outside 0..1')

  const ecology: Ecology = {
    mycorrhizal: listOf(ec, 'mycorrhizal', TREE_GENERA, file, 'ecology'),
    substrate: oneOf(ec, 'substrate', SUBSTRATE, file, 'ecology'),
    biomes: listOf(ec, 'biomes', BIOMES, file, 'ecology'),
    season: season as number[],
    moisture,
    gregarious: oneOf(ec, 'gregarious', GREGARIOUS, file, 'ecology'),
    frequency: oneOf(ec, 'frequency', FREQUENCY, file, 'ecology'),
  }
  if (ecology.biomes.length === 0) throw new SpeciesError(file, 'ecology.biomes', 'at least one biome is required')

  const lookalikesRaw = get(raw, 'lookalikes', file, '')
  if (!Array.isArray(lookalikesRaw) || lookalikesRaw.some((s) => typeof s !== 'string')) {
    throw new SpeciesError(file, 'lookalikes', 'expected a list of species ids')
  }

  const mediaRaw = get(raw, 'media', file, '')
  if (!Array.isArray(mediaRaw)) throw new SpeciesError(file, 'media', 'expected a list')
  const media: MediaRef[] = mediaRaw.map((m, i) => ({
    src: str(m, 'src', file, `media[${i}]`),
    license: str(m, 'license', file, `media[${i}]`),
    author: str(m, 'author', file, `media[${i}]`),
    source: str(m, 'source', file, `media[${i}]`),
  }))

  const textObj = get(raw, 'text', file, '')
  const text = { ru: str(textObj, 'ru', file, 'text'), en: str(textObj, 'en', file, 'text') }

  const common = {
    id,
    gbifKey,
    name,
    lookalikes: lookalikesRaw as string[],
    ecology,
    media,
    text,
  }

  if (kind === 'find') return { ...common, kind, morphology: parseFindMorphology(raw, file) }
  if (kind === 'berry') return { ...common, kind, edibility: edibility!, morphology: parseBerryMorphology(raw, file) }
  if (kind === 'herb') return { ...common, kind, edibility: edibility!, morphology: parseHerbMorphology(raw, file) }
  if (kind === 'nut') return { ...common, kind, edibility: edibility!, morphology: parseNutMorphology(raw, file) }
  return { ...common, kind: 'mushroom', edibility: edibility!, morphology: parseMushroomMorphology(raw, file) }
}
