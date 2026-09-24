import {
  emptySave, applyFind, setFindNote, mergeSave, defaultPrefs, readBikeSpot, readDrone, resetQuests, type Find, type SaveData,
} from '../../src/save/store'

const find = (id: string, at = 1000): Find => ({ speciesId: id, x: 1, z: 2, at })

describe('applyFind', () => {
  it('opens a species on the first find', () => {
    const s = applyFind(emptySave(), find('boletus-edulis'))
    expect(s.discovered).toEqual(['boletus-edulis'])
  })

  it('does not open the same species twice', () => {
    let s = applyFind(emptySave(), find('boletus-edulis'))
    s = applyFind(s, find('boletus-edulis', 2000))
    expect(s.discovered).toEqual(['boletus-edulis'])
  })

  it('records every find all the same', () => {
    let s = applyFind(emptySave(), find('boletus-edulis'))
    s = applyFind(s, find('boletus-edulis', 2000))
    expect(s.finds).toHaveLength(2)
  })

  it('keeps the order species were first found in', () => {
    let s = applyFind(emptySave(), find('amanita-muscaria'))
    s = applyFind(s, find('boletus-edulis'))
    expect(s.discovered).toEqual(['amanita-muscaria', 'boletus-edulis'])
  })

  it('leaves the original save untouched', () => {
    const before = emptySave()
    applyFind(before, find('boletus-edulis'))
    expect(before.discovered).toHaveLength(0)
  })

  it('starts from a valid empty save', () => {
    const s = emptySave()
    expect(s.discovered).toEqual([])
    expect(s.finds).toEqual([])
  })
})

describe('quests', () => {
  it('round-trips a partially-populated set (only axe placed so far)', () => {
    const withQuests = { ...emptySave(), quests: { axe: { position: { x: 12, y: 3, z: -4 }, state: 'carrying' as const } } }
    const loaded = mergeSave(withQuests)
    expect(loaded.quests).toEqual(withQuests.quests)
  })

  it('round-trips a fully-populated set', () => {
    const full = {
      axe: { position: { x: 1, y: 0, z: 1 }, state: 'pending' as const },
      lamp: { position: { x: 2, y: 0, z: 2 }, state: 'pending' as const },
      rod: { position: { x: 3, y: 0, z: 3 }, state: 'done' as const },
      bike: { position: { x: 4, y: 0, z: 4 }, state: 'carrying' as const },
    }
    const withQuests = { ...emptySave(), quests: full }
    const loaded = mergeSave(withQuests)
    expect(loaded.quests).toEqual(full)
  })

  it('is absent from a fresh save, same as a save from before this feature existed', () => {
    expect(emptySave().quests).toBeUndefined()
    expect(mergeSave(undefined).quests).toBeUndefined()
  })
})

describe('mergeSave', () => {
  it('starts from the defaults with nothing stored at all', () => {
    // calendarStart is Date.now() at call time — compared separately
    // (a tolerant "close to now") rather than via toEqual, which would
    // flake whenever the two calls below land in different milliseconds.
    const merged = mergeSave(undefined)
    const empty = emptySave()
    expect({ ...merged, calendarStart: 0 }).toEqual({ ...empty, calendarStart: 0 })
    expect(Math.abs(merged.calendarStart - Date.now())).toBeLessThan(5000)
  })

  it('puts a save from before auto weather on auto, dropping its old fixed pick', () => {
    const old = { prefs: { ...defaultPrefs(), weather: 'clear' } } as unknown as Partial<SaveData>
    delete (old.prefs as Partial<SaveData['prefs']>).weatherMode
    const merged = mergeSave(old)
    expect(merged.prefs.weatherMode).toBe('auto')
    expect('weather' in merged.prefs).toBe(false)
  })

  it('keeps a weather the player picked themselves', () => {
    expect(mergeSave({ prefs: { ...defaultPrefs(), weatherMode: 'snow' } }).prefs.weatherMode).toBe('snow')
  })

  it('takes top-level fields from a stored save', () => {
    const s = mergeSave({ lang: 'en' })
    expect(s.lang).toBe('en')
  })

  it('fills in a prefs field a stored save predates, rather than losing every prefs field to it', () => {
    // The bug this guards: an old save missing a newly-added Prefs field
    // (soundVolume, say) must not blank out every OTHER prefs field too —
    // a naive `{ ...defaults, ...stored }` merge is shallow, and `prefs`
    // is itself a nested object, so a stored `prefs` missing one new key
    // would otherwise overwrite the rest of `defaultPrefs()` wholesale.
    const s = mergeSave({ prefs: { mouseSensitivity: 2 } } as Partial<SaveData>)
    expect(s.prefs.mouseSensitivity).toBe(2)
    expect(s.prefs.soundVolume).toBe(defaultPrefs().soundVolume)
    expect(s.prefs.drawDistance).toBe(defaultPrefs().drawDistance)
  })
})

describe('setFindNote', () => {
  it('sets the note on the find with a matching timestamp', () => {
    let s = applyFind(emptySave(), find('boletus-edulis', 1000))
    s = applyFind(s, find('amanita-muscaria', 2000))
    s = setFindNote(s, 2000, 'under the big spruce')
    expect(s.finds.find((f) => f.at === 2000)?.note).toBe('under the big spruce')
    expect(s.finds.find((f) => f.at === 1000)?.note).toBeUndefined()
  })

  it('leaves the save untouched when no find matches', () => {
    const before = applyFind(emptySave(), find('boletus-edulis', 1000))
    const after = setFindNote(before, 9999, 'nobody home')
    expect(after.finds).toEqual(before.finds)
  })

  it('leaves the original save untouched', () => {
    const before = applyFind(emptySave(), find('boletus-edulis', 1000))
    setFindNote(before, 1000, 'a note')
    expect(before.finds[0].note).toBeUndefined()
  })
})

describe('bikeSpot', () => {
  it('survives a round trip through mergeSave', () => {
    const merged = mergeSave({ bikeSpot: { wall: 'left', along: -0.4 } })
    expect(readBikeSpot(merged.bikeSpot)).toEqual({ wall: 'left', along: -0.4 })
  })

  it('is absent on a save from before the choice existed', () => {
    expect(readBikeSpot(mergeSave({}).bikeSpot)).toBeUndefined()
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'left'],
    ['an unknown wall', { wall: 'roof', along: 0 }],
    ['a missing offset', { wall: 'left' }],
    ['a non-number offset', { wall: 'left', along: '1' }],
    ['a non-finite offset', { wall: 'left', along: Infinity }],
  ])('rejects %s read back from storage', (_label, raw) => {
    expect(readBikeSpot(raw)).toBeUndefined()
  })
})

describe('resetQuests', () => {
  const played = (): SaveData => ({
    ...applyFind(emptySave(), find('boletus-edulis')),
    lang: 'ru',
    calendarStart: 12345,
    prefs: { ...defaultPrefs(), minimap: true, mouseSensitivity: 1.7 },
    quests: {
      axe: { position: { x: 1, y: 0, z: 2 }, state: 'done' },
      bike: { position: { x: 3, y: 0, z: 4 }, state: 'carrying' },
      diamond: { position: { x: 5, y: 0, z: 6 }, state: 'done' },
    },
    bikeSpot: { wall: 'left', along: 0.4 },
    soup: { stage: 'done', left: 0 },
  })

  it('forgets every quest and where the bicycle was left, so the next load starts them fresh', () => {
    const reset = resetQuests(played())
    expect(reset.quests).toBeUndefined()
    expect(reset.bikeSpot).toBeUndefined()
    expect('quests' in reset).toBe(false)
    expect('bikeSpot' in reset).toBe(false)
    expect('soup' in reset).toBe(false)
  })

  it('leaves everything that is not a quest exactly as it was', () => {
    const before = played()
    const reset = resetQuests(before)
    expect(reset.discovered).toEqual(before.discovered)
    expect(reset.finds).toEqual(before.finds)
    expect(reset.lang).toBe('ru')
    expect(reset.calendarStart).toBe(12345)
    expect(reset.prefs).toEqual(before.prefs)
  })

  it('returns a new object and leaves the old save untouched', () => {
    const before = played()
    const reset = resetQuests(before)
    expect(reset).not.toBe(before)
    expect(before.quests?.axe?.state).toBe('done')
    expect(before.bikeSpot).toEqual({ wall: 'left', along: 0.4 })
  })

  it('is a harmless no-op on a save that never had quests, and idempotent', () => {
    const fresh = emptySave()
    expect(resetQuests(fresh)).toEqual(fresh)
    const once = resetQuests(played())
    expect(resetQuests(once)).toEqual(once)
  })

  it('survives a round trip through mergeSave: a reset save still loads with no quests', () => {
    expect(mergeSave(resetQuests(played())).quests).toBeUndefined()
  })
})

describe('the quadcopter order', () => {
  it.each([
    [{ stage: 'ordered', crateEnd: 0 }],
    [{ stage: 'crate', crateEnd: 1 }],
    [{ stage: 'owned', crateEnd: 1 }],
  ] as const)('reads back a good one: %o', (raw) => {
    expect(readDrone(raw)).toEqual(raw)
  })

  it.each([
    ['nothing', undefined],
    ['null', null],
    ['a string', 'owned'],
    ['an unknown stage', { stage: 'flying', crateEnd: 0 }],
    ['a bad end', { stage: 'crate', crateEnd: 2 }],
    ['a missing end', { stage: 'crate' }],
  ])('rejects %s read back from storage', (_label, raw) => {
    expect(readDrone(raw)).toBeUndefined()
  })

  it('is forgotten with the quests: a reset takes the quadcopter back too', () => {
    const played: SaveData = { ...emptySave(), drone: { stage: 'owned', crateEnd: 1 } }
    const reset = resetQuests(played)
    expect(reset.drone).toBeUndefined()
    expect('drone' in reset).toBe(false)
    expect(played.drone).toEqual({ stage: 'owned', crateEnd: 1 }) // the original is untouched
  })

  it('survives a round trip through mergeSave', () => {
    expect(readDrone(mergeSave({ drone: { stage: 'crate', crateEnd: 0 } }).drone)).toEqual({ stage: 'crate', crateEnd: 0 })
  })
})
