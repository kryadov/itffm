import { setLang, getLang, t, speciesName, speciesText, RU, EN } from '../../src/i18n/i18n'
import { speciesById } from '../../src/species/load'
import { EDIBILITY, SUBSTRATE, HYMENIUM } from '../../src/species/schema'

describe('i18n', () => {
  it('defaults to Russian', () => {
    expect(getLang()).toBe('ru')
  })

  it('switches language', () => {
    setLang('en')
    expect(getLang()).toBe('en')
    setLang('ru')
  })

  it('has the same keys in both dictionaries', () => {
    expect(Object.keys(RU).sort()).toEqual(Object.keys(EN).sort())
  })

  it('has no empty values', () => {
    for (const dict of [RU, EN]) {
      for (const [k, v] of Object.entries(dict)) expect(v.length, `${k} is empty`).toBeGreaterThan(0)
    }
  })

  it('translates by the current language', () => {
    setLang('en')
    expect(t('collect')).toBe(EN.collect)
    setLang('ru')
    expect(t('collect')).toBe(RU.collect)
  })

  it('follows the language for species names and text', () => {
    const s = speciesById('boletus-edulis')!
    setLang('en')
    expect(speciesName(s)).toBe(s.name.en)
    expect(speciesText(s)).toBe(s.text.en)
    setLang('ru')
    expect(speciesName(s)).toBe(s.name.ru)
  })

  it('can label every value the UI shows from the schema', () => {
    // The UI turns raw enum values into words. A value with no label would
    // reach the player as "deadwood" in the middle of a Russian sentence.
    for (const key of [...EDIBILITY, ...SUBSTRATE, ...HYMENIUM]) {
      expect(RU, `no label for ${key}`).toHaveProperty(key)
    }
  })
})
