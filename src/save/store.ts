import type { Lang } from '../i18n/i18n'
import type { TimeMode } from '../world/daynight'
import type { Weather } from '../world/weather'

export interface Find {
  speciesId: string
  x: number
  z: number
  /** When it was found, Date.now() — also this find's own identity: nothing
   *  else needs one, and two finds sharing a millisecond is not worth
   *  guarding against. */
  at: number
  /** The player's own note — where exactly, what stood out. Empty until
   *  they write one. */
  note?: string
}

export interface Prefs {
  /** Multiplier on the base mouse sensitivity — 1 is the default feel. */
  mouseSensitivity: number
  /** Multiplier on walking (and crouch) speed — 1 is the default pace. */
  walkSpeedMultiplier: number
  /** How far away a mushroom still draws, metres. */
  drawDistance: number
  /** 'cycle' runs a full day/night loop; 'day'/'night' lock the clock. */
  timeMode: TimeMode
  /** A fixed weather — there is no forecast, only what the player picks. */
  weather: Weather
  /** Off by default — see ui/compass.ts and ui/minimap.ts for why. */
  minimap: boolean
  /** 0..1 — the collect/cut sound (audio/audio.ts). 0 is silent; there is no
   *  separate on/off toggle for one short effect. */
  soundVolume: number
}

export interface SaveData {
  /** Species opened in the encyclopedia, in the order they were first found. */
  discovered: string[]
  finds: Find[]
  lang: Lang
  disclaimerSeen: boolean
  prefs: Prefs
}

export function defaultPrefs(): Prefs {
  // 'day' keeps the wood exactly as it always looked before day/night
  // existed — a player has to opt into the cycle, not be surprised by it.
  return {
    mouseSensitivity: 1,
    walkSpeedMultiplier: 1,
    drawDistance: 45,
    timeMode: 'day',
    weather: 'clear',
    minimap: false,
    soundVolume: 0.7,
  }
}

/**
 * Fills a value loaded from storage in over the defaults — deeper than a flat
 * `{ ...emptySave(), ...stored }` would go, because `prefs` is itself a
 * nested object: a save written before a new `Prefs` field existed carries a
 * `prefs` object missing that key, and a shallow merge would let that whole
 * object win outright, silently blanking every field the old save predates
 * rather than only the field it actually specifies.
 */
export function mergeSave(stored: Partial<SaveData> | undefined): SaveData {
  return { ...emptySave(), ...stored, prefs: { ...defaultPrefs(), ...stored?.prefs } }
}

const DB_NAME = 'itffm'
const STORE = 'save'
const KEY = 'current'

export function emptySave(): SaveData {
  return { discovered: [], finds: [], lang: 'ru', disclaimerSeen: false, prefs: defaultPrefs() }
}

/** Applies a find. Returns a new object and leaves the old one untouched. */
export function applyFind(save: SaveData, find: Find): SaveData {
  return {
    ...save,
    discovered: save.discovered.includes(find.speciesId)
      ? save.discovered
      : [...save.discovered, find.speciesId],
    finds: [...save.finds, find],
  }
}

/** Sets one find's note by its `at` timestamp. Returns a new object and
 *  leaves the old one untouched, same as `applyFind`. A find with no
 *  matching `at` (already gone, or never existed) leaves the save as is. */
export function setFindNote(save: SaveData, at: number, note: string): SaveData {
  return { ...save, finds: save.finds.map((f) => (f.at === at ? { ...f, note } : f)) }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

/** Reads the save. Any failure starts a fresh one rather than breaking the game. */
export async function loadSave(): Promise<SaveData> {
  try {
    const db = await openDb()
    return await new Promise<SaveData>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      req.onsuccess = () => resolve(mergeSave(req.result as Partial<SaveData> | undefined))
      req.onerror = () => reject(req.error)
    })
  } catch {
    return emptySave()
  }
}

export async function persistSave(save: SaveData): Promise<void> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(save, KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    // Private mode, or storage denied. Not being able to save does not stop
    // anyone walking in the woods.
  }
}
