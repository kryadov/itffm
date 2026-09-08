export interface PopularPlace {
  id: string
  ru: string
  en: string
  /** What actually goes to Nominatim (geo/geocode.ts) — not always the same
   *  as the display name, since a bare name is sometimes ambiguous. */
  query: string
}

/**
 * A short, curated list for the place-picker screen. The blank input scares
 * off a player who has never thought about which forest to type in; these are
 * real places, checked to carry the OSM tags (`natural=wood`, `leisure=nature_reserve`,
 * `boundary=national_park`) the loader actually reads, and picked to span more
 * than one biome — this is not just a list of famous names.
 */
export const POPULAR_PLACES: PopularPlace[] = [
  { id: 'losiny-ostrov', ru: 'Лосиный Остров', en: 'Losiny Ostrov, Moscow', query: 'Лосиный Остров, Москва' },
  {
    id: 'prioksko-terrasny',
    ru: 'Приокско-Террасный заповедник',
    en: 'Prioksko-Terrasny Nature Reserve',
    query: 'Приокско-Террасный заповедник',
  },
  { id: 'kurshskaya-kosa', ru: 'Куршская коса', en: 'Curonian Spit', query: 'Куршская коса' },
  {
    id: 'polistovsky',
    ru: 'Полистовский заповедник',
    en: 'Polistovsky Nature Reserve',
    query: 'Полистовский заповедник',
  },
  { id: 'bialowieza', ru: 'Беловежская пуща', en: 'Białowieża Forest', query: 'Białowieża Forest' },
  { id: 'black-forest', ru: 'Шварцвальд', en: 'Black Forest', query: 'Schwarzwald, Germany' },
  { id: 'epping-forest', ru: 'Эппинг-Форест', en: 'Epping Forest', query: 'Epping Forest, England' },
]
