import type { Lang } from '../i18n/i18n'
import type { TimeMode } from '../world/daynight'

export interface Find {
  speciesId: string
  x: number
  z: number
  /** When it was found, Date.now(). */
  at: number
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
  return { mouseSensitivity: 1, walkSpeedMultiplier: 1, drawDistance: 45, timeMode: 'day' }
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
      req.onsuccess = () => resolve({ ...emptySave(), ...(req.result as Partial<SaveData> | undefined) })
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
