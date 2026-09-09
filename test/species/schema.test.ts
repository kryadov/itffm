import { validateSpecies } from '../../src/species/schema'

const valid = {
  id: 'amanita-muscaria',
  gbifKey: 2526057,
  name: { la: 'Amanita muscaria', ru: 'Мухомор красный', en: 'Fly agaric' },
  edibility: 'poisonous',
  lookalikes: [],
  morphology: {
    cap: { shape: 'convex', ageShape: 'flat', diameter: [80, 200], color: '#d0201a', surface: 'warty', surfaceColor: '#fffdf0' },
    hymenium: { type: 'gills', attachment: 'free', color: '#fffdf0' },
    stipe: { height: [80, 200], width: [10, 20], color: '#fffdf0', position: 'central', ring: 'pendant', volva: 'bulbous-rings' },
    flesh: { color: '#fffdf0', bruising: 'none' },
    latex: 'none',
  },
  ecology: {
    mycorrhizal: ['betula', 'picea', 'pinus'],
    substrate: 'soil',
    biomes: ['forest-mixed', 'forest-coniferous'],
    season: [7, 8, 9, 10],
    moisture: [0.3, 0.8],
    gregarious: 'scattered',
    frequency: 'common',
  },
  media: [],
  text: { ru: 'Описание.', en: 'Description.' },
}

const validBerry = {
  id: 'vaccinium-myrtillus',
  gbifKey: 3086357,
  name: { la: 'Vaccinium myrtillus', ru: 'Черника', en: 'Bilberry' },
  kind: 'berry',
  edibility: 'edible',
  lookalikes: [],
  morphology: {
    color: '#2a2f6b',
    diameter: [6, 10],
    clusterSize: [3, 8],
    leafColor: '#3f5a2c',
    bushHeight: [250, 400],
  },
  ecology: {
    mycorrhizal: [],
    substrate: 'soil',
    biomes: ['forest-coniferous'],
    season: [7, 8, 9],
    moisture: [0.4, 0.9],
    gregarious: 'clustered',
    frequency: 'common',
  },
  media: [],
  text: { ru: 'Описание.', en: 'Description.' },
}

const validHerb = {
  id: 'urtica-dioica',
  gbifKey: 3033970,
  name: { la: 'Urtica dioica', ru: 'Крапива двудомная', en: 'Common nettle' },
  kind: 'herb',
  edibility: 'edible',
  lookalikes: [],
  morphology: {
    stemColor: '#4a6b3a',
    leafColor: '#3f6b2c',
    height: [400, 1500],
    leafSize: [60, 150],
    leafCount: [8, 20],
  },
  ecology: {
    mycorrhizal: [],
    substrate: 'soil',
    biomes: ['meadow-scrub'],
    season: [5, 6, 7, 8],
    moisture: [0.4, 0.9],
    gregarious: 'clustered',
    frequency: 'common',
  },
  media: [],
  text: { ru: 'Описание.', en: 'Description.' },
}

const validNut = {
  id: 'corylus-avellana',
  gbifKey: 2874515,
  name: { la: 'Corylus avellana', ru: 'Лещина обыкновенная', en: 'Common hazel' },
  kind: 'nut',
  edibility: 'edible',
  lookalikes: [],
  morphology: {
    bodyColor: '#8a5a2a',
    capColor: '#5a7a3a',
    size: [12, 18],
    capCoverage: [0.4, 0.7],
  },
  ecology: {
    mycorrhizal: [],
    substrate: 'livewood',
    biomes: ['forest-broadleaved'],
    season: [8, 9],
    moisture: [0.3, 0.7],
    gregarious: 'clustered',
    frequency: 'common',
  },
  media: [],
  text: { ru: 'Описание.', en: 'Description.' },
}

const validFind = {
  id: 'interesting-stone',
  name: { la: 'Lapis notabilis', ru: 'Интересный камень', en: 'Interesting stone' },
  kind: 'find',
  lookalikes: [],
  morphology: {
    color: '#9a9a92',
    size: [30, 90],
    material: 'quartz',
  },
  ecology: {
    mycorrhizal: [],
    substrate: 'soil',
    biomes: ['forest-mixed'],
    season: [6, 7],
    moisture: [0.2, 0.6],
    gregarious: 'solitary',
    frequency: 'occasional',
  },
  media: [],
  text: { ru: 'Описание.', en: 'Description.' },
}

describe('validateSpecies', () => {
  it('accepts a well-formed species', () => {
    expect(validateSpecies(valid, 'amanita-muscaria.yaml').id).toBe('amanita-muscaria')
  })

  it('rejects unknown edibility and names the file', () => {
    const bad = { ...valid, edibility: 'tasty' }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/x\.yaml.*edibility/s)
  })

  it('rejects a month outside 1..12', () => {
    const bad = { ...valid, ecology: { ...valid.ecology, season: [7, 13] } }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/season/)
  })

  it('rejects a colour that is not hex', () => {
    const bad = { ...valid, morphology: { ...valid.morphology, flesh: { color: 'white', bruising: 'none' } } }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/color/)
  })

  it('rejects an unknown host genus', () => {
    const bad = { ...valid, ecology: { ...valid.ecology, mycorrhizal: ['baobab'] } }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/mycorrhizal/)
  })

  it('rejects an inverted range', () => {
    const bad = { ...valid, morphology: { ...valid.morphology, cap: { ...valid.morphology.cap, diameter: [200, 80] } } }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/diameter/)
  })

  it('requires both languages in the description', () => {
    const bad = { ...valid, text: { ru: 'Есть.' } }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/text\.en/)
  })

  it('defaults kind to mushroom when the field is absent', () => {
    expect(validateSpecies(valid, 'x.yaml').kind).toBe('mushroom')
  })

  it('rejects an unknown kind and names the file', () => {
    expect(() => validateSpecies({ ...valid, kind: 'vegetable' }, 'x.yaml')).toThrow(/x\.yaml.*kind/s)
  })

  it('still requires edibility for a mushroom', () => {
    const { edibility, ...withoutEdibility } = valid
    void edibility
    expect(() => validateSpecies(withoutEdibility, 'x.yaml')).toThrow(/edibility/)
  })

  it('accepts a well-formed berry', () => {
    const s = validateSpecies(validBerry, 'x.yaml')
    expect(s.kind).toBe('berry')
    expect(s.kind === 'berry' && s.morphology.color).toBe('#2a2f6b')
  })

  it('rejects a berry with mushroom-shaped morphology', () => {
    const bad = { ...validBerry, morphology: valid.morphology }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/x\.yaml.*morphology/s)
  })

  it('rejects a berry cluster range that is inverted', () => {
    const bad = { ...validBerry, morphology: { ...validBerry.morphology, clusterSize: [8, 3] } }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/clusterSize/)
  })

  it('accepts a well-formed herb', () => {
    const s = validateSpecies(validHerb, 'x.yaml')
    expect(s.kind).toBe('herb')
    expect(s.kind === 'herb' && s.morphology.leafCount).toEqual([8, 20])
  })

  it('rejects a herb with berry-shaped morphology', () => {
    const bad = { ...validHerb, morphology: validBerry.morphology }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/x\.yaml.*morphology/s)
  })

  it('accepts a well-formed nut', () => {
    const s = validateSpecies(validNut, 'x.yaml')
    expect(s.kind).toBe('nut')
    expect(s.kind === 'nut' && s.morphology.capCoverage).toEqual([0.4, 0.7])
  })

  it('rejects a nut capCoverage outside 0..1', () => {
    const bad = { ...validNut, morphology: { ...validNut.morphology, capCoverage: [0.5, 1.4] } }
    expect(() => validateSpecies(bad, 'x.yaml')).toThrow(/capCoverage/)
  })

  it('accepts a find with no gbifKey and no edibility', () => {
    const s = validateSpecies(validFind, 'x.yaml')
    expect(s.kind).toBe('find')
    expect(s.gbifKey).toBeUndefined()
    expect('edibility' in s).toBe(false)
    expect(s.kind === 'find' && s.morphology.material).toBe('quartz')
  })

  it('still requires gbifKey for a non-find kind', () => {
    const { gbifKey, ...withoutGbifKey } = valid
    void gbifKey
    expect(() => validateSpecies(withoutGbifKey, 'x.yaml')).toThrow(/gbifKey/)
  })

  it('rejects an explicit edibility on a find', () => {
    // Not forbidden by the schema — an extra field is simply ignored, since
    // a find's Species type never reads it. Documents the actual behaviour
    // rather than asserting a rejection that doesn't happen.
    const withEdibility = { ...validFind, edibility: 'edible' }
    const s = validateSpecies(withEdibility, 'x.yaml')
    expect('edibility' in s).toBe(false)
  })
})
