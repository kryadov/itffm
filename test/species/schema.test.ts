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

  it('accepts an explicit kind', () => {
    expect(validateSpecies({ ...valid, kind: 'berry' }, 'x.yaml').kind).toBe('berry')
  })

  it('rejects an unknown kind and names the file', () => {
    expect(() => validateSpecies({ ...valid, kind: 'vegetable' }, 'x.yaml')).toThrow(/x\.yaml.*kind/s)
  })

  it('still requires edibility for a mushroom', () => {
    const { edibility, ...withoutEdibility } = valid
    void edibility
    expect(() => validateSpecies(withoutEdibility, 'x.yaml')).toThrow(/edibility/)
  })

  it('lets a find go without edibility', () => {
    const { edibility, ...withoutEdibility } = valid
    void edibility
    const s = validateSpecies({ ...withoutEdibility, kind: 'find' }, 'x.yaml')
    expect(s.edibility).toBeUndefined()
  })

  it('still validates edibility for a find when it is given', () => {
    expect(() => validateSpecies({ ...valid, kind: 'find', edibility: 'tasty' }, 'x.yaml')).toThrow(/edibility/)
  })
})
