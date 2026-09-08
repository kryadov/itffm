import type { Species } from '../species/schema'

export type Lang = 'ru' | 'en'

/**
 * Every string the player sees. Species names and descriptions are not here —
 * they belong to the species data, which carries both languages of its own.
 */
export const RU = {
  collect: 'В корзину',
  leave: 'Оставить расти',
  traits: 'Признаки',
  lookalikes: 'Двойники',
  ecology: 'Где растёт',
  encyclopedia: 'Энциклопедия',
  closeHint: 'Tab — закрыть',
  of: 'из',
  unknown: '???',
  basketFull: 'Корзина полна',
  tally: 'Разбор корзины',
  tallyEmpty: 'Корзина пуста — но прогулка всё равно удалась.',
  edible: 'съедобный',
  conditional: 'условно съедобный',
  inedible: 'несъедобный',
  poisonous: 'ядовитый',
  deadly: 'смертельно ядовитый',
  disclaimer:
    'Игра не является определителем грибов. Не используйте её, чтобы решать, что можно есть: настоящий гриб определяют по совокупности признаков, а ошибка стоит здоровья.',
  understood: 'Понятно',
  controls: 'WASD — идти, Shift — присесть, E — рассмотреть, Tab — энциклопедия, Q — разобрать корзину',
  capSize: 'Шляпка',
  underside: 'Снизу',
  stipe: 'Ножка',
  substrate: 'Растёт на',
  partners: 'Партнёры',
  gills: 'пластинки',
  pores: 'трубчатый слой',
  teeth: 'шипики',
  smooth: 'гладкий низ',
  maze: 'лабиринтовидный низ',
  withRing: 'с кольцом',
  noRing: 'без кольца',
  withVolva: 'с вольвой у основания',
  soil: 'почве',
  litter: 'подстилке',
  deadwood: 'мёртвой древесине',
  livewood: 'живых деревьях',
  dung: 'помёте',
  moss: 'мху',
  sand: 'песке',
  burnt: 'гарях',
  mm: 'мм',
  placeIntro:
    'Назовите настоящий лес — свой дачный, заповедник, национальный парк — и почва, деревья и грибы будут расти по его настоящей экологии.',
  placePlaceholder: 'Лосиный Остров',
  placeGo: 'В лес',
  placeDemo: 'Просто показать лес',
  placePopular: 'Или один из известных лесов:',
  filterAny: 'Любой',
  filterBiome: 'Биом',
  filterEdibility: 'Съедобность',
  filterHymenium: 'Гименофор',
  filterSeason: 'Сезон',
  spring: 'весна',
  summer: 'лето',
  autumn: 'осень',
  winter: 'зима',
  noMatches: 'Под эти фильтры ничего не подходит.',
  placeSize: 'Размер участка',
  stageGeocode: 'Ищем место…',
  stageOsm: 'Читаем карту леса…',
  stageTerrain: 'Строим рельеф…',
  stageBuild: 'Выращиваем лес…',
  fellBackNotice: 'Не удалось построить лес по этому месту — показываю запасной лес.',
  lang: 'EN',
} as const

export const EN: Record<keyof typeof RU, string> = {
  collect: 'Into the basket',
  leave: 'Leave it growing',
  traits: 'Field marks',
  lookalikes: 'Look-alikes',
  ecology: 'Where it grows',
  encyclopedia: 'Encyclopedia',
  closeHint: 'Tab to close',
  of: 'of',
  unknown: '???',
  basketFull: 'The basket is full',
  tally: 'Sorting the basket',
  tallyEmpty: 'An empty basket — but the walk was still worth it.',
  edible: 'edible',
  conditional: 'edible with care',
  inedible: 'inedible',
  poisonous: 'poisonous',
  deadly: 'deadly poisonous',
  disclaimer:
    'This game is not a field guide. Do not use it to decide what is safe to eat: a real mushroom is identified from the whole set of its characters, and a mistake costs your health.',
  understood: 'Understood',
  controls: 'WASD to walk, Shift to crouch, E to examine, Tab for the encyclopedia, Q to sort the basket',
  capSize: 'Cap',
  underside: 'Underside',
  stipe: 'Stipe',
  substrate: 'Grows on',
  partners: 'Partners',
  gills: 'gills',
  pores: 'tubes and pores',
  teeth: 'spines',
  smooth: 'a smooth underside',
  maze: 'a maze-like underside',
  withRing: 'with a ring',
  noRing: 'without a ring',
  withVolva: 'with a volva at the base',
  soil: 'soil',
  litter: 'leaf litter',
  deadwood: 'dead wood',
  livewood: 'living trees',
  dung: 'dung',
  moss: 'moss',
  sand: 'sand',
  burnt: 'burnt ground',
  mm: 'mm',
  placeIntro:
    'Name a real wood — your own local one, a nature reserve, a national park — and the ground, the trees and the mushrooms will follow its actual ecology.',
  placePlaceholder: 'Losiny Ostrov',
  placeGo: 'Into the wood',
  placeDemo: 'Just show me a wood',
  placePopular: 'Or one of these known woods:',
  filterAny: 'Any',
  filterBiome: 'Biome',
  filterEdibility: 'Edibility',
  filterHymenium: 'Underside',
  filterSeason: 'Season',
  spring: 'spring',
  summer: 'summer',
  autumn: 'autumn',
  winter: 'winter',
  noMatches: 'Nothing matches these filters.',
  placeSize: 'Plot size',
  stageGeocode: 'Looking for the place…',
  stageOsm: 'Reading the map of the wood…',
  stageTerrain: 'Shaping the terrain…',
  stageBuild: 'Growing the wood…',
  fellBackNotice: 'Could not build a wood from that place — showing the demo wood instead.',
  lang: 'RU',
}

let current: Lang = 'ru'

export function setLang(l: Lang): void {
  current = l
}

export function getLang(): Lang {
  return current
}

export function t(key: keyof typeof RU): string {
  return current === 'ru' ? RU[key] : EN[key]
}

export function speciesName(s: Species): string {
  return current === 'ru' ? s.name.ru : s.name.en
}

export function speciesText(s: Species): string {
  return current === 'ru' ? s.text.ru : s.text.en
}
